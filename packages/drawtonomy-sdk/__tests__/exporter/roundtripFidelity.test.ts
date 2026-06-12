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
//   Fix E — boundary-alignment snapping never merges a lane's own start and
//           end clusters, so sub-epsilon connecting lanes survive export.
//
// Real-world fixtures: esmini's fabriksgatan.xodr / two_plus_one.xodr ship in
// __tests__/fixtures. A real Lanelet2 map can additionally be supplied via
// the ROUNDTRIP_LANELET2_OSM environment variable (path to a .osm file);
// those tests are skipped when the variable is unset.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseOpenDriveXml } from '../../src/exporter/opendriveParser'
import { odrToShapes } from '../../src/exporter/odrToShapes'
import { exportToOpenDrive } from '../../src/exporter/opendrive'
import { exportToLanelet2 } from '../../src/exporter/lanelet2'
import { parseOsmXml } from '../../src/exporter/osmParser'
import { osmToShapes, type ImportedShapes } from '../../src/exporter/osmToShapes'
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
 *   (a multi-lane signal: OpenDRIVE <validity> can only attach to one road
 *   in the 1-lane-per-road export model, so this exercises that loss)
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
 * OpenDRIVE roads in the 1-lane-per-road export are always one-directional,
 * so the bidirectional flag is lost through an xodr round trip.
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
      expectAttributesPreserved(r, ['type', 'subtype', 'odr_type', 'one_way'])
    }
  })

  // Fix B: the exporter emits one <road> per lane with its own reference
  // line, so re-import would create fresh boundary linestrings per road;
  // odrToShapes dedupes geometrically identical boundary linestrings so
  // left/right adjacency (shared boundary linestrings) survives.
  it('preserves left/right adjacency (Fix B: dedupe shared boundaries)', () => {
    for (const { name, imported } of fixtures) {
      const r = measureFidelity(imported, viaOpenDrive(imported))
      expect(r.adjacencyBefore, `${name}: adjacency before`).toBeGreaterThan(0)
      expect(r.adjacencyPreserved, `${name}: adjacency preserved`).toBe(r.adjacencyBefore)
    }
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
  // on one road plus <signalReference> records on the other affected roads
  // (1 lane = 1 road), and the stop line rides in <userData code="stopLine">
  // on the signal; both are merged back on import.
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
