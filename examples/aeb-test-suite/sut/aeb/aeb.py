"""Sample SUT: a TTC-based staged AEB (Autonomous Emergency Braking).

A stand-in for your own driving software. It depends on neither the simulator (esmini) nor the
runner. The interface is:

    aeb = AEB(config_dict)
    accel = aeb.step(obs)        # obs: Observation -> target acceleration [m/s²] (braking < 0)

Three stages, Euro NCAP style: warn -> partial -> full.
Each stage starts at a TTC threshold (ETTC, which includes the lead's deceleration, when
use_ettc is set). Braking holds until the threat clears or the ego stops.
The output has a dead time and a jerk limit.
Only objects ahead, within sensor range and in the ego lane, are considered.

Target size (observation width / length) affects detection:
- The lane gate is tuned for a reference width ref_width (a car, 2.0 m) and measured at the
  target's edge (shifted by (width - ref_width) / 2). Narrow targets enter the gate later.
- Recognition range scales with apparent width: min(sensor_range, camera_range x width / ref_width).
  With camera_range = 100 m a motorcycle (0.8 m) is detected only within 40 m.
- Narrow targets need to be tracked for narrow_confirm x max(0, 1 - width / ref_width) s before
  they are confirmed (0.48 s for a motorcycle, 0 for a car).
For a car (width = ref_width) none of this changes the result.
"""

from __future__ import annotations

import math
from collections import deque
from dataclasses import dataclass, field

STAGES = ('off', 'warn', 'partial', 'full')


@dataclass
class TrackedObject:
    """One object as seen from the ego (sensor output)."""
    name: str
    gap: float          # ego front to object rear [m] (negative = overlap)
    lateral: float      # lateral offset of object center [m] (left positive)
    speed: float        # object longitudinal speed [m/s]
    width: float = 2.0  # object width [m]
    length: float = 5.0  # object length [m]


@dataclass
class Observation:
    t: float                    # time [s]
    ego_speed: float            # ego speed [m/s]
    ego_accel: float            # ego measured acceleration [m/s²]
    objects: list[TrackedObject] = field(default_factory=list)


DEFAULTS = {
    'sensor_range': 100.0,      # [m]
    'lane_gate': 1.5,           # in-lane lateral gate [m] (for a ref_width target, at its center)
    'ref_width': 2.0,           # target width the gate is tuned for [m] (a car)
    'camera_range': 100.0,      # recognition range for a ref_width target [m]
    'narrow_confirm': 0.8,      # confirm time for a zero-width target [s] (0 at ref_width)
    'warn_ttc': 2.6,            # [s]
    'partial_ttc': 1.6,
    'full_ttc': 0.9,
    'partial_decel': 4.0,       # [m/s²]
    'full_decel': 8.0,
    'use_ettc': False,          # True: use ETTC (includes lead deceleration)
    'response_delay': 0.3,      # brake command dead time [s]
    'jerk_limit': 15.0,         # [m/s³]
    'release_hold': 0.5,        # release after the threat clears for this long [s]
    'stop_margin': 1.0,         # distance margin subtracted in TTC [m]
    # Brake easing near a stationary target once a stop is assured. None = off
    'ease_off_ratio': None,     # ease off when stopping distance <= ratio x remaining
    'reapply_ratio': 0.7,       # re-apply when stopping distance >= ratio x remaining
    'ease_decel': 2.0,          # decel while eased [m/s²]
    'ease_off_decel': 'command',  # decel for the estimate: 'command' or 'measured'
    'dt': 0.02,
}


class AEB:
    def __init__(self, config: dict | None = None):
        self.cfg = {**DEFAULTS, **(config or {})}
        self.reset()

    # ------------------------------------------------------------------ state
    def reset(self) -> None:
        dt = self.cfg['dt']
        n_delay = max(0, int(round(self.cfg['response_delay'] / dt)))
        self._pipe: deque[float] = deque([0.0] * n_delay, maxlen=n_delay) if n_delay else deque()
        self._out = 0.0
        self._cmd = 0.0
        self._stage = 'off'
        self._latched_decel = 0.0
        self._separating_for = 0.0
        self._eased = False
        self._peak_decel = 0.0
        self._prev: dict[str, tuple[float, float]] = {}   # name -> (t, speed)
        self._target_accel: dict[str, float] = {}
        self._seen_since: dict[str, float] = {}           # name -> time it entered the gate and range
        self.status = {'stage': 'off', 'ttc': None, 'target': None}

    # ------------------------------------------------------------------ helpers
    def _estimate_accel(self, obj: TrackedObject, t: float) -> float:
        prev = self._prev.get(obj.name)
        a = self._target_accel.get(obj.name, 0.0)
        if prev is not None and t > prev[0]:
            raw = (obj.speed - prev[1]) / (t - prev[0])
            a = 0.7 * a + 0.3 * raw          # first-order low-pass
        self._prev[obj.name] = (t, obj.speed)
        self._target_accel[obj.name] = a
        return a

    def _gate_for(self, obj: TrackedObject) -> float:
        """Max center lateral offset to count as in-lane, measured at the target edge."""
        return self.cfg['lane_gate'] + (obj.width - self.cfg['ref_width']) / 2.0

    def _confirm_for(self, obj: TrackedObject) -> float:
        """Time a target must be tracked before it is confirmed [s] (longer when narrow)."""
        c = self.cfg
        return c['narrow_confirm'] * max(0.0, 1.0 - obj.width / c['ref_width'])

    def _range_for(self, obj: TrackedObject) -> float:
        """Detection range: the shorter of sensor range and width-scaled recognition range."""
        c = self.cfg
        return min(c['sensor_range'], c['camera_range'] * obj.width / c['ref_width'])

    def _ttc(self, gap: float, v_rel: float, a_rel: float) -> float | None:
        """Time until gap reaches 0. v_rel = closing speed (> 0 closing), a_rel = closing accel."""
        if gap <= 0:
            return 0.0
        if not self.cfg['use_ettc'] or abs(a_rel) < 1e-3:
            return gap / v_rel if v_rel > 1e-3 else None
        # smallest positive root of gap - v_rel t - 0.5 a_rel t^2 = 0
        disc = v_rel * v_rel + 2.0 * a_rel * gap
        if disc < 0:
            return None
        t = (-v_rel + math.sqrt(disc)) / a_rel if a_rel != 0 else None
        if t is None or t <= 0:
            return gap / v_rel if v_rel > 1e-3 else None
        return t

    # ------------------------------------------------------------------ main
    def step(self, obs: Observation) -> float:
        c = self.cfg
        # 1) nearest in-lane object within range
        target = None
        for o in obs.objects:
            a_est = self._estimate_accel(o, obs.t)
            if o.gap > self._range_for(o) or o.gap < -1.0 or abs(o.lateral) > self._gate_for(o):
                self._seen_since.pop(o.name, None)
                continue
            since = self._seen_since.setdefault(o.name, obs.t)
            if obs.t - since < self._confirm_for(o) - 1e-9:
                continue
            if target is None or o.gap < target[0].gap:
                target = (o, a_est)

        ttc = None
        closing = False
        if target is not None:
            o, a_t = target
            v_rel = obs.ego_speed - o.speed
            a_rel = -a_t      # lead braking (a_t < 0) -> positive closing accel; ego assumed at constant speed
            closing = v_rel > 0.05 or (c['use_ettc'] and a_rel > 0.5 and o.speed > 0.1)
            if closing:
                ttc = self._ttc(o.gap - c['stop_margin'], max(v_rel, 0.0), a_rel)

        # 2) stage: rise on TTC, release when the threat clears or the target is lost
        want = 'off'
        if ttc is not None:
            if ttc < c['full_ttc']:
                want = 'full'
            elif ttc < c['partial_ttc']:
                want = 'partial'
            elif ttc < c['warn_ttc']:
                want = 'warn'
        if STAGES.index(want) > STAGES.index(self._stage):
            self._stage = want
            self._separating_for = 0.0
        elif self._stage != 'off':
            # do not release while the target is nearly stopped (avoids release/re-trigger loops)
            target_moving = target is not None and target[0].speed > 0.5
            if target is None or (not closing and target_moving):
                self._separating_for += c['dt']
                if self._separating_for >= c['release_hold'] and obs.ego_speed > 0.05:
                    self._stage = want
            else:
                self._separating_for = 0.0

        braking = self._stage in ('partial', 'full')
        if braking:
            self._peak_decel = max(self._peak_decel, -obs.ego_accel)
        else:
            self._peak_decel = 0.0
            self._eased = False

        decel = {'off': 0.0, 'warn': 0.0, 'partial': c['partial_decel'], 'full': c['full_decel']}[self._stage]
        # easing: near a stationary target, ease off if the estimated decel stops in time (hysteresis)
        if braking and c['ease_off_ratio'] is not None and target is not None and target[0].speed < 0.5:
            a_assumed = c['full_decel'] if c['ease_off_decel'] == 'command' else max(self._peak_decel, 0.5)
            v_rel = max(obs.ego_speed - target[0].speed, 0.0)
            d_stop = v_rel * v_rel / (2.0 * a_assumed)
            avail = max(target[0].gap - c['stop_margin'], 0.0)
            if not self._eased and d_stop <= c['ease_off_ratio'] * avail:
                self._eased = True
            elif self._eased and d_stop >= c['reapply_ratio'] * avail:
                self._eased = False
            if self._eased:
                decel = min(decel, c['ease_decel'])
        # hold the stop once stopped while braking
        if obs.ego_speed < 0.05 and self._stage in ('partial', 'full'):
            decel = c['full_decel']
        cmd = -decel
        self._cmd = cmd

        # 3) dead time -> jerk limit
        if self._pipe.maxlen:
            delayed = self._pipe[0]
            self._pipe.append(cmd)
        else:
            delayed = cmd
        max_da = c['jerk_limit'] * c['dt']
        self._out += max(-max_da, min(max_da, delayed - self._out))

        self.status = {'stage': self._stage, 'ttc': ttc, 'target': target[0].name if target else None}
        return self._out

    # ------------------------------------------------------------------ plan
    def predict_outputs(self, n: int) -> list[float]:
        """Plan for this cycle: output accel [m/s²] for the next n cycles if the current
        command (_cmd) is held (first = the value the last step() returned).

        Runs a copy of the output model (dead-time pipe + jerk limit); internal state is unchanged."""
        c = self.cfg
        pipe = deque(self._pipe, maxlen=self._pipe.maxlen)
        out = self._out
        cmd = self._cmd
        max_da = c['jerk_limit'] * c['dt']
        outs = [out]
        for _ in range(n - 1):
            if pipe.maxlen:
                delayed = pipe[0]
                pipe.append(cmd)
            else:
                delayed = cmd
            out += max(-max_da, min(max_da, delayed - out))
            outs.append(out)
        return outs
