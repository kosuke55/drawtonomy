#!/usr/bin/env python3
"""Make run logs small enough to commit (run_sweep.py calls this for every run it writes).

  python3 tools/slim_logs.py            # slim every results/**/logs in place and update the result JSON
  python3 tools/slim_logs.py --check    # only report sizes

CSV (esmini --csv_logger):
  - every LOG_EVERY-th simulation step (0.02 s x 2 = 0.04 s) plus the last row (the collision frame
    when the run stops on a collision)
  - only the columns drawtonomy and tools/verify_verdicts.py read (KEEP_COLUMNS). The preamble,
    the header style (`#<n> <name> [unit]`), `Index` and the `, ` separator stay as esmini writes them.
  - positions and sizes in mm, heading 1e-4 rad, speed 1e-3 m/s
  - `Scenario File Name` is made relative to the repository
Planning trace:
  - `driven` has the same times as the CSV rows
  - one plan every PLAN_PERIOD s (the plan states keep their 0.1 s spacing), plus every plan whose
    predicted positions (0.5 s .. 3 s ahead) differ from the last kept plan by more than PLAN_CHANGE_M
    (e.g. when braking starts), so the plan shown at any time is never off by more than that
Every step selects by time / Index (not "every other row"), so running it again changes nothing.
Scenario-check runs keep no log (the result JSON is the record).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SIM_DT = 0.02
LOG_EVERY = 2               # CSV / driven: 0.02 s x 2 = 0.04 s
PLAN_PERIOD = 0.5           # planning trace: one plan per 0.5 s ...
PLAN_CHANGE_M = 0.5         # ... plus any plan whose prediction moved more than this from the last kept one
KEEP_COLUMNS = ['Entity_Name', 'Current_Speed', 'bb_x', 'bb_length', 'bb_width',
                'World_Position_X', 'World_Position_Y', 'World_Heading_Angle']
DIGITS = {'Current_Speed': 3, 'bb_x': 3, 'bb_length': 3, 'bb_width': 3,
          'World_Position_X': 3, 'World_Position_Y': 3, 'World_Heading_Angle': 4}
UNITS = {'Entity_Name': '[-]', 'Current_Speed': '[m/s]', 'bb_x': '[m]', 'bb_length': '[m]', 'bb_width': '[m]',
         'World_Position_X': '[m]', 'World_Position_Y': '[m]', 'World_Heading_Angle': '[rad]'}


def num(v: float, nd: int) -> str:
    """Rounded, without trailing zeros ('50', '-5.25', '0.1234'); -0 -> 0."""
    s = f'{round(float(v), nd):.{nd}f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def _label(cell: str) -> tuple[int, str] | None:
    """'#2 lane_offset [m]' -> (2, 'lane_offset')."""
    c = cell.strip()
    if not c.startswith('#'):
        return None
    n, _, rest = c[1:].partition(' ')
    name = rest.split('[')[0].strip()
    return int(n), name


def _on_grid(step: int) -> bool:
    return step % LOG_EVERY == 0


def slim_csv_text(text: str, repo_rel_scenario: str | None = None) -> tuple[str, list[float]]:
    """Returns (slim text, kept times)."""
    lines = text.splitlines()
    hi = next(i for i, l in enumerate(lines) if 'TimeStamp' in l and 'Entity_Name' in l)
    pre = []
    for l in lines[:hi]:
        if repo_rel_scenario and l.startswith('Scenario File Name:'):
            l = f'Scenario File Name: {repo_rel_scenario}'
        pre.append(l)
    hdr = lines[hi].split(',')
    idx_i = next(i for i, c in enumerate(hdr) if c.strip().startswith('Index'))
    t_i = next(i for i, c in enumerate(hdr) if c.strip().startswith('TimeStamp'))
    cols: dict[int, dict[str, int]] = {}
    for i, c in enumerate(hdr):
        lab = _label(c)
        if lab and lab[1] in KEEP_COLUMNS:
            cols.setdefault(lab[0], {}).setdefault(lab[1], i)
    ents = sorted(cols)
    out_hdr = ['Index [-]', 'TimeStamp [s]']
    for n in ents:
        out_hdr += [f'#{n} {k} {UNITS[k]}' for k in KEEP_COLUMNS]
    rows = [l for l in lines[hi + 1:] if l.strip()]
    kept = []
    times = []
    for j, l in enumerate(rows):
        c = [x.strip() for x in l.split(',')]
        try:
            step = int(float(c[idx_i]))
        except (ValueError, IndexError):
            continue
        if not (_on_grid(step) or j == len(rows) - 1):
            continue
        t = float(c[t_i])
        cells = [str(step), num(t, 2)]
        for n in ents:
            m = cols[n]
            name = c[m['Entity_Name']] if m['Entity_Name'] < len(c) else ''
            for k in KEEP_COLUMNS:
                if not name:
                    cells.append('')
                elif k == 'Entity_Name':
                    cells.append(name)
                else:
                    cells.append(num(float(c[m[k]]), DIGITS[k]))
        kept.append(', '.join(cells) + ', ')
        times.append(round(t, 2))
    body = pre + [', '.join(out_hdr) + ', '] + kept
    return '\n'.join(body) + '\n', times


def _round_state(s: dict) -> dict:
    return {'t': round(s['t'], 2), 'x': round(s['x'], 3), 'y': round(s['y'], 3),
            'h': round(s['h'], 4), 'v': round(s['v'], 3)}


def _pos_at(states: list[dict], t: float):
    """Planned position at t (linear between states; held after a stop; None outside the plan)."""
    if t < states[0]['t']:
        return None
    for a, b in zip(states, states[1:]):
        if a['t'] <= t <= b['t']:
            w = (t - a['t']) / (b['t'] - a['t']) if b['t'] > a['t'] else 0.0
            return a['x'] + w * (b['x'] - a['x']), a['y'] + w * (b['y'] - a['y'])
    last = states[-1]
    return (last['x'], last['y']) if last['v'] <= 0.0 else None


def _plan_moved(old: dict, new: dict) -> float:
    """Largest distance between two plans' predicted positions at new.t + 0.5 .. 3 s."""
    m = 0.0
    for k in range(1, 7):
        a = _pos_at(old['states'], new['t'] + 0.5 * k)
        b = _pos_at(new['states'], new['t'] + 0.5 * k)
        if a and b:
            m = max(m, math.hypot(a[0] - b[0], a[1] - b[1]))
    return m


def slim_trace_doc(doc: dict, times: list[float] | None) -> dict:
    """driven -> the CSV times (or the same grid when there is no CSV); plans -> one per PLAN_PERIOD."""
    keep_t = set(times) if times else None
    for tr in doc.get('tracks', []):
        drv = tr.get('driven') or []
        out = []
        for j, s in enumerate(drv):
            t = round(s['t'], 2)
            if keep_t is not None:
                ok = t in keep_t
            else:
                ok = _on_grid(int(round(s['t'] / SIM_DT))) or j == len(drv) - 1
            if ok:
                out.append(_round_state(s))
        tr['driven'] = out
        plans = []
        for p in tr.get('plans') or []:
            p = {'t': round(p['t'], 2), 'states': [_round_state(s) for s in p['states']]}
            k = p['t'] / PLAN_PERIOD
            if abs(k - round(k)) < 1e-6 or not plans or _plan_moved(plans[-1], p) > PLAN_CHANGE_M:
                plans.append(p)
        tr['plans'] = plans
        v = tr.get('vehicle')
        if v:
            tr['vehicle'] = {k: round(x, 3) if isinstance(x, float) else x for k, x in v.items()}
    return doc


def dump_trace(doc: dict) -> str:
    return json.dumps(doc, separators=(',', ':')) + '\n'


def trace_path_of(csv: Path) -> Path:
    """logs/<TC>/<run>.csv -> logs/<TC>/<run>.planning-trace.json"""
    return csv.with_name(csv.stem + '.planning-trace.json')


def slim_run(csv: Path, scenario: Path | None = None) -> None:
    """Slim one run's CSV and (if present) its planning trace, in place."""
    rel = None
    if scenario is not None:
        try:
            rel = scenario.resolve().relative_to(REPO).as_posix()
        except ValueError:
            rel = scenario.name
    text, times = slim_csv_text(csv.read_text(), rel)
    csv.write_text(text)
    tp = trace_path_of(csv)
    if tp.exists():
        tp.write_text(dump_trace(slim_trace_doc(json.loads(tp.read_text()), times)))


def file_ref(path: Path, rel: str) -> dict:
    data = path.read_bytes()
    return {'path': rel, 'url': None, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}


def ref_path(v) -> str | None:
    """`log` / `trace` of a run: {"path": ...} or the old plain string."""
    if isinstance(v, dict):
        return v.get('path')
    return v if isinstance(v, str) else None


def _scenario_of(tc_id: str) -> Path | None:
    import yaml
    for y in (REPO / 'testcases').rglob('testcase.yaml'):
        tc = yaml.safe_load(y.read_text())
        if tc.get('id') == tc_id:
            return y.parent / tc['scenario']
    return None


def slim_results_dir(d: Path) -> None:
    check = d.name == 'scenario-check'
    for f in sorted(d.glob('*.json')):
        doc = json.loads(f.read_text())
        scenario = _scenario_of(doc['testcase'])
        for r in doc['runs']:
            if check:
                r['log'] = None
                r.pop('trace', None)
                continue
            for key in ('log', 'trace'):
                rel = ref_path(r.get(key))
                if not rel:
                    continue
                if key == 'log':
                    slim_run(d / rel, scenario)
                r[key] = file_ref(d / rel, rel)
        f.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n')
    if check and (d / 'logs').exists():
        shutil.rmtree(d / 'logs')


def logs_size() -> tuple[int, int]:
    files = [p for p in (REPO / 'results').glob('*/logs/**/*') if p.is_file()]
    return len(files), sum(p.stat().st_size for p in files)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--check', action='store_true', help='only report the size of results/*/logs')
    a = ap.parse_args()
    n0, b0 = logs_size()
    if not a.check:
        for d in sorted((REPO / 'results').iterdir()):
            if d.is_dir():
                slim_results_dir(d)
    n1, b1 = logs_size()
    print(f'logs: {n0} files {b0 / 1e6:.1f} MB' + ('' if a.check else f' -> {n1} files {b1 / 1e6:.1f} MB'))


if __name__ == '__main__':
    sys.exit(main())
