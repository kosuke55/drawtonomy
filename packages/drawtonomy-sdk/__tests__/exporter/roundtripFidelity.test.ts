// Round-trip fidelity audit for the four conversion paths between
// OpenDRIVE (.xodr), the editor shape model, and Lanelet2 (.osm):
//
//   (a) xodr -> shapes -> lanelet2 -> shapes
//   (b) xodr -> shapes -> xodr -> shapes
//   (c) lanelet2 -> shapes -> xodr -> shapes
//   (d) lanelet2 -> shapes -> lanelet2 -> shapes   (baseline, expected high fidelity)
//
// Each path is measured with two signatures:
//   - topologySignature: lane count, next/prev edge set, left/right adjacency
//     pairs (derived from shared boundary linestrings)
//   - attributeSignature: per-lane semantic tags and traffic-light links
//     (affected lanes + stop line)
//
// Lanes on the two sides of a round trip carry different ids, so signatures
// are compared through a geometric matching: lanes are paired by their
// start/end midpoints (nearest neighbour within a tolerance), and edge /
// adjacency / attribute preservation is evaluated through that pairing.
//
// Two extra suites cover topologies that historically lost data: a 2x2
// diamond branch/merge (now synthesized into a <junction>) and a chain with
// a sub-epsilon connecting lane (now protected from snapping collapse).
//
// Historical losses and their fixes (all landed):
//   Fix A — odrToShapes welds contact-point Points of connected lanes, so
//           the Lanelet2 export shares nodes and connectivity survives (a).
//   Fix B — odrToShapes dedupes geometrically identical boundary
//           linestrings, restoring left/right adjacency through xodr (b, c).
//   Fix C — exportToOpenDrive synthesizes <junction> elements for branch /
//           merge edges that road links alone cannot express.
//   Fix D — lanelet-only lane tags ride in <userData code="laneAttributes">,
//           multi-road signal validity in <signalReference>, stop lines in
//           <userData code="stopLine">, and are restored on import.
//   Fix E — boundary-alignment snapping never merges a lane's start-side and
//           end-side endpoint Points into one cluster (tracked per point id,
//           covering Points shared with neighbouring lanes), so sub-epsilon
//           connecting lanes survive export.
//
// Real-world fixtures: esmini's fabriksgatan.xodr / two_plus_one.xodr ship in
// __tests__/fixtures. A real Lanelet2 map can additionally be supplied via
// the ROUNDTRIP_LANELET2_OSM environment variable (path to a .osm file);
// those tests are skipped when the variable is unset.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseOpenDriveXml, type OdrGeometry } from '../../src/exporter/opendriveParser'
import { odrToShapes } from '../../src/exporter/odrToShapes'
import { evalGeometry, sampleReferenceLine } from '../../src/exporter/odrGeometry'
import { exportToOpenDrive } from '../../src/exporter/opendrive'
import { exportToLanelet2 } from '../../src/exporter/lanelet2'
import { parseOsmXml } from '../../src/exporter/osmParser'
import { osmToShapes, type ImportedShapes } from '../../src/exporter/osmToShapes'
import { PIXELS_PER_METER } from '../../src/exporter/units'
import type { DrawtonomySnapshot } from '../../src/types'

// ---------------------------------------------------------------------------
// Signature helpers
// ---------------------------------------------------------------------------

interface Pt {
  x: number
  y: number
}

/** Geometric anchor of a lane: midpoints of its entry and exit edges. */
interface LaneGeom {
  index: number
  start: Pt
  end: Pt
}

/** Semantic attribute keys compared per lane. */
const LANE_ATTRIBUTE_KEYS = [
  'type',
  'subtype',
  'odr_type',
  'one_way',
  'speed_limit',
  'turn_direction',
  'location',
] as const
type LaneAttributeKey = (typeof LANE_ATTRIBUTE_KEYS)[number]

export interface TopologySignature {
  laneCount: number
  /** Directed next edges as "fromIndex->toIndex" (lane indices, not ids). */
  edges: Set<string>
  /** Unordered lane index pairs sharing a boundary linestring ("i|j", i<j). */
  adjacency: Set<string>
  /** Geometric anchors used to match lanes across a round trip. */
  geoms: LaneGeom[]
}

export interface TrafficLightSignature {
  pos: Pt
  /** Indices (into lanes) of the lanes this signal controls. */
  affected: number[]
  hasStopLine: boolean
}

export interface AttributeSignature {
  /** Per-lane picked attributes, index-aligned with topologySignature.geoms. */
  lanes: Partial<Record<LaneAttributeKey, string>>[]
  trafficLights: TrafficLightSignature[]
}

function midpoint(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Compute next/prev edge set, adjacency pair set and lane anchors. */
export function topologySignature(shapes: ImportedShapes): TopologySignature {
  const pointById = new Map(shapes.points.map(p => [p.id, p]))
  const lsById = new Map(shapes.linestrings.map(l => [l.id, l]))
  const laneIndexById = new Map(shapes.lanes.map((l, i) => [l.id as string, i]))

  const geoms: LaneGeom[] = shapes.lanes.map((lane, index) => {
    const left = lsById.get(lane.leftBoundaryId)
    const right = lsById.get(lane.rightBoundaryId)
    const leftIds = left ? (lane.invertLeft ? [...left.pointIds].reverse() : left.pointIds) : []
    const rightIds = right ? (lane.invertRight ? [...right.pointIds].reverse() : right.pointIds) : []
    const ls = pointById.get(leftIds[0])
    const le = pointById.get(leftIds[leftIds.length - 1])
    const rs = pointById.get(rightIds[0])
    const re = pointById.get(rightIds[rightIds.length - 1])
    if (!ls || !le || !rs || !re) {
      return { index, start: { x: NaN, y: NaN }, end: { x: NaN, y: NaN } }
    }
    return { index, start: midpoint(ls, rs), end: midpoint(le, re) }
  })

  const edges = new Set<string>()
  shapes.lanes.forEach((lane, i) => {
    for (const nextId of lane.next) {
      const j = laneIndexById.get(nextId)
      if (j !== undefined) edges.add(`${i}->${j}`)
    }
    // prev edges are folded into the directed set too (covers asymmetric data).
    for (const prevId of lane.prev) {
      const j = laneIndexById.get(prevId)
      if (j !== undefined) edges.add(`${j}->${i}`)
    }
  })

  // Adjacency: two distinct lanes referencing the same boundary linestring.
  const lanesByBoundary = new Map<string, number[]>()
  shapes.lanes.forEach((lane, i) => {
    for (const b of [lane.leftBoundaryId, lane.rightBoundaryId]) {
      if (!b) continue
      const list = lanesByBoundary.get(b) ?? []
      list.push(i)
      lanesByBoundary.set(b, list)
    }
  })
  const adjacency = new Set<string>()
  for (const list of lanesByBoundary.values()) {
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const lo = Math.min(list[a], list[b])
        const hi = Math.max(list[a], list[b])
        if (lo !== hi) adjacency.add(`${lo}|${hi}`)
      }
    }
  }

  return { laneCount: shapes.lanes.length, edges, adjacency, geoms }
}

/** Collect per-lane semantic attributes and traffic-light link info. */
export function attributeSignature(shapes: ImportedShapes): AttributeSignature {
  const laneIndexById = new Map(shapes.lanes.map((l, i) => [l.id as string, i]))
  const lanes = shapes.lanes.map(lane => {
    const picked: Partial<Record<LaneAttributeKey, string>> = {}
    for (const key of LANE_ATTRIBUTE_KEYS) {
      const v = lane.attributes[key]
      if (v !== undefined && v !== '') picked[key] = v
    }
    return picked
  })
  const trafficLights: TrafficLightSignature[] = shapes.trafficLights.map(tl => ({
    pos: { x: tl.x, y: tl.y },
    affected: tl.affectedLaneIds
      .map(id => laneIndexById.get(id))
      .filter((i): i is number => i !== undefined)
      .sort((a, b) => a - b),
    hasStopLine: tl.stopLineId !== null,
  }))
  return { lanes, trafficLights }
}

// ---------------------------------------------------------------------------
// Cross-round-trip comparison
// ---------------------------------------------------------------------------

/** Default matching tolerance: ~3.6 m in canvas px (16.67 px/m). */
const DEFAULT_TOL_PX = 60

/**
 * Greedy nearest-neighbour matching of lanes by start/end midpoints.
 * Returns beforeIndex -> afterIndex for pairs within tolerance.
 */
function matchLanes(before: LaneGeom[], after: LaneGeom[], tolPx: number): Map<number, number> {
  const candidates: { cost: number; b: number; a: number }[] = []
  for (const gb of before) {
    if (!Number.isFinite(gb.start.x)) continue
    for (const ga of after) {
      if (!Number.isFinite(ga.start.x)) continue
      const dStart = dist(gb.start, ga.start)
      const dEnd = dist(gb.end, ga.end)
      if (dStart > tolPx || dEnd > tolPx) continue
      candidates.push({ cost: dStart + dEnd, b: gb.index, a: ga.index })
    }
  }
  candidates.sort((x, y) => x.cost - y.cost)
  const usedB = new Set<number>()
  const usedA = new Set<number>()
  const matching = new Map<number, number>()
  for (const c of candidates) {
    if (usedB.has(c.b) || usedA.has(c.a)) continue
    usedB.add(c.b)
    usedA.add(c.a)
    matching.set(c.b, c.a)
  }
  return matching
}

export interface FidelityReport {
  laneCountBefore: number
  laneCountAfter: number
  matchedLanes: number
  edgesBefore: number
  edgesAfter: number
  /** Edges of `before` whose endpoints both matched and exist in `after`. */
  edgesPreserved: number
  adjacencyBefore: number
  adjacencyAfter: number
  adjacencyPreserved: number
  /** Per attribute key: lanes where the key was set before / preserved after. */
  attributes: Record<LaneAttributeKey, { comparable: number; preserved: number }>
  trafficLightsBefore: number
  trafficLightsMatched: number
  /** Matched signals whose affected-lane set is identical (via lane matching). */
  trafficLightAffectedPreserved: number
  stopLinesBefore: number
  stopLinesPreserved: number
}

/** Measure what a round trip kept, by comparing before/after signatures. */
export function measureFidelity(
  before: ImportedShapes,
  after: ImportedShapes,
  tolPx: number = DEFAULT_TOL_PX
): FidelityReport {
  const topoB = topologySignature(before)
  const topoA = topologySignature(after)
  const attrB = attributeSignature(before)
  const attrA = attributeSignature(after)
  const matching = matchLanes(topoB.geoms, topoA.geoms, tolPx)

  let edgesPreserved = 0
  for (const e of topoB.edges) {
    const [f, t] = e.split('->').map(Number)
    const mf = matching.get(f)
    const mt = matching.get(t)
    if (mf !== undefined && mt !== undefined && topoA.edges.has(`${mf}->${mt}`)) edgesPreserved++
  }

  let adjacencyPreserved = 0
  for (const p of topoB.adjacency) {
    const [x, y] = p.split('|').map(Number)
    const mx = matching.get(x)
    const my = matching.get(y)
    if (mx === undefined || my === undefined) continue
    const lo = Math.min(mx, my)
    const hi = Math.max(mx, my)
    if (topoA.adjacency.has(`${lo}|${hi}`)) adjacencyPreserved++
  }

  const attributes = {} as FidelityReport['attributes']
  for (const key of LANE_ATTRIBUTE_KEYS) {
    let comparable = 0
    let preserved = 0
    for (const [b, a] of matching) {
      const vb = attrB.lanes[b][key]
      if (vb === undefined) continue
      comparable++
      if (attrA.lanes[a][key] === vb) preserved++
    }
    attributes[key] = { comparable, preserved }
  }

  // Traffic lights: greedy position matching, then affected-set comparison.
  const usedAfterTl = new Set<number>()
  let trafficLightsMatched = 0
  let trafficLightAffectedPreserved = 0
  let stopLinesBefore = 0
  let stopLinesPreserved = 0
  for (const tb of attrB.trafficLights) {
    if (tb.hasStopLine) stopLinesBefore++
    let bestIdx = -1
    let bestD = Infinity
    attrA.trafficLights.forEach((ta, i) => {
      if (usedAfterTl.has(i)) return
      const d = dist(tb.pos, ta.pos)
      if (d < bestD) {
        bestD = d
        bestIdx = i
      }
    })
    if (bestIdx < 0 || bestD > tolPx) continue
    usedAfterTl.add(bestIdx)
    trafficLightsMatched++
    const ta = attrA.trafficLights[bestIdx]
    const mappedAffected = tb.affected
      .map(i => matching.get(i))
      .filter((i): i is number => i !== undefined)
      .sort((a, b) => a - b)
    if (
      mappedAffected.length === tb.affected.length &&
      mappedAffected.length === ta.affected.length &&
      mappedAffected.every((v, i) => v === ta.affected[i])
    ) {
      trafficLightAffectedPreserved++
    }
    if (tb.hasStopLine && ta.hasStopLine) stopLinesPreserved++
  }

  return {
    laneCountBefore: topoB.laneCount,
    laneCountAfter: topoA.laneCount,
    matchedLanes: matching.size,
    edgesBefore: topoB.edges.size,
    edgesAfter: topoA.edges.size,
    edgesPreserved,
    adjacencyBefore: topoB.adjacency.size,
    adjacencyAfter: topoA.adjacency.size,
    adjacencyPreserved,
    attributes,
    trafficLightsBefore: attrB.trafficLights.length,
    trafficLightsMatched,
    trafficLightAffectedPreserved,
    stopLinesBefore,
    stopLinesPreserved,
  }
}

// ---------------------------------------------------------------------------
// Pipeline helpers
// ---------------------------------------------------------------------------

/** Wrap ImportedShapes into a DrawtonomySnapshot (mirrors the editor import). */
function snapshotFrom(imported: ImportedShapes): DrawtonomySnapshot {
  const shapes: unknown[] = []
  for (const p of imported.points) {
    shapes.push({
      id: p.id,
      type: 'point',
      x: p.x,
      y: p.y,
      rotation: 0,
      zIndex: 0,
      props: { color: 'black', visible: true, osmId: p.osmId },
    })
  }
  for (const ls of imported.linestrings) {
    shapes.push({
      id: ls.id,
      type: 'linestring',
      x: ls.x,
      y: ls.y,
      rotation: 0,
      zIndex: 0,
      props: {
        pointIds: ls.pointIds,
        color: 'black',
        strokeWidth: 2,
        attributes: ls.attributes,
        osmId: ls.osmId,
      },
    })
  }
  for (const lane of imported.lanes) {
    shapes.push({
      id: lane.id,
      type: 'lane',
      x: lane.x,
      y: lane.y,
      rotation: 0,
      zIndex: 0,
      props: {
        leftBoundaryId: lane.leftBoundaryId,
        rightBoundaryId: lane.rightBoundaryId,
        invertLeft: lane.invertLeft,
        invertRight: lane.invertRight,
        color: 'default',
        size: 'm',
        attributes: lane.attributes,
        next: lane.next,
        prev: lane.prev,
        osmId: lane.osmId,
        ...(lane.yieldLaneIds ? { yieldLaneIds: lane.yieldLaneIds } : {}),
      },
    })
  }
  for (const tl of imported.trafficLights) {
    shapes.push({
      id: tl.id,
      type: 'traffic_light',
      x: tl.x,
      y: tl.y,
      rotation: 0,
      zIndex: 0,
      props: {
        w: tl.w,
        h: tl.h,
        color: 'default',
        style: '',
        attributes: tl.attributes,
        osmId: tl.osmId,
        affectedLaneIds: tl.affectedLaneIds,
        stopLineId: tl.stopLineId,
        controllerId: tl.controllerId ?? '',
      },
    })
  }
  for (const ts of imported.trafficSigns ?? []) {
    shapes.push({
      id: ts.id,
      type: 'traffic_sign',
      x: ts.x,
      y: ts.y,
      rotation: 0,
      zIndex: 0,
      props: {
        w: ts.w,
        h: ts.h,
        color: 'default',
        attributes: ts.attributes,
        osmId: ts.osmId,
        affectedLaneIds: ts.affectedLaneIds,
        stopLineId: ts.stopLineId,
      },
    })
  }
  for (const cw of imported.crosswalks ?? []) {
    shapes.push({
      id: cw.id,
      type: 'crosswalk',
      x: cw.x,
      y: cw.y,
      rotation: 0,
      zIndex: 0,
      props: {
        startX: cw.startX,
        startY: cw.startY,
        endX: cw.endX,
        endY: cw.endY,
        crosswalkWidth: cw.crosswalkWidth,
        color: 'default',
        attributes: cw.attributes,
        osmId: cw.osmId,
        affectedLaneIds: cw.affectedLaneIds,
        stopLineId: cw.stopLineId,
      },
    })
  }
  const snapshot: DrawtonomySnapshot = {
    version: '1.1',
    timestamp: new Date().toISOString(),
    shapes: shapes as DrawtonomySnapshot['shapes'],
  }
  if (imported.originLatLon) snapshot.origin = imported.originLatLon
  return snapshot
}

const FALLBACK_ORIGIN = { lat: 35.0, lon: 139.0 }

function importXodr(xml: string): ImportedShapes {
  return odrToShapes(parseOpenDriveXml(xml))
}

function importLanelet2(xml: string): ImportedShapes {
  return osmToShapes(parseOsmXml(xml))
}

/** shapes -> lanelet2 (.osm) -> shapes */
function viaLanelet2(imported: ImportedShapes): ImportedShapes {
  const osmXml = exportToLanelet2(snapshotFrom(imported), {
    mapOrigin: imported.originLatLon ?? FALLBACK_ORIGIN,
  })
  return importLanelet2(osmXml)
}

/** shapes -> xodr -> shapes */
function viaOpenDrive(imported: ImportedShapes): ImportedShapes {
  const snapshot = snapshotFrom(imported)
  if (!snapshot.origin) snapshot.origin = FALLBACK_ORIGIN
  return importXodr(exportToOpenDrive(snapshot))
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURES = join(__dirname, '..', 'fixtures')
const FABRIKSGATAN = join(FIXTURES, 'fabriksgatan.xodr')
const TWO_PLUS_ONE = join(FIXTURES, 'two_plus_one.xodr')
const LANELET2_REAL = process.env.ROUNDTRIP_LANELET2_OSM ?? ''
/** Optional extra OpenDRIVE map for the debug matrix (path to a .xodr). */
const XODR_REAL = process.env.ROUNDTRIP_XODR ?? ''

/**
 * Synthetic OpenDRIVE network exercising every connectivity construct:
 * - road 1: two right driving lanes (adjacency) + a signal with <validity>
 * - junction 10 with a 2-in x 2-out connection pattern (branch + merge)
 * - road 2: two lane sections chained by lane-level links
 */
const SYNTHETIC_XODR = `<?xml version="1.0"?>
<OpenDRIVE>
  <header revMajor="1" revMinor="6">
    <geoReference><![CDATA[+proj=tmerc +lat_0=35.0 +lon_0=139.0 +datum=WGS84]]></geoReference>
  </header>
  <road name="in_a" length="50" id="1" junction="-1">
    <link><successor elementType="junction" elementId="10"/></link>
    <planView><geometry s="0" x="0" y="0" hdg="0" length="50"><line/></geometry></planView>
    <lanes>
      <laneSection s="0">
        <right>
          <lane id="-1" type="driving" level="false"><width sOffset="0" a="3.5" b="0" c="0" d="0"/></lane>
          <lane id="-2" type="driving" level="false"><width sOffset="0" a="3.5" b="0" c="0" d="0"/></lane>
        </right>
      </laneSection>
    </lanes>
    <signals>
      <signal id="100" s="45" t="2" zOffset="4.5" name="sig" dynamic="yes" orientation="+" type="1000001" subtype="-1" country="OpenDRIVE" value="0" height="0.8" width="0.5">
        <validity fromLane="-1" toLane="-1"/>
      </signal>
    </signals>
  </road>
  <road name="in_b" length="50" id="4" junction="-1">
    <link><successor elementType="junction" elementId="10"/></link>
    <planView><geometry s="0" x="0" y="-12" hdg="0" length="50"><line/></geometry></planView>
    <lanes>
      <laneSection s="0">
        <right>
          <lane id="-1" type="driving" level="false"><width sOffset="0" a="3.5" b="0" c="0" d="0"/></lane>
        </right>
      </laneSection>
    </lanes>
  </road>
  <road name="conn_a2" length="20" id="5" junction="10">
    <link>
      <predecessor elementType="road" elementId="1" contactPoint="end"/>
      <successor elementType="road" elementId="2" contactPoint="start"/>
    </link>
    <planView><geometry s="0" x="50" y="0" hdg="0" length="20"><line/></geometry></planView>
    <lanes>
      <laneSection s="0">
        <right>
          <lane id="-1" type="driving" level="false">
            <link><predecessor id="-1"/><successor id="-1"/></link>
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
          </lane>
        </right>
      </laneSection>
    </lanes>
  </road>
  <road name="conn_a3" length="23.32" id="6" junction="10">
    <link>
      <predecessor elementType="road" elementId="1" contactPoint="end"/>
      <successor elementType="road" elementId="3" contactPoint="start"/>
    </link>
    <planView><geometry s="0" x="50" y="0" hdg="-0.54042" length="23.32"><line/></geometry></planView>
    <lanes>
      <laneSection s="0">
        <right>
          <lane id="-1" type="driving" level="false">
            <link><predecessor id="-1"/><successor id="-1"/></link>
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
          </lane>
        </right>
      </laneSection>
    </lanes>
  </road>
  <road name="conn_b2" length="23.32" id="7" junction="10">
    <link>
      <predecessor elementType="road" elementId="4" contactPoint="end"/>
      <successor elementType="road" elementId="2" contactPoint="start"/>
    </link>
    <planView><geometry s="0" x="50" y="-12" hdg="0.54042" length="23.32"><line/></geometry></planView>
    <lanes>
      <laneSection s="0">
        <right>
          <lane id="-1" type="driving" level="false">
            <link><predecessor id="-1"/><successor id="-1"/></link>
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
          </lane>
        </right>
      </laneSection>
    </lanes>
  </road>
  <road name="conn_b3" length="20" id="8" junction="10">
    <link>
      <predecessor elementType="road" elementId="4" contactPoint="end"/>
      <successor elementType="road" elementId="3" contactPoint="start"/>
    </link>
    <planView><geometry s="0" x="50" y="-12" hdg="0" length="20"><line/></geometry></planView>
    <lanes>
      <laneSection s="0">
        <right>
          <lane id="-1" type="driving" level="false">
            <link><predecessor id="-1"/><successor id="-1"/></link>
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
          </lane>
        </right>
      </laneSection>
    </lanes>
  </road>
  <road name="out_a" length="50" id="2" junction="-1">
    <link><predecessor elementType="junction" elementId="10"/></link>
    <planView><geometry s="0" x="70" y="0" hdg="0" length="50"><line/></geometry></planView>
    <lanes>
      <laneSection s="0">
        <right>
          <lane id="-1" type="driving" level="false">
            <link><successor id="-1"/></link>
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
          </lane>
        </right>
      </laneSection>
      <laneSection s="25">
        <right>
          <lane id="-1" type="driving" level="false">
            <link><predecessor id="-1"/></link>
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
          </lane>
        </right>
      </laneSection>
    </lanes>
  </road>
  <road name="out_b" length="50" id="3" junction="-1">
    <link><predecessor elementType="junction" elementId="10"/></link>
    <planView><geometry s="0" x="70" y="-12" hdg="0" length="50"><line/></geometry></planView>
    <lanes>
      <laneSection s="0">
        <right>
          <lane id="-1" type="driving" level="false"><width sOffset="0" a="3.5" b="0" c="0" d="0"/></lane>
        </right>
      </laneSection>
    </lanes>
  </road>
  <junction id="10" name="x">
    <connection id="0" incomingRoad="1" connectingRoad="5" contactPoint="start"><laneLink from="-1" to="-1"/></connection>
    <connection id="1" incomingRoad="1" connectingRoad="6" contactPoint="start"><laneLink from="-1" to="-1"/></connection>
    <connection id="2" incomingRoad="4" connectingRoad="7" contactPoint="start"><laneLink from="-1" to="-1"/></connection>
    <connection id="3" incomingRoad="4" connectingRoad="8" contactPoint="start"><laneLink from="-1" to="-1"/></connection>
  </junction>
</OpenDRIVE>`

/**
 * Synthetic Lanelet2 map (around 35.0/139.0):
 * - lane A (r100) -> lane B (r101): consecutive, boundaries share end nodes
 * - lane C (r102): right neighbour of A, sharing way 11 as its left boundary
 * - traffic light regulatory element (r200) on lanes A and C with a stop line
 *   (a multi-lane signal: A and C bundle into one road, so the OpenDRIVE
 *   export covers both with a single <validity> lane range)
 * Latitude step of 3.15e-5 deg is roughly 3.5 m.
 */
const SYNTHETIC_LANELET2 = `<?xml version='1.0' encoding='UTF-8'?>
<osm version='0.6' generator='test'>
  <node id='1' lat='35.000000' lon='139.000000' />
  <node id='2' lat='35.000000' lon='139.000700' />
  <node id='3' lat='34.999969' lon='139.000000' />
  <node id='4' lat='34.999969' lon='139.000700' />
  <node id='5' lat='35.000000' lon='139.001400' />
  <node id='6' lat='34.999969' lon='139.001400' />
  <node id='7' lat='34.999938' lon='139.000000' />
  <node id='8' lat='34.999938' lon='139.000700' />
  <node id='9' lat='35.000005' lon='139.000690' />
  <node id='10' lat='34.999964' lon='139.000690' />
  <way id='11'>
    <nd ref='1' /><nd ref='2' />
    <tag k='type' v='line_thin' /><tag k='subtype' v='solid' />
  </way>
  <way id='12'>
    <nd ref='3' /><nd ref='4' />
    <tag k='type' v='line_thin' /><tag k='subtype' v='dashed' />
  </way>
  <way id='13'>
    <nd ref='2' /><nd ref='5' />
    <tag k='type' v='line_thin' /><tag k='subtype' v='solid' />
  </way>
  <way id='14'>
    <nd ref='4' /><nd ref='6' />
    <tag k='type' v='line_thin' /><tag k='subtype' v='solid' />
  </way>
  <way id='15'>
    <nd ref='7' /><nd ref='8' />
    <tag k='type' v='line_thin' /><tag k='subtype' v='solid' />
  </way>
  <way id='16'>
    <nd ref='9' /><nd ref='10' />
    <tag k='type' v='traffic_light' />
  </way>
  <way id='17'>
    <nd ref='9' /><nd ref='10' />
    <tag k='type' v='stop_line' />
  </way>
  <relation id='100'>
    <member type='way' ref='11' role='left' />
    <member type='way' ref='12' role='right' />
    <member type='relation' ref='200' role='regulatory_element' />
    <tag k='type' v='lanelet' /><tag k='subtype' v='road' />
    <tag k='location' v='urban' /><tag k='one_way' v='yes' />
    <tag k='speed_limit' v='40' /><tag k='turn_direction' v='straight' />
  </relation>
  <relation id='101'>
    <member type='way' ref='13' role='left' />
    <member type='way' ref='14' role='right' />
    <tag k='type' v='lanelet' /><tag k='subtype' v='road' />
    <tag k='location' v='urban' /><tag k='one_way' v='yes' />
    <tag k='speed_limit' v='40' /><tag k='turn_direction' v='left' />
  </relation>
  <relation id='102'>
    <member type='way' ref='12' role='left' />
    <member type='way' ref='15' role='right' />
    <member type='relation' ref='200' role='regulatory_element' />
    <tag k='type' v='lanelet' /><tag k='subtype' v='road' />
    <tag k='location' v='urban' /><tag k='one_way' v='yes' />
    <tag k='speed_limit' v='40' /><tag k='turn_direction' v='straight' />
  </relation>
  <relation id='200'>
    <member type='way' ref='16' role='refers' />
    <member type='way' ref='17' role='ref_line' />
    <tag k='type' v='regulatory_element' /><tag k='subtype' v='traffic_light' />
  </relation>
</osm>`

/**
 * Minimal bidirectional Lanelet2 map: a single lanelet tagged one_way=no.
 * Exported OpenDRIVE roads only carry one-directional right lanes, so the
 * bidirectional flag is lost through an xodr round trip.
 */
const BIDIRECTIONAL_LANELET2 = `<?xml version='1.0' encoding='UTF-8'?>
<osm version='0.6' generator='test'>
  <node id='1' lat='35.000000' lon='139.000000' />
  <node id='2' lat='35.000000' lon='139.000700' />
  <node id='3' lat='34.999969' lon='139.000000' />
  <node id='4' lat='34.999969' lon='139.000700' />
  <way id='11'>
    <nd ref='1' /><nd ref='2' />
    <tag k='type' v='line_thin' /><tag k='subtype' v='solid' />
  </way>
  <way id='12'>
    <nd ref='3' /><nd ref='4' />
    <tag k='type' v='line_thin' /><tag k='subtype' v='solid' />
  </way>
  <relation id='100'>
    <member type='way' ref='11' role='left' />
    <member type='way' ref='12' role='right' />
    <tag k='type' v='lanelet' /><tag k='subtype' v='road' />
    <tag k='one_way' v='no' />
  </relation>
</osm>`

/** Axis-aligned straight lane spec for buildLaneNetwork (canvas px). */
interface LaneSpec {
  name: string
  x0: number
  x1: number
  y: number
}

/**
 * Build an ImportedShapes network of straight horizontal lanes (60 px wide,
 * ~3.6 m) with explicit next/prev links. Boundary linestrings are 2-point
 * lines and are NOT shared between lanes.
 */
function buildLaneNetwork(specs: LaneSpec[], links: [string, string][]): ImportedShapes {
  const points: ImportedShapes['points'] = []
  const linestrings: ImportedShapes['linestrings'] = []
  const lanes: ImportedShapes['lanes'] = []
  let pid = 0
  let lid = 0

  const addBoundary = (x0: number, y0: number, x1: number, y1: number): string => {
    const a = `shape:dp_${pid++}`
    const b = `shape:dp_${pid++}`
    points.push({ id: a as never, x: x0, y: y0, osmId: '' })
    points.push({ id: b as never, x: x1, y: y1, osmId: '' })
    const id = `shape:dl_${lid++}`
    linestrings.push({ id: id as never, x: (x0 + x1) / 2, y: (y0 + y1) / 2, pointIds: [a, b], osmId: '', attributes: {} })
    return id
  }

  for (const { name, x0, x1, y } of specs) {
    const left = addBoundary(x0, y, x1, y)
    const right = addBoundary(x0, y + 60, x1, y + 60)
    lanes.push({
      id: `shape:lane_${name}` as never,
      x: (x0 + x1) / 2,
      y: y + 30,
      leftBoundaryId: left,
      rightBoundaryId: right,
      invertLeft: false,
      invertRight: false,
      osmId: '',
      attributes: { type: 'lanelet', subtype: 'road', one_way: 'yes' },
      next: [],
      prev: [],
    })
  }
  const byName = new Map(lanes.map(l => [(l.id as string).replace('shape:lane_', ''), l]))
  for (const [from, to] of links) {
    const f = byName.get(from)!
    const t = byName.get(to)!
    f.next.push(t.id as string)
    t.prev.push(f.id as string)
  }

  const xs = points.map(p => p.x)
  const ys = points.map(p => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return {
    points,
    linestrings,
    lanes,
    trafficLights: [],
    bounds: {
      minX,
      maxX,
      minY,
      maxY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
      width: maxX - minX,
      height: maxY - minY,
    },
    originLatLon: FALLBACK_ORIGIN,
  }
}

/**
 * Hand-built 2x2 "diamond" network: two approach lanes (A, D) that both
 * branch into two departure lanes (B, C).
 *
 *   A --> B    A --> C    D --> B    D --> C
 *
 * This is the canonical case where writing only next[0]/prev[0] into road
 * <link> elements loses an edge: D->C is neither D's first successor nor C's
 * first predecessor, so neither side of the dual write records it.
 */
function diamondShapes(): ImportedShapes {
  return buildLaneNetwork(
    [
      { name: 'A', x0: 0, x1: 800, y: 0 },
      { name: 'D', x0: 0, x1: 800, y: 200 },
      { name: 'B', x0: 800, x1: 1600, y: 0 },
      { name: 'C', x0: 800, x1: 1600, y: 200 },
    ],
    [
      ['A', 'B'],
      ['A', 'C'],
      ['D', 'B'],
      ['D', 'C'],
    ]
  )
}

/**
 * Chain with a short middle link: A (48 m) -> S (1 m) -> B (48 m).
 * Mirrors the sub-2 m junction stub lanes found in real OpenDRIVE maps.
 * The exporter's boundary-alignment snapping (epsilon 30 px ~ 1.8 m) merges
 * S's start and end endpoints into one cluster, collapsing its centerline to
 * < 1 cm, so S is silently dropped (and the chain broken) on export.
 */
function shortLinkShapes(): ImportedShapes {
  return buildLaneNetwork(
    [
      { name: 'A', x0: 0, x1: 800, y: 0 },
      { name: 'S', x0: 800, x1: 817, y: 0 }, // 17 px ~ 1 m
      { name: 'B', x0: 817, x1: 1617, y: 0 },
    ],
    [
      ['A', 'S'],
      ['S', 'B'],
    ]
  )
}

// ---------------------------------------------------------------------------
// Fixture loading
// ---------------------------------------------------------------------------

interface XodrFixture {
  name: string
  imported: ImportedShapes
}

function loadXodrFixtures(): XodrFixture[] {
  const fixtures: XodrFixture[] = [{ name: 'synthetic', imported: importXodr(SYNTHETIC_XODR) }]
  if (existsSync(FABRIKSGATAN)) {
    fixtures.push({ name: 'fabriksgatan', imported: importXodr(readFileSync(FABRIKSGATAN, 'utf-8')) })
  }
  if (existsSync(TWO_PLUS_ONE)) {
    fixtures.push({ name: 'two_plus_one', imported: importXodr(readFileSync(TWO_PLUS_ONE, 'utf-8')) })
  }
  return fixtures
}

const hasRealLanelet2 = LANELET2_REAL !== '' && existsSync(LANELET2_REAL)

function expectAttributesPreserved(r: FidelityReport, keys: readonly LaneAttributeKey[]): void {
  for (const key of keys) {
    expect(r.attributes[key].preserved, `attribute "${key}"`).toBe(r.attributes[key].comparable)
  }
}

// ---------------------------------------------------------------------------
// (d) lanelet2 -> shapes -> lanelet2 -> shapes  (baseline)
// ---------------------------------------------------------------------------

describe('(d) lanelet2 -> shapes -> lanelet2 -> shapes', () => {
  it('preserves topology, attributes and regulatory links (synthetic)', () => {
    const before = importLanelet2(SYNTHETIC_LANELET2)
    const r = measureFidelity(before, viaLanelet2(before))
    expect(r.laneCountAfter).toBe(r.laneCountBefore)
    expect(r.matchedLanes).toBe(r.laneCountBefore)
    expect(r.edgesBefore).toBeGreaterThan(0)
    expect(r.edgesPreserved).toBe(r.edgesBefore)
    expect(r.adjacencyBefore).toBeGreaterThan(0)
    expect(r.adjacencyPreserved).toBe(r.adjacencyBefore)
    expectAttributesPreserved(r, LANE_ATTRIBUTE_KEYS)
    expect(r.trafficLightsMatched).toBe(r.trafficLightsBefore)
    expect(r.trafficLightAffectedPreserved).toBe(r.trafficLightsBefore)
    expect(r.stopLinesPreserved).toBe(r.stopLinesBefore)
  })

  it.runIf(hasRealLanelet2)('preserves topology, attributes and regulatory links (real map)', () => {
    const before = importLanelet2(readFileSync(LANELET2_REAL, 'utf-8'))
    const r = measureFidelity(before, viaLanelet2(before))
    expect(r.matchedLanes).toBe(r.laneCountBefore)
    expect(r.edgesPreserved).toBe(r.edgesBefore)
    expect(r.adjacencyPreserved).toBe(r.adjacencyBefore)
    expectAttributesPreserved(r, LANE_ATTRIBUTE_KEYS)
    expect(r.trafficLightAffectedPreserved).toBe(r.trafficLightsBefore)
    expect(r.stopLinesPreserved).toBe(r.stopLinesBefore)
  })
})

// ---------------------------------------------------------------------------
// (a) xodr -> shapes -> lanelet2 -> shapes
// ---------------------------------------------------------------------------

describe('(a) xodr -> shapes -> lanelet2 -> shapes', () => {
  const fixtures = loadXodrFixtures()

  it('preserves lane count, adjacency and lane attributes', () => {
    for (const { name, imported } of fixtures) {
      const r = measureFidelity(imported, viaLanelet2(imported))
      expect(r.matchedLanes, `${name}: matched lanes`).toBe(r.laneCountBefore)
      expect(r.adjacencyPreserved, `${name}: adjacency`).toBe(r.adjacencyBefore)
      expectAttributesPreserved(r, ['type', 'subtype', 'odr_type', 'one_way'])
    }
  })

  it('preserves signal validity (affected lanes) for single-lane signals', () => {
    const before = importXodr(SYNTHETIC_XODR)
    const r = measureFidelity(before, viaLanelet2(before))
    expect(r.trafficLightsMatched).toBe(r.trafficLightsBefore)
    expect(r.trafficLightAffectedPreserved).toBe(r.trafficLightsBefore)
  })

  // Fix A: odrToShapes welds the boundary endpoint Points of lanes joined by
  // a next/prev edge (laneSection chains, road links, junction connections),
  // so exportToLanelet2 emits shared nodes and the re-import's shared-node
  // based connection detection recovers every edge.
  it('preserves next/prev connectivity (Fix A: weld contact points)', () => {
    for (const { name, imported } of fixtures) {
      const r = measureFidelity(imported, viaLanelet2(imported))
      expect(r.edgesBefore, `${name}: edges before`).toBeGreaterThan(0)
      expect(r.edgesPreserved, `${name}: edges preserved`).toBe(r.edgesBefore)
    }
  })
})

// ---------------------------------------------------------------------------
// (b) xodr -> shapes -> xodr -> shapes
// ---------------------------------------------------------------------------

describe('(b) xodr -> shapes -> xodr -> shapes', () => {
  const fixtures = loadXodrFixtures()

  it('preserves lane count, connectivity and lane attributes', () => {
    for (const { name, imported } of fixtures) {
      const r = measureFidelity(imported, viaOpenDrive(imported))
      expect(r.matchedLanes, `${name}: matched lanes`).toBe(r.laneCountBefore)
      // 1:1 edges ride on road links; branch/merge edges ride on the
      // junctions synthesized by Fix C (see the diamond suite below).
      expect(r.edgesPreserved, `${name}: edges`).toBe(r.edgesBefore)
      expectAttributesPreserved(r, [
        'type',
        'subtype',
        'odr_type',
        'one_way',
        // Junction turn directions ride per lane in the laneAttributes
        // userData stash, so they survive even though lane ids shift.
        'turn_direction',
      ])
    }
  })

  // Same-direction adjacent lanes are exported as one <road> (lane bundling),
  // so their shared boundary is structural in the file itself; adjacency
  // across travel directions (e.g. the two sides of a two-way road) lives in
  // separate roads and is restored by the importer's boundary dedupe (Fix B).
  it('preserves left/right adjacency (bundling + Fix B dedupe)', () => {
    for (const { name, imported } of fixtures) {
      const r = measureFidelity(imported, viaOpenDrive(imported))
      expect(r.adjacencyBefore, `${name}: adjacency before`).toBeGreaterThan(0)
      expect(r.adjacencyPreserved, `${name}: adjacency preserved`).toBe(r.adjacencyBefore)
    }
  })
})

// ---------------------------------------------------------------------------
// Road bundling: laterally adjacent same-direction lanes become one <road>
// ---------------------------------------------------------------------------

describe('road bundling (shapes -> xodr structural adjacency)', () => {
  it('keeps the two adjacent lanes of one road in one exported road (-1/-2)', () => {
    const before = importXodr(SYNTHETIC_XODR)
    const snapshot = snapshotFrom(before)
    if (!snapshot.origin) snapshot.origin = FALLBACK_ORIGIN
    const xodr = exportToOpenDrive(snapshot)
    const parsed = parseOpenDriveXml(xodr)

    // Source road 1 carries two adjacent right driving lanes; the export must
    // keep them inside one road — structurally, in the XML itself, not
    // recovered by the importer's geometric dedupe.
    const mainRoads = parsed.roads.filter(r => r.junction === '-1')
    const twoLaneRoads = mainRoads.filter(r => r.laneSections[0]?.right.length === 2)
    expect(twoLaneRoads).toHaveLength(1)
    expect(twoLaneRoads[0].laneSections[0].right.map(l => l.id)).toEqual([-1, -2])
    // Bundling strictly reduces the mainline road count below
    // one-road-per-lane (junction-stamped roads are the short synthesized
    // connecting roads, not lane-carrying mainlines).
    expect(mainRoads.length).toBeLessThan(before.lanes.length)

    // Re-import: the two lanes carry the same odr_road_id, ids -1/-2, and
    // share the middle boundary linestring object.
    const after = importXodr(xodr)
    const lanes = after.lanes.filter(l => l.attributes.odr_road_id === twoLaneRoads[0].id)
    expect(lanes).toHaveLength(2)
    const inner = lanes.find(l => l.attributes.odr_lane_id === '-1')!
    const outer = lanes.find(l => l.attributes.odr_lane_id === '-2')!
    expect(inner).toBeDefined()
    expect(outer).toBeDefined()
    expect(inner.rightBoundaryId).toBe(outer.leftBoundaryId)
  })

  it('drops the exported road count well below one-road-per-lane on real maps', () => {
    for (const { name, imported } of loadXodrFixtures()) {
      const snapshot = snapshotFrom(imported)
      if (!snapshot.origin) snapshot.origin = FALLBACK_ORIGIN
      const parsed = parseOpenDriveXml(exportToOpenDrive(snapshot))
      const mainRoads = parsed.roads.filter(r => r.junction === '-1')
      expect(mainRoads.length, `${name}: exported mainline roads`).toBeLessThan(imported.lanes.length)
      const multiLaneRoads = mainRoads.filter(
        r => (r.laneSections[0]?.right.length ?? 0) >= 2
      )
      expect(multiLaneRoads.length, `${name}: multi-lane roads`).toBeGreaterThan(0)
    }
  })

  it('emits multi-lane signal validity as one lane range inside one road', () => {
    // Lanes A and C of the synthetic Lanelet2 map are laterally adjacent and
    // both controlled by the signal, so they bundle into one road and the
    // <validity> covers lanes -2..-1 — no <signalReference> needed.
    const before = importLanelet2(SYNTHETIC_LANELET2)
    const snapshot = snapshotFrom(before)
    if (!snapshot.origin) snapshot.origin = FALLBACK_ORIGIN
    const xodr = exportToOpenDrive(snapshot)
    expect(xodr).toContain('<validity fromLane="-2" toLane="-1"/>')
    expect(xodr).not.toContain('<signalReference')
    const r = measureFidelity(before, importXodr(xodr))
    expect(r.trafficLightAffectedPreserved).toBe(r.trafficLightsBefore)
  })
})

// ---------------------------------------------------------------------------
// (c) lanelet2 -> shapes -> xodr -> shapes
// ---------------------------------------------------------------------------

describe('(c) lanelet2 -> shapes -> xodr -> shapes', () => {
  it('preserves lane count, connectivity, type and one_way (synthetic)', () => {
    const before = importLanelet2(SYNTHETIC_LANELET2)
    const r = measureFidelity(before, viaOpenDrive(before))
    expect(r.matchedLanes).toBe(r.laneCountBefore)
    expect(r.edgesPreserved).toBe(r.edgesBefore)
    expectAttributesPreserved(r, ['type', 'subtype', 'one_way'])
    expect(r.trafficLightsMatched).toBe(r.trafficLightsBefore)
  })

  // Calibrated against an Autoware-style sample map (drivable lanes, no
  // degenerate lanelets). Sub-centimetre lanelets still hit the degenerate
  // geometry guard at export and would drop out of such a map.
  it.runIf(hasRealLanelet2)('preserves lane count, connectivity, type and one_way (real map)', () => {
    const before = importLanelet2(readFileSync(LANELET2_REAL, 'utf-8'))
    const r = measureFidelity(before, viaOpenDrive(before))
    expect(r.matchedLanes).toBe(r.laneCountBefore)
    expect(r.edgesPreserved).toBe(r.edgesBefore)
    expectAttributesPreserved(r, ['type', 'one_way'])
    expect(r.trafficLightsMatched).toBe(r.trafficLightsBefore)
  })

  // Fix B (same mechanism as path (b)).
  it('preserves left/right adjacency (Fix B: dedupe shared boundaries)', () => {
    const before = importLanelet2(SYNTHETIC_LANELET2)
    const r = measureFidelity(before, viaOpenDrive(before))
    expect(r.adjacencyBefore).toBeGreaterThan(0)
    expect(r.adjacencyPreserved).toBe(r.adjacencyBefore)
  })

  // Fix D: speed_limit / turn_direction / location have no (full) OpenDRIVE
  // representation; they ride in <userData code="laneAttributes"> and are
  // restored on import.
  it('preserves Lanelet2-only lane tags (Fix D: userData passthrough)', () => {
    const before = importLanelet2(SYNTHETIC_LANELET2)
    const r = measureFidelity(before, viaOpenDrive(before))
    for (const key of ['speed_limit', 'turn_direction', 'location'] as const) {
      expect(r.attributes[key].comparable, `${key} comparable`).toBeGreaterThan(0)
      expect(r.attributes[key].preserved, `${key} preserved`).toBe(r.attributes[key].comparable)
    }
  })

  // Fix D: non-"road" lanelet subtypes used to degrade through the lossy ODR
  // type mapping (e.g. crosswalk -> <lane type="walking"> -> walkway); the
  // exact subtype now rides in the laneAttributes userData.
  it.runIf(hasRealLanelet2)('preserves non-road lanelet subtypes (Fix D)', () => {
    const before = importLanelet2(readFileSync(LANELET2_REAL, 'utf-8'))
    const r = measureFidelity(before, viaOpenDrive(before))
    expect(r.attributes.subtype.preserved).toBe(r.attributes.subtype.comparable)
  })

  // Fix D: every exported road is one-directional and the importer defaults
  // to one_way=yes, but the stashed laneAttributes restore one_way=no.
  it('keeps bidirectional lanes bidirectional (Fix D)', () => {
    const before = importLanelet2(BIDIRECTIONAL_LANELET2)
    const r = measureFidelity(before, viaOpenDrive(before))
    expect(r.attributes.one_way.comparable).toBeGreaterThan(0)
    expect(r.attributes.one_way.preserved).toBe(r.attributes.one_way.comparable)
  })

  // Fix D: a regulatory element controlling N lanelets becomes a <signal>
  // whose <validity> covers the affected lanes of its road; lanes living in
  // other road bundles get <signalReference> records. The stop line rides in
  // <userData code="stopLine"> on the signal; all are merged back on import.
  it('preserves multi-lane signal validity and stop lines (Fix C/D)', () => {
    const before = importLanelet2(SYNTHETIC_LANELET2)
    const r = measureFidelity(before, viaOpenDrive(before))
    expect(r.trafficLightsBefore).toBeGreaterThan(0)
    expect(r.trafficLightAffectedPreserved).toBe(r.trafficLightsBefore)
    expect(r.stopLinesBefore).toBeGreaterThan(0)
    expect(r.stopLinesPreserved).toBe(r.stopLinesBefore)
  })
})

// ---------------------------------------------------------------------------
// Diamond branch/merge: the genuine next[0]/prev[0] loss case + junctions
// ---------------------------------------------------------------------------

describe('diamond branch/merge through xodr (shapes -> xodr -> shapes)', () => {
  // Fix C: a <junction> is synthesized for branch/merge edges, so every edge
  // is representable (and standard ODR consumers see a valid junction
  // instead of conflicting road links). Without it, D->C — neither D.next[0]
  // nor C.prev[0] — was decidably lost (1 of 4 edges).
  it('preserves all branch/merge edges (Fix C: synthesize junctions)', () => {
    const before = diamondShapes()
    const r = measureFidelity(before, viaOpenDrive(before))
    expect(r.matchedLanes).toBe(4)
    expect(r.edgesBefore).toBe(4)
    expect(r.edgesPreserved).toBe(r.edgesBefore)
  })

  it('emits a <junction> element for branching lanes (Fix C)', () => {
    const snapshot = snapshotFrom(diamondShapes())
    if (!snapshot.origin) snapshot.origin = FALLBACK_ORIGIN
    const xodr = exportToOpenDrive(snapshot)
    expect(xodr).toContain('<junction')
    // All four edges of the 2-in x 2-out diamond live in one junction.
    expect(xodr.match(/<connection /g)).toHaveLength(4)
    expect(xodr.match(/<laneLink from="-1" to="-1"\/>/g)).toHaveLength(4)
  })
})

// ---------------------------------------------------------------------------
// Junction normalization: standard incoming -> connecting -> outgoing roads
// ---------------------------------------------------------------------------

describe('junction normalization (standard connecting-road structure)', () => {
  function exportXodr(imported: ImportedShapes): string {
    const snapshot = snapshotFrom(imported)
    if (!snapshot.origin) snapshot.origin = FALLBACK_ORIGIN
    return exportToOpenDrive(snapshot)
  }

  // Standard OpenDRIVE semantics: roads inside a junction are short
  // connecting roads carrying a guaranteed predecessor (incoming road) and
  // successor (outgoing road); the mainlines stay junction="-1". The missing
  // successor on junction-stamped roads is exactly what esmini warns about
  // ("connecting road lacks successor").
  it('emits only short, fully linked connecting roads inside junctions', () => {
    const sources = [...loadXodrFixtures(), { name: 'diamond', imported: diamondShapes() }]
    for (const { name, imported } of sources) {
      const parsed = parseOpenDriveXml(exportXodr(imported))
      const roadById = new Map(parsed.roads.map(r => [r.id, r]))
      let connectingCount = 0
      for (const road of parsed.roads) {
        if (road.junction === '-1') continue
        connectingCount++
        expect(road.length, `${name}: connecting road ${road.id} length`).toBeLessThan(0.5)
        expect(road.predecessor?.elementType, `${name}: road ${road.id} predecessor`).toBe('road')
        expect(road.successor?.elementType, `${name}: road ${road.id} successor`).toBe('road')
      }
      for (const junction of parsed.junctions) {
        expect(junction.connections.length, `${name}: junction ${junction.id} connections`).toBeGreaterThan(0)
        for (const conn of junction.connections) {
          const connecting = roadById.get(conn.connectingRoad)
          expect(connecting?.junction, `${name}: connection road ${conn.connectingRoad}`).toBe(junction.id)
          expect(connecting?.predecessor?.elementId).toBe(conn.incomingRoad)
          // Incoming and outgoing mainlines are not junction members.
          expect(roadById.get(conn.incomingRoad)?.junction).toBe('-1')
          expect(roadById.get(connecting!.successor!.elementId)?.junction).toBe('-1')
        }
      }
      if (parsed.junctions.length > 0) {
        expect(connectingCount, `${name}: connecting roads exist`).toBeGreaterThan(0)
      }
    }
  })

  // The synthesized connecting roads sit below the importer's micro-section
  // threshold: a re-import must skip them (no extra sliver lanes) while
  // bridging the lane links across, keeping the lane set and edge set intact.
  it('re-imports without materializing the synthesized connecting roads', () => {
    const before = diamondShapes()
    const after = importXodr(exportXodr(before))
    expect(after.lanes).toHaveLength(before.lanes.length)
    const r = measureFidelity(before, after)
    expect(r.matchedLanes).toBe(r.laneCountBefore)
    expect(r.edgesPreserved).toBe(r.edgesBefore)
  })

  // Right-of-way between two maneuvers of one junction is standard junction
  // <priority high low> (between connecting roads), replacing the userData
  // stash for such pairs; the importer maps it back to yieldLaneIds on the
  // incoming lanes the maneuvers start from.
  it('expresses junction right-of-way as <priority> and restores yieldLaneIds', () => {
    const before = diamondShapes()
    const laneA = before.lanes.find(l => (l.id as string) === 'shape:lane_A')!
    const laneD = before.lanes.find(l => (l.id as string) === 'shape:lane_D')!
    laneA.yieldLaneIds = [laneD.id as string] // A has right of way; D yields.

    const xodr = exportXodr(before)
    const parsed = parseOpenDriveXml(xodr)
    expect(parsed.junctions).toHaveLength(1)
    const junction = parsed.junctions[0]
    // A and D have two maneuvers each -> 2x2 priority records.
    expect(junction.priorities).toHaveLength(4)
    const roadById = new Map(parsed.roads.map(r => [r.id, r]))
    for (const pr of junction.priorities) {
      expect(roadById.get(pr.high)?.junction).toBe(junction.id)
      expect(roadById.get(pr.low)?.junction).toBe(junction.id)
    }
    // The junction-expressible pair no longer needs the userData fallback.
    expect(xodr).not.toContain('<userData code="yieldLanes"')

    const after = importXodr(xodr)
    const rowLanes = after.lanes.filter(l => (l.yieldLaneIds ?? []).length > 0)
    expect(rowLanes).toHaveLength(1)
    expect(rowLanes[0].yieldLaneIds).toHaveLength(1)
    // Lane A was drawn at y=0, lane D at y=200 (canvas px survive the trip).
    const yielding = after.lanes.find(l => l.id === rowLanes[0].yieldLaneIds![0])!
    expect(rowLanes[0].y).toBeLessThan(100)
    expect(yielding.y).toBeGreaterThan(100)
  })
})

// ---------------------------------------------------------------------------
// Short connecting lanes vs boundary-alignment snapping (Fix E)
// ---------------------------------------------------------------------------

describe('short connecting lanes through xodr (shapes -> xodr -> shapes)', () => {
  // Fix E: buildBoundaryAlignmentOverrides snaps connected-lane endpoints
  // within 30 px (~1.8 m) to a cluster centroid. A connecting lane shorter
  // than the epsilon used to get its start AND end merged into one cluster,
  // collapsing its centerline below the 1 cm export guard and silently
  // dropping the lane together with its next/prev chain (measured on CARLA
  // Town01: 54/306 lanes — all 0.6-1.2 m junction stubs — and 108/270
  // edges; Town05 lost 975/1961 lanes). The snapping now never merges a
  // lane's own start and end clusters.
  it('keeps sub-epsilon connecting lanes and their chain (Fix E)', () => {
    const before = shortLinkShapes()
    const r = measureFidelity(before, viaOpenDrive(before))
    expect(r.laneCountBefore).toBe(3)
    expect(r.laneCountAfter).toBe(r.laneCountBefore)
    expect(r.edgesBefore).toBe(2)
    expect(r.edgesPreserved).toBe(r.edgesBefore)
  })
})

// ---------------------------------------------------------------------------
// Plan-view geometry fitting (export quality)
// ---------------------------------------------------------------------------

/**
 * Synthetic curvy OpenDRIVE road: line -> spiral -> arc -> spiral -> line
 * with two right driving lanes. Start poses are chained analytically through
 * evalGeometry so the plan view is exactly continuous.
 */
function buildCurvyXodr(): string {
  const defs: (Omit<OdrGeometry, 's' | 'x' | 'y' | 'hdg'> & { xml: string })[] = [
    { kind: 'line', length: 40, xml: '<line/>' },
    {
      kind: 'spiral',
      length: 40,
      curvStart: 0,
      curvEnd: 0.02,
      xml: '<spiral curvStart="0" curvEnd="0.02"/>',
    },
    { kind: 'arc', length: 60, curvature: 0.02, xml: '<arc curvature="0.02"/>' },
    {
      kind: 'spiral',
      length: 40,
      curvStart: 0.02,
      curvEnd: 0,
      xml: '<spiral curvStart="0.02" curvEnd="0"/>',
    },
    { kind: 'line', length: 30, xml: '<line/>' },
  ]
  let pose = { x: 0, y: 0, hdg: 0 }
  let s = 0
  const parts: string[] = []
  for (const d of defs) {
    const geom = { ...d, s, x: pose.x, y: pose.y, hdg: pose.hdg } as OdrGeometry
    parts.push(
      `      <geometry s="${s}" x="${pose.x}" y="${pose.y}" hdg="${pose.hdg}" length="${d.length}">${d.xml}</geometry>`
    )
    pose = evalGeometry(geom, d.length)
    s += d.length
  }
  return `<?xml version="1.0"?>
<OpenDRIVE>
  <header revMajor="1" revMinor="6">
    <geoReference><![CDATA[+proj=tmerc +lat_0=35.0 +lon_0=139.0 +datum=WGS84]]></geoReference>
  </header>
  <road name="curvy" length="${s}" id="1" junction="-1">
    <planView>
${parts.join('\n')}
    </planView>
    <lanes>
      <laneSection s="0">
        <right>
          <lane id="-1" type="driving" level="false"><width sOffset="0" a="3.5" b="0" c="0" d="0"/></lane>
          <lane id="-2" type="driving" level="false"><width sOffset="0" a="3.5" b="0" c="0" d="0"/></lane>
        </right>
      </laneSection>
    </lanes>
  </road>
</OpenDRIVE>`
}

/** Boundary polylines of an imported map in ENU meters. */
function boundaryPolylinesEnu(shapes: ImportedShapes): { x: number; y: number }[][] {
  const pointById = new Map(shapes.points.map(p => [p.id, p]))
  return shapes.linestrings.map(ls =>
    ls.pointIds
      .map(id => pointById.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map(p => ({ x: p.x / PIXELS_PER_METER, y: -p.y / PIXELS_PER_METER }))
  )
}

function distToPolyline(p: Pt, poly: readonly Pt[]): number {
  let best = Infinity
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i]
    const b = poly[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    let t = len2 > 1e-18 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0
    t = Math.max(0, Math.min(1, t))
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)))
  }
  return best
}

/** Max distance (px) from each before-lane boundary point to its matched after boundary. */
function maxBoundaryDeviationPx(before: ImportedShapes, after: ImportedShapes): number {
  const topoB = topologySignature(before)
  const topoA = topologySignature(after)
  const matching = matchLanesForTest(topoB.geoms, topoA.geoms)
  const ptB = new Map(before.points.map(p => [p.id, p]))
  const ptA = new Map(after.points.map(p => [p.id, p]))
  const lsB = new Map(before.linestrings.map(l => [l.id, l]))
  const lsA = new Map(after.linestrings.map(l => [l.id, l]))
  const polyOf = (
    lane: ImportedShapes['lanes'][number],
    pts: Map<string, { x: number; y: number }>,
    ls: Map<string, { pointIds: string[] }>,
    side: 'left' | 'right'
  ): Pt[] => {
    const rec = ls.get(side === 'left' ? lane.leftBoundaryId : lane.rightBoundaryId)
    if (!rec) return []
    return rec.pointIds.map(id => pts.get(id)).filter((p): p is Pt => !!p)
  }
  let max = 0
  for (const [b, a] of matching) {
    for (const side of ['left', 'right'] as const) {
      const pb = polyOf(before.lanes[b], ptB, lsB, side)
      const pa = polyOf(after.lanes[a], ptA, lsA, side)
      if (pb.length < 2 || pa.length < 2) continue
      for (const p of pb) max = Math.max(max, distToPolyline(p, pa))
    }
  }
  return max
}

function matchLanesForTest(before: LaneGeom[], after: LaneGeom[]): Map<number, number> {
  return matchLanes(before, after, DEFAULT_TOL_PX)
}

describe('plan-view geometry fitting (export quality)', () => {
  const curvyXml = buildCurvyXodr()

  it('emits compact analytic primitives instead of a line decomposition', () => {
    const before = importXodr(curvyXml)
    expect(before.lanes).toHaveLength(2)
    const xml = exportToOpenDrive(snapshotFrom(before))
    const geomCount = (xml.match(/<geometry /g) ?? []).length
    // The previous per-sample line decomposition needed ~40 <line> records
    // for this road (5 cm chord tolerance on R = 50 m); the fitter must get
    // far below that and use curved primitives. Tighten only, never relax.
    expect(geomCount).toBeLessThanOrEqual(16)
    expect(xml).toContain('<arc ')
  })

  it('keeps the fitted reference line within tolerance of the source boundaries', () => {
    const before = importXodr(curvyXml)
    const exported = parseOpenDriveXml(exportToOpenDrive(snapshotFrom(before)))
    const boundaries = boundaryPolylinesEnu(before)
    expect(exported.roads.length).toBeGreaterThan(0)
    for (const road of exported.roads) {
      const samples = sampleReferenceLine(road, { maxChordErrorMeters: 0.01, maxStepMeters: 1 })
      expect(samples.length).toBeGreaterThan(10)
      for (const sample of samples) {
        // The road reference line is the bundle's leftmost boundary, so each
        // re-evaluated point must sit on one of the original boundary
        // polylines: 5 cm fit tolerance + the polylines' own chordal slack.
        const d = Math.min(...boundaries.map(b => distToPolyline(sample, b)))
        expect(d).toBeLessThanOrEqual(0.12)
      }
    }
  })

  it('round-trips curved-lane boundary geometry within 0.15 m', () => {
    const before = importXodr(curvyXml)
    const after = viaOpenDrive(before)
    const r = measureFidelity(before, after)
    expect(r.laneCountAfter).toBe(r.laneCountBefore)
    expect(r.matchedLanes).toBe(r.laneCountBefore)
    expect(r.adjacencyPreserved).toBe(r.adjacencyBefore)
    const maxDevPx = maxBoundaryDeviationPx(before, after)
    expect(maxDevPx / PIXELS_PER_METER).toBeLessThanOrEqual(0.15)
  })

  it('keeps a straight road a single <line> geometry (no regression)', () => {
    const before = importXodr(SYNTHETIC_XODR)
    const xml = exportToOpenDrive(snapshotFrom(before))
    // Synthesized junction connecting stubs are excluded: they blend the
    // incoming pose onto the outgoing road and legitimately emit an <arc>
    // when the drawn branch kinks (contact-gap cleanliness, see
    // emitConnectingRoad).
    const roadChunks = xml.split('<road ').slice(1).filter(c => !c.startsWith('name="connecting"'))
    expect(roadChunks.length).toBeGreaterThan(0)
    for (const chunk of roadChunks) {
      const planView = chunk.split('<planView>')[1]?.split('</planView>')[0] ?? ''
      const count = (planView.match(/<geometry /g) ?? []).length
      expect(count).toBe(1)
      expect(planView).toContain('<line/>')
      expect(planView).not.toContain('<arc ')
      expect(planView).not.toContain('<paramPoly3 ')
    }
  })
})

// ---------------------------------------------------------------------------
// Contact-point cleanliness (ASAM QC checker rules)
// ---------------------------------------------------------------------------

describe('contact-point cleanliness (ASAM QC rules)', () => {
  const point = (id: string, x: number, y: number) => ({
    id, type: 'point', x, y, rotation: 0, zIndex: 0,
    props: { color: 'black', visible: true, osmId: '' },
  })
  const linestring = (id: string, pointIds: string[]) => ({
    id, type: 'linestring', x: 0, y: 0, rotation: 0, zIndex: 0,
    props: { pointIds, color: 'black', strokeWidth: 2, attributes: {}, osmId: '' },
  })
  const lane = (id: string, left: string, right: string, opts: { next?: string[]; prev?: string[] } = {}) => ({
    id, type: 'lane', x: 0, y: 0, rotation: 0, zIndex: 0,
    props: {
      leftBoundaryId: left, rightBoundaryId: right, invertLeft: false, invertRight: false,
      color: 'default', size: 'm', attributes: { type: 'lanelet', subtype: 'road' },
      next: opts.next ?? [], prev: opts.prev ?? [], osmId: '',
    },
  })
  const snap = (shapes: unknown[]): DrawtonomySnapshot =>
    ({ version: '1.1', timestamp: 't', shapes, origin: FALLBACK_ORIGIN } as DrawtonomySnapshot)

  it('omits standard links on zero-width contacts and restores the edge from userData', () => {
    // Lane t1 tapers to a point (left and right boundaries share the final
    // Point) where lane t2 grows from the same point — the Town01 sidewalk /
    // fabriksgatan border pattern. OpenDRIVE forbids linking lanes with zero
    // width at the linked contact (zero_width_at_start/end, new_lane_appear),
    // so the edge must leave the standard records and ride in
    // <userData code="hiddenLaneLinks"> instead — and come back on import.
    const shapes = [
      point('p1', 0, -10), point('p2', 100, 0), point('p3', 0, 10),
      point('p4', 200, -10), point('p5', 200, 10),
      linestring('t1l', ['p1', 'p2']), linestring('t1r', ['p3', 'p2']),
      lane('t1', 't1l', 't1r', { next: ['t2'] }),
      linestring('t2l', ['p2', 'p4']), linestring('t2r', ['p2', 'p5']),
      lane('t2', 't2l', 't2r', { prev: ['t1'] }),
    ]
    const xml = exportToOpenDrive(snap(shapes))
    expect(xml).not.toContain('<successor id=')
    expect(xml).not.toContain('<predecessor id=')
    expect(xml).toContain('userData code="hiddenLaneLinks"')
    const after = importXodr(xml)
    expect(after.lanes).toHaveLength(2)
    const next = after.lanes.flatMap(l => l.next)
    expect(next).toHaveLength(1)
  })

  it('keeps narrow connected lanes at full width at the contact (no snap pinch)', () => {
    // Two connected 10 px (0.6 m) lanes: the endpoint snap must not cluster a
    // lane's left and right boundary endpoints (which would pinch the lane to
    // zero width at the weld and bend the geometry).
    const shapes = [
      point('p1', 0, -5), point('p2', 100, -5), point('p3', 0, 5), point('p4', 100, 5),
      linestring('l1l', ['p1', 'p2']), linestring('l1r', ['p3', 'p4']),
      lane('n1', 'l1l', 'l1r', { next: ['n2'] }),
      point('p5', 100, -5), point('p6', 200, -5), point('p7', 100, 5), point('p8', 200, 5),
      linestring('l2l', ['p5', 'p6']), linestring('l2r', ['p7', 'p8']),
      lane('n2', 'l2l', 'l2r', { prev: ['n1'] }),
    ]
    const parsed = parseOpenDriveXml(exportToOpenDrive(snap(shapes)))
    expect(parsed.roads.length).toBe(2)
    for (const road of parsed.roads) {
      const l = road.laneSections[0].right[0]
      for (const w of l.widths) {
        // 10 px = 0.6 m everywhere (constant-width rectangles).
        expect(w.a).toBeGreaterThan(0.55)
        expect(Math.abs(w.b)).toBeLessThan(1e-6)
      }
      // No skew: the reference line stays horizontal.
      expect(Math.abs(road.planView[0].hdg)).toBeLessThan(1e-6)
    }
  })

  it('lands the fitted plan view exactly on the drawn boundary endpoints', () => {
    // A quarter arc drawn as a polyline: the fitted reference line must end
    // on the final drawn vertex (the contact point with a neighbouring road),
    // not merely within the 5 cm fitting band.
    const n = 24
    const leftIds: string[] = []
    const rightIds: string[] = []
    const shapes: unknown[] = []
    for (let i = 0; i <= n; i++) {
      const a = (Math.PI / 2) * (i / n)
      shapes.push(point(`a${i}`, 560 * Math.cos(a), -560 * Math.sin(a)))
      shapes.push(point(`b${i}`, 500 * Math.cos(a), -500 * Math.sin(a)))
      leftIds.push(`a${i}`)
      rightIds.push(`b${i}`)
    }
    shapes.push(linestring('arcL', leftIds), linestring('arcR', rightIds))
    shapes.push(lane('arc1', 'arcL', 'arcR'))
    const parsed = parseOpenDriveXml(exportToOpenDrive(snap(shapes)))
    const road = parsed.roads[0]
    const last = road.planView[road.planView.length - 1]
    const end = evalGeometry(last, last.length)
    // Drawn final left vertex (canvas px -> ENU meters: x/PX, -y/PX).
    const ex = 0 / PIXELS_PER_METER
    const ey = 560 / PIXELS_PER_METER
    expect(Math.hypot(end.x - ex, end.y - ey)).toBeLessThan(0.002)
    // The start heading honors the drawn tangent (downward in canvas =
    // +pi/2 in ENU... the arc starts at angle 0 moving toward -y canvas).
    expect(Math.abs(road.planView[0].hdg - Math.PI / 2)).toBeLessThan(0.01)
  })

  it('blends synthesized connecting stubs onto kinked outgoing roads (no border step)', () => {
    // A branch whose exit kinks 0.35 rad at the weld (the hand-drawn case):
    // the stub must blend heading and width so both of its lane borders meet
    // the outgoing road within the 1 cm gap tolerance of ASAM QC checkers.
    const kc = Math.cos(0.35)
    const ks = Math.sin(0.35)
    const shapes = [
      point('m1', 0, -30), point('m2', 300, -30),
      point('m3', 0, 30), point('m4', 300, 30),
      linestring('mL', ['m1', 'm2']), linestring('mR', ['m3', 'm4']),
      lane('main', 'mL', 'mR', { next: ['exitA', 'exitB'] }),
      point('e1', 300, -30), point('e2', 300 + 200 * kc, -30 + 200 * ks),
      point('e3', 300, 30), point('e4', 300 + 200 * kc, 30 + 200 * ks),
      linestring('eL', ['e1', 'e2']), linestring('eR', ['e3', 'e4']),
      lane('exitA', 'eL', 'eR', { prev: ['main'] }),
      point('f1', 300, -30), point('f2', 500, -30),
      point('f3', 300, 30), point('f4', 500, 30),
      linestring('fL', ['f1', 'f2']), linestring('fR', ['f3', 'f4']),
      lane('exitB', 'fL', 'fR', { prev: ['main'] }),
    ]
    const parsed = parseOpenDriveXml(exportToOpenDrive(snap(shapes)))
    const roadById = new Map(parsed.roads.map(r => [r.id, r]))
    const stubs = parsed.roads.filter(r => r.junction !== '-1')
    expect(stubs.length).toBe(2)
    for (const stub of stubs) {
      const out = roadById.get(stub.successor!.elementId)!
      const stubGeom = stub.planView[0]
      const stubEnd = evalGeometry(stubGeom, stubGeom.length)
      const outStart = evalGeometry(out.planView[0], 0)
      // Inner border: stub end vs outgoing reference start.
      expect(Math.hypot(stubEnd.x - outStart.x, stubEnd.y - outStart.y)).toBeLessThan(0.01)
      // Outer border: add each side's width along its own right normal.
      const wRec = stub.laneSections[0].right[0].widths[0]
      const stubW = wRec.a + wRec.b * stubGeom.length
      const wOut = out.laneSections[0].right[0].widths[0].a
      const ox1 = stubEnd.x + Math.sin(stubEnd.hdg) * stubW
      const oy1 = stubEnd.y - Math.cos(stubEnd.hdg) * stubW
      const ox2 = outStart.x + Math.sin(outStart.hdg) * wOut
      const oy2 = outStart.y - Math.cos(outStart.hdg) * wOut
      expect(Math.hypot(ox1 - ox2, oy1 - oy2)).toBeLessThan(0.01)
    }
  })
})

// ---------------------------------------------------------------------------
// Debug matrix (run with ROUNDTRIP_DEBUG=1 to print the raw numbers)
// ---------------------------------------------------------------------------

function formatReport(name: string, r: FidelityReport): string {
  const attrs = Object.entries(r.attributes)
    .filter(([, v]) => v.comparable > 0)
    .map(([k, v]) => `${k}:${v.preserved}/${v.comparable}`)
    .join(' ')
  return [
    `[${name}]`,
    `lanes ${r.laneCountBefore}->${r.laneCountAfter} (matched ${r.matchedLanes})`,
    `edges ${r.edgesPreserved}/${r.edgesBefore} (after ${r.edgesAfter})`,
    `adjacency ${r.adjacencyPreserved}/${r.adjacencyBefore} (after ${r.adjacencyAfter})`,
    `attrs ${attrs}`,
    `tl ${r.trafficLightsMatched}/${r.trafficLightsBefore} affected ${r.trafficLightAffectedPreserved} stopline ${r.stopLinesPreserved}/${r.stopLinesBefore}`,
  ].join(' | ')
}

describe.runIf(process.env.ROUNDTRIP_DEBUG === '1')('fidelity matrix (debug)', () => {
  it('prints the full matrix', async () => {
    const lines: string[] = []
    const sources: { name: string; kind: 'xodr' | 'osm'; xml: string }[] = [
      { name: 'synthetic-xodr', kind: 'xodr', xml: SYNTHETIC_XODR },
      { name: 'synthetic-ll2', kind: 'osm', xml: SYNTHETIC_LANELET2 },
    ]
    if (existsSync(FABRIKSGATAN)) {
      sources.push({ name: 'fabriksgatan', kind: 'xodr', xml: readFileSync(FABRIKSGATAN, 'utf-8') })
    }
    if (existsSync(TWO_PLUS_ONE)) {
      sources.push({ name: 'two_plus_one', kind: 'xodr', xml: readFileSync(TWO_PLUS_ONE, 'utf-8') })
    }
    if (LANELET2_REAL && existsSync(LANELET2_REAL)) {
      sources.push({ name: 'lanelet2-real', kind: 'osm', xml: readFileSync(LANELET2_REAL, 'utf-8') })
    }
    if (XODR_REAL && existsSync(XODR_REAL)) {
      sources.push({ name: 'xodr-real', kind: 'xodr', xml: readFileSync(XODR_REAL, 'utf-8') })
    }
    for (const src of sources) {
      const before = src.kind === 'xodr' ? importXodr(src.xml) : importLanelet2(src.xml)
      const viaLl2 = measureFidelity(before, viaLanelet2(before))
      const viaOdr = measureFidelity(before, viaOpenDrive(before))
      const pathLl2 = src.kind === 'xodr' ? '(a) xodr->ll2' : '(d) ll2->ll2'
      const pathOdr = src.kind === 'xodr' ? '(b) xodr->xodr' : '(c) ll2->xodr'
      lines.push(formatReport(`${src.name} ${pathLl2}`, viaLl2))
      lines.push(formatReport(`${src.name} ${pathOdr}`, viaOdr))
    }
    const { writeFileSync } = await import('node:fs')
    writeFileSync('/tmp/fidelity-matrix.txt', lines.join('\n') + '\n')
    expect(true).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Carry-through export (verbatim re-emission of unedited roads)
// ---------------------------------------------------------------------------

import { odrToShapes as odrToShapesFull } from '../../src/exporter/odrToShapes'
import {
  extractOdrDocument,
  rewriteRoadLinkTargets,
} from '../../src/exporter/odrCarryThrough'

describe('carry-through export (sidecar verbatim re-emission)', () => {
  /** Three single-lane roads chained by plain road links + one signal. */
  const CHAIN_XODR = `<?xml version="1.0"?>
<OpenDRIVE>
  <header revMajor="1" revMinor="6" name="chain">
    <geoReference><![CDATA[+proj=tmerc +lat_0=35.0 +lon_0=139.0 +datum=WGS84]]></geoReference>
  </header>
  <road name="a" length="60" id="1" junction="-1">
    <link><successor elementType="road" elementId="2" contactPoint="start"/></link>
    <planView><geometry s="0" x="0" y="0" hdg="0" length="60"><line/></geometry></planView>
    <lanes>
      <laneSection s="0">
        <right>
          <lane id="-1" type="driving" level="false">
            <link><successor id="-1"/></link>
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
          </lane>
        </right>
      </laneSection>
    </lanes>
    <signals>
      <signal id="7" s="55" t="-2" zOffset="4.5" name="sig" dynamic="yes" orientation="+" type="1000001" subtype="-1" country="OpenDRIVE" value="0" height="0.8" width="0.5">
        <validity fromLane="-1" toLane="-1"/>
      </signal>
    </signals>
  </road>
  <road name="b" length="60" id="2" junction="-1">
    <link>
      <predecessor elementType="road" elementId="1" contactPoint="end"/>
      <successor elementType="road" elementId="3" contactPoint="start"/>
    </link>
    <planView><geometry s="0" x="60" y="0" hdg="0" length="60"><line/></geometry></planView>
    <lanes>
      <laneSection s="0">
        <right>
          <lane id="-1" type="driving" level="false">
            <link><predecessor id="-1"/><successor id="-1"/></link>
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
          </lane>
        </right>
      </laneSection>
    </lanes>
  </road>
  <road name="c" length="60" id="3" junction="-1">
    <link><predecessor elementType="road" elementId="2" contactPoint="end"/></link>
    <planView><geometry s="0" x="120" y="0" hdg="0" length="60"><line/></geometry></planView>
    <lanes>
      <laneSection s="0">
        <right>
          <lane id="-1" type="driving" level="false">
            <link><predecessor id="-1"/></link>
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
          </lane>
        </right>
      </laneSection>
    </lanes>
  </road>
</OpenDRIVE>`

  const stripDate = (xml: string): string => xml.replace(/date="[^"]*"/, 'date=""')

  /** Assert a verbatim unedited round trip for the given source document. */
  const expectVerbatimRoundTrip = (xml: string): void => {
    const imported = odrToShapesFull(parseOpenDriveXml(xml))
    expect(imported.sidecar.roadRecords).toBeDefined()
    const out = exportToOpenDrive(snapshotFrom(imported), { sidecar: imported.sidecar })
    const doc = extractOdrDocument(xml)!
    for (const road of doc.roads) {
      expect(out).toContain(road.text)
    }
    for (const junction of doc.junctions) {
      expect(out).toContain(junction.text)
    }
    if (doc.headerText) expect(out).toContain(doc.headerText)
    // Semantic identity: re-importing the export reproduces the original
    // lane count, edges, adjacency and signal links exactly.
    const re = importXodr(out)
    const rep = measureFidelity(imported, re)
    expect(rep.laneCountAfter).toBe(rep.laneCountBefore)
    expect(rep.matchedLanes).toBe(rep.laneCountBefore)
    expect(rep.edgesAfter).toBe(rep.edgesBefore)
    expect(rep.edgesPreserved).toBe(rep.edgesBefore)
    expect(rep.adjacencyAfter).toBe(rep.adjacencyBefore)
    expect(rep.adjacencyPreserved).toBe(rep.adjacencyBefore)
    expect(rep.trafficLightsMatched).toBe(rep.trafficLightsBefore)
    expect(rep.trafficLightAffectedPreserved).toBe(rep.trafficLightsBefore)
    expect(rep.stopLinesPreserved).toBe(rep.stopLinesBefore)
  }

  it('re-emits every road verbatim on an unedited chain round trip', () => {
    expectVerbatimRoundTrip(CHAIN_XODR)
  })

  it('re-emits the synthetic junction map verbatim (junction + validity)', () => {
    expectVerbatimRoundTrip(SYNTHETIC_XODR)
  })

  it('re-emits fabriksgatan verbatim (real-world map, two-way roads, signals)', () => {
    if (!existsSync(FABRIKSGATAN)) return
    expectVerbatimRoundTrip(readFileSync(FABRIKSGATAN, 'utf-8'))
  })

  it('re-emits two_plus_one verbatim', () => {
    if (!existsSync(TWO_PLUS_ONE)) return
    expectVerbatimRoundTrip(readFileSync(TWO_PLUS_ONE, 'utf-8'))
  })

  it('keeps <object type="parkingSpace"> verbatim for unedited roads', () => {
    // W50: parking spaces are materialized as polygons only; the source
    // <object> stays in the road's verbatim XML and re-emits unchanged when the
    // road is not edited. The polygon does not participate in the road state
    // hash, so importing it must not force regeneration of the carrying road.
    const parkingFixture = join(FIXTURES, 'parking_demo.xodr')
    if (!existsSync(parkingFixture)) return
    const xml = readFileSync(parkingFixture, 'utf-8')
    const imported = odrToShapesFull(parseOpenDriveXml(xml))
    // Repeated parkingSpace objects expand into many polygon instances, but the
    // source <object>s stay verbatim in the sidecar (only the polygons multiply).
    expect((imported.parkingSpaces ?? []).length).toBeGreaterThan(7)
    const out = exportToOpenDrive(snapshotFrom(imported), { sidecar: imported.sidecar })
    // Every original parkingSpace object survives the unedited round trip.
    const before = (xml.match(/type="parkingSpace"/g) || []).length
    const after = (out.match(/type="parkingSpace"/g) || []).length
    expect(after).toBe(before)
  })

  it('regenerates only the edited road and keeps its original id', () => {
    const imported = odrToShapesFull(parseOpenDriveXml(CHAIN_XODR))
    const records = imported.sidecar.roadRecords!
    // Nudge an interior boundary point of road 2's lane sideways (~1.8 m).
    const laneId = records['2'].laneShapeIds[0]
    const lane = imported.lanes.find(l => l.id === laneId)!
    const ls = imported.linestrings.find(l => l.id === lane.leftBoundaryId)!
    const midPid = ls.pointIds[Math.floor(ls.pointIds.length / 2)]
    const pt = imported.points.find(p => p.id === midPid)!
    pt.y += 30

    const out = exportToOpenDrive(snapshotFrom(imported), { sidecar: imported.sidecar })
    const doc = extractOdrDocument(CHAIN_XODR)!
    const road = (id: string) => doc.roads.find(r => r.id === id)!
    expect(out).toContain(road('1').text)
    expect(out).toContain(road('3').text)
    expect(out).not.toContain(road('2').text)
    // The regenerated bundle covers exactly road 2's lane set -> id reuse,
    // so the verbatim neighbours' links stay valid without rewriting.
    expect(out).toMatch(/<road [^>]*id="2"/)

    const re = importXodr(out)
    expect(re.lanes.length).toBe(3)
    const rep = measureFidelity(imported, re)
    expect(rep.matchedLanes).toBe(3)
    expect(rep.edgesPreserved).toBe(rep.edgesBefore)
    expect(rep.edgesBefore).toBe(2)
    // The edit survived: some re-imported boundary point sits near the
    // nudged position (lane 2's left boundary originally ran along y = 0).
    const moved = re.points.some(
      p => Math.abs(p.y - pt.y) < 10 && Math.abs(p.x - pt.x) < 100
    )
    expect(moved).toBe(true)
  })

  it('moving a traffic light regenerates only its carrying road', () => {
    const imported = odrToShapesFull(parseOpenDriveXml(CHAIN_XODR))
    const tl = imported.trafficLights[0]
    expect(tl).toBeDefined()
    tl.x += 50

    const out = exportToOpenDrive(snapshotFrom(imported), { sidecar: imported.sidecar })
    const doc = extractOdrDocument(CHAIN_XODR)!
    const road = (id: string) => doc.roads.find(r => r.id === id)!
    expect(out).not.toContain(road('1').text)
    expect(out).toContain(road('2').text)
    expect(out).toContain(road('3').text)
    // The regenerated signal id starts above the original signal id space.
    expect(out).toMatch(/<signal [^>]*id="8"/)
    const re = importXodr(out)
    const rep = measureFidelity(imported, re)
    expect(rep.matchedLanes).toBe(3)
    expect(rep.edgesPreserved).toBe(rep.edgesBefore)
    expect(rep.trafficLightsMatched).toBe(1)
    expect(rep.trafficLightAffectedPreserved).toBe(1)
  })

  it('regenerates a junction but keeps clean incoming/outgoing roads, re-pointing their junction links', () => {
    const imported = odrToShapesFull(parseOpenDriveXml(SYNTHETIC_XODR))
    const records = imported.sidecar.roadRecords!
    // Nudge an interior boundary point of out_b (road 3).
    const laneId = records['3'].laneShapeIds[0]
    const lane = imported.lanes.find(l => l.id === laneId)!
    const ls = imported.linestrings.find(l => l.id === lane.leftBoundaryId)!
    const midPid = ls.pointIds[Math.floor(ls.pointIds.length / 2)]
    imported.points.find(p => p.id === midPid)!.y += 20

    const out = exportToOpenDrive(snapshotFrom(imported), { sidecar: imported.sidecar })
    const doc = extractOdrDocument(SYNTHETIC_XODR)!
    const road = (id: string) => doc.roads.find(r => r.id === id)!
    const stripIds = (s: string): string => s.replace(/elementId="[^"]*"/g, 'elementId=""')
    // Roads 1 / 2 / 4 stay verbatim except their junction link elementIds,
    // which are re-pointed at the regenerated junction.
    for (const rid of ['1', '2', '4']) {
      expect(stripIds(out)).toContain(stripIds(road(rid).text))
    }
    // The dirty road and the junction's connecting roads regenerate.
    expect(out).not.toContain(road('3').text)
    expect(stripIds(out)).not.toContain(stripIds(road('5').text))
    // The original junction element is replaced.
    const junction = doc.junctions.find(j => j.id === '10')!
    expect(out).not.toContain(junction.text)
    expect(out).toMatch(/<junction /)
    // Semantic identity through re-import: all lanes and junction edges.
    const re = importXodr(out)
    const rep = measureFidelity(imported, re)
    expect(rep.matchedLanes).toBe(rep.laneCountBefore)
    expect(rep.edgesPreserved).toBe(rep.edgesBefore)
  })

  it('keeps the no-sidecar behavior unchanged (regression guard)', () => {
    const imported = odrToShapesFull(parseOpenDriveXml(CHAIN_XODR))
    const snapshot = snapshotFrom(imported)
    const base = stripDate(exportToOpenDrive(snapshot))
    expect(stripDate(exportToOpenDrive(snapshot, {}))).toBe(base)
    expect(stripDate(exportToOpenDrive(snapshot, { sidecar: null }))).toBe(base)
    // A legacy sidecar without road records also falls back to full regeneration.
    const legacy = { ...imported.sidecar }
    delete legacy.roadRecords
    expect(stripDate(exportToOpenDrive(snapshot, { sidecar: legacy }))).toBe(base)
  })

  it('rewrites only road link elementIds in verbatim blocks', () => {
    const doc = extractOdrDocument(CHAIN_XODR)!
    const road1 = doc.roads.find(r => r.id === '1')!
    const rewritten = rewriteRoadLinkTargets(road1.text, new Map([['2', '99']]))
    expect(rewritten).toContain('elementId="99"')
    expect(rewritten.replace('elementId="99"', 'elementId="2"')).toBe(road1.text)
    // No mapping -> byte-identical.
    expect(rewriteRoadLinkTargets(road1.text, new Map())).toBe(road1.text)
  })

  // -------------------------------------------------------------------------
  // Generational decay guards (issue #628 R1)
  //
  // A single edit used to bleed information out of the document on every
  // subsequent import/export cycle: controllers vanished outright, and roads
  // whose lanes re-bundled lost their original ids. These pin the fixed
  // behaviour on a fixture carrying a micro (0.2 m) road, a junction, a
  // controller and signals.
  // -------------------------------------------------------------------------
  const MICRO_FIXTURE = join(FIXTURES, 'micro_road_junction.xodr')

  /** Nudge one interior boundary point of the first lane (~an edit). */
  const editFirstLane = (imported: ReturnType<typeof odrToShapesFull>): void => {
    const lane = imported.lanes[0]
    const ls = imported.linestrings.find(l => l.id === lane.leftBoundaryId)!
    const pid = ls.pointIds[Math.floor(ls.pointIds.length / 2)]
    imported.points.find(p => p.id === pid)!.y += 30
  }

  it('keeps a road with no materialized lanes (micro road) verbatim', () => {
    const xml = readFileSync(MICRO_FIXTURE, 'utf-8')
    const imported = odrToShapesFull(parseOpenDriveXml(xml))
    // Road 4 is 0.2 m: below the importer's minimum section length, so it
    // materializes no lane shapes at all.
    expect(imported.sidecar.roadRecords!['4'].laneShapeIds).toEqual([])
    // It is not editable, so it must survive verbatim even when a neighbour
    // is edited (it used to drag its neighbours down as an "unrecorded" ref).
    editFirstLane(imported)
    const out = exportToOpenDrive(snapshotFrom(imported), { sidecar: imported.sidecar })
    const micro = extractOdrDocument(xml)!.roads.find(r => r.id === '4')!
    expect(out).toContain(micro.text)
  })

  it('keeps a controller when only some of its signals regenerate', () => {
    const xml = readFileSync(MICRO_FIXTURE, 'utf-8')
    const imported = odrToShapesFull(parseOpenDriveXml(xml))
    // Controller membership is parsed and carried on the imported lights, so
    // the grouping survives even for regenerated signals.
    expect(imported.trafficLights.map(t => t.controllerId)).toEqual(['900', '900'])

    editFirstLane(imported)
    const out = exportToOpenDrive(snapshotFrom(imported), { sidecar: imported.sidecar })
    // Controller 900 used to be dropped entirely because signal 500's road
    // was edited; it must survive and still cover both signals.
    const controllers = extractOdrDocument(out)!.controllers
    expect(controllers.length).toBe(1)
    expect(controllers[0].id).toBe('900')
    expect(controllers[0].signalIds.length).toBe(2)
  })

  it('preserves every original road id and name across three generations', () => {
    const xml = readFileSync(MICRO_FIXTURE, 'utf-8')
    const source = extractOdrDocument(xml)!
    const sourceIds = source.roads.map(r => r.id)

    let current = xml
    for (let generation = 1; generation <= 3; generation++) {
      const imported = odrToShapesFull(parseOpenDriveXml(current))
      if (generation === 1) editFirstLane(imported)
      current = exportToOpenDrive(snapshotFrom(imported), { sidecar: imported.sidecar })

      const doc = extractOdrDocument(current)!
      const emittedIds = new Set(doc.roads.map(r => r.id))
      // Every source road id still present — no re-allocation at any depth.
      for (const id of sourceIds) {
        expect(emittedIds, `generation ${generation} lost road id ${id}`).toContain(id)
      }
      // The controller survives every generation too.
      expect(doc.controllers.length, `generation ${generation} lost the controller`).toBe(1)
    }
    // The edited road regenerates but keeps its original <road name>.
    expect(current).toMatch(/<road name="west_approach"[^>]*id="1"/)
  })

  it('keeps an unedited round trip fully verbatim on the micro fixture', () => {
    expectVerbatimRoundTrip(readFileSync(MICRO_FIXTURE, 'utf-8'))
  })
})
