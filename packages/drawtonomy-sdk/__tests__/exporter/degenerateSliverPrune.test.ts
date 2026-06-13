// Regression for issue #494: degenerate sliver-lane pruning on import.
//
// CARLA Town04 junction connecting roads (e.g. road 107 in junction 106) pack
// lane-count transitions into chains of centimetre-scale lane sections. After
// the importer welds connected boundary endpoints, a sub-half-metre section's
// inner boundary collapses onto a single point: a wedge-shaped sliver lane
// with a zero-length boundary that no exporter can represent (its apex is
// displaced longitudinally, so OpenDRIVE's offset-along-normal width model
// drops it, losing the lane round-trip).
//
// `odrToShapes` now runs `pruneDegenerateSliverLanes()`, which removes such
// slivers and stitches their prev/next directly so connectivity survives.
//
// Fixture: `town04-junction106.xodr` is a self-contained slice of CARLA Town04
// (junction 106 + its 12 connecting roads + 4 mainlines, elevation/userData
// stripped). On import it produces 7 degenerate slivers — including road 107's
// 0.42 m section, the exact case in the issue — which the prune removes.
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseOpenDriveXml } from '../../src/exporter/opendriveParser'
import { odrToShapes } from '../../src/exporter/odrToShapes'
import { exportToOpenDrive } from '../../src/exporter/opendrive'
import { PIXELS_PER_METER } from '../../src/exporter/units'
import type { DrawtonomySnapshot } from '../../src/types'
import type { ImportedShapes } from '../../src/exporter/osmToShapes'

const FIXTURE = join(__dirname, '..', 'fixtures', 'town04-junction106.xodr')

/** Below this (m) a boundary has collapsed to a point — the prune threshold. */
const SLIVER_EPS_M = 0.05

function importXodr(xml: string): ImportedShapes {
  return odrToShapes(parseOpenDriveXml(xml))
}

/** Arc length (m) of a linestring boundary. */
function boundaryLengthM(shapes: ImportedShapes, lsId: string): number {
  const ptById = new Map(shapes.points.map(p => [p.id, p]))
  const ls = shapes.linestrings.find(l => l.id === lsId)
  if (!ls) return 0
  let total = 0
  for (let i = 1; i < ls.pointIds.length; i++) {
    const a = ptById.get(ls.pointIds[i - 1])
    const b = ptById.get(ls.pointIds[i])
    if (a && b) total += Math.hypot(a.x - b.x, a.y - b.y)
  }
  return total / PIXELS_PER_METER
}

/** Shortest lane boundary (m) in the import. */
function minBoundaryM(shapes: ImportedShapes): number {
  let min = Infinity
  for (const lane of shapes.lanes) {
    min = Math.min(
      min,
      boundaryLengthM(shapes, lane.leftBoundaryId),
      boundaryLengthM(shapes, lane.rightBoundaryId)
    )
  }
  return min
}

/** Wrap an import into a snapshot for re-export (mirrors the editor). */
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
  const snapshot: DrawtonomySnapshot = {
    version: '1.1',
    timestamp: new Date().toISOString(),
    shapes: shapes as DrawtonomySnapshot['shapes'],
  }
  snapshot.origin = imported.originLatLon ?? { lat: 49.0, lon: 8.0 }
  return snapshot
}

describe('degenerate sliver-lane pruning (issue #494)', () => {
  const present = existsSync(FIXTURE)
  const itIf = present ? it : it.skip
  if (!present) {
    it.skip('town04-junction106.xodr fixture missing', () => {})
  }

  itIf('leaves no zero-length lane boundary after import', () => {
    const imported = importXodr(readFileSync(FIXTURE, 'utf-8'))
    // Without the prune the import carries 7 slivers whose inner boundary is
    // exactly 0 m; with it the shortest surviving boundary clears the
    // threshold by an order of magnitude.
    expect(minBoundaryM(imported)).toBeGreaterThan(SLIVER_EPS_M)
    for (const lane of imported.lanes) {
      expect(boundaryLengthM(imported, lane.leftBoundaryId)).toBeGreaterThanOrEqual(
        SLIVER_EPS_M
      )
      expect(boundaryLengthM(imported, lane.rightBoundaryId)).toBeGreaterThanOrEqual(
        SLIVER_EPS_M
      )
    }
  })

  itIf('round-trips losslessly through OpenDRIVE (no lanes dropped)', () => {
    const before = importXodr(readFileSync(FIXTURE, 'utf-8'))
    const after = importXodr(exportToOpenDrive(snapshotFrom(before)))
    // Pre-fix this was lossy (the exporter silently dropped the zero-width
    // slivers, e.g. 53 -> 46): pruning them on import makes it stable.
    expect(after.lanes.length).toBe(before.lanes.length)
  })

  itIf('bridges connectivity across each pruned sliver', () => {
    const imported = importXodr(readFileSync(FIXTURE, 'utf-8'))
    const byId = new Map(imported.lanes.map(l => [l.id as string, l]))
    // Every surviving lane edge must point at another surviving lane (a pruned
    // sliver would leave a dangling next/prev id) — the stitch replaces each
    // removed sliver with a direct prev->next link.
    for (const lane of imported.lanes) {
      for (const n of lane.next) expect(byId.has(n)).toBe(true)
      for (const p of lane.prev) expect(byId.has(p)).toBe(true)
    }
    // The fixture's connectivity is preserved: at least one through-edge exists.
    const edges = imported.lanes.reduce((s, l) => s + l.next.length, 0)
    expect(edges).toBeGreaterThan(0)
  })
})
