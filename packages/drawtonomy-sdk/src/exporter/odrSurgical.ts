// Surgical regeneration for OpenDRIVE round trips.
//
// When a road is edited but the edit only moved boundary points *laterally*
// (across the travel direction, not along it), the road's plan view, lane
// offset, elevation profile, signals, objects and links are all still valid —
// only the lane <width> polynomials changed. Regenerating the whole road with
// the fitting exporter would needlessly rebuild the reference line from the
// leftmost boundary (dropping the original laneOffset, shifting s, coarsening
// the elevation profile and dropping signals/objects).
//
// This module instead keeps the original <road> element verbatim and rewrites
// only the <width> records inside each <lane>, computed from the edited
// boundaries measured against the *original* reference line. Any edit that is
// not lateral-only (a point dragged along the road, an end point moved, a lane
// added / removed, or connectivity changed) makes the check fail and the road
// falls back to full regeneration (handled by the caller).
//
// The same treatment covers the road's <signals>. A <signal> is a direct child
// of <road> positioned by (s, t) on the road's own reference line, with no
// coupling to the lanes or to any other signal, so moving / deleting / adding
// one is a byte-local edit of that element: `rewriteSignals` re-projects the
// live shape onto the *original* reference line and rewrites only s / t,
// removes a deleted element (with its own line), and appends an added one just
// before </signals>. A signal pushed outside [0, length] cannot be expressed on
// this road at all, so it falls back to full regeneration like any other edit
// the surgical path cannot absorb.

import type { BaseShape, LaneProps, LinestringProps, PointProps } from '../types.js'
import type { SignalBaseline } from './odrCarryThrough.js'
import { evalPoly3, sampleReferenceLine, type ReferenceSample } from './odrGeometry.js'
import type { OdrLane, OdrLaneSection, OdrRoad } from './opendriveParser.js'
import { fmt, fmtPrecise, pxToEnuX, pxToEnuY } from './units.js'

type LaneShape = BaseShape<'lane', LaneProps>
type LinestringShape = BaseShape<'linestring', LinestringProps>
type PointShape = BaseShape<'point', PointProps>

interface Enu {
  x: number
  y: number
}

// Opt-in tracing for local debugging (globalThis.__SURGICAL_DEBUG = true);
// never on in production, and free of any node-only globals.
function dbg(...a: unknown[]): void {
  if ((globalThis as Record<string, unknown>).__SURGICAL_DEBUG) console.warn('[surgical]', ...a)
}

/** Micro sections are skipped by the importer, so their lanes have no shapes. */
const MIN_SECTION_LEN_M = 0.3
const S_EPS = 1e-6
/**
 * Maximum longitudinal drift (m) a boundary end point may show against its
 * original station before the edit counts as non-lateral. Conservative: an
 * edit that drags a point along the road by more than a few centimetres must
 * fall back to full regeneration rather than silently recompute wrong widths.
 */
const LATERAL_S_TOL_M = 0.1
/**
 * Maximum drift (m) a lane's inner boundary may show from the datum
 * accumulated so far (the outer offset of the previous lane, or 0 at the
 * center). A shared inner boundary that both neighbours moved together stays
 * on the datum; a boundary the user moved independently of its inner neighbour
 * — the road's fixed reference/laneOffset center, or one side of a shared edge
 * moved without the other — drifts off it. Such an edit is not expressible as
 * a width-only change (it would need a new laneOffset or reference line), so
 * the road falls back to full regeneration.
 */
const INNER_DATUM_TOL_M = 0.02
/** Width simplification tolerance (m), matching the full-regen exporter. */
const WIDTH_SIMPLIFY_TOL_M = 0.01
/**
 * Maximum longitudinal residual (m) a signal may show against the station it
 * projects onto. `projectStation` clamps to the road's ends, so a signal
 * dragged past either end returns s = 0 / s = length with the whole overshoot
 * as this residual; beyond the tolerance the signal is simply not on this road
 * and the surgical path gives up. Also catches a signal on a road whose
 * sampled reference line is too coarse to carry it.
 */
const OFF_ROAD_TOL_M = 0.05

/**
 * Signed lateral offset of a boundary point from a reference pose, measured
 * along the pose's right normal (sin h, -cos h) — the same convention the
 * fitting exporter uses. Returns null when the point does not project cleanly
 * onto the boundary near this pose.
 */
function offsetAlongNormal(pose: ReferenceSample, bnd: readonly Enu[], refVal: number): number | null {
  const nx = Math.sin(pose.hdg)
  const ny = -Math.cos(pose.hdg)
  let best: number | null = null
  for (let i = 0; i < bnd.length - 1; i++) {
    const dx = bnd[i + 1].x - bnd[i].x
    const dy = bnd[i + 1].y - bnd[i].y
    const det = dx * ny - dy * nx
    if (Math.abs(det) < 1e-12) continue
    const rx = bnd[i].x - pose.x
    const ry = bnd[i].y - pose.y
    const w = (nx * ry - ny * rx) / det
    if (w < -1e-9 || w > 1 + 1e-9) continue
    const t = (dx * ry - dy * rx) / det
    if (best === null || Math.abs(t - refVal) < Math.abs(best - refVal)) best = t
  }
  return best
}

/**
 * Longitudinal station of a point projected onto the reference polyline.
 * Used only for the lateral-only test (does the edit keep s?). Returns the
 * projected s, or null when the polyline is degenerate.
 */
function projectStation(p: Enu, poses: readonly ReferenceSample[]): number | null {
  let best: number | null = null
  let bestD = Infinity
  for (let i = 0; i < poses.length - 1; i++) {
    const a = poses[i]
    const b = poses[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    if (len2 < 1e-18) continue
    let u = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2
    if (u < 0) u = 0
    if (u > 1) u = 1
    const projX = a.x + u * dx
    const projY = a.y + u * dy
    const d = Math.hypot(p.x - projX, p.y - projY)
    if (d < bestD) {
      bestD = d
      best = a.s + (b.s - a.s) * u
    }
  }
  return best
}

/** Piecewise-linear (a + b*ds) width records, greedily simplified. */
function widthRecords(sArr: readonly number[], wArr: readonly number[]): { s: number; a: number; b: number }[] {
  const recs: { s: number; a: number; b: number }[] = []
  if (sArr.length < 2) {
    recs.push({ s: 0, a: wArr[0] ?? 0, b: 0 })
    return recs
  }
  let i0 = 0
  while (i0 < sArr.length - 1) {
    let end = i0 + 1
    for (let j = i0 + 2; j < sArr.length; j++) {
      const slope = (wArr[j] - wArr[i0]) / (sArr[j] - sArr[i0])
      let ok = true
      for (let k = i0 + 1; k < j; k++) {
        if (Math.abs(wArr[i0] + slope * (sArr[k] - sArr[i0]) - wArr[k]) > WIDTH_SIMPLIFY_TOL_M) {
          ok = false
          break
        }
      }
      if (!ok) break
      end = j
    }
    recs.push({ s: sArr[i0], a: wArr[i0], b: (wArr[end] - wArr[i0]) / (sArr[end] - sArr[i0]) })
    i0 = end
  }
  return recs
}

/** laneOffset polynomial value at station s (last record with rec.s <= s). */
function laneOffsetAt(road: OdrRoad, s: number): number {
  let active: OdrRoad['laneOffsets'][number] | null = null
  for (const rec of road.laneOffsets) {
    if (rec.s <= s + S_EPS) active = rec
    else break
  }
  return active ? evalPoly3(active, s - active.s) : 0
}

/** Original lane width (importer read) at ds past the section start. */
function laneWidthAt(lane: OdrLane, ds: number): number {
  let active: OdrLane['widths'][number] | null = null
  for (const rec of lane.widths) {
    if (rec.sOffset <= ds + S_EPS) active = rec
    else break
  }
  if (!active) return 0
  const w = evalPoly3(active, ds - active.sOffset)
  return w > 0 ? w : 0
}

/** ENU boundary polyline of a linestring shape, in reference-line order. */
function boundaryEnu(
  shapeMap: Map<string, BaseShape>,
  boundaryId: string | null,
  invert: boolean
): Enu[] | null {
  if (!boundaryId) return null
  const ls = shapeMap.get(boundaryId) as unknown as LinestringShape | undefined
  if (!ls) return null
  const ids = invert ? [...ls.props.pointIds].reverse() : ls.props.pointIds
  const pts: Enu[] = []
  for (const id of ids) {
    const p = shapeMap.get(id) as unknown as PointShape | undefined
    if (!p) return null
    pts.push({ x: pxToEnuX(p.x), y: pxToEnuY(p.y) })
  }
  return pts.length >= 2 ? pts : null
}

/**
 * Reconstruct the original inner/outer boundary of every lane in ENU, exactly
 * as the importer built it (reference line + laneOffset, then accumulate widths
 * from the center outward). Used to seed the width datum and cross-check the
 * edit is lateral-only.
 */
function originalBoundaries(
  road: OdrRoad,
  sec: OdrLaneSection,
  stations: readonly ReferenceSample[]
): { center: Enu[]; leftOuter: Enu[][]; rightOuter: Enu[][] } {
  const normals = stations.map(st => ({ x: -Math.sin(st.hdg), y: Math.cos(st.hdg) }))
  const center: Enu[] = stations.map((st, j) => {
    const off = laneOffsetAt(road, st.s)
    return { x: st.x + normals[j].x * off, y: st.y + normals[j].y * off }
  })
  const accumulate = (lanes: OdrLane[], sign: 1 | -1): Enu[][] => {
    const out: Enu[][] = []
    let prev = center
    for (const lane of lanes) {
      const next = prev.map((p, j) => {
        const w = laneWidthAt(lane, stations[j].s - sec.s)
        return { x: p.x + sign * normals[j].x * w, y: p.y + sign * normals[j].y * w }
      })
      out.push(next)
      prev = next
    }
    return out
  }
  return { center, leftOuter: accumulate(sec.left, 1), rightOuter: accumulate(sec.right, -1) }
}

/** Lane shape keyed by (odr_lane_id, odr_section_s). */
export type LaneShapeKey = string
export function laneShapeKey(laneId: number, sectionS: number): LaneShapeKey {
  return `${laneId} ${fmt(sectionS)}`
}
/** Internal key for the recomputed-width map (uses the parsed section s). */
function widthKey(laneId: number, sectionS: number): string {
  return `${laneId} ${fmt(sectionS)}`
}

/**
 * Attempt to rewrite only the <width> records of a road's <lanes> subtree,
 * keeping every other byte of the original <road> element. Returns the new
 * road text, or null when the edit is not lateral-only (fall back to full
 * regeneration).
 *
 * `road` is the parsed original road; `roadText` its verbatim element text;
 * `laneShapes` maps (laneId, sectionS) to the live (possibly edited) lane
 * shape for this road.
 */
export function buildSurgicalRoad(
  road: OdrRoad,
  roadText: string,
  laneShapes: Map<LaneShapeKey, LaneShape>,
  shapeMap: Map<string, BaseShape>
): string | null {
  if (road.laneSections.length === 0) {
    dbg('road', road.id, 'no lane sections')
    return null
  }

  const extraStations: number[] = []
  for (const sec of road.laneSections) {
    extraStations.push(sec.s)
    for (const lane of [...sec.left, ...sec.right]) {
      for (const w of lane.widths) extraStations.push(sec.s + w.sOffset)
    }
  }
  for (const lo of road.laneOffsets) extraStations.push(lo.s)

  const samples = sampleReferenceLine(road, { extraStations })
  if (samples.length < 2) {
    dbg('road', road.id, 'too few samples')
    return null
  }

  // laneId+section -> new <width> record set. Only lanes that materialize a
  // shape are entered; center / skipped lanes are left untouched.
  const newWidths = new Map<string, { s: number; a: number; b: number }[]>()

  for (let secIdx = 0; secIdx < road.laneSections.length; secIdx++) {
    const sec = road.laneSections[secIdx]
    const secEnd = secIdx + 1 < road.laneSections.length ? road.laneSections[secIdx + 1].s : road.length
    if (secEnd - sec.s < MIN_SECTION_LEN_M) {
      dbg('road', road.id, 'micro section', secIdx)
      return null
    }
    const stations = samples.filter(st => st.s >= sec.s - S_EPS && st.s <= secEnd + S_EPS)
    if (stations.length < 2) {
      dbg('road', road.id, 'section', secIdx, 'too few stations')
      return null
    }

    const orig = originalBoundaries(road, sec, stations)

    // The center offset line (reference + laneOffset) is the datum widths are
    // measured from; poses share the reference heading.
    const centerPoses: ReferenceSample[] = stations.map((st, j) => ({
      s: st.s,
      x: orig.center[j].x,
      y: orig.center[j].y,
      hdg: st.hdg,
      z: st.z,
    }))
    const sPerStation = stations.map(st => st.s - sec.s)

    // Projected station of every original boundary point, index-aligned to the
    // station grid, so the edited boundary can be compared point-for-point.
    const origStationOf = (bnd: readonly Enu[]): (number | null)[] =>
      bnd.map(p => projectStation(p, centerPoses))

    // `sideDir` is the direction of *outward* lane growth measured along the
    // reference right normal (sin h, -cos h): right-side lanes grow toward +t,
    // left-side lanes toward -t. (This is the opposite of the importer's
    // accumulate `sign`, which is expressed against the +t / left normal.)
    const handleSide = (lanes: OdrLane[], sideDir: 1 | -1, origOuter: Enu[][]): boolean => {
      // Cumulative signed offset (along the right normal) of the current lane's
      // inner boundary, seeded at 0 (the center) and advanced by each lane's
      // recomputed outer offset so a skipped (dropped) lane still shifts the
      // datum for its outer neighbours.
      let innerOffset = centerPoses.map(() => 0)
      let origInner: Enu[] = orig.center
      for (let i = 0; i < lanes.length; i++) {
        const lane = lanes[i]
        const origOuterBnd = origOuter[i]
        const shape = laneShapes.get(laneShapeKey(lane.id, sec.s))
        if (!shape) {
          // Lane was dropped on import (zero width / sliver). Advance the datum
          // by the ORIGINAL width so neighbours stay aligned; do not emit.
          innerOffset = innerOffset.map((o, j) => o + sideDir * laneWidthAt(lane, stations[j].s - sec.s))
          origInner = origOuterBnd
          continue
        }
        // The lane shape stores boundaries in reference-line order; read them
        // in that order (invert=false) so they align with the station poses.
        const inner = boundaryEnu(shapeMap, shape.props.leftBoundaryId, false)
        const outer = boundaryEnu(shapeMap, shape.props.rightBoundaryId, false)
        if (!inner || !outer) {
          dbg('road', road.id, 'lane', lane.id, 'no inner/outer boundary')
          return false
        }

        // Lateral-only test: the edited boundaries must have the same point
        // count as the originals (a lateral drag preserves the vertex set),
        // and every edited point must project onto the reference line at the
        // same station as the original point it replaces — no longitudinal
        // drift. Reconstructed originals are index-aligned to the stations.
        const pairs: [Enu[], Enu[]][] = [
          [inner, origInner],
          [outer, origOuterBnd],
        ]
        for (const [edited, original] of pairs) {
          if (edited.length !== original.length) {
            dbg('road', road.id, 'lane', lane.id, 'point count changed', edited.length, 'vs', original.length)
            return false
          }
          const origS = origStationOf(original)
          for (let k = 0; k < edited.length; k++) {
            const sNew = projectStation(edited[k], centerPoses)
            const sOld = origS[k]
            if (sNew === null || sOld === null) {
              dbg('road', road.id, 'lane', lane.id, 'point off polyline at', k)
              return false
            }
            if (Math.abs(sNew - sOld) > LATERAL_S_TOL_M) {
              dbg('road', road.id, 'lane', lane.id, 'point', k, 's drift', sNew, 'vs', sOld)
              return false
            }
          }
        }

        // Widths at each station: offset of outer minus offset of inner, both
        // measured along the center-line normal. `sign` orients the search.
        const wArr: number[] = []
        const sArr: number[] = []
        const newInnerOffset: number[] = []
        for (let j = 0; j < centerPoses.length; j++) {
          const ref = innerOffset[j]
          const tInner = offsetAlongNormal(centerPoses[j], inner, ref)
          const tOuter = offsetAlongNormal(centerPoses[j], outer, ref + sideDir)
          if (tInner === null || tOuter === null) {
            dbg('road', road.id, 'lane', lane.id, 'station', j, 't null', tInner, tOuter, 'ref', ref)
            return false
          }
          // The inner boundary must still sit on the accumulated datum (the
          // center / the previous lane's outer). If it drifted laterally, the
          // edit moved the fixed reference frame or a shared edge one-sidedly,
          // which no width record can express — fall back.
          if (Math.abs(tInner - ref) > INNER_DATUM_TOL_M) {
            dbg('road', road.id, 'lane', lane.id, 'station', j, 'inner datum drift', tInner, 'vs', ref)
            return false
          }
          // Width is the outward span from inner to outer along the right
          // normal; `sideDir` makes it positive on both sides.
          const width = Math.max(0, sideDir * (tOuter - tInner))
          wArr.push(width)
          sArr.push(sPerStation[j])
          newInnerOffset.push(tOuter)
        }

        newWidths.set(widthKey(lane.id, sec.s), widthRecords(sArr, wArr))
        innerOffset = newInnerOffset
        origInner = origOuterBnd
      }
      return true
    }

    if (!handleSide(sec.left, -1, orig.leftOuter)) return null
    if (!handleSide(sec.right, 1, orig.rightOuter)) return null
  }

  // Rewrite the <width> records lane by lane, in original document order,
  // keeping everything else (links, roadMark, userData, lane type) verbatim.
  const out = rewriteLaneWidths(roadText, road, newWidths)
  if (out === null) dbg('road', road.id, 'rewriteLaneWidths failed')
  return out
}

/**
 * Replace the <width .../> records of each lane that has recomputed widths,
 * matching lanes structurally by walking <laneSection> / <lane> blocks in
 * document order. Every non-<width> byte is preserved.
 */
function rewriteLaneWidths(
  roadText: string,
  road: OdrRoad,
  newWidths: Map<string, { s: number; a: number; b: number }[]>
): string | null {
  const lanesStart = roadText.indexOf('<lanes>')
  const lanesEnd = roadText.indexOf('</lanes>')
  if (lanesStart < 0 || lanesEnd < 0 || lanesEnd < lanesStart) return null

  const before = roadText.slice(0, lanesStart)
  const lanesBlock = roadText.slice(lanesStart, lanesEnd + '</lanes>'.length)
  const after = roadText.slice(lanesEnd + '</lanes>'.length)

  const sectionRe = /<laneSection\b[^>]*>[\s\S]*?<\/laneSection>/g
  let sectionIdx = 0
  let failed = false

  const rewrittenLanes = lanesBlock.replace(sectionRe, secBlock => {
    const sec = road.laneSections[sectionIdx++]
    if (!sec) return secBlock
    // Match a self-closing <lane .../> (e.g. the center lane) or a full
    // <lane ...>...</lane> pair. Anchoring the pair form on a `>` that is not
    // `/>` prevents a self-closing lane from swallowing the next lane's body.
    const laneRe = /<lane\b([^>]*?)\/>|<lane\b([^>]*[^/])>([\s\S]*?)<\/lane>/g
    return secBlock.replace(laneRe, (full, selfAttrs: string, pairAttrs: string, inner: string) => {
      if (selfAttrs !== undefined) return full // self-closing lane: no widths
      const openAttrs = pairAttrs
      const idMatch = openAttrs.match(/\bid="(-?\d+)"/)
      if (!idMatch) return full
      const laneId = parseInt(idMatch[1], 10)
      const recs = newWidths.get(widthKey(laneId, sec.s))
      if (!recs) return full // center lane / skipped lane: untouched
      const widthLineMatch = inner.match(/([^\S\n]*)<width\b/)
      const indent = widthLineMatch ? widthLineMatch[1] : '                        '
      const widthXml = recs
        .map(r => `<width sOffset="${fmt(r.s)}" a="${fmt(r.a)}" b="${fmtPrecise(r.b)}" c="0" d="0"/>`)
        .join(`\n${indent}`)
      let replaced = false
      const newInner = inner.replace(/([^\S\n]*<width\b[^>]*\/>\s*)+/, () => {
        replaced = true
        return `${indent}${widthXml}\n`
      })
      if (!replaced) {
        failed = true
        return full
      }
      return `<lane${openAttrs}>${newInner}</lane>`
    })
  })

  if (failed) return null
  return before + rewrittenLanes + after
}

// ---------------------------------------------------------------------------
// Surgical <signal> rewriting
// ---------------------------------------------------------------------------

/** A live regulatory shape attached to a road. */
export interface SurgicalSignalShape {
  /** Shape id (used for tracing and for the returned id mapping). */
  shapeId: string
  /** Source `<signal id>` this shape came from; '' for a shape added since import. */
  odrSignalId: string
  /** Current position in canvas pixels, compared against the baseline by value. */
  canvasX: number
  canvasY: number
  /** Current position in ENU meters (the same point, converted). */
  x: number
  y: number
  /**
   * Everything about the shape except its position, serialized the same way on
   * both sides of a round trip. A kept signal whose payload no longer matches
   * the one recorded for its source id is not "the same signal moved", so the
   * road falls back to full regeneration.
   */
  payload: string
}

/** Outcome of `rewriteSignals`, so the caller can keep its id bookkeeping. */
export interface SurgicalSignalResult {
  /** The road text with only the touched `<signal>` elements changed. */
  text: string
  /** Emitted `<signal id>` per shape id (source ids kept, added ones fresh). */
  signalIdByShape: Map<string, string>
  /** Number of `<signal id>` values allocated for added shapes. */
  allocatedIds: number
}

/**
 * Station / offset of an ENU point on a road's reference line, or null when the
 * point lies beyond either end of the road.
 *
 * `t` is the signed offset along the reference line's +t normal, matching the
 * importer's `pose.x - sin(h) * t`, `pose.y + cos(h) * t`.
 *
 * `projectStation` clamps to the polyline, so a point dragged past an end comes
 * back as s = 0 / s = length with a *longitudinal* residual. Such a point is
 * not on this road any more, so it is rejected rather than silently pinned to
 * the end: the residual along the pose's tangent must be zero.
 */
function projectOntoReference(
  p: Enu,
  poses: readonly ReferenceSample[]
): { s: number; t: number } | null {
  const s = projectStation(p, poses)
  if (s === null) return null
  // Interpolate the pose at s the way the importer's poseAt does, then measure
  // the residual in the pose's frame.
  let pose = poses[poses.length - 1]
  if (s <= poses[0].s) pose = poses[0]
  else {
    for (let i = 0; i < poses.length - 1; i++) {
      const a = poses[i]
      const b = poses[i + 1]
      if (s > b.s) continue
      const span = b.s - a.s
      const f = span > S_EPS ? (s - a.s) / span : 0
      pose = { s, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, hdg: a.hdg, z: a.z }
      break
    }
  }
  const dx = p.x - pose.x
  const dy = p.y - pose.y
  const along = dx * Math.cos(pose.hdg) + dy * Math.sin(pose.hdg)
  if (Math.abs(along) > OFF_ROAD_TOL_M) return null
  return { s, t: -dx * Math.sin(pose.hdg) + dy * Math.cos(pose.hdg) }
}

/** `<signal ...>` or `<signal .../>` blocks of a road's <signals>, in document order. */
const SIGNAL_BLOCK_RE = /[^\S\n]*<signal\b[^>]*?(?:\/>|>[\s\S]*?<\/signal>)\n?/g

/** The `id` attribute of a `<signal>` block, or null. */
function signalBlockId(block: string): string | null {
  const open = block.slice(0, block.indexOf('>') + 1)
  return open.match(/\bid="([^"]*)"/)?.[1] ?? null
}

/**
 * Rewrite only the `<signal>` elements of a road, keeping every other byte of
 * the original `<road>` element.
 *
 * `shapes` are the live regulatory shapes currently attached to this road. A
 * shape carrying a source `odrSignalId` that the road defines keeps that id and
 * has its `s` / `t` attributes rewritten (all other attributes, children and
 * whitespace are preserved). A defined `<signal>` that HAD a shape at import
 * (it has a baseline) and has none now was deleted, and is removed with its
 * own line; one that never had a shape is kept, since it was never editable.
 * A shape with no source id is appended just before
 * `</signals>` using `renderNewSignal`, which the caller supplies so the new
 * element matches the full-regeneration exporter's formatting.
 *
 * Returns null when the edit cannot be expressed this way: a signal that no
 * longer projects inside [0, length], a road with no `<signals>` block to
 * append to, or an id collision. The caller then falls back to regenerating
 * the whole road.
 */
export function rewriteSignals(
  roadText: string,
  road: OdrRoad,
  shapes: readonly SurgicalSignalShape[],
  baselines: Readonly<Record<string, SignalBaseline>>,
  nextSignalId: number,
  renderNewSignal: (shapeId: string, id: string, s: number, t: number, indent: string) => string | null
): SurgicalSignalResult | null {
  const samples = sampleReferenceLine(road)
  if (samples.length < 2) {
    dbg('signals: road', road.id, 'too few reference samples')
    return null
  }

  const definedIds = new Set(road.signals.map(sig => sig.id))
  const signalIdByShape = new Map<string, string>()

  // Shapes that keep a source id are either untouched (their `<signal>` keeps
  // its source bytes) or moved (s / t recomputed against the ORIGINAL
  // reference line). Shapes with no source id are appended with a fresh id.
  const kept = new Set<string>()
  const moved = new Map<string, { s: number; t: number }>()
  const added: { shapeId: string; s: number; t: number }[] = []
  for (const shape of shapes) {
    const baseline = shape.odrSignalId ? baselines[shape.odrSignalId] : undefined
    const isKnown = shape.odrSignalId !== '' && definedIds.has(shape.odrSignalId)
    if (isKnown) {
      if (kept.has(shape.odrSignalId)) {
        dbg('signals: road', road.id, 'two shapes claim signal', shape.odrSignalId)
        return null
      }
      // Same id, but is it still the same signal? Anything other than the
      // position changing means the element would have to be rebuilt, which
      // this rewrite does not do.
      if (baseline === undefined || baseline.payload !== shape.payload) {
        dbg('signals: road', road.id, 'signal', shape.odrSignalId, 'payload changed')
        return null
      }
      kept.add(shape.odrSignalId)
      signalIdByShape.set(shape.shapeId, shape.odrSignalId)
      // Unmoved: identical position values, so the element is left alone and
      // keeps the source's own number spelling.
      if (baseline.x === shape.canvasX && baseline.y === shape.canvasY) continue
    }
    const proj = projectOntoReference({ x: shape.x, y: shape.y }, samples)
    if (proj === null) {
      dbg('signals: road', road.id, 'shape', shape.shapeId, 'is off the road (longitudinal overshoot)')
      return null
    }
    if (proj.s < -S_EPS || proj.s > road.length + S_EPS) {
      dbg('signals: road', road.id, 'shape', shape.shapeId, 's', proj.s, 'outside [0,', road.length, ']')
      return null
    }
    if (isKnown) moved.set(shape.odrSignalId, proj)
    else added.push({ shapeId: shape.shapeId, s: proj.s, t: proj.t })
  }

  let failed = false
  let text = roadText.replace(SIGNAL_BLOCK_RE, block => {
    const id = signalBlockId(block)
    if (id === null) return block
    if (!kept.has(id)) {
      // A signal the importer never turned into a shape (an unsupported type,
      // say) has no baseline, so no live shape can claim it. That is not the
      // user deleting it — it was never editable — and this rewrite is the one
      // path that can keep such an element. Only a signal that DID have a
      // shape at import and has none now was deleted; drop that one together
      // with its indentation and line break.
      if (baselines[id] === undefined) return block
      return ''
    }
    const proj = moved.get(id)
    // Claimed but not moved: keep the source bytes exactly as they are, down
    // to the spelling of the numbers ("90" must not become "90.000000").
    if (proj === undefined) return block
    const end = block.indexOf('>') + 1
    let rewritten = block.slice(0, end)
    let ok = true
    for (const [name, value] of [
      ['s', proj.s],
      ['t', proj.t],
    ] as const) {
      const re = new RegExp(`(\\b${name}=")([^"]*)(")`)
      if (!re.test(rewritten)) {
        ok = false
        break
      }
      rewritten = rewritten.replace(re, (_x, pre: string, _old: string, post: string) => pre + fmt(value) + post)
    }
    if (!ok) {
      dbg('signals: road', road.id, 'signal', id, 'has no s/t attribute to rewrite')
      failed = true
      return block
    }
    return rewritten + block.slice(end)
  })
  if (failed) return null

  // Append the added signals as the last children of <signals>.
  let allocatedIds = 0
  if (added.length > 0) {
    const closeIdx = text.indexOf('</signals>')
    if (closeIdx < 0) {
      dbg('signals: road', road.id, 'no <signals> block to append to')
      return null
    }
    // Indent the appended elements like the `</signals>` they go before. Only
    // the LEADING whitespace of that line is indentation: a document with no
    // line breaks puts the whole `<road>` fragment in front of the close tag,
    // and copying it onto every added line would duplicate real markup. When
    // the line holds anything else, fall back to a fixed indent — the inserted
    // block still starts on its own line, so the result stays well-formed.
    const lineStart = text.lastIndexOf('\n', closeIdx) + 1
    const beforeClose = text.slice(lineStart, closeIdx)
    const ownLine = /^[^\S\n]*$/.test(beforeClose)
    const childIndent = ownLine ? `${beforeClose}  ` : '        '
    const rendered: string[] = []
    for (const a of added) {
      const id = String(nextSignalId + allocatedIds)
      if (definedIds.has(id)) {
        dbg('signals: road', road.id, 'fresh signal id', id, 'collides')
        return null
      }
      const xml = renderNewSignal(a.shapeId, id, a.s, a.t, childIndent)
      if (xml === null) {
        dbg('signals: road', road.id, 'cannot render added signal for shape', a.shapeId)
        return null
      }
      rendered.push(xml)
      signalIdByShape.set(a.shapeId, id)
      allocatedIds++
    }
    // When `</signals>` shares its line with markup, the inserted block needs
    // a newline in front of it too, so the first added element starts at the
    // indent it was rendered with rather than after that markup.
    const lead = ownLine ? '' : '\n'
    text = `${text.slice(0, closeIdx)}${lead}${rendered.join('\n')}\n${text.slice(closeIdx)}`
  }

  return { text, signalIdByShape, allocatedIds }
}
