// Layer 4: geometric continuity (`geom.*`).
//
// Reference-line arithmetic, reusing the exporter's geometry evaluation
// (`evalGeometry`, which covers line / arc / spiral / paramPoly3 / poly3) so
// the validator and the exporter agree by construction about what a geometry
// record means.
//
// Checks:
//   geom.plan-view-gap        consecutive geometries of one road do not meet
//   geom.plan-view-heading    ... or meet at a heading discontinuity
//   geom.road-length-mismatch road@length disagrees with the plan-view sum
//   geom.negative-lane-width  a <width> record evaluates negative
//   geom.road-link-gap        two linked roads do not touch at their contact
//
// ---------------------------------------------------------------------------
// Threshold calibration (measured 2026-08-22 over 6 fixtures + 26 esmini maps,
// 401 geometry joints / 182 roads / 242 road links)
// ---------------------------------------------------------------------------
//
// Within one road, real maps are near-exact and the defaults have wide margin:
//
//   plan-view position gap   observed max 4.0e-4 m   default 0.02 m   (50x)
//   plan-view heading step   observed max 2.3e-5 rad default 0.005 rad (200x)
//   road length vs sum       observed max 4.0e-16    default 1 %      (huge)
//
// Between roads it is a different story, and the reason is structural rather
// than a matter of precision. `road@length`-scale gaps at a link are normal:
//
//   1. A road carrying a <laneOffset> has its reference line laterally shifted
//      from the lane geometry. Two roads with different offsets meet along
//      their *lanes* while their reference lines stay apart by exactly the
//      offset difference. fabriksgatan's connecting roads (laneOffset a=1.75)
//      linking to mainlines (a=0) produce a uniform 1.75 m; multi_intersections
//      produces 3.75 m the same way. Both maps are correct.
//   2. Some shipped maps simply contain link records their geometry does not
//      honour: soderleden road 7 declares its predecessor to be road 2 at that
//      road's end, 66 m from where road 7 actually begins. esmini drives this
//      map regardless, because it routes through the junction rather than the
//      stray link.
//
// So the road-link check is reported as a *warning*: it is real evidence worth
// surfacing, but it must not redden a map that ships and works. The lane offset
// difference is subtracted before comparing, which removes cause (1) exactly
// and leaves cause (2) visible.
//
// Lane widths need a tolerance for the opposite reason — not structure, but
// arithmetic. Merge and exit lanes are authored to close at exactly zero, e.g.
// `3.5 - 0.0042*ds^2 + 0.000056*ds^3` reaching 0 at ds = 50. In IEEE-754 those
// land a few ulps below zero: all 8 negative evaluations across the two corpora
// fall between -8.9e-16 and -1.8e-15 m, in soderleden, two_plus_one and
// multi_intersections. The 1 mm default is twelve orders of magnitude above
// that noise and still far below any width a map could intend, so it separates
// the two cleanly rather than splitting a continuum.

import { evalGeometry } from '../../exporter/odrGeometry.js'
import type { OdrMap, OdrRoad, OdrWidth } from '../../exporter/opendriveParser.js'
import type { OdrFinding, ResolvedGeometryThresholds } from '../types.js'

/** Wrap an angle to (-pi, pi]. */
function normalizeAngle(a: number): number {
  let x = a
  while (x > Math.PI) x -= 2 * Math.PI
  while (x <= -Math.PI) x += 2 * Math.PI
  return x
}

/** Evaluate a cubic `a + b*ds + c*ds^2 + d*ds^3`. */
function evalCubic(rec: { a: number; b: number; c: number; d: number }, ds: number): number {
  return rec.a + rec.b * ds + rec.c * ds * ds + rec.d * ds * ds * ds
}

/** The road's lateral lane offset at station `s` (0 when it declares none). */
function laneOffsetAt(road: OdrRoad, s: number): number {
  const records = road.laneOffsets
  if (records.length === 0) return 0
  let applicable = records[0]
  for (const rec of records) {
    if (rec.s <= s) applicable = rec
    else break
  }
  return evalCubic(applicable, s - applicable.s)
}

interface Pose {
  x: number
  y: number
  hdg: number
}

/** Pose at a road's start or end, on its reference line. */
function poseAtEnd(road: OdrRoad, at: 'start' | 'end'): Pose | null {
  if (road.planView.length === 0) return null
  if (at === 'start') {
    const g = road.planView[0]
    return evalGeometry(g, 0)
  }
  const g = road.planView[road.planView.length - 1]
  return evalGeometry(g, g.length)
}

/** Station of a road's start or end. */
const stationAtEnd = (road: OdrRoad, at: 'start' | 'end'): number =>
  at === 'start' ? 0 : road.length

export function checkGeometry(
  map: OdrMap,
  thresholds: ResolvedGeometryThresholds
): OdrFinding[] {
  const findings: OdrFinding[] = []
  const roadById = new Map<string, OdrRoad>()
  for (const road of map.roads) {
    if (!roadById.has(road.id)) roadById.set(road.id, road)
  }

  for (const road of map.roads) {
    // --- plan-view continuity ---------------------------------------------
    for (let i = 0; i + 1 < road.planView.length; i++) {
      const current = road.planView[i]
      const next = road.planView[i + 1]
      const end = evalGeometry(current, current.length)

      const gap = Math.hypot(end.x - next.x, end.y - next.y)
      if (gap > thresholds.planViewGapMeters) {
        findings.push({
          severity: 'error',
          category: 'MAP_DEFECT',
          rule: 'geom.plan-view-gap',
          message: `road ${road.id}: geometry ${i} ends at (${end.x.toFixed(3)}, ${end.y.toFixed(3)}) but geometry ${i + 1} starts at (${next.x.toFixed(3)}, ${next.y.toFixed(3)}) — a gap of ${gap.toFixed(3)} m`,
          location: { roadId: road.id, s: next.s },
        })
      }

      const dHdg = Math.abs(normalizeAngle(end.hdg - next.hdg))
      if (dHdg > thresholds.planViewHeadingRad) {
        findings.push({
          severity: 'error',
          category: 'MAP_DEFECT',
          rule: 'geom.plan-view-heading',
          message: `road ${road.id}: heading jumps by ${dHdg.toFixed(5)} rad between geometry ${i} and ${i + 1}`,
          location: { roadId: road.id, s: next.s },
        })
      }
    }

    // --- road length vs plan-view sum --------------------------------------
    if (road.planView.length > 0 && road.length > 0) {
      const sum = road.planView.reduce((acc, g) => acc + g.length, 0)
      const relative = Math.abs(sum - road.length) / road.length
      if (relative > thresholds.lengthMismatchRatio) {
        findings.push({
          severity: 'error',
          category: 'MAP_DEFECT',
          rule: 'geom.road-length-mismatch',
          message: `road ${road.id}: length="${road.length}" but its plan-view geometries sum to ${sum.toFixed(3)} m (${(relative * 100).toFixed(1)} % off)`,
          location: { roadId: road.id },
        })
      }
    }

    if (road.planView.length === 0 && road.length > 0) {
      findings.push({
        severity: 'error',
        category: 'MAP_DEFECT',
        rule: 'geom.no-plan-view',
        message: `road ${road.id} has length ${road.length} but no <planView> geometry`,
        location: { roadId: road.id },
      })
    }

    // --- lane widths -------------------------------------------------------
    //
    // A width record spans from its own sOffset to the next one (or to the end
    // of the lane section). Evaluating both ends of that span catches a plain
    // negative constant as well as a ramp that crosses zero, without the false
    // alarms that sampling a cubic's interior would produce on records whose
    // higher-order terms only matter outside their own span.
    for (const [sectionIndex, section] of road.laneSections.entries()) {
      const sectionEnd =
        sectionIndex + 1 < road.laneSections.length
          ? road.laneSections[sectionIndex + 1].s
          : road.length
      const sectionLength = Math.max(sectionEnd - section.s, 0)

      for (const lane of [...section.left, ...section.right]) {
        const widths: OdrWidth[] = lane.widths
        for (const [wi, width] of widths.entries()) {
          const spanEnd = wi + 1 < widths.length ? widths[wi + 1].sOffset : sectionLength
          const ds = Math.max(spanEnd - width.sOffset, 0)
          const atStart = evalCubic(width, 0)
          const atEnd = evalCubic(width, ds)
          const worst = Math.min(atStart, atEnd)
          if (worst < -thresholds.negativeWidthToleranceMeters) {
            findings.push({
              severity: 'error',
              category: 'MAP_DEFECT',
              rule: 'geom.negative-lane-width',
              message: `road ${road.id} lane section ${sectionIndex} lane ${lane.id}: <width> record ${wi} evaluates to ${worst.toFixed(3)} m, which is negative`,
              location: { roadId: road.id, laneId: lane.id, s: section.s + width.sOffset },
            })
          }
        }
      }
    }
  }

  // --- road-to-road contact ------------------------------------------------
  //
  // Warning, not error: see the calibration note above. Reported once per
  // ordered link, which means a mutually declared pair is reported twice —
  // deliberately, since either road may be the one at fault and a reader
  // filtering by road id must see it.
  for (const road of map.roads) {
    for (const [which, link] of [
      ['successor', road.successor],
      ['predecessor', road.predecessor],
    ] as const) {
      if (!link || link.elementType !== 'road') continue
      const target = roadById.get(link.elementId)
      if (!target) continue // layer 2 reported the dangling link

      const myEnd = which === 'successor' ? 'end' : 'start'
      const theirEnd = link.contactPoint ?? (which === 'successor' ? 'start' : 'end')
      const mine = poseAtEnd(road, myEnd)
      const theirs = poseAtEnd(target, theirEnd)
      if (!mine || !theirs) continue

      // Subtract the lane-offset difference: two roads whose lanes meet can
      // have reference lines apart by exactly that amount, and flagging it
      // would redden fabriksgatan and multi_intersections, which are correct.
      const myOffset = laneOffsetAt(road, stationAtEnd(road, myEnd))
      const theirOffset = laneOffsetAt(target, stationAtEnd(target, theirEnd))
      const offsetSlack = Math.abs(myOffset - theirOffset)

      const raw = Math.hypot(mine.x - theirs.x, mine.y - theirs.y)
      const gap = Math.max(raw - offsetSlack, 0)
      if (gap > thresholds.roadLinkGapMeters) {
        findings.push({
          severity: 'warning',
          category: 'MAP_DEFECT',
          rule: 'geom.road-link-gap',
          message:
            `road ${road.id} <${which}> declares road ${target.id} at its ${theirEnd}, but the two reference lines are ${gap.toFixed(3)} m apart` +
            (offsetSlack > 0 ? ` (after allowing ${offsetSlack.toFixed(3)} m of lane offset)` : ''),
          location: { roadId: road.id },
        })
      }
    }
  }

  return findings
}
