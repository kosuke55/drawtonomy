// Convert a parsed OpenDRIVE model (`OdrMap`) into the shape primitives that
// the drawtonomy editor consumes (points, linestrings, lanes, traffic lights,
// traffic signs, crosswalks).
//
// Mirrors the Lanelet2 OSM import path (`osmToShapes`): the output is the
// same intermediate `ImportedShapes` structure, extended with a sidecar (the
// original XML plus the derived geographic origin) and a list of warnings for
// features that were parsed but flattened or ignored.
//
// Geometry pipeline per road:
//   1. Adaptively sample the reference line (line/arc/spiral/paramPoly3).
//   2. At each station, shift by the laneOffset polynomial along the normal
//      to obtain the lane reference ("center") polyline.
//   3. Accumulate lane widths outward (left lanes +t, right lanes -t) to get
//      every lane boundary polyline in meters.
//   4. Convert meters -> pixels and ENU (y up) -> canvas (y down), the exact
//      inverse of the OpenDRIVE exporter's conversion, so that
//      import -> export is near-identity.
//
// Boundary sharing: adjacent lanes within one road/section share a single
// boundary linestring (lane -1's outer boundary IS lane -2's inner boundary),
// and the center boundary is shared between lane +1 and lane -1.
//
// Direction semantics: in OpenDRIVE, left lanes (positive ids) run opposite
// to the reference line. Boundary polylines are stored in reference-line
// order, so left lanes set invertLeft/invertRight = true — the editor then
// reads the boundaries reversed, consistent with how `osmToShapes` encodes
// direction via boundary inversion.

import type {
  OdrLane,
  OdrLaneSection,
  OdrMap,
  OdrObject,
  OdrObjectRepeat,
  OdrRoad,
  OdrRoadMark,
  OdrSignalValidity,
} from './opendriveParser.js'
import { evalPoly3, sampleReferenceLine, type ReferenceSample } from './odrGeometry.js'
import { sampleAtParam, type Point2D } from './laneCenterline.js'
import {
  createShapeIdAllocator,
  type ImportBounds,
  type ImportedCrosswalk,
  type ImportedLane,
  type ImportedLinestring,
  type ImportedParkingSpace,
  type ImportedPoint,
  type ImportedShapes,
  type ImportedTrafficLight,
  type ImportedTrafficSign,
  type ShapeIdAllocator,
} from './osmToShapes.js'
import { PIXELS_PER_METER } from './units.js'
import {
  hashRoadState,
  type CarryLaneState,
  type CarryRegulatoryState,
  type OdrRoadRecord,
} from './odrCarryThrough.js'

export type { OdrRoadRecord } from './odrCarryThrough.js'

/** Sidecar captured at OpenDRIVE import time (for verbatim round-trip export). */
export interface OdrSidecar {
  rawXml: string
  originLat: number | null
  originLon: number | null
  /**
   * Per source road: the lane shape ids it materialized and a hash of their
   * editable state at import time. `exportToOpenDrive({ sidecar })` re-emits
   * roads whose hash still matches verbatim from `rawXml` (carry-through).
   */
  roadRecords?: Record<string, OdrRoadRecord>
}

export interface OdrImportResult extends ImportedShapes {
  sidecar: OdrSidecar
  /** Human-readable notes about unsupported features (flattened elevation, etc.). */
  warnings: string[]
}

export interface OdrToShapesOptions {
  /** Custom id allocator. A fresh `createShapeIdAllocator()` is used when omitted. */
  idAllocator?: ShapeIdAllocator
  /** Restrict conversion to the given road ids. When omitted, all roads are converted. */
  selectedRoadIds?: readonly string[]
  /** Maximum chord error for reference-line sampling (m). Default 0.05. */
  maxChordErrorMeters?: number
  /** Maximum station spacing for reference-line sampling (m). Default 5. */
  maxStepMeters?: number
}

interface EnuPoint {
  x: number
  y: number
  /**
   * Reference-line height at this point (m). Lane boundaries are offset only
   * laterally (no superelevation support yet), so every point across a road
   * cross-section shares the station's reference height.
   */
  z?: number
}

/** Lanes narrower than this (m) carry no usable area and are skipped. */
const WIDTH_EPS = 1e-3
const S_EPS = 1e-6

/**
 * Lane sections shorter than this (m) are skipped as transition slivers.
 * Generated maps (e.g. CARLA towns) often encode lane-count transitions as
 * chains of centimeter-scale lane sections; materializing those as lanes
 * produces degenerate slivers that no exporter can represent. A lane section
 * below vehicle scale carries no usable lane area, so connectivity is
 * bridged across skipped sections via their lane-level links instead.
 */
const MIN_SECTION_LEN_M = 0.3

/**
 * Derive a WGS84 origin from an OpenDRIVE <geoReference> PROJ string.
 *
 * Supports `+proj=tmerc +lat_0=.. +lon_0=..` (exact: the projection origin is
 * the local (0, 0)) and `+proj=utm +zone=..` (approximate: the zone's central
 * meridian on the equator; UTM's false easting/northing is not compensated).
 * Returns null when the origin cannot be derived.
 */
export function parseGeoReferenceOrigin(
  geoReference: string | null
): { lat: number; lon: number; approximate: boolean } | null {
  if (!geoReference) return null
  if (/\+proj=tmerc\b/.test(geoReference)) {
    const latMatch = geoReference.match(/\+lat_0=(-?[\d.]+(?:[eE][-+]?\d+)?)/)
    const lonMatch = geoReference.match(/\+lon_0=(-?[\d.]+(?:[eE][-+]?\d+)?)/)
    if (latMatch && lonMatch) {
      const lat = parseFloat(latMatch[1])
      const lon = parseFloat(lonMatch[1])
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return { lat, lon, approximate: false }
      }
    }
    return null
  }
  if (/\+proj=utm\b/.test(geoReference)) {
    const zoneMatch = geoReference.match(/\+zone=(\d+)/)
    if (zoneMatch) {
      const zone = parseInt(zoneMatch[1], 10)
      if (zone >= 1 && zone <= 60) {
        return { lat: 0, lon: zone * 6 - 183, approximate: true }
      }
    }
    return null
  }
  return null
}

/** ENU meters -> canvas pixels (inverse of the exporter's pxToEnuX). */
function enuToCanvasX(m: number): number {
  return m * PIXELS_PER_METER
}

/** ENU meters -> canvas pixels with the y-axis flip (inverse of pxToEnuY). */
function enuToCanvasY(m: number): number {
  return -m * PIXELS_PER_METER
}

function laneOffsetAt(road: OdrRoad, s: number): number {
  let active = null
  for (const rec of road.laneOffsets) {
    if (rec.s <= s + S_EPS) active = rec
    else break
  }
  return active ? evalPoly3(active, s - active.s) : 0
}

/** Lane width at `ds` meters past the lane-section start. */
function laneWidthAt(lane: OdrLane, ds: number): number {
  let active = null
  for (const rec of lane.widths) {
    if (rec.sOffset <= ds + S_EPS) active = rec
    else break
  }
  if (!active) return 0
  const w = evalPoly3(active, ds - active.sOffset)
  return w > 0 ? w : 0
}

function roadMarkToSubtype(rm: OdrRoadMark | undefined): string {
  if (!rm) return 'solid'
  if (rm.type.includes('broken')) return 'dashed'
  return 'solid'
}

/**
 * OpenDRIVE lane type -> lanelet-style lane subtype. Lane shapes follow the
 * lanelet vocabulary (`attributes.type = 'lanelet'`, kind in `subtype`) so
 * that the Lanelet2 exporter emits valid `type=lanelet` relations; the exact
 * OpenDRIVE type is preserved separately in `odr_type` for re-export.
 */
const ODR_TYPE_TO_LANELET_SUBTYPE: Record<string, string> = {
  driving: 'road',
  sidewalk: 'walkway',
  walking: 'walkway',
  biking: 'bicycle_lane',
  exit: 'exit',
  entry: 'road',
  onRamp: 'road',
  offRamp: 'road',
  bus: 'bus_lane',
  taxi: 'bus_lane',
  crosswalk: 'crosswalk',
}

function laneletSubtypeFor(odrType: string): string {
  return ODR_TYPE_TO_LANELET_SUBTYPE[odrType] ?? odrType
}

function shouldKeepLane(lane: OdrLane, maxWidth: number): boolean {
  if (lane.type === 'none') return false
  return maxWidth > WIDTH_EPS
}

function emptyBounds(): ImportBounds {
  return {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    centerX: 0,
    centerY: 0,
    width: 0,
    height: 0,
  }
}

/**
 * Classify a junction lane's turning direction from the accumulated signed
 * heading change along its reference samples (left lanes travel against the
 * reference direction, flipping the sign). Consumers such as Autoware require
 * a turn_direction tag on every lanelet inside an intersection.
 */
function turnDirectionFor(stations: ReferenceSample[], isLeftLane: boolean): string {
  let total = 0
  for (let i = 1; i < stations.length; i++) {
    let d = stations[i].hdg - stations[i - 1].hdg
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    total += d
  }
  if (isLeftLane) total = -total
  const TURN_THRESHOLD = (20 * Math.PI) / 180
  if (total > TURN_THRESHOLD) return 'left'
  if (total < -TURN_THRESHOLD) return 'right'
  return 'straight'
}

interface RegisteredLane {
  shapeId: string
  roadId: string
  sectionIdx: number
  odrLaneId: number
  /** OpenDRIVE lane type (driving, sidewalk, ...). */
  laneType: string
}

/** OpenDRIVE signal types converted to traffic light shapes (vehicle / pedestrian). */
const TRAFFIC_LIGHT_SIGNAL_TYPES = new Set(['1000001', '1000002'])

/** Interpolated pose on the sampled reference line at station `s` (clamped). */
function poseAt(samples: ReferenceSample[], s: number): { x: number; y: number; hdg: number } {
  const first = samples[0]
  if (s <= first.s) return first
  const last = samples[samples.length - 1]
  if (s >= last.s) return last
  for (let i = 0; i < samples.length - 1; i++) {
    const a = samples[i]
    const b = samples[i + 1]
    if (s > b.s) continue
    const span = b.s - a.s
    const f = span > S_EPS ? (s - a.s) / span : 0
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, hdg: a.hdg }
  }
  return last
}

/**
 * Convert a parsed OpenDRIVE map into editor-ready point/linestring/lane
 * records plus a sidecar for round-trip export.
 *
 * Pass `selectedRoadIds` to restrict the conversion to a subset of roads
 * (selective import); leave it `undefined` to import every road.
 */
export function odrToShapes(map: OdrMap, options: OdrToShapesOptions = {}): OdrImportResult {
  const idAllocator = options.idAllocator ?? createShapeIdAllocator()
  const warnings: string[] = []

  const origin = parseGeoReferenceOrigin(map.header.geoReference)
  if (origin?.approximate) {
    warnings.push(
      'geoReference uses a UTM projection; the derived origin is the zone central meridian on the equator (false easting/northing not compensated).'
    )
  }

  const result: OdrImportResult = {
    points: [],
    linestrings: [],
    lanes: [],
    trafficLights: [],
    trafficSigns: [],
    crosswalks: [],
    parkingSpaces: [],
    bounds: emptyBounds(),
    sidecar: {
      rawXml: map.rawXml,
      originLat: origin ? origin.lat : null,
      originLon: origin ? origin.lon : null,
    },
    warnings,
  }
  if (origin) {
    result.originLatLon = { lat: origin.lat, lon: origin.lon }
  }

  let roads = map.roads
  if (options.selectedRoadIds) {
    const selected = new Set(options.selectedRoadIds)
    roads = roads.filter(r => selected.has(r.id))
  }

  // Signal grouping: <controller>/<control> maps each signal id to the
  // controller switching it. The grouping cannot be recovered from the
  // signals themselves, so it rides on the imported traffic lights and lets
  // the exporter rebuild a <controller> for regenerated signals too.
  const controllerIdBySignal = new Map<string, string>()
  for (const c of map.controllers ?? []) {
    if (!c.id) continue
    for (const ctl of c.controls) {
      if (!controllerIdBySignal.has(ctl.signalId)) controllerIdBySignal.set(ctl.signalId, c.id)
    }
  }

  // ---- Statistics for aggregated warnings ----
  let elevationRoads = 0
  let superelevationRoads = 0
  let poly3Roads = 0
  let signalCount = 0
  let convertedSignalCount = 0
  let objectCount = 0
  let convertedObjectCount = 0
  let microSectionRoads = 0

  // ---- Shape materialization ----
  const laneRegistry = new Map<string, RegisteredLane>()
  const lanesByRoad = new Map<string, RegisteredLane[]>()
  const laneShapeById = new Map<string, ImportedLane>()
  const sectionCount = new Map<string, number>()
  /** Section indices skipped per road (micro sections / unsampleable). */
  const skippedSections = new Map<string, Set<number>>()
  const roadById = new Map<string, OdrRoad>()
  /** Roads (with their reference samples) whose signals are converted after all lanes exist. */
  const signalRoads: { road: OdrRoad; samples: ReferenceSample[] }[] = []
  /**
   * Lane attributes restored from <userData code="laneAttributes">.
   * Current exporters key the stash by ODR lane id ({"-1": {...}, "-2": ...});
   * legacy files carried one flat map applied to every lane of the road.
   */
  interface RestoredLaneAttrs {
    flat: Record<string, string> | null
    perLane: Map<number, Record<string, string>> | null
  }
  const restoredAttrCache = new Map<string, RestoredLaneAttrs>()

  const pickStringAttrs = (obj: Record<string, unknown>): Record<string, string> | null => {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(obj)) {
      // `type` is fixed to 'lanelet' and odr_* meta is regenerated.
      if (typeof v !== 'string' || k === 'type' || k.startsWith('odr_')) continue
      out[k] = v
    }
    return Object.keys(out).length > 0 ? out : null
  }

  const restoredLaneAttributes = (road: OdrRoad, odrLaneId: number): Record<string, string> | null => {
    let entry = restoredAttrCache.get(road.id)
    if (entry === undefined) {
      entry = { flat: null, perLane: null }
      const raw = road.userData['laneAttributes']
      if (raw) {
        try {
          const obj = JSON.parse(raw) as unknown
          if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            const flat: Record<string, unknown> = {}
            for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
              if (v && typeof v === 'object' && !Array.isArray(v) && /^-?\d+$/.test(k)) {
                const laneAttrs = pickStringAttrs(v as Record<string, unknown>)
                if (laneAttrs) {
                  entry.perLane = entry.perLane ?? new Map()
                  entry.perLane.set(parseInt(k, 10), laneAttrs)
                }
              } else {
                flat[k] = v
              }
            }
            entry.flat = pickStringAttrs(flat)
          }
        } catch {
          // Malformed userData JSON is ignored (third-party files).
        }
      }
      restoredAttrCache.set(road.id, entry)
    }
    const perLane = entry.perLane?.get(odrLaneId) ?? null
    if (!entry.flat && !perLane) return null
    return { ...(entry.flat ?? {}), ...(perLane ?? {}) }
  }

  const registryKey = (roadId: string, sectionIdx: number, odrLaneId: number): string =>
    `${roadId}|${sectionIdx}|${odrLaneId}`

  for (const road of roads) {
    roadById.set(road.id, road)
    sectionCount.set(road.id, road.laneSections.length)
    if (road.hasElevation) elevationRoads++
    if (road.hasSuperelevation) superelevationRoads++
    if (road.planView.some(g => g.kind === 'poly3')) poly3Roads++
    signalCount += road.signals.length
    objectCount += road.objects.length

    if (road.planView.length === 0 || road.laneSections.length === 0) {
      warnings.push(`Road ${road.id}: no plan view geometry or lane sections; skipped.`)
      continue
    }

    // Stations that must be present: laneSection starts, laneOffset
    // breakpoints, and lane width record breakpoints.
    const extraStations: number[] = []
    for (const sec of road.laneSections) {
      extraStations.push(sec.s)
      for (const lane of [...sec.left, ...sec.right]) {
        for (const w of lane.widths) extraStations.push(sec.s + w.sOffset)
      }
    }
    for (const lo of road.laneOffsets) extraStations.push(lo.s)

    const samples = sampleReferenceLine(road, {
      maxChordErrorMeters: options.maxChordErrorMeters,
      maxStepMeters: options.maxStepMeters,
      extraStations,
    })
    if (samples.length < 2) {
      warnings.push(`Road ${road.id}: reference line could not be sampled; skipped.`)
      continue
    }

    const skipped = new Set<number>()
    let microSections = 0
    for (let secIdx = 0; secIdx < road.laneSections.length; secIdx++) {
      const sec = road.laneSections[secIdx]
      const secEnd = secIdx + 1 < road.laneSections.length ? road.laneSections[secIdx + 1].s : road.length
      // Micro sections (a few centimeters or less — common in generated maps
      // as lane-count transition slivers) carry no usable lane area; they are
      // skipped and lane-level connectivity is bridged across them below.
      if (secEnd - sec.s < MIN_SECTION_LEN_M) {
        skipped.add(secIdx)
        microSections++
        continue
      }
      const stations = samples.filter(st => st.s >= sec.s - S_EPS && st.s <= secEnd + S_EPS)
      if (stations.length < 2) {
        skipped.add(secIdx)
        continue
      }
      materializeSection(road, sec, secIdx, stations)
    }
    skippedSections.set(road.id, skipped)
    if (microSections > 0) microSectionRoads++

    // Signals are materialized after every road's lanes exist, because a
    // <signalReference> may point at lanes of a road processed later.
    signalRoads.push({ road, samples })
  }

  /**
   * Resolve lane references that point into skipped (micro) sections to the
   * nearest materialized section, following lane-level links in `dir`
   * (+1 = toward larger section indices, -1 = toward smaller). Returns the
   * (sectionIdx, laneId) pairs in the first materialized section reached.
   */
  function resolveThroughSkipped(
    road: OdrRoad,
    secIdx: number,
    laneIds: number[],
    dir: 1 | -1
  ): { secIdx: number; laneId: number }[] {
    const out: { secIdx: number; laneId: number }[] = []
    const skipped = skippedSections.get(road.id)
    const visit = (si: number, ids: number[], depth: number): void => {
      if (si < 0 || si >= road.laneSections.length || ids.length === 0 || depth > road.laneSections.length) {
        return
      }
      if (!skipped?.has(si)) {
        for (const id of ids) out.push({ secIdx: si, laneId: id })
        return
      }
      const sec = road.laneSections[si]
      const nextIds: number[] = []
      for (const id of ids) {
        const lane = [...sec.left, ...sec.right].find(l => l.id === id)
        if (!lane) continue
        for (const linked of dir === 1 ? lane.successorIds : lane.predecessorIds) {
          if (!nextIds.includes(linked)) nextIds.push(linked)
        }
      }
      visit(si + dir, nextIds, depth + 1)
    }
    visit(secIdx, laneIds, 0)
    return out
  }

  /**
   * Resolve the lane shapes a <validity> lane range applies to on `road` at
   * station `s`, falling back to every driving lane of the road when the
   * validity list is empty. Resolved shape ids are appended to `into`.
   */
  function resolveAffectedLanes(
    road: OdrRoad,
    s: number,
    validity: OdrSignalValidity[],
    into: string[]
  ): void {
    let secIdx = 0
    for (let i = 0; i < road.laneSections.length; i++) {
      if (road.laneSections[i].s <= s + S_EPS) secIdx = i
      else break
    }
    if (validity.length > 0) {
      for (const v of validity) {
        const lo = Math.min(v.fromLane, v.toLane)
        const hi = Math.max(v.fromLane, v.toLane)
        for (let odrLaneId = lo; odrLaneId <= hi; odrLaneId++) {
          if (odrLaneId === 0) continue
          const reg = laneRegistry.get(registryKey(road.id, secIdx, odrLaneId))
          if (reg && !into.includes(reg.shapeId)) into.push(reg.shapeId)
        }
      }
    } else {
      for (const reg of lanesByRoad.get(road.id) ?? []) {
        if (reg.laneType === 'driving' && !into.includes(reg.shapeId)) {
          into.push(reg.shapeId)
        }
      }
    }
  }

  /**
   * Rebuild a stop-line linestring from a signal's
   * <userData code="stopLine" value="[[x,y],...]"> record (ENU meters).
   * Returns the linestring shape id, or null when the record is absent or
   * malformed.
   */
  function materializeStopLine(stopLineJson: string | undefined): string | null {
    if (!stopLineJson) return null
    let coords: unknown
    try {
      coords = JSON.parse(stopLineJson)
    } catch {
      return null
    }
    if (!Array.isArray(coords) || coords.length < 2) return null
    const pts: EnuPoint[] = []
    for (const entry of coords) {
      if (!Array.isArray(entry) || entry.length < 2) return null
      const [x, y] = entry
      if (typeof x !== 'number' || typeof y !== 'number') return null
      pts.push({ x, y })
    }
    const pointIds: string[] = []
    let firstX = 0
    let firstY = 0
    pts.forEach((p, i) => {
      const x = enuToCanvasX(p.x)
      const y = enuToCanvasY(p.y)
      if (i === 0) {
        firstX = x
        firstY = y
      }
      const pointId = idAllocator.next('point')
      result.points.push({ id: pointId, x, y, osmId: '' })
      pointIds.push(pointId)
    })
    const ls: ImportedLinestring = {
      id: idAllocator.next('linestring'),
      x: firstX,
      y: firstY,
      pointIds,
      osmId: '',
      attributes: { type: 'stop_line', subtype: 'solid', width: '0.2' },
    }
    result.linestrings.push(ls)
    return ls.id
  }

  // <signalReference> records grouped by the referenced signal id, so a
  // signal controlling several roads recovers its full validity set.
  const referencesBySignalId = new Map<string, { road: OdrRoad; s: number; validity: OdrSignalValidity[] }[]>()
  for (const road of roads) {
    for (const ref of road.signalReferences) {
      if (!ref.id) continue
      const list = referencesBySignalId.get(ref.id) ?? []
      list.push({ road, s: ref.s, validity: ref.validity })
      referencesBySignalId.set(ref.id, list)
    }
  }

  /**
   * Convert signals into shapes: type 1000001/1000002 become traffic lights,
   * any other type with dynamic != "yes" becomes a static traffic sign. The
   * position is the (s, t) station evaluated on the reference line;
   * `affectedLaneIds` resolves the <validity> lane range against the lane
   * section containing s (falling back to every driving lane of the road),
   * merged with the lanes of any road that re-applies the signal via
   * <signalReference>. A <userData code="stopLine"> record is rebuilt into a
   * stop-line linestring and linked through `stopLineId`; sign attributes
   * stashed in <userData code="signAttributes"> (sign_code etc.) are restored.
   */
  function materializeSignals(road: OdrRoad, samples: ReferenceSample[]): void {
    for (const sig of road.signals) {
      const isTrafficLight = TRAFFIC_LIGHT_SIGNAL_TYPES.has(sig.type)
      // Dynamic signals of unknown type cannot be represented as static
      // signs; they stay sidecar-only (counted in the warnings).
      if (!isTrafficLight && sig.dynamic === 'yes') continue
      const pose = poseAt(samples, sig.s)
      // Unit normal toward +t (left of the reference direction in ENU).
      const ex = pose.x - Math.sin(pose.hdg) * sig.t
      const ey = pose.y + Math.cos(pose.hdg) * sig.t
      // World heading the signal applies to (ENU radians): reference-line
      // heading, flipped for orientation="-", plus the signal's hOffset.
      const headingRad = pose.hdg + (sig.orientation === '-' ? Math.PI : 0) + sig.hOffset

      const affected: string[] = []
      resolveAffectedLanes(road, sig.s, sig.validity, affected)
      for (const ref of referencesBySignalId.get(sig.id) ?? []) {
        if (ref.road.id === road.id) continue
        resolveAffectedLanes(ref.road, ref.s, ref.validity, affected)
      }

      if (isTrafficLight) {
        const data: ImportedTrafficLight = {
          id: idAllocator.next('traffic_light'),
          x: enuToCanvasX(ex),
          y: enuToCanvasY(ey),
          // Default editor proportions (30x60 px) when the signal carries no size.
          w: sig.width > 0 ? sig.width * PIXELS_PER_METER : 30,
          h: sig.height > 0 ? sig.height * PIXELS_PER_METER : 60,
          osmId: '',
          affectedLaneIds: affected,
          stopLineId: materializeStopLine(sig.userData['stopLine']),
          controllerId: controllerIdBySignal.get(sig.id) ?? '',
          attributes: {
            type: 'traffic_light',
            odr_signal_id: sig.id,
            odr_road_id: road.id,
            odr_signal_type: sig.type,
            odr_signal_subtype: sig.subtype,
          },
        }
        result.trafficLights.push(data)
        convertedSignalCount++
        continue
      }

      // Static traffic sign. Attributes stashed by the exporter in
      // <userData code="signAttributes"> (sign_code, sign_type, regulatory
      // element subtype, custom tags) are restored verbatim; third-party
      // signs fall back to the signal name as the sign code.
      const attributes: Record<string, string> = { type: 'traffic_sign' }
      const rawSignAttrs = sig.userData['signAttributes']
      if (rawSignAttrs) {
        try {
          const obj = JSON.parse(rawSignAttrs) as unknown
          if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
              if (typeof v !== 'string' || k === 'type' || k.startsWith('odr_')) continue
              attributes[k] = v
            }
          }
        } catch {
          // Malformed userData JSON is ignored (third-party files).
        }
      }
      if (!attributes.sign_code && sig.name) attributes.sign_code = sig.name
      attributes.odr_signal_id = sig.id
      attributes.odr_road_id = road.id
      attributes.odr_signal_type = sig.type
      attributes.odr_signal_subtype = sig.subtype
      if (sig.country) attributes.odr_country = sig.country
      const data: ImportedTrafficSign = {
        id: idAllocator.next('traffic_sign'),
        x: enuToCanvasX(ex),
        y: enuToCanvasY(ey),
        // Default editor proportions (30x30 px) when the signal carries no size.
        w: sig.width > 0 ? sig.width * PIXELS_PER_METER : 30,
        h: sig.height > 0 ? sig.height * PIXELS_PER_METER : 30,
        osmId: '',
        affectedLaneIds: affected,
        stopLineId: materializeStopLine(sig.userData['stopLine']),
        attributes,
        headingRad,
      }
      result.trafficSigns.push(data)
      convertedSignalCount++
    }
  }

  for (const { road, samples } of signalRoads) {
    materializeSignals(road, samples)
  }

  /** Driving-lane shape ids of a road (regulatory link resolution). */
  const drivingLanesOf = (roadId: string): string[] => {
    const out: string[] = []
    for (const reg of lanesByRoad.get(roadId) ?? []) {
      if (reg.laneType === 'driving' && !out.includes(reg.shapeId)) out.push(reg.shapeId)
    }
    return out
  }

  /** Shape ids of a specific (road, ODR lane id) pair, across all sections. */
  const lanesOfRoadLane = (roadId: string, odrLaneId: number): string[] => {
    const out: string[] = []
    for (const reg of lanesByRoad.get(roadId) ?? []) {
      if (reg.odrLaneId === odrLaneId && !out.includes(reg.shapeId)) out.push(reg.shapeId)
    }
    return out
  }

  /** Resolve a [[roadId, laneId], ...] JSON record to lane shape ids. */
  const resolveLanePairs = (pairs: unknown): string[] => {
    const out: string[] = []
    if (!Array.isArray(pairs)) return out
    for (const entry of pairs) {
      if (!Array.isArray(entry) || entry.length < 2) continue
      const [rid, lid] = entry
      if (typeof rid !== 'string' || typeof lid !== 'string') continue
      const odrLaneId = parseInt(lid, 10)
      if (!Number.isFinite(odrLaneId)) continue
      for (const shapeId of lanesOfRoadLane(rid, odrLaneId)) {
        if (!out.includes(shapeId)) out.push(shapeId)
      }
    }
    return out
  }

  /**
   * Convert crosswalk objects into crosswalk shapes. The band center is the
   * (s, t) station on the reference line; the walking axis follows the
   * object's heading (relative to the road direction), spanning `length`
   * with band width `width`. Regulatory links stashed by the exporter in
   * <userData code="crosswalkLinks"> (affected roads + stop line polyline)
   * are resolved back to lane shape ids / a stop-line linestring.
   */
  function materializeCrosswalks(road: OdrRoad, samples: ReferenceSample[]): void {
    for (const obj of road.objects) {
      if (obj.type !== 'crosswalk') continue
      if (!(obj.length > 0) || !(obj.width > 0)) continue
      const pose = poseAt(samples, obj.s)
      // Unit normal toward +t (left of the reference direction in ENU).
      const cx = pose.x - Math.sin(pose.hdg) * obj.t
      const cy = pose.y + Math.cos(pose.hdg) * obj.t
      const axisHdg = pose.hdg + obj.hdg
      const hx = (Math.cos(axisHdg) * obj.length) / 2
      const hy = (Math.sin(axisHdg) * obj.length) / 2
      const startX = enuToCanvasX(cx - hx)
      const startY = enuToCanvasY(cy - hy)
      const endX = enuToCanvasX(cx + hx)
      const endY = enuToCanvasY(cy + hy)
      const shapeX = (startX + endX) / 2
      const shapeY = (startY + endY) / 2

      const affected: string[] = []
      let stopLineId: string | null = null
      const rawLinks = obj.userData['crosswalkLinks']
      if (rawLinks) {
        try {
          const links = JSON.parse(rawLinks) as {
            affectedLanes?: unknown
            affectedRoads?: unknown
            stopLine?: unknown
          }
          // Current exports carry lane-precise [[roadId, laneId], ...] pairs;
          // legacy files only listed road ids (=> every driving lane).
          if (Array.isArray(links.affectedLanes)) {
            for (const shapeId of resolveLanePairs(links.affectedLanes)) {
              if (!affected.includes(shapeId)) affected.push(shapeId)
            }
          } else if (Array.isArray(links.affectedRoads)) {
            for (const rid of links.affectedRoads) {
              if (typeof rid !== 'string') continue
              for (const shapeId of drivingLanesOf(rid)) {
                if (!affected.includes(shapeId)) affected.push(shapeId)
              }
            }
          }
          if (Array.isArray(links.stopLine)) {
            stopLineId = materializeStopLine(JSON.stringify(links.stopLine))
          }
        } catch {
          // Malformed userData JSON is ignored (third-party files).
        }
      }

      const data: ImportedCrosswalk = {
        id: idAllocator.next('crosswalk'),
        x: shapeX,
        y: shapeY,
        startX: startX - shapeX,
        startY: startY - shapeY,
        endX: endX - shapeX,
        endY: endY - shapeY,
        crosswalkWidth: obj.width * PIXELS_PER_METER,
        osmId: '',
        affectedLaneIds: affected,
        stopLineId,
        attributes: {
          type: 'crosswalk',
          odr_road_id: road.id,
          odr_object_id: obj.id,
        },
      }
      result.crosswalks.push(data)
      convertedObjectCount++
    }
  }

  for (const { road, samples } of signalRoads) {
    materializeCrosswalks(road, samples)
  }

  /**
   * Convert `<object type="parkingSpace">` into polygon footprints. Corner
   * geometry follows the OpenDRIVE object outline model:
   *   - <cornerLocal u v>: the object origin is the (s, t) station on the
   *     reference line; each corner sits at (u, v) in the object's local frame,
   *     whose u axis points along the road heading + the object's own `hdg`.
   *   - <cornerRoad s t>: each corner is an independent (s, t) station on the
   *     reference line (no object-local rotation).
   * When an object carries no outline the footprint is an oriented rectangle
   * derived from s/t/hdg/length/width (the crosswalk band construction reused,
   * closed into four corners). Vertices are converted meters -> canvas pixels,
   * matching every other imported shape. Only the footprint is materialized;
   * the source <object> stays verbatim in the sidecar for carry-through export.
   */
  function materializeParkingSpaces(road: OdrRoad, samples: ReferenceSample[]): void {
    /**
     * A single placement of an object along the reference line: the (s, t) station,
     * the extra heading tilt of the repeat line, and the per-instance footprint
     * length/width. A non-repeated object yields exactly one placement at its own
     * pose with zero tilt and its own dimensions.
     */
    interface Placement {
      s: number
      t: number
      /** Heading added to (road heading + object hdg), from the repeat line tilt. */
      tilt: number
      length: number
      width: number
    }

    /**
     * Expand a `<repeat>` into discrete instance placements. Instances are spaced
     * `distance` metres from `s` to `s + length`; t / length / width are linearly
     * interpolated from their start value to their end value across the span. An
     * unauthored width/length (`undefined`) falls back to the object's dimension.
     * A `distance` <= 0 (continuous object) collapses to one swept instance at the
     * span start, so the object still materializes rather than vanishing.
     * (ASAM OpenDRIVE 1.8 §13.2; placement math mirrors esmini's
     * RMObject::GetRepeatInstances.)
     */
    const expandRepeat = (obj: OdrObject, rep: OdrObjectRepeat): Placement[] => {
      const tilt = Math.atan2(rep.tEnd - rep.tStart, rep.length || 1)
      const lenAt = (f: number) =>
        rep.lengthStart !== undefined || rep.lengthEnd !== undefined
          ? (rep.lengthStart ?? 0) + f * ((rep.lengthEnd ?? 0) - (rep.lengthStart ?? 0))
          : obj.length
      const widAt = (f: number) =>
        rep.widthStart !== undefined || rep.widthEnd !== undefined
          ? (rep.widthStart ?? 0) + f * ((rep.widthEnd ?? 0) - (rep.widthStart ?? 0))
          : obj.width
      const placements: Placement[] = []
      const roadLen = road.length
      if (!(rep.length > 0) || !(rep.distance > 0)) {
        // Continuous object (distance == 0) or degenerate span: one instance at start.
        const f = 0
        placements.push({
          s: rep.s,
          t: rep.tStart,
          tilt,
          length: lenAt(f),
          width: widAt(f),
        })
        return placements
      }
      // Iterate the span in accumulated length (curS), mirroring esmini's
      // RMObject::GetRepeatInstances: the loop bound and the road-overflow guard
      // both use curS (not rep.s + curS) so the repeat start offset does not
      // reduce how many copies fit.
      for (let curS = 0; curS < rep.length + S_EPS && curS < roadLen + S_EPS; curS += rep.distance) {
        const f = curS / rep.length
        const instLen = lenAt(f)
        // Stop once an instance would extend past the end of the road.
        if (curS + instLen > roadLen + S_EPS) break
        placements.push({
          s: rep.s + curS,
          t: rep.tStart + f * (rep.tEnd - rep.tStart),
          tilt,
          length: instLen,
          width: widAt(f),
        })
      }
      return placements
    }

    /** Build the ENU footprint corners for one placement of an object. */
    const footprintFor = (obj: OdrObject, pl: Placement): EnuPoint[] => {
      let enuCorners: EnuPoint[] = []
      if (obj.outline.length >= 3) {
        const localCorners = obj.outline.filter(c => c.u !== undefined && c.v !== undefined)
        const roadCorners = obj.outline.filter(c => c.s !== undefined && c.t !== undefined)
        if (localCorners.length >= 3) {
          const pose = poseAt(samples, pl.s)
          // Object origin: reference-line pose at s, shifted by t along +normal.
          const ox = pose.x - Math.sin(pose.hdg) * pl.t
          const oy = pose.y + Math.cos(pose.hdg) * pl.t
          const axisHdg = pose.hdg + obj.hdg + pl.tilt
          const cu = Math.cos(axisHdg)
          const su = Math.sin(axisHdg)
          // Scale the authored (start-of-span) outline toward this instance's
          // dimensions, matching how esmini grows repeated copies.
          const scaleU = obj.length > S_EPS ? pl.length / obj.length : 1
          const scaleV = obj.width > S_EPS ? pl.width / obj.width : 1
          enuCorners = localCorners.map(c => {
            const u = (c.u as number) * scaleU
            const v = (c.v as number) * scaleV
            // Local u axis along axisHdg, v axis 90° to its left (+normal).
            return { x: ox + cu * u - su * v, y: oy + su * u + cu * v }
          })
        } else if (roadCorners.length >= 3) {
          // cornerRoad corners are stations on the reference line. For a repeated
          // object each corner's authored s is an offset re-based to the instance
          // station (its minimum s becomes the instance s); a non-repeated object
          // keeps the corners' absolute s.
          const minCornerS = Math.min(...roadCorners.map(c => c.s as number))
          const sBase = obj.repeats.length > 0 ? pl.s - minCornerS : 0
          enuCorners = roadCorners.map(c => {
            const p = poseAt(samples, sBase + (c.s as number))
            return {
              x: p.x - Math.sin(p.hdg) * (c.t as number),
              y: p.y + Math.cos(p.hdg) * (c.t as number),
            }
          })
        }
      }
      if (enuCorners.length < 3) {
        // No usable outline: derive an oriented rectangle from s/t/hdg/l/w.
        if (!(pl.length > 0) || !(pl.width > 0)) return []
        const pose = poseAt(samples, pl.s)
        const cx = pose.x - Math.sin(pose.hdg) * pl.t
        const cy = pose.y + Math.cos(pose.hdg) * pl.t
        const axisHdg = pose.hdg + obj.hdg + pl.tilt
        const ux = Math.cos(axisHdg)
        const uy = Math.sin(axisHdg)
        // Normal (left of the object axis) for the width direction.
        const nx = -uy
        const ny = ux
        const hl = pl.length / 2
        const hw = pl.width / 2
        enuCorners = [
          { x: cx - ux * hl - nx * hw, y: cy - uy * hl - ny * hw },
          { x: cx + ux * hl - nx * hw, y: cy + uy * hl - ny * hw },
          { x: cx + ux * hl + nx * hw, y: cy + uy * hl + ny * hw },
          { x: cx - ux * hl + nx * hw, y: cy - uy * hl + ny * hw },
        ]
      }
      return enuCorners
    }

    for (const obj of road.objects) {
      if (obj.type !== 'parkingSpace') continue
      // A repeat replicates the object into many instances; without one the object
      // is placed exactly once at its own pose.
      const placements: Placement[] =
        obj.repeats.length > 0
          ? obj.repeats.flatMap(rep => expandRepeat(obj, rep))
          : [{ s: obj.s, t: obj.t, tilt: 0, length: obj.length, width: obj.width }]

      for (const pl of placements) {
        const enuCorners = footprintFor(obj, pl)
        if (enuCorners.length < 3) continue
        const data: ImportedParkingSpace = {
          id: idAllocator.next('polygon'),
          points: enuCorners.map(p => ({ x: enuToCanvasX(p.x), y: enuToCanvasY(p.y) })),
          osmId: '',
          attributes: {
            type: 'parking_space',
            odr_object_id: obj.id,
            odr_road_id: road.id,
            odr_type: obj.type,
          },
        }
        ;(result.parkingSpaces ??= []).push(data)
      }
      convertedObjectCount++
    }
  }

  for (const { road, samples } of signalRoads) {
    materializeParkingSpaces(road, samples)
  }

  // Restore right-of-way links stashed by the exporter.
  // Current exports carry <userData code="yieldLanes"> with per-lane
  // { ownLaneId: [[roadId, laneId], ...] } records; legacy files carried
  // <userData code="yieldRoads"> (every driving lane of the carrying road
  // yields over the driving lanes of the listed roads).
  for (const road of roads) {
    const rawYieldLanes = road.userData['yieldLanes']
    if (rawYieldLanes) {
      let byLane: unknown
      try {
        byLane = JSON.parse(rawYieldLanes)
      } catch {
        continue
      }
      if (!byLane || typeof byLane !== 'object' || Array.isArray(byLane)) continue
      for (const [laneIdStr, pairs] of Object.entries(byLane as Record<string, unknown>)) {
        const odrLaneId = parseInt(laneIdStr, 10)
        if (!Number.isFinite(odrLaneId)) continue
        const yieldLaneIds = resolveLanePairs(pairs)
        if (yieldLaneIds.length === 0) continue
        for (const shapeId of lanesOfRoadLane(road.id, odrLaneId)) {
          const lane = laneShapeById.get(shapeId)
          if (lane) lane.yieldLaneIds = [...yieldLaneIds]
        }
      }
      continue
    }
    const rawYield = road.userData['yieldRoads']
    if (!rawYield) continue
    let yieldRoadIds: unknown
    try {
      yieldRoadIds = JSON.parse(rawYield)
    } catch {
      continue
    }
    if (!Array.isArray(yieldRoadIds)) continue
    const yieldLaneIds: string[] = []
    for (const rid of yieldRoadIds) {
      if (typeof rid !== 'string') continue
      for (const shapeId of drivingLanesOf(rid)) {
        if (!yieldLaneIds.includes(shapeId)) yieldLaneIds.push(shapeId)
      }
    }
    if (yieldLaneIds.length === 0) continue
    for (const shapeId of drivingLanesOf(road.id)) {
      const lane = laneShapeById.get(shapeId)
      if (lane) lane.yieldLaneIds = [...yieldLaneIds]
    }
  }

  function materializeSection(
    road: OdrRoad,
    sec: OdrLaneSection,
    secIdx: number,
    stations: ReferenceSample[]
  ): void {
    // Unit normals pointing toward +t (left of the reference direction in ENU).
    const normals: EnuPoint[] = stations.map(st => ({ x: -Math.sin(st.hdg), y: Math.cos(st.hdg) }))
    // Lane reference polyline: reference line shifted by the laneOffset.
    const centerPts: EnuPoint[] = stations.map((st, j) => {
      const off = laneOffsetAt(road, st.s)
      // z is the reference-line height: lateral offsets do not change it
      // (superelevation / lateralProfile is still dropped — see warnings).
      return { x: st.x + normals[j].x * off, y: st.y + normals[j].y * off, z: st.z }
    })

    // Accumulate boundary polylines from the center outward. Index 0 is the
    // center; index i is the outer boundary of the i-th lane (inner-to-outer
    // order). Widths of skipped lanes still shift the outer boundaries.
    const accumulate = (lanes: OdrLane[], sign: 1 | -1): EnuPoint[][] => {
      const boundaries: EnuPoint[][] = [centerPts]
      let prev = centerPts
      for (const lane of lanes) {
        const next = prev.map((p, j) => {
          const w = laneWidthAt(lane, stations[j].s - sec.s)
          return { x: p.x + sign * normals[j].x * w, y: p.y + sign * normals[j].y * w, z: p.z }
        })
        boundaries.push(next)
        prev = next
      }
      return boundaries
    }
    const leftBoundaries = accumulate(sec.left, 1)
    const rightBoundaries = accumulate(sec.right, -1)

    // Lazily materialize boundary linestrings so adjacent lanes share them.
    // The center boundary (index 0) is shared across both sides.
    const lsCache = new Map<string, ImportedLinestring>()
    const getLinestring = (side: 'L' | 'R', index: number, pts: EnuPoint[], rm: OdrRoadMark | undefined): ImportedLinestring => {
      const key = index === 0 ? 'C' : `${side}${index}`
      const cached = lsCache.get(key)
      if (cached) return cached
      const pointIds: string[] = []
      let firstX = 0
      let firstY = 0
      pts.forEach((p, j) => {
        const x = enuToCanvasX(p.x)
        const y = enuToCanvasY(p.y)
        if (j === 0) {
          firstX = x
          firstY = y
        }
        const pointId = idAllocator.next('point')
        const data: ImportedPoint = { id: pointId, x, y, osmId: '' }
        // Keep the third dimension on the point so 2D editing preserves it.
        // Omit an exact 0 so "no elevation" roads produce no z at all.
        if (p.z !== undefined && p.z !== 0) data.z = p.z
        result.points.push(data)
        pointIds.push(pointId)
      })
      const attributes: Record<string, string> = {
        type: 'line_thin',
        subtype: roadMarkToSubtype(rm),
        width: '0.2',
      }
      // OpenDRIVE roadMark carry-through. These are read back at export time
      // when a road has been edited (and therefore cannot be emitted verbatim),
      // and by the app's display-mode-aware boundary color resolver.
      if (rm) {
        attributes.odr_road_mark_type = rm.type
        if (rm.color !== undefined) attributes.odr_road_mark_color = rm.color
        if (rm.weight !== undefined) attributes.odr_road_mark_weight = rm.weight
        if (rm.width !== undefined) attributes.odr_road_mark_width = String(rm.width)
        if (rm.material !== undefined) attributes.odr_road_mark_material = rm.material
        if (rm.laneChange !== undefined) attributes.odr_road_mark_lane_change = rm.laneChange
      }
      const data: ImportedLinestring = {
        id: idAllocator.next('linestring'),
        x: firstX,
        y: firstY,
        pointIds,
        osmId: '',
        attributes,
      }
      result.linestrings.push(data)
      lsCache.set(key, data)
      return data
    }

    const centerRoadMark = sec.center.find(l => l.id === 0)?.roadMarks[0]
    const boundaryRoadMark = (lanes: OdrLane[], index: number): OdrRoadMark | undefined =>
      index === 0 ? centerRoadMark : lanes[index - 1]?.roadMarks[0]

    const materializeSide = (lanes: OdrLane[], boundaries: EnuPoint[][], side: 'L' | 'R'): void => {
      for (let i = 0; i < lanes.length; i++) {
        const lane = lanes[i]
        let maxWidth = 0
        for (const st of stations) {
          const w = laneWidthAt(lane, st.s - sec.s)
          if (w > maxWidth) maxWidth = w
        }
        if (!shouldKeepLane(lane, maxWidth)) continue

        const innerLs = getLinestring(side, i, boundaries[i], boundaryRoadMark(lanes, i))
        const outerLs = getLinestring(side, i + 1, boundaries[i + 1], boundaryRoadMark(lanes, i + 1))

        // Left lanes (positive ids) travel opposite to the reference line, so
        // their boundaries (stored in reference-line order) are read reversed.
        // For both sides the inner boundary is the lane's left edge in travel
        // direction (verified against screen coordinates with y pointing down).
        const isLeftLane = lane.id > 0
        const laneShapeId = idAllocator.next('lane')
        const attributes: Record<string, string> = {
          type: 'lanelet',
          subtype: laneletSubtypeFor(lane.type),
          one_way: 'yes',
          // Lanelet tags stashed by the exporter in <userData
          // code="laneAttributes"> (speed_limit, turn_direction, location,
          // one_way=no, exact subtype, custom tags) override the defaults.
          ...restoredLaneAttributes(road, lane.id),
          odr_type: lane.type,
          odr_road_id: road.id,
          odr_lane_id: String(lane.id),
          odr_section_s: String(sec.s),
          // Kept so a regenerated road can re-emit its original <road name>
          // instead of falling back to the lanelet subtype.
          ...(road.name ? { odr_road_name: road.name } : {}),
        }
        attributes.type = 'lanelet'
        if (road.junction !== '-1') {
          attributes.odr_junction_id = road.junction
          if (!attributes.turn_direction) {
            attributes.turn_direction = turnDirectionFor(stations, isLeftLane)
          }
        }

        const data: ImportedLane = {
          id: laneShapeId,
          x: innerLs.x,
          y: innerLs.y,
          leftBoundaryId: innerLs.id,
          rightBoundaryId: outerLs.id,
          invertLeft: isLeftLane,
          invertRight: isLeftLane,
          osmId: '',
          attributes,
          next: [],
          prev: [],
        }
        result.lanes.push(data)
        laneShapeById.set(laneShapeId, data)
        const registered: RegisteredLane = {
          shapeId: laneShapeId,
          roadId: road.id,
          sectionIdx: secIdx,
          odrLaneId: lane.id,
          laneType: lane.type,
        }
        laneRegistry.set(registryKey(road.id, secIdx, lane.id), registered)
        const roadLanes = lanesByRoad.get(road.id) ?? []
        roadLanes.push(registered)
        lanesByRoad.set(road.id, roadLanes)
      }
    }

    materializeSide(sec.left, leftBoundaries, 'L')
    materializeSide(sec.right, rightBoundaries, 'R')
  }

  // ---- Connectivity ----

  const connect = (fromShapeId: string, toShapeId: string): void => {
    const from = laneShapeById.get(fromShapeId)
    const to = laneShapeById.get(toShapeId)
    if (!from || !to) return
    if (!from.next.includes(toShapeId)) from.next.push(toShapeId)
    if (!to.prev.includes(fromShapeId)) to.prev.push(fromShapeId)
  }

  /**
   * Drop wedge-shaped sliver lanes whose inner boundary has collapsed to a
   * point. Generated junction maps (e.g. CARLA towns) route turns through
   * short lane sections whose inner edge converges on the corner; after weld,
   * one boundary degenerates to a single coincident pair of endpoints. Such a
   * triangle cannot be expressed by OpenDRIVE's offset-along-normal width
   * model (its apex is displaced longitudinally, not laterally, so the width
   * collapses to zero) and the exporter would silently drop it, losing the
   * lane round-trip. The sliver carries no usable area and only chains
   * connectivity (every one has a full-size sibling lane that already covers
   * the maneuver), so it is removed and its `prev`/`next` are stitched
   * directly, bridging the connection across it.
   */
  function pruneDegenerateSliverLanes(): void {
    const lsById = new Map(result.linestrings.map(l => [l.id as string, l]))
    const ptById = new Map(result.points.map(p => [p.id as string, p]))
    const boundaryLengthM = (lsId: string): number => {
      const ls = lsById.get(lsId)
      if (!ls) return 0
      let total = 0
      for (let i = 1; i < ls.pointIds.length; i++) {
        const a = ptById.get(ls.pointIds[i - 1])
        const b = ptById.get(ls.pointIds[i])
        if (a && b) total += Math.hypot(a.x - b.x, a.y - b.y)
      }
      return total / PIXELS_PER_METER
    }
    // A boundary shorter than this (m) counts as collapsed. The shortest
    // legitimate boundary in practice clears the micro-section threshold by an
    // order of magnitude, so this only ever catches true point-collapses.
    const SLIVER_EPS_M = 0.05
    const degenerate = result.lanes.filter(
      lane =>
        boundaryLengthM(lane.leftBoundaryId) < SLIVER_EPS_M ||
        boundaryLengthM(lane.rightBoundaryId) < SLIVER_EPS_M
    )
    if (degenerate.length === 0) return

    const removedIds = new Set(degenerate.map(l => l.id as string))
    // Stitch connectivity across each removed sliver: every predecessor links
    // directly to every successor.
    for (const lane of degenerate) {
      for (const fromId of lane.prev) {
        if (removedIds.has(fromId)) continue
        for (const toId of lane.next) {
          if (removedIds.has(toId)) continue
          connect(fromId, toId)
        }
      }
    }
    // Drop the slivers from the lane list, every lane's next/prev, and the
    // registries the carry-through hash builder reads.
    result.lanes = result.lanes.filter(l => !removedIds.has(l.id as string))
    for (const lane of result.lanes) {
      lane.next = lane.next.filter(id => !removedIds.has(id))
      lane.prev = lane.prev.filter(id => !removedIds.has(id))
    }
    for (const lane of degenerate) laneShapeById.delete(lane.id as string)
    // Purge the slivers from laneRegistry / lanesByRoad (keyed by road/section).
    for (const [roadId, regs] of lanesByRoad) {
      const kept = regs.filter(r => !removedIds.has(r.shapeId))
      if (kept.length !== regs.length) lanesByRoad.set(roadId, kept)
      for (const r of regs) {
        if (removedIds.has(r.shapeId)) {
          laneRegistry.delete(registryKey(r.roadId, r.sectionIdx, r.odrLaneId))
        }
      }
    }
  }

  /**
   * Registered lanes at a road's start (first section) or end (last
   * section). When the outermost section is a skipped micro section, the
   * lane reference is resolved through it along the lane-level links to the
   * first materialized section.
   */
  const lanesAt = (roadId: string, contact: 'start' | 'end', odrLaneId: number): RegisteredLane[] => {
    const road = roadById.get(roadId)
    const count = sectionCount.get(roadId) ?? 0
    if (!road || count === 0) return []
    const secIdx = contact === 'start' ? 0 : count - 1
    const direct = laneRegistry.get(registryKey(roadId, secIdx, odrLaneId))
    if (direct) return [direct]
    const out: RegisteredLane[] = []
    for (const t of resolveThroughSkipped(road, secIdx, [odrLaneId], contact === 'start' ? 1 : -1)) {
      const reg = laneRegistry.get(registryKey(roadId, t.secIdx, t.laneId))
      if (reg && !out.includes(reg)) out.push(reg)
    }
    return out
  }

  /**
   * A materialized lane standing in for a (road, contact, lane id) endpoint.
   * `odrLaneId` / `contact` describe the endpoint in the road the lane was
   * found in (which may differ from the queried road after bridging), so
   * travel-direction checks in `linkLanes` stay correct.
   */
  interface LaneEndpoint {
    reg: RegisteredLane
    odrLaneId: number
    contact: 'start' | 'end'
  }

  /**
   * Resolve a (road, contact, lane id) endpoint to materialized lanes.
   *
   * Within a road this is `lanesAt` (which already bridges skipped micro
   * sections). When the whole road was skipped — e.g. the short synthesized
   * junction connecting roads this exporter emits, or any sub-threshold road
   * in third-party files — the resolution continues across the road: lane
   * links are walked through its (skipped) sections to the far end, and the
   * road-level link there is followed into the neighbouring road, recursively,
   * so connectivity is bridged across skipped roads instead of being lost.
   */
  const resolveLaneEndpoints = (
    roadId: string,
    contact: 'start' | 'end',
    odrLaneId: number,
    depth: number = 0
  ): LaneEndpoint[] => {
    const direct = lanesAt(roadId, contact, odrLaneId)
    if (direct.length > 0) return direct.map(reg => ({ reg, odrLaneId, contact }))
    const road = roadById.get(roadId)
    if (!road || depth > 4) return []
    // Only bridge across roads with no materialized lanes at all; partially
    // materialized roads are fully handled by the in-road resolution above.
    if ((lanesByRoad.get(roadId) ?? []).length > 0) return []
    const n = road.laneSections.length
    if (n === 0) return []
    // Walk lane-level links through the skipped sections to the far end.
    const farContact: 'start' | 'end' = contact === 'start' ? 'end' : 'start'
    const dir = contact === 'start' ? 1 : -1
    let idx = contact === 'start' ? 0 : n - 1
    let ids = [odrLaneId]
    for (let step = 0; step < n - 1 && ids.length > 0; step++) {
      const sec = road.laneSections[idx]
      const nextIds: number[] = []
      for (const id of ids) {
        const lane = [...sec.left, ...sec.right].find(l => l.id === id)
        if (!lane) continue
        for (const linked of dir === 1 ? lane.successorIds : lane.predecessorIds) {
          if (!nextIds.includes(linked)) nextIds.push(linked)
        }
      }
      ids = nextIds
      idx += dir
    }
    const farSec = road.laneSections[farContact === 'start' ? 0 : n - 1]
    const link = farContact === 'end' ? road.successor : road.predecessor
    if (!farSec || !link || link.elementType !== 'road') return []
    const cpB = link.contactPoint ?? (farContact === 'end' ? 'start' : 'end')
    const out: LaneEndpoint[] = []
    for (const id of ids) {
      const lane = [...farSec.left, ...farSec.right].find(l => l.id === id)
      if (!lane) continue
      const targetIds = farContact === 'end' ? lane.successorIds : lane.predecessorIds
      for (const tid of targetIds) {
        for (const ep of resolveLaneEndpoints(link.elementId, cpB, tid, depth + 1)) {
          if (!out.some(o => o.reg === ep.reg && o.odrLaneId === ep.odrLaneId && o.contact === ep.contact)) {
            out.push(ep)
          }
        }
      }
    }
    return out
  }

  /**
   * Link two lanes meeting at a shared contact, respecting travel direction:
   * right lanes (id < 0) travel toward the road's end, left lanes (id > 0)
   * toward its start. A connection is `a -> b` when a's travel exits at the
   * contact and b's travel enters there (and vice versa); when both exit or
   * both enter, the directions are inconsistent and the pair is skipped.
   */
  const linkLanes = (
    a: RegisteredLane,
    aOdrId: number,
    cpA: 'start' | 'end',
    b: RegisteredLane,
    bOdrId: number,
    cpB: 'start' | 'end'
  ): void => {
    const aExits = (aOdrId < 0) === (cpA === 'end')
    const bEnters = (bOdrId < 0) === (cpB === 'start')
    if (aExits && bEnters) connect(a.shapeId, b.shapeId)
    else if (!aExits && !bEnters) connect(b.shapeId, a.shapeId)
  }

  // Chain consecutive lane sections within each road via lane-level links.
  // References into skipped micro sections are resolved through them to the
  // nearest materialized section.
  for (const road of roads) {
    for (let secIdx = 0; secIdx < road.laneSections.length; secIdx++) {
      const sec = road.laneSections[secIdx]
      for (const lane of [...sec.left, ...sec.right]) {
        const cur = laneRegistry.get(registryKey(road.id, secIdx, lane.id))
        if (!cur) continue
        if (secIdx + 1 < road.laneSections.length) {
          for (const succId of lane.successorIds) {
            for (const t of resolveThroughSkipped(road, secIdx + 1, [succId], 1)) {
              const nxt = laneRegistry.get(registryKey(road.id, t.secIdx, t.laneId))
              if (!nxt) continue
              if (lane.id < 0 && t.laneId < 0) connect(cur.shapeId, nxt.shapeId)
              else if (lane.id > 0 && t.laneId > 0) connect(nxt.shapeId, cur.shapeId)
            }
          }
        }
        if (secIdx > 0) {
          for (const predId of lane.predecessorIds) {
            for (const t of resolveThroughSkipped(road, secIdx - 1, [predId], -1)) {
              const prv = laneRegistry.get(registryKey(road.id, t.secIdx, t.laneId))
              if (!prv) continue
              if (lane.id < 0 && t.laneId < 0) connect(prv.shapeId, cur.shapeId)
              else if (lane.id > 0 && t.laneId > 0) connect(cur.shapeId, prv.shapeId)
            }
          }
        }
      }
    }
  }

  // Road-level links (road <-> road). Junction links are resolved separately
  // through the junction connection table.
  const processRoadLink = (
    roadA: OdrRoad,
    link: OdrRoad['successor'],
    cpA: 'start' | 'end'
  ): void => {
    if (!link || link.elementType !== 'road') return
    const roadB = roadById.get(link.elementId)
    if (!roadB) return
    const cpB = link.contactPoint ?? (cpA === 'end' ? 'start' : 'end')
    const sec = roadA.laneSections[cpA === 'start' ? 0 : roadA.laneSections.length - 1]
    if (!sec) return
    for (const lane of [...sec.left, ...sec.right]) {
      const targetIds = cpA === 'end' ? lane.successorIds : lane.predecessorIds
      for (const a of resolveLaneEndpoints(roadA.id, cpA, lane.id)) {
        for (const toId of targetIds) {
          for (const b of resolveLaneEndpoints(roadB.id, cpB, toId)) {
            linkLanes(a.reg, a.odrLaneId, a.contact, b.reg, b.odrLaneId, b.contact)
          }
        }
      }
    }
  }
  for (const road of roads) {
    processRoadLink(road, road.predecessor, 'start')
    processRoadLink(road, road.successor, 'end')
  }

  // Junction connections: incomingRoad -> connectingRoad laneLinks.
  for (const junction of map.junctions) {
    for (const conn of junction.connections) {
      const roadA = roadById.get(conn.incomingRoad)
      const roadC = roadById.get(conn.connectingRoad)
      if (!roadA || !roadC) continue
      // Which end of the incoming road faces this junction?
      const contacts: ('start' | 'end')[] = []
      if (roadA.successor?.elementType === 'junction' && roadA.successor.elementId === junction.id) {
        contacts.push('end')
      }
      if (roadA.predecessor?.elementType === 'junction' && roadA.predecessor.elementId === junction.id) {
        contacts.push('start')
      }
      if (contacts.length === 0) contacts.push('end') // Tolerant default.
      for (const cpA of contacts) {
        for (const ll of conn.laneLinks) {
          for (const a of resolveLaneEndpoints(roadA.id, cpA, ll.from)) {
            for (const b of resolveLaneEndpoints(roadC.id, conn.contactPoint, ll.to)) {
              linkLanes(a.reg, a.odrLaneId, a.contact, b.reg, b.odrLaneId, b.contact)
            }
          }
        }
      }
    }
  }

  // Hidden lane links: edges the exporter could not express as standard
  // <link>/<laneLink> records because a contact width is zero (the OpenDRIVE
  // zero-width / appearing-lane link rules), stashed per road as
  // <userData code="hiddenLaneLinks" value="[{fr,fl,tr,tl},...]"> with
  // from-road / from-lane / to-road / to-lane ids (from end -> to start in
  // travel direction). Restored here into next/prev like any other link.
  for (const road of roads) {
    const raw = road.userData['hiddenLaneLinks']
    if (!raw) continue
    let recs: unknown
    try {
      recs = JSON.parse(raw)
    } catch {
      continue // Malformed userData JSON is ignored (third-party files).
    }
    if (!Array.isArray(recs)) continue
    for (const rec of recs) {
      if (!rec || typeof rec !== 'object') continue
      const { fr, fl, tr, tl } = rec as Record<string, unknown>
      if (typeof fl !== 'number' || typeof tl !== 'number') continue
      const fromRoad = fr === undefined ? road.id : String(fr)
      const toRoad = tr === undefined ? road.id : String(tr)
      for (const a of resolveLaneEndpoints(fromRoad, 'end', fl)) {
        for (const b of resolveLaneEndpoints(toRoad, 'start', tl)) {
          linkLanes(a.reg, a.odrLaneId, a.contact, b.reg, b.odrLaneId, b.contact)
        }
      }
    }
  }

  // Junction <priority high low> records restore right-of-way links: the
  // lanes standing in for the prioritized connecting road gain yieldLaneIds
  // over the lanes standing in for the yielding one. A materialized
  // connecting road is represented by its own lanes; a skipped (short
  // synthesized) one resolves through its predecessor link to the incoming
  // lanes the maneuver started from — the lanes the exporter originally read
  // the yieldLaneIds off. Merged with any userData-restored links above.
  const priorityRoadLanes = (roadId: string): string[] => {
    const own = lanesByRoad.get(roadId) ?? []
    if (own.length > 0) {
      const out: string[] = []
      for (const reg of own) {
        if (!out.includes(reg.shapeId)) out.push(reg.shapeId)
      }
      return out
    }
    const road = roadById.get(roadId)
    if (!road) return []
    const lastSec = road.laneSections[road.laneSections.length - 1]
    if (!lastSec) return []
    const out: string[] = []
    for (const lane of [...lastSec.left, ...lastSec.right]) {
      for (const ep of resolveLaneEndpoints(roadId, 'end', lane.id)) {
        if (!out.includes(ep.reg.shapeId)) out.push(ep.reg.shapeId)
      }
    }
    return out
  }
  for (const junction of map.junctions) {
    for (const pr of junction.priorities) {
      const highLanes = priorityRoadLanes(pr.high)
      const lowLanes = priorityRoadLanes(pr.low)
      if (highLanes.length === 0 || lowLanes.length === 0) continue
      for (const shapeId of highLanes) {
        const lane = laneShapeById.get(shapeId)
        if (!lane) continue
        const merged = lane.yieldLaneIds ?? []
        for (const lowId of lowLanes) {
          if (lowId !== shapeId && !merged.includes(lowId)) merged.push(lowId)
        }
        if (merged.length > 0) lane.yieldLaneIds = merged
      }
    }
  }

  // ---- Round-trip fidelity post-processing ----
  // 1. Boundaries that are geometrically one line (each exported road carries
  //    its own copy of a boundary shared with its neighbour) collapse into a
  //    single linestring so left/right adjacency is expressed by sharing.
  // 2. Boundary endpoints of connected lanes are welded into shared Point
  //    shapes so a Lanelet2 export emits shared nodes (Autoware routing and
  //    shared-node connection detection both depend on this).
  dedupeSharedBoundaries(result)
  weldConnectedLaneContacts(result)
  pruneDegenerateSliverLanes()
  removeOrphanLinestrings(result)
  removeOrphanPoints(result)

  // ---- Carry-through records ----
  // Per-road state hashes for `exportToOpenDrive({ sidecar })`: a road whose
  // hash still matches at export time was not edited and is re-emitted
  // verbatim from the sidecar XML. Hashes are taken AFTER all post-processing
  // (dedupe / weld / orphan removal) so they describe exactly the shapes the
  // editor will hold; the exporter recomputes them from the live shapes.
  {
    const recPointById = new Map(result.points.map(p => [p.id as string, p]))
    const recLsById = new Map(result.linestrings.map(l => [l.id as string, l]))
    const boundaryPts = (lsId: string | null, invert: boolean): Point2D[] | null => {
      if (!lsId) return null
      const ls = recLsById.get(lsId)
      if (!ls) return null
      const ids = invert ? [...ls.pointIds].reverse() : ls.pointIds
      const pts: Point2D[] = []
      for (const pid of ids) {
        const p = recPointById.get(pid)
        if (p) pts.push({ x: p.x, y: p.y })
      }
      return pts.length >= 2 ? pts : null
    }
    const laneRoadOf = new Map<string, string>()
    for (const [roadId, regs] of lanesByRoad) {
      for (const reg of regs) laneRoadOf.set(reg.shapeId, roadId)
    }
    // Regulatory shapes touching a road: attached to it (odr_road_id) or
    // affecting any of its lanes. Mirrored by the exporter's hash builder.
    const regStatesByRoad = new Map<string, CarryRegulatoryState[]>()
    const addRegState = (state: CarryRegulatoryState, affected: readonly string[], own: string | undefined): void => {
      const touching = new Set<string>()
      if (own && roadById.has(own)) touching.add(own)
      for (const lid of affected) {
        const rid = laneRoadOf.get(lid)
        if (rid) touching.add(rid)
      }
      for (const rid of touching) {
        const list = regStatesByRoad.get(rid) ?? []
        list.push(state)
        regStatesByRoad.set(rid, list)
      }
    }
    for (const tl of result.trafficLights) {
      addRegState(
        {
          kind: 'traffic_light',
          shapeId: tl.id as string,
          numbers: [tl.x, tl.y, tl.w, tl.h, 0],
          attributes: tl.attributes,
          affectedLaneIds: tl.affectedLaneIds,
          stopLinePts: boundaryPts(tl.stopLineId, false),
          // Must mirror the exporter's hash builder, which reads the live
          // shape's controllerId; hardcoding '' here would make every
          // controller-grouped road hash as edited on an unedited round trip.
          controllerId: tl.controllerId ?? '',
        },
        tl.affectedLaneIds,
        tl.attributes['odr_road_id']
      )
    }
    for (const ts of result.trafficSigns) {
      addRegState(
        {
          kind: 'traffic_sign',
          shapeId: ts.id as string,
          numbers: [ts.x, ts.y, ts.w, ts.h, 0],
          attributes: ts.attributes,
          affectedLaneIds: ts.affectedLaneIds,
          stopLinePts: boundaryPts(ts.stopLineId, false),
          controllerId: '',
        },
        ts.affectedLaneIds,
        ts.attributes['odr_road_id']
      )
    }
    for (const cw of result.crosswalks) {
      addRegState(
        {
          kind: 'crosswalk',
          shapeId: cw.id as string,
          numbers: [cw.x, cw.y, cw.startX, cw.startY, cw.endX, cw.endY, cw.crosswalkWidth, 0],
          attributes: cw.attributes,
          affectedLaneIds: cw.affectedLaneIds,
          stopLinePts: boundaryPts(cw.stopLineId, false),
          controllerId: '',
        },
        cw.affectedLaneIds,
        cw.attributes['odr_road_id']
      )
    }
    const roadRecords: Record<string, OdrRoadRecord> = {}
    for (const road of roads) {
      const regLanes = lanesByRoad.get(road.id) ?? []
      const laneStates: CarryLaneState[] = regLanes.map(reg => {
        const lane = laneShapeById.get(reg.shapeId)!
        return {
          leftPts: boundaryPts(lane.leftBoundaryId, lane.invertLeft),
          rightPts: boundaryPts(lane.rightBoundaryId, lane.invertRight),
          attributes: lane.attributes,
          next: lane.next,
          prev: lane.prev,
          yieldLaneIds: lane.yieldLaneIds ?? [],
        }
      })
      roadRecords[road.id] = {
        laneShapeIds: regLanes.map(r => r.shapeId),
        stateHash: hashRoadState(laneStates, regStatesByRoad.get(road.id) ?? []),
      }
    }
    result.sidecar.roadRecords = roadRecords
  }

  // ---- Aggregated warnings ----
  if (elevationRoads > 0) {
    warnings.push(
      `Elevation profiles on ${elevationRoads} road(s) were kept as per-point heights (the canvas view stays 2D).`
    )
  }
  if (superelevationRoads > 0) {
    warnings.push(`Superelevation/lateral profiles on ${superelevationRoads} road(s) were ignored (2D import).`)
  }
  if (poly3Roads > 0) {
    warnings.push(
      `Deprecated <poly3> geometry on ${poly3Roads} road(s) was approximated (local abscissa taken as arc length).`
    )
  }
  const unconvertedSignals = signalCount - convertedSignalCount
  const unconvertedObjects = objectCount - convertedObjectCount
  if (unconvertedSignals > 0 || unconvertedObjects > 0) {
    warnings.push(
      `${unconvertedSignals} signal(s) and ${unconvertedObjects} object(s) were parsed but not converted to shapes.`
    )
  }
  if (microSectionRoads > 0) {
    warnings.push(
      `Micro lane sections (< ${MIN_SECTION_LEN_M} m) on ${microSectionRoads} road(s) were skipped; lane connectivity was bridged across them.`
    )
  }

  // ---- Bounds ----
  for (const point of result.points) {
    if (point.x < result.bounds.minX) result.bounds.minX = point.x
    if (point.x > result.bounds.maxX) result.bounds.maxX = point.x
    if (point.y < result.bounds.minY) result.bounds.minY = point.y
    if (point.y > result.bounds.maxY) result.bounds.maxY = point.y
  }
  if (result.points.length > 0) {
    result.bounds.width = result.bounds.maxX - result.bounds.minX
    result.bounds.height = result.bounds.maxY - result.bounds.minY
    result.bounds.centerX = result.bounds.minX + result.bounds.width / 2
    result.bounds.centerY = result.bounds.minY + result.bounds.height / 2
  }

  return result
}

// ---------------------------------------------------------------------------
// Round-trip fidelity post-processing
// ---------------------------------------------------------------------------

/**
 * Max pointwise deviation (m) for two boundaries to count as one line, in
 * the interior of the polyline. Two genuinely distinct parallel boundaries
 * are at least a lane width apart in their interior, so this can stay tight.
 */
const BOUNDARY_DEDUPE_INTERIOR_TOL_M = 0.3

/**
 * Max pointwise deviation (m) near the polyline ends. Contact-point welding
 * (see weldConnectedLaneContacts) moves junction corners by up to a couple
 * of meters, and the per-road reconstruction of a shared boundary diverges
 * around such a kink, so the comparison is more permissive there. A false
 * match would require two boundaries that pinch below this at both ends AND
 * run within the interior tolerance in between — i.e. a degenerate sliver.
 */
const BOUNDARY_DEDUPE_END_TOL_M = 1.5

/**
 * Max contact gap (m) tolerated when welding the boundary endpoints of two
 * lanes joined by a next/prev edge. At junction entries/exits the corner on
 * the outer side of a turning connecting lane legitimately sits up to about
 * `laneWidth * 2 * sin(turnAngle / 2)` away from the incoming lane's corner,
 * so this is generous; the weld is only ever applied across declared edges,
 * never discovered by proximity.
 */
const CONTACT_WELD_MAX_GAP_M = 10

/**
 * Merge boundary linestrings that trace the same geometry (all resampled
 * points within tolerance), so adjacent lanes reference one shared
 * linestring. Reversed duplicates merge too, flipping the lane's invert flag.
 *
 * The OpenDRIVE exporter emits one road per lane with its own reference
 * line, so a boundary shared between two adjacent lanes comes back as two
 * near-identical linestrings; this pass restores the sharing (and with it
 * the left/right adjacency information).
 */
function dedupeSharedBoundaries(result: ImportedShapes): void {
  const pointById = new Map(result.points.map(p => [p.id as string, p]))
  const boundaryIds = new Set<string>()
  for (const lane of result.lanes) {
    boundaryIds.add(lane.leftBoundaryId)
    boundaryIds.add(lane.rightBoundaryId)
  }

  interface Entry {
    ls: ImportedLinestring
    pts: EnuPoint[]
  }
  const entries: Entry[] = []
  for (const ls of result.linestrings) {
    if (!boundaryIds.has(ls.id as string)) continue
    const pts: EnuPoint[] = []
    for (const pid of ls.pointIds) {
      const p = pointById.get(pid)
      if (p) pts.push({ x: p.x, y: p.y })
    }
    if (pts.length >= 2) entries.push({ ls, pts })
  }

  // 1. Enumerate match candidates with a deviation score (best orientation).
  interface Candidate {
    a: string
    b: string
    reversed: boolean
    score: number
  }
  const candidates: Candidate[] = []
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const m = boundaryMatchScore(entries[i].pts, entries[j].pts)
      if (m === null) continue
      candidates.push({
        a: entries[i].ls.id as string,
        b: entries[j].ls.id as string,
        reversed: m.reversed,
        score: m.score,
      })
    }
  }
  if (candidates.length === 0) return
  // Best (lowest-deviation) matches merge first, so the true duplicate of a
  // boundary wins over a nearby copy across a very narrow lane; the
  // left!=right constraint below then blocks the false match.
  candidates.sort((x, y) => x.score - y.score)

  // 2. Union-find with orientation parity (0 = same order as parent, 1 =
  //    reversed), constrained so no lane ends up with left === right.
  const parent = new Map<string, string>()
  const parity = new Map<string, number>()
  const findWithParity = (x: string): { root: string; parity: number } => {
    let root = x
    let p = 0
    while (true) {
      const up = parent.get(root)
      if (up === undefined || up === root) break
      p ^= parity.get(root) ?? 0
      root = up
    }
    // Path compression (re-walk, pointing every node at the root).
    let cur = x
    let curP = p
    while (cur !== root) {
      const up = parent.get(cur)!
      const upP = parity.get(cur) ?? 0
      parent.set(cur, root)
      parity.set(cur, curP)
      cur = up
      curP ^= upP
    }
    return { root, parity: p }
  }

  const pairKey = (x: string, y: string): string => (x < y ? `${x}|${y}` : `${y}|${x}`)
  /** Current root pairs (left|right) of every lane; merges may not collapse one. */
  const lanePairs = new Set<string>()
  const lanesByRoot = new Map<string, ImportedLane[]>()
  for (const lane of result.lanes) {
    lanePairs.add(pairKey(lane.leftBoundaryId, lane.rightBoundaryId))
    for (const b of [lane.leftBoundaryId, lane.rightBoundaryId]) {
      const list = lanesByRoot.get(b) ?? []
      list.push(lane)
      lanesByRoot.set(b, list)
    }
  }

  let merges = 0
  for (const c of candidates) {
    const fa = findWithParity(c.a)
    const fb = findWithParity(c.b)
    if (fa.root === fb.root) continue
    if (lanePairs.has(pairKey(fa.root, fb.root))) continue // would collapse a lane
    // Attach b's tree under a's root, composing orientation parities.
    parent.set(fb.root, fa.root)
    parity.set(fb.root, fa.parity ^ (c.reversed ? 1 : 0) ^ fb.parity)
    merges++
    // Re-key the root pairs of the lanes that referenced b's old root.
    const moved = lanesByRoot.get(fb.root) ?? []
    const target = lanesByRoot.get(fa.root) ?? []
    for (const lane of moved) {
      target.push(lane)
      lanePairs.add(
        pairKey(findWithParity(lane.leftBoundaryId).root, findWithParity(lane.rightBoundaryId).root)
      )
    }
    lanesByRoot.set(fa.root, target)
    lanesByRoot.delete(fb.root)
  }
  if (merges === 0) return

  // 3. Apply: every boundary resolves to its root linestring; a reversed
  //    parity flips the lane's invert flag for that boundary.
  const replaced = new Map<string, { keepId: string; reversed: boolean }>()
  for (const entry of entries) {
    const id = entry.ls.id as string
    const f = findWithParity(id)
    if (f.root !== id) replaced.set(id, { keepId: f.root, reversed: f.parity === 1 })
  }
  for (const lane of result.lanes) {
    const left = replaced.get(lane.leftBoundaryId)
    if (left) {
      lane.leftBoundaryId = left.keepId
      if (left.reversed) lane.invertLeft = !lane.invertLeft
    }
    const right = replaced.get(lane.rightBoundaryId)
    if (right) {
      lane.rightBoundaryId = right.keepId
      if (right.reversed) lane.invertRight = !lane.invertRight
    }
  }
  result.linestrings = result.linestrings.filter(ls => !replaced.has(ls.id as string))
}

/**
 * Position-dependent dedupe tolerance (px): the interior tolerance over the
 * middle half of the polyline, tapering up to the end tolerance at t=0 / t=1.
 */
function dedupeTolAt(t: number): number {
  const interior = BOUNDARY_DEDUPE_INTERIOR_TOL_M * PIXELS_PER_METER
  const end = BOUNDARY_DEDUPE_END_TOL_M * PIXELS_PER_METER
  // 0 for t in [0.25, 0.75], rising linearly to 1 at t = 0 / t = 1.
  const edge = Math.max(0, Math.abs(t - 0.5) * 2 - 0.5) / 0.5
  return interior + (end - interior) * edge
}

/**
 * Score how well two boundary polylines trace the same line. Each polyline
 * is resampled by normalized arc length and the distance from every sample
 * to the OTHER polyline (nearest point on any segment) is taken, normalized
 * by the graded tolerance; the worst ratio over both directions is the score
 * (<= 1 means a match). Nearest-point distance is used instead of comparing
 * param-matched samples because differing vertex distributions of the same
 * curve cause longitudinal slip that is not a geometric deviation.
 * The relative orientation is decided by the endpoint pairing, which also
 * acts as a cheap pre-filter. Returns null for no match.
 */
function boundaryMatchScore(
  a: EnuPoint[],
  b: EnuPoint[]
): { reversed: boolean; score: number } | null {
  const d = (p: EnuPoint, q: EnuPoint): number => Math.hypot(p.x - q.x, p.y - q.y)
  const endTolPx = BOUNDARY_DEDUPE_END_TOL_M * PIXELS_PER_METER
  const a0 = a[0]
  const a1 = a[a.length - 1]
  const b0 = b[0]
  const b1 = b[b.length - 1]
  const forwardEnds = Math.max(d(a0, b0), d(a1, b1))
  const reversedEnds = Math.max(d(a0, b1), d(a1, b0))
  if (Math.min(forwardEnds, reversedEnds) > endTolPx) return null
  const score = Math.max(polylineDeviationScore(a, b), polylineDeviationScore(b, a))
  if (score > 1) return null
  return { reversed: reversedEnds < forwardEnds, score }
}

/**
 * Worst nearest-point distance from arc-length resampled points of `a` to
 * the polyline `b`, normalized by the graded tolerance (1 = at tolerance).
 */
function polylineDeviationScore(a: EnuPoint[], b: EnuPoint[]): number {
  const n = Math.max(a.length, 8)
  let worst = 0
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const pa = sampleAtParam(a, t)
    const score = distanceToPolyline(pa, b) / dedupeTolAt(t)
    if (score > worst) {
      worst = score
      if (worst > 1) return worst
    }
  }
  return worst
}

/** Distance from a point to the nearest segment of a polyline. */
function distanceToPolyline(q: { x: number; y: number }, poly: EnuPoint[]): number {
  let best = Infinity
  for (let i = 0; i < poly.length - 1; i++) {
    const ax = poly[i].x
    const ay = poly[i].y
    const dx = poly[i + 1].x - ax
    const dy = poly[i + 1].y - ay
    const len2 = dx * dx + dy * dy
    let t = len2 > 0 ? ((q.x - ax) * dx + (q.y - ay) * dy) / len2 : 0
    if (t < 0) t = 0
    else if (t > 1) t = 1
    const px = ax + dx * t
    const py = ay + dy * t
    const dist = Math.hypot(q.x - px, q.y - py)
    if (dist < best) best = dist
  }
  return best
}

/**
 * Weld the boundary endpoint Points of lanes joined by a next/prev edge into
 * shared Point shapes (union-find; the cluster centroid is the welded
 * position). Lane-section chains and road links meet exactly; junction
 * connections can differ on the outer corner of a turn, which is exactly the
 * corner a Lanelet2-style map shares between consecutive lanelets.
 *
 * Welds are derived ONLY from declared edges, and each weld joins a lane's
 * end to its successor's start; a lane's own start and end are never merged,
 * so short connecting lanes survive unchanged.
 */
function weldConnectedLaneContacts(result: ImportedShapes): void {
  const maxGapPx = CONTACT_WELD_MAX_GAP_M * PIXELS_PER_METER
  const pointById = new Map(result.points.map(p => [p.id as string, p]))
  const lsById = new Map(result.linestrings.map(l => [l.id as string, l]))
  const laneById = new Map(result.lanes.map(l => [l.id as string, l]))

  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let root = x
    while (true) {
      const p = parent.get(root)
      if (p === undefined || p === root) break
      root = p
    }
    let cur = x
    while (cur !== root) {
      const next = parent.get(cur)!
      parent.set(cur, root)
      cur = next
    }
    return root
  }
  const union = (a: string, b: string): void => {
    if (!parent.has(a)) parent.set(a, a)
    if (!parent.has(b)) parent.set(b, b)
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }

  /** Boundary endpoint Point id at the lane's travel start/end. */
  const corner = (
    lane: ImportedLane,
    boundary: 'left' | 'right',
    side: 'start' | 'end'
  ): string | null => {
    const ls = lsById.get(boundary === 'left' ? lane.leftBoundaryId : lane.rightBoundaryId)
    if (!ls || ls.pointIds.length === 0) return null
    const invert = boundary === 'left' ? lane.invertLeft : lane.invertRight
    const ids = ls.pointIds
    const atStoredStart = side === 'start' ? !invert : invert
    return atStoredStart ? ids[0] : ids[ids.length - 1]
  }

  const gap = (aId: string, bId: string): number => {
    const a = pointById.get(aId)
    const b = pointById.get(bId)
    if (!a || !b) return Infinity
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  let welds = 0
  for (const lane of result.lanes) {
    for (const nextId of lane.next) {
      const next = laneById.get(nextId)
      if (!next) continue
      const aL = corner(lane, 'left', 'end')
      const aR = corner(lane, 'right', 'end')
      const bL = corner(next, 'left', 'start')
      const bR = corner(next, 'right', 'start')
      if (!aL || !aR || !bL || !bR) continue
      if (gap(aL, bL) > maxGapPx || gap(aR, bR) > maxGapPx) continue
      union(aL, bL)
      union(aR, bR)
      welds++
    }
  }
  if (welds === 0) return

  // Cluster centroid becomes the welded position (representative value).
  const clusters = new Map<string, string[]>()
  for (const id of parent.keys()) {
    const root = find(id)
    const list = clusters.get(root) ?? []
    list.push(id)
    clusters.set(root, list)
  }
  for (const [root, members] of clusters) {
    if (members.length < 2) continue
    let sx = 0
    let sy = 0
    let n = 0
    for (const m of members) {
      const p = pointById.get(m)
      if (!p) continue
      sx += p.x
      sy += p.y
      n++
    }
    const rp = pointById.get(root)
    if (!rp || n === 0) continue
    rp.x = sx / n
    rp.y = sy / n
  }

  // Rewrite linestring point references to the cluster roots and refresh the
  // anchor coordinates (linestrings anchor on their first point).
  for (const ls of result.linestrings) {
    let changed = false
    const ids = ls.pointIds.map(id => {
      if (!parent.has(id)) return id
      const root = find(id)
      if (root !== id) changed = true
      return root
    })
    if (changed) ls.pointIds = ids
    const first = pointById.get(ls.pointIds[0])
    if (first) {
      ls.x = first.x
      ls.y = first.y
    }
  }
  for (const lane of result.lanes) {
    const ls = lsById.get(lane.leftBoundaryId)
    if (ls) {
      lane.x = ls.x
      lane.y = ls.y
    }
  }
}

/**
 * Drop linestrings that no lane references (boundaries orphaned by sliver-lane
 * pruning). Run before `removeOrphanPoints` so their points are freed too.
 */
function removeOrphanLinestrings(result: ImportedShapes): void {
  const used = new Set<string>()
  for (const lane of result.lanes) {
    used.add(lane.leftBoundaryId)
    used.add(lane.rightBoundaryId)
  }
  for (const tl of result.trafficLights) if (tl.stopLineId) used.add(tl.stopLineId)
  for (const ts of result.trafficSigns) if (ts.stopLineId) used.add(ts.stopLineId)
  for (const cw of result.crosswalks) if (cw.stopLineId) used.add(cw.stopLineId)
  if (used.size === result.linestrings.length) return
  result.linestrings = result.linestrings.filter(l => used.has(l.id as string))
}

/** Drop Point records no longer referenced by any linestring. */
function removeOrphanPoints(result: ImportedShapes): void {
  const used = new Set<string>()
  for (const ls of result.linestrings) {
    for (const pid of ls.pointIds) used.add(pid)
  }
  if (used.size === result.points.length) return
  result.points = result.points.filter(p => used.has(p.id as string))
}
