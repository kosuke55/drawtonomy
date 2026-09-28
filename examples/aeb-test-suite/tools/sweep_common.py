"""Shared helpers for the runner.

- load test cases (testcases/**/testcase.yaml; groups can nest)
- expand OpenSCENARIO ParameterValueDistribution (Deterministic)
- read xosc ParameterDeclaration defaults
- evaluate criteria
- ctypes wrapper for esmini (libesminiLib)
"""

from __future__ import annotations

import ctypes
import hashlib
import itertools
import math
import os
import xml.etree.ElementTree as ET
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parent.parent
ESMINI_BIN = Path(os.environ.get('ESMINI_BIN', Path.home() / 'esmini-bin/esmini/bin'))
ESMINI_LIB = Path(os.environ.get('ESMINI_LIB', ESMINI_BIN / 'libesminiLib.dylib'))


# --------------------------------------------------------------------------- testcases
def load_testcases() -> list[dict]:
    """Read every testcase.yaml under testcases/ (groups can nest).

    A folder with testcase.yaml is one test case; folders above it are groups (optional
    group.yaml). `_dir` = the test case folder, `_groups` = group paths from the top (relative to
    testcases/). IDs must be unique (they key the result files)."""
    out = []
    seen: dict[str, Path] = {}
    root = REPO / 'testcases'
    for y in sorted(root.rglob('testcase.yaml')):
        tc = yaml.safe_load(y.read_text())
        tc['_dir'] = y.parent
        rel = y.parent.relative_to(root)
        tc['_groups'] = ['/'.join(rel.parts[:k]) for k in range(1, len(rel.parts))]
        if tc['id'] in seen:
            raise ValueError(f"duplicate testcase id {tc['id']}: {seen[tc['id']]} / {y}")
        seen[tc['id']] = y
        out.append(tc)
    return out


def sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def _num(s: str):
    v = float(s)
    return int(v) if v.is_integer() else v


def xosc_param_defaults(xosc: Path) -> dict:
    root = ET.parse(xosc).getroot()
    out = {}
    pd = root.find('ParameterDeclarations')
    if pd is None:
        return out
    for p in pd.findall('ParameterDeclaration'):
        name, typ, val = p.get('name'), p.get('parameterType'), p.get('value')
        if typ in ('double', 'integer', 'unsignedInt', 'int'):
            try:
                out[name] = _num(val)
                continue
            except ValueError:
                pass
        out[name] = val
    return out


def xosc_stop_time(xosc: Path, default: float = 30.0) -> float:
    """SimulationTimeCondition of the StopTrigger (default if absent)."""
    root = ET.parse(xosc).getroot()
    st = root.find('Storyboard/StopTrigger')
    if st is not None:
        for c in st.iter('SimulationTimeCondition'):
            try:
                return float(c.get('value'))
            except (TypeError, ValueError):
                pass
    return default


def expand_pvd(pvd: Path) -> tuple[list[dict], list[dict]]:
    """Expand a Deterministic distribution into all combinations.

    Returns (parameters, combos):
      parameters = [{'name', 'values'}] in declaration order
      combos     = [{name: value}], the product in declaration order (first parameter varies slowest)
    """
    root = ET.parse(pvd).getroot()
    det = root.find('ParameterValueDistribution/Deterministic')
    if det is None:
        raise ValueError(f'{pvd}: Deterministic distribution only')
    factors: list[list[dict]] = []
    parameters: list[dict] = []
    for el in det:
        if el.tag == 'DeterministicSingleParameterDistribution':
            name = el.get('parameterName')
            vals = []
            ds = el.find('DistributionSet')
            dr = el.find('DistributionRange')
            if ds is not None:
                vals = [_num(e.get('value')) for e in ds.findall('Element')]
            elif dr is not None:
                step = float(dr.get('stepWidth'))
                rg = dr.find('Range')
                lo, hi = float(rg.get('lowerLimit')), float(rg.get('upperLimit'))
                k = 0
                while lo + k * step <= hi + 1e-9:
                    vals.append(_num(f'{lo + k * step:.10g}'))
                    k += 1
            elif el.find('UserDefinedDistribution') is not None:
                raise ValueError('UserDefinedDistribution is not supported')
            parameters.append({'name': name, 'values': vals})
            factors.append([{name: v} for v in vals])
        elif el.tag == 'DeterministicMultiParameterDistribution':
            sets = []
            for pvs in el.iter('ParameterValueSet'):
                sets.append({a.get('parameterRef'): _num_or_str(a.get('value'))
                             for a in pvs.findall('ParameterAssignment')})
            names = sorted({k for s in sets for k in s})
            for n in names:
                parameters.append({'name': n, 'values': sorted({s[n] for s in sets if n in s}, key=str)})
            factors.append(sets)
    combos = []
    for prod in itertools.product(*factors):
        d = {}
        for part in prod:
            d.update(part)
        combos.append(d)
    return parameters, combos


def _num_or_str(s: str):
    try:
        return _num(s)
    except ValueError:
        return s


# --------------------------------------------------------------------------- criteria
_OPS = {
    '==': lambda a, b: a == b,
    '!=': lambda a, b: a != b,
    '>=': lambda a, b: a >= b,
    '>': lambda a, b: a > b,
    '<=': lambda a, b: a <= b,
    '<': lambda a, b: a < b,
}


def eval_criteria(criteria: list[dict], kpis: dict) -> list[str]:
    """Return the kpi names of failed criteria. None for min_ttc / min_gap means +inf;
    any other None fails."""
    failed = []
    for c in criteria:
        k, op, ref = c['kpi'], c['op'], c['value']
        v = kpis.get(k)
        if v is None and k in ('min_ttc', 'min_gap'):
            v = math.inf
        if v is None or not _OPS[op](v, ref):
            failed.append(k)
    return failed


# --------------------------------------------------------------------------- esmini
class SEState(ctypes.Structure):
    _fields_ = [
        ('id', ctypes.c_int), ('model_id', ctypes.c_int), ('ctrl_type', ctypes.c_int),
        ('timestamp', ctypes.c_double),
        ('x', ctypes.c_double), ('y', ctypes.c_double), ('z', ctypes.c_double),
        ('h', ctypes.c_double), ('p', ctypes.c_double), ('r', ctypes.c_double),
        ('roadId', ctypes.c_uint32), ('junctionId', ctypes.c_uint32),
        ('t', ctypes.c_double), ('laneId', ctypes.c_int), ('laneOffset', ctypes.c_double),
        ('s', ctypes.c_double), ('speed', ctypes.c_double),
        ('centerOffsetX', ctypes.c_double), ('centerOffsetY', ctypes.c_double), ('centerOffsetZ', ctypes.c_double),
        ('width', ctypes.c_double), ('length', ctypes.c_double), ('height', ctypes.c_double),
        ('objectType', ctypes.c_int), ('objectCategory', ctypes.c_int),
        ('wheel_angle', ctypes.c_double), ('wheel_rot', ctypes.c_double),
        ('visibilityMask', ctypes.c_int),
    ]


PARAM_CB = ctypes.CFUNCTYPE(None, ctypes.c_void_p)
SBE_CB = ctypes.CFUNCTYPE(None, ctypes.c_char_p, ctypes.c_int, ctypes.c_int, ctypes.c_char_p)

SBE_EVENT = 6
SBE_RUNNING = 2
SBE_COMPLETE = 3


class Esmini:
    """Thin libesminiLib wrapper (one per process; esmini has global state)."""

    def __init__(self, lib_path: Path = ESMINI_LIB):
        lib = ctypes.CDLL(str(lib_path))
        d, i, p = ctypes.c_double, ctypes.c_int, ctypes.c_char_p
        lib.SE_InitWithArgs.argtypes = [i, ctypes.POINTER(p)]
        lib.SE_InitWithArgs.restype = i
        lib.SE_StepDT.argtypes = [d]
        lib.SE_StepDT.restype = i
        lib.SE_GetSimulationTime.restype = d
        lib.SE_GetQuitFlag.restype = i
        lib.SE_GetNumberOfObjects.restype = i
        lib.SE_GetId.argtypes = [i]
        lib.SE_GetId.restype = i
        lib.SE_GetIdByName.argtypes = [p]
        lib.SE_GetIdByName.restype = i
        lib.SE_GetObjectName.argtypes = [i]
        lib.SE_GetObjectName.restype = p
        lib.SE_GetObjectState.argtypes = [i, ctypes.POINTER(SEState)]
        lib.SE_GetObjectState.restype = i
        lib.SE_ReportObjectPosXYH.argtypes = [i, d, d, d]
        lib.SE_ReportObjectSpeed.argtypes = [i, d]
        lib.SE_ReportObjectAcc.argtypes = [i, d, d, d]
        lib.SE_GetObjectNumberOfCollisions.argtypes = [i]
        lib.SE_GetObjectNumberOfCollisions.restype = i
        lib.SE_GetObjectCollision.argtypes = [i, i]
        lib.SE_GetObjectCollision.restype = i
        lib.SE_SetParameterDouble.argtypes = [p, d]
        lib.SE_SetParameterDouble.restype = i
        lib.SE_SetParameterString.argtypes = [p, p]
        lib.SE_RegisterParameterDeclarationCallback.argtypes = [PARAM_CB, ctypes.c_void_p]
        lib.SE_RegisterStoryBoardElementStateChangeCallback.argtypes = [SBE_CB]
        self.lib = lib
        self._keep = []

    def init(self, xosc: Path, params: dict, dt: float, csv: Path | None, log: Path | None) -> int:
        lib = self.lib
        self.events: dict[str, float] = {}      # event name -> first RUNNING time
        self.events_done: dict[str, float] = {}

        def on_params(_):
            for k, v in params.items():
                if isinstance(v, (int, float)):
                    lib.SE_SetParameterDouble(k.encode(), float(v))
                else:
                    lib.SE_SetParameterString(k.encode(), str(v).encode())

        pcb = PARAM_CB(on_params)
        self._keep = [pcb]
        lib.SE_RegisterParameterDeclarationCallback(pcb, None)
        args = ['esmini', '--osc', str(xosc), '--headless', '--fixed_timestep', f'{dt}', '--collision',
                '--disable_stdout']
        args += ['--logfile_path', str(log)] if log else ['--disable_log']
        if csv:
            args += ['--csv_logger', str(csv)]
        argv = (ctypes.c_char_p * len(args))(*[a.encode() for a in args])
        rc = lib.SE_InitWithArgs(len(args), argv)
        if rc != 0:
            return rc

        def on_sbe(name, typ, state, _path):
            if typ != SBE_EVENT:
                return
            n = name.decode()
            t = lib.SE_GetSimulationTime()
            if state == SBE_RUNNING:
                self.events.setdefault(n, t)
            elif state == SBE_COMPLETE:
                self.events_done.setdefault(n, t)

        scb = SBE_CB(on_sbe)
        self._keep.append(scb)
        lib.SE_RegisterStoryBoardElementStateChangeCallback(scb)
        return 0

    def objects(self) -> dict[str, SEState]:
        lib = self.lib
        out = {}
        for k in range(lib.SE_GetNumberOfObjects()):
            oid = lib.SE_GetId(k)
            st = SEState()
            lib.SE_GetObjectState(oid, ctypes.byref(st))
            out[lib.SE_GetObjectName(oid).decode()] = st
        return out

    def collisions(self, obj_id: int) -> list[int]:
        n = self.lib.SE_GetObjectNumberOfCollisions(obj_id)
        return [self.lib.SE_GetObjectCollision(obj_id, k) for k in range(n)]

    def close(self):
        self.lib.SE_Close()


# --------------------------------------------------------------------------- geometry
def relative(ego: SEState, obj: SEState) -> tuple[float, float, float]:
    """obj relative to ego: (bumper gap, lateral offset, sum of half widths).
    Uses body centers (reference point + centerOffsetX) in the ego heading frame."""
    ch, sh = math.cos(ego.h), math.sin(ego.h)
    ex = ego.x + ego.centerOffsetX * ch
    ey = ego.y + ego.centerOffsetX * sh
    ox = obj.x + obj.centerOffsetX * math.cos(obj.h)
    oy = obj.y + obj.centerOffsetX * math.sin(obj.h)
    dx, dy = ox - ex, oy - ey
    lon = dx * ch + dy * sh
    lat = -dx * sh + dy * ch
    gap = lon - ego.length / 2 - obj.length / 2
    return gap, lat, (ego.width + obj.width) / 2


# --------------------------------------------------------------------------- OBB (same geometry as drawtonomy FAIL CONDITIONS)
#   Collision            = the two OBBs (center = reference point + centerOffsetX, heading h,
#                          length x width) overlap by the separating axis theorem (SAT).
#   LongitudinalDistance = gap between both OBBs projected on the ego heading (negative = overlap).
# A 1-D gap alone misses the corner of a cutting-in vehicle that is still at an angle.
def obb_corners(st: SEState) -> list[tuple[float, float]]:
    ch, sh = math.cos(st.h), math.sin(st.h)
    cx = st.x + st.centerOffsetX * ch
    cy = st.y + st.centerOffsetX * sh
    hl, hw = st.length / 2, st.width / 2
    return [(cx + lx * ch - ly * sh, cy + lx * sh + ly * ch) for lx, ly in ((hl, hw), (hl, -hw), (-hl, -hw), (-hl, hw))]


def _proj(corners, ax, ay):
    ds = [x * ax + y * ay for x, y in corners]
    return min(ds), max(ds)


def obb_overlap(a: SEState, b: SEState) -> bool:
    """Whether two OBBs overlap (SAT). Touching counts as overlap."""
    ca, cb = obb_corners(a), obb_corners(b)
    for rect in (ca, cb):
        for i in range(4):
            (x1, y1), (x2, y2) = rect[i], rect[(i + 1) % 4]
            nx, ny = -(y2 - y1), x2 - x1
            n = math.hypot(nx, ny)
            if n == 0:
                continue
            nx, ny = nx / n, ny / n
            a0, a1 = _proj(ca, nx, ny)
            b0, b1 = _proj(cb, nx, ny)
            if a1 < b0 or b1 < a0:
                return False
    return True


def obb_longitudinal(ego: SEState, obj: SEState) -> tuple[float, bool, bool]:
    """Return (gap along the ego heading, negative = overlap; obj is ahead;
    OBBs overlap on the ego lateral axis)."""
    ax, ay = math.cos(ego.h), math.sin(ego.h)
    ce, co = obb_corners(ego), obb_corners(obj)
    e0, e1 = _proj(ce, ax, ay)
    o0, o1 = _proj(co, ax, ay)
    ex = ego.x + ego.centerOffsetX * ax
    ey = ego.y + ego.centerOffsetX * ay
    ox = obj.x + obj.centerOffsetX * math.cos(obj.h)
    oy = obj.y + obj.centerOffsetX * math.sin(obj.h)
    ahead = ox * ax + oy * ay >= ex * ax + ey * ay
    free = (o0 - e1) if ahead else (e0 - o1)
    lx, ly = -ay, ax
    l0, l1 = _proj(ce, lx, ly)
    m0, m1 = _proj(co, lx, ly)
    lateral_overlap = not (l1 <= m0 or m1 <= l0)
    return free, ahead, lateral_overlap
