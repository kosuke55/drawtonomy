#!/usr/bin/env python3
"""Parameter sweep runner (closed loop: esmini + SUT).

Usage:
  python3 tools/run_sweep.py --sut aeb --config sut/aeb/configs/v1.1.yaml [--testcase TC-AEB-001] [--jobs N]
  python3 tools/run_sweep.py --scenario-check [--testcase TC-AVD-001] [--jobs N]
  (both) --generated-at 2026-09-06T09:00:00Z  pin generatedAt in the results

SUT mode:
  Expands the distribution (<slug>.pvd.xosc) and runs every combination in esmini (libesminiLib).
  The ego is externally controlled: each step integrates the SUT (sut/<id>) acceleration along
  the lane and reports it back with SE_ReportObjectPosXYH / Speed / Acc. NPCs follow the xosc.
  KPIs are checked against the testcase.yaml criteria -> results/<sut>@<ver>/<TC>.json.
  Each combination also runs a reference model (ideal 10 m/s² braking, no delay, friction-limited);
  runs where even that collides get unavoidable=true.

--scenario-check mode:
  The ego follows the script too. Checks that the scenario itself works (esmini runs without
  errors, key events fire, no unintended collisions) -> results/scenario-check/<TC>.json (no logs).

Logs: each SUT run writes logs/<TC>/<run>.csv (esmini --csv_logger) and <run>.planning-trace.json,
then tools/slim_logs.py makes them small enough to commit (0.04 s, the columns drawtonomy reads,
a plan every 0.5 s or when it changes). The result JSON refers to them as {"path", "url", "sha256", "bytes"}.
"""

from __future__ import annotations

import argparse
import datetime as dt_mod
import importlib
import json
import math
import multiprocessing as mp
import os
import re
import sys
import tempfile
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sweep_common as cb  # noqa: E402
import slim_logs  # noqa: E402

REPO = cb.REPO
DT = 0.02
G = 9.81
REF_DECEL = 10.0            # reference model (ideal braking) decel [m/s²]
SERIES_EVERY = 5            # 0.02 s × 5 = 10 Hz
STOP_HOLD = 1.0             # stop after the ego has been stopped this long [s]
PLAN_EVERY = 5              # planning trace: state spacing in a plan, 0.02 s x 5 = 0.1 s
                            # (a plan every 0.1 s; slim_logs keeps one per 0.5 s)
PLAN_HORIZON = 3.0          # plan horizon [s] (cut at stop)
TRACE_SCHEMA = 'drawtonomy-planning-trace-v1'
BENIGN_LOG = [re.compile(r'Unsupported controller type')]   # known error from the ego marker (Controller name="")

_ES: cb.Esmini | None = None


def _worker_init():
    global _ES
    # esmini writes a banner to fd 1; silence it in workers
    devnull = os.open(os.devnull, os.O_WRONLY)
    os.dup2(devnull, 1)
    _ES = cb.Esmini()
    sys.path.insert(0, str(REPO))


# --------------------------------------------------------------------------- controllers
class IdealBrake:
    """Reference model: full braking with no delay as soon as an in-lane target appears."""

    def __init__(self, decel: float):
        self.decel = decel
        self.on = False

    def step(self, in_lane_target: bool) -> float:
        if in_lane_target:
            self.on = True
        return -self.decel if self.on else 0.0


trace_path_of = slim_logs.trace_path_of


def predict_plan(ctrl, t: float, x: float, y: float, h: float, v: float) -> dict:
    """Plan at time t: motion if the current command is held (the SUT's own output model,
    ctrl.predict_outputs), every 0.1 s up to PLAN_HORIZON or the stop. Friction is not applied:
    the plan is what the SUT intends."""
    n = int(round(PLAN_HORIZON / DT))
    outs = ctrl.predict_outputs(n)
    ch, sh = math.cos(h), math.sin(h)
    states = [_state(t, x, y, h, v)]
    s = 0.0
    for k, a in enumerate(outs, start=1):
        a = min(0.0, a)                       # no propulsion, same as the plant
        v_new = max(0.0, v + a * DT)
        s += 0.5 * (v + v_new) * DT
        v = v_new
        stopped = v <= 0.0
        if k % PLAN_EVERY == 0 or stopped:
            states.append(_state(t + k * DT, x + s * ch, y + s * sh, h, v))
        if stopped:
            break
    return {'t': round(t, 3), 'states': states}


def _state(t, x, y, h, v) -> dict:
    return {'t': round(t, 3), 'x': round(x, 4), 'y': round(y, 4), 'h': round(h, 5), 'v': round(v, 4)}


def write_trace(path: Path, driven: list, plans: list, ego, producer: dict) -> None:
    """Ego-only planning trace (drawtonomy-planning-trace-v1, frame=ref = esmini reference point).
    `driven` matches the Ego rows of the CSV (same times and positions)."""
    doc = {
        'schema': TRACE_SCHEMA,
        'producer': producer,
        'frame': 'ref',
        'tracks': [{
            'role': 'ego',
            'vehicle': {'length': round(ego.length, 4), 'width': round(ego.width, 4),
                        'refToCenter': round(ego.centerOffsetX, 4)},
            'driven': driven,
            'plans': plans,
        }],
    }
    path.write_text(json.dumps(doc, separators=(',', ':')) + '\n')


def _r(v, nd=3):
    if v is None or (isinstance(v, float) and not math.isfinite(v)):
        return None
    return round(float(v), nd)


# --------------------------------------------------------------------------- one run
def simulate(job: dict) -> dict:
    """Run one parameter combination once. job['mode'] = 'sut' | 'reference' | 'check'."""
    es = _ES
    mode = job['mode']
    xosc = Path(job['xosc'])
    params = job['params']
    all_params = {**job['defaults'], **params}
    friction = float(all_params.get('Friction', 1.0))
    max_brake = friction * G                         # max decel the road allows (plant limit)
    csv = Path(job['csv']) if job.get('csv') else None
    if csv:
        csv.parent.mkdir(parents=True, exist_ok=True)
    log = None
    if mode == 'check':
        fd, log_name = tempfile.mkstemp(suffix='.log')
        os.close(fd)
        log = Path(log_name)

    rc = es.init(xosc, params, DT, csv, log)
    if rc != 0:
        return {'error': f'SE_Init failed (rc={rc})'}

    ego_name, tgt_name = job['ego'], job['target']
    ego_id = es.lib.SE_GetIdByName(ego_name.encode())
    objs = es.objects()
    if ego_name not in objs or tgt_name not in objs:
        es.close()
        return {'error': f'entity not found: {ego_name}/{tgt_name}'}

    ego0 = objs[ego_name]
    ex, ey, eh, ev = ego0.x, ego0.y, ego0.h, ego0.speed
    # planning trace (SUT runs with a log only): driven states + a plan per cycle
    tracing = mode == 'sut' and csv is not None
    driven = [_state(0.0, ego0.x, ego0.y, ego0.h, ego0.speed)] if tracing else []
    plans = []
    ea = 0.0
    ctrl = None
    if mode == 'sut':
        mod = importlib.import_module(f"sut.{job['sut_id']}")
        ctrl = mod.create_controller(job['sut_params'], DT)
        Obs, Trk = mod.Observation, mod.TrackedObject
    elif mode == 'reference':
        ctrl = IdealBrake(min(REF_DECEL, max_brake))

    stop_time = job['stop_time']
    t = 0.0
    collision = False
    impact_speed = 0.0
    collided_pairs: set[tuple[str, str]] = set()
    min_ttc = math.inf
    min_gap = math.inf
    max_decel = 0.0
    trigger_time = None
    stopped_for = 0.0
    series = {'t': [], 'gap': [], 'ego_v': [], 'ego_a': [], 'target_v': [], 'ttc': []}
    step_i = 0
    error = None

    def measure(objs):
        """Ego vs. target relation and collision, with drawtonomy's FAIL CONDITIONS OBB geometry.

        gap     = OBB gap along the ego heading (negative = overlap, as LongitudinalDistance)
        in_lane = target is ahead and the OBBs overlap on the ego lateral axis
        hit     = OBBs overlap (as Collision), or esmini reports a collision"""
        e, o = objs[ego_name], objs[tgt_name]
        gap, ahead, lat_overlap = cb.obb_longitudinal(e, o)
        _, lat, _ = cb.relative(e, o)
        in_lane = ahead and lat_overlap
        hit = cb.obb_overlap(e, o) or o.id in es.collisions(e.id)
        ttc = None
        vrel = e.speed - o.speed
        if in_lane and gap > 0 and vrel > 1e-3:
            ttc = gap / vrel
        return gap, lat, in_lane, ttc, vrel, hit

    while True:
        # ---- control (modes with an externally controlled ego)
        if mode in ('sut', 'reference'):
            e_state = objs[ego_name]
            if mode == 'sut':
                tracked = []
                for n, st in objs.items():
                    if n == ego_name:
                        continue
                    g, lat, _ = cb.relative(e_state, st)
                    tracked.append(Trk(name=n, gap=g, lateral=lat, speed=st.speed, width=st.width, length=st.length))
                cmd = ctrl.step(Obs(t=t, ego_speed=ev, ego_accel=ea, objects=tracked))
                stage = ctrl.status.get('stage')
                if tracing and step_i % PLAN_EVERY == 0:
                    plans.append(predict_plan(ctrl, t, ex, ey, eh, ev))
                if trigger_time is None and stage in ('partial', 'full'):
                    trigger_time = t
            else:
                _, _, in_lane0, _, _, _ = measure(objs)
                cmd = ctrl.step(in_lane0)
            # plant: no propulsion (speed held), braking limited by friction
            a = max(-max_brake, min(0.0, cmd))
            if ev <= 0.0 and a < 0:
                a = 0.0
            v_new = max(0.0, ev + a * DT)
            a_eff = (v_new - ev) / DT
            ex += 0.5 * (ev + v_new) * DT * math.cos(eh)
            ey += 0.5 * (ev + v_new) * DT * math.sin(eh)
            ev, ea = v_new, a_eff
            max_decel = max(max_decel, -a_eff)
            es.lib.SE_ReportObjectPosXYH(ego_id, ex, ey, eh)
            es.lib.SE_ReportObjectSpeed(ego_id, ev)
            es.lib.SE_ReportObjectAcc(ego_id, ea * math.cos(eh), ea * math.sin(eh), 0.0)

        if es.lib.SE_StepDT(DT) != 0:
            error = 'SE_StepDT failed'
            break
        step_i += 1
        t = es.lib.SE_GetSimulationTime()
        objs = es.objects()
        if tracing:
            e = objs[ego_name]
            driven.append(_state(t, e.x, e.y, e.h, e.speed))
        if mode == 'check':
            e = objs[ego_name]
            prev_v = ev
            ev = e.speed
            ea = (ev - prev_v) / DT
            max_decel = max(max_decel, -ea)
            for cid in es.collisions(ego_id):
                other = es.lib.SE_GetObjectName(cid).decode()
                collided_pairs.add((ego_name, other))
            # NPC-NPC collisions too
            for n, st in objs.items():
                if n == ego_name:
                    continue
                for cid in es.collisions(st.id):
                    other = es.lib.SE_GetObjectName(cid).decode()
                    if other != ego_name:
                        collided_pairs.add(tuple(sorted((n, other))))

        gap, lat, in_lane, ttc, vrel, hit = measure(objs)
        if in_lane or hit:
            # on overlap, clamp to <= 0 so min_gap agrees with collision
            min_gap = min(min_gap, gap if not hit else min(gap, 0.0))
            if ttc is not None:
                min_ttc = min(min_ttc, ttc)
        if hit and not collision:
            collision = True
            impact_speed = max(0.0, vrel)

        if step_i % SERIES_EVERY == 0:
            series['t'].append(_r(t, 2))
            series['gap'].append(_r(gap))
            series['ego_v'].append(_r(ev))
            series['ego_a'].append(_r(ea))
            series['target_v'].append(_r(objs[tgt_name].speed))
            series['ttc'].append(_r(ttc))

        # ---- termination
        if mode != 'check' and collision:
            break
        if mode != 'check':
            stopped_for = stopped_for + DT if ev < 0.01 else 0.0
            if stopped_for >= STOP_HOLD:
                break
        if es.lib.SE_GetQuitFlag() or t >= stop_time - 1e-9:
            break

    events = dict(es.events)
    es.close()
    if tracing and not error:
        write_trace(trace_path_of(csv), driven, plans, ego0,
                    {'name': f"sut/{job['sut_id']}", 'version': str(job.get('sut_version') or '')})
    if csv is not None and csv.exists():
        slim_logs.slim_run(csv, xosc)

    log_errors = []
    if log is not None:
        try:
            for line in log.read_text(errors='replace').splitlines():
                if '[error]' in line and not any(p.search(line) for p in BENIGN_LOG):
                    log_errors.append(line.strip())
        finally:
            log.unlink(missing_ok=True)

    return {
        'error': error,
        'collision': collision,
        'impact_speed': impact_speed,
        'min_ttc': min_ttc,
        'min_gap': min_gap,
        'max_decel': max_decel,
        'aeb_trigger_time': trigger_time,
        'series': series,
        'events': events,
        'collided_pairs': sorted(collided_pairs),
        'log_errors': log_errors,
        'end_time': t,
        'trace': job['log_rel'][:-len('.csv')] + '.planning-trace.json' if tracing and not error else None,
    }


def run_job(job: dict) -> dict:
    """SUT mode: main run + reference run. Check mode: one scripted run."""
    try:
        main = simulate(job)
        out = {'main': main}
        if job['mode'] == 'sut' and not main.get('error'):
            ref = simulate({**job, 'mode': 'reference', 'csv': None})
            out['reference'] = ref
        return out
    except Exception as exc:  # noqa: BLE001
        return {'main': {'error': f'{type(exc).__name__}: {exc}'}}


# --------------------------------------------------------------------------- result assembly
def kpis_of(m: dict) -> dict:
    return {
        'collision': bool(m['collision']),
        'min_ttc': _r(m['min_ttc']),
        'min_gap': _r(m['min_gap']),
        'impact_speed': _r(m['impact_speed']),
        'max_decel': _r(m['max_decel']),
        'aeb_trigger_time': _r(m['aeb_trigger_time'], 2),
    }


def build_run(tc: dict, idx: int, params: dict, res: dict, mode: str, log_rel: str, out_dir: Path) -> dict:
    m = res['main']
    run = {'id': f'r{idx:04d}', 'params': params}
    if m.get('error'):
        run.update({'verdict': 'ERROR', 'failed': [], 'error': m['error'], 'kpis': {}, 'unavoidable': None,
                    'log': None, 'series': {}})
        return run
    kpis = kpis_of(m)
    if mode == 'check':
        # scenario-check ignores criteria and only checks the scenario itself:
        # no esmini errors / key events fire / no collisions outside allowCollisions
        failed = []
        sc = tc.get('scenarioCheck', {}) or {}
        allowed = {tuple(sorted(p)) for p in sc.get('allowCollisions', [])}
        for ev in sc.get('events', []):
            if ev not in m['events']:
                failed.append(f'event:{ev}')
        unintended = [p for p in m['collided_pairs'] if tuple(sorted(p)) not in allowed]
        for p in unintended:
            tag = f'unintended_collision:{p[0]}-{p[1]}'
            if tag not in failed:
                failed.append(tag)
        if m['log_errors']:
            failed.append('esmini_error')
        kpis['events'] = {k: _r(v, 2) for k, v in m['events'].items()}
        kpis['collided_pairs'] = [list(p) for p in m['collided_pairs']]
        if m['log_errors']:
            kpis['esmini_errors'] = m['log_errors'][:5]
        unavoidable = None
    else:
        failed = cb.eval_criteria(tc.get('criteria', []), kpis)
        ref = res.get('reference') or {}
        unavoidable = bool(ref.get('collision')) if not ref.get('error') else None
    run.update({
        'verdict': 'PASS' if not failed else 'FAIL',
        'failed': failed,
        'kpis': kpis,
        'unavoidable': unavoidable,
        'log': slim_logs.file_ref(out_dir / log_rel, log_rel) if mode != 'check' else None,
        'series': m['series'],
    })
    if m.get('trace'):
        run['trace'] = slim_logs.file_ref(out_dir / m['trace'], m['trace'])
    return run


def sweep(tcs: list[dict], mode: str, sut: dict | None, jobs: int, generated_at: str | None = None) -> None:
    if mode == 'check':
        out_dir = REPO / 'results' / 'scenario-check'
        sut_meta = {'id': 'scenario-check', 'version': '-', 'label': 'Scenario check (ego scripted)', 'config': {}}
    else:
        out_dir = REPO / 'results' / f"{sut['id']}@{sut['version']}"
        sut_meta = {'id': sut['id'], 'version': str(sut['version']), 'label': sut.get('label', sut['id']),
                    'config': sut.get('params', {})}
    out_dir.mkdir(parents=True, exist_ok=True)

    all_jobs = []
    per_tc = {}
    for tc in tcs:
        d = tc['_dir']
        xosc = d / tc['scenario']
        defaults = cb.xosc_param_defaults(xosc)
        if tc.get('distribution') and (d / tc['distribution']).exists():
            parameters, combos = cb.expand_pvd(d / tc['distribution'])
        else:
            parameters, combos = [], [{}]
        units = {p['name']: p.get('unit') for p in tc.get('parameters', [])}
        for p in parameters:
            p['unit'] = units.get(p['name'])
        per_tc[tc['id']] = {'tc': tc, 'xosc': xosc, 'parameters': parameters, 'combos': combos}
        stop_time = cb.xosc_stop_time(xosc)
        for i, params in enumerate(combos, start=1):
            log_rel = f"logs/{tc['id']}/r{i:04d}.csv"
            all_jobs.append({
                'tc_id': tc['id'], 'idx': i, 'mode': 'check' if mode == 'check' else 'sut',
                'xosc': str(xosc), 'params': params, 'defaults': defaults,
                'ego': tc['ego'], 'target': tc['target'], 'stop_time': stop_time,
                'csv': str(out_dir / log_rel) if mode != 'check' else None, 'log_rel': log_rel,
                'sut_id': sut['id'] if sut else None, 'sut_params': sut.get('params', {}) if sut else None,
                'sut_version': str(sut['version']) if sut else None,
            })

    t0 = time.time()
    ctx = mp.get_context('spawn')
    with ProcessPoolExecutor(max_workers=jobs, mp_context=ctx, initializer=_worker_init) as ex:
        results = list(ex.map(run_job, all_jobs, chunksize=4))

    by_tc: dict[str, list] = {k: [] for k in per_tc}
    for job, res in zip(all_jobs, results):
        tc = per_tc[job['tc_id']]['tc']
        by_tc[job['tc_id']].append(build_run(tc, job['idx'], job['params'], res, mode, job['log_rel'], out_dir))

    now = generated_at or dt_mod.datetime.now(dt_mod.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    for tc_id, runs in by_tc.items():
        info = per_tc[tc_id]
        summary = {
            'total': len(runs),
            'pass': sum(r['verdict'] == 'PASS' for r in runs),
            'fail': sum(r['verdict'] == 'FAIL' for r in runs),
            'error': sum(r['verdict'] == 'ERROR' for r in runs),
        }
        doc = {
            'schema': 'drawtonomy-runs-v0',
            'testcase': tc_id,
            'sut': sut_meta,
            'scenarioSha256': cb.sha256_file(info['xosc']),
            'generatedAt': now,
            'dt': DT,
            'parameters': info['parameters'],
            'summary': summary,
            'runs': runs,
        }
        path = out_dir / f'{tc_id}.json'
        path.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n')
        unav = sum(bool(r.get('unavoidable')) for r in runs)
        print(f"{sut_meta['id']}@{sut_meta['version']} {tc_id}: total={summary['total']} pass={summary['pass']} "
              f"fail={summary['fail']} error={summary['error']} unavoidable={unav} -> {path.relative_to(REPO)}")
    print(f'{len(all_jobs)} runs in {time.time() - t0:.1f} s (jobs={jobs})')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--sut', help='SUT id (sut/<id>)')
    ap.add_argument('--config', help='SUT config yaml (sut/<id>/configs/vX.Y.yaml)')
    ap.add_argument('--testcase', action='append', help='TC id (repeatable). Default: all')
    ap.add_argument('--jobs', type=int, default=max(1, (os.cpu_count() or 2) - 1))
    ap.add_argument('--scenario-check', action='store_true', help='run the ego as scripted to check the scenario itself')
    ap.add_argument('--generated-at', help='generatedAt for the results (ISO 8601 UTC, e.g. 2026-09-06T09:00:00Z). '
                    'Default: now')
    a = ap.parse_args()
    if a.generated_at:
        try:
            ts = dt_mod.datetime.fromisoformat(a.generated_at.replace('Z', '+00:00'))
        except ValueError:
            ap.error(f'--generated-at is not ISO 8601: {a.generated_at}')
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=dt_mod.timezone.utc)
        a.generated_at = ts.astimezone(dt_mod.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

    tcs = cb.load_testcases()
    if a.testcase:
        tcs = [t for t in tcs if t['id'] in a.testcase]
        if not tcs:
            ap.error(f'testcase not found: {a.testcase}')

    if a.scenario_check:
        sweep(tcs, 'check', None, a.jobs, a.generated_at)
        return
    if not (a.sut and a.config):
        ap.error('--sut and --config are required (or use --scenario-check)')
    cfg_path = Path(a.config)
    if not cfg_path.is_absolute():
        cfg_path = (Path.cwd() / cfg_path) if (Path.cwd() / cfg_path).exists() else REPO / cfg_path
    sut = yaml.safe_load(cfg_path.read_text())
    if sut.get('id') != a.sut:
        ap.error(f"config id '{sut.get('id')}' != --sut '{a.sut}'")
    tcs = [t for t in tcs if a.sut in (t.get('sut') or [])]
    if not tcs:
        ap.error(f'no testcase targets sut={a.sut}')
    sweep(tcs, 'sut', sut, a.jobs, a.generated_at)


if __name__ == '__main__':
    main()
