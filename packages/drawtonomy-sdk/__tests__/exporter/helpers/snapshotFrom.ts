// Wrap ImportedShapes into a DrawtonomySnapshot, the way the editor does
// after an import. Shared by the exporter round-trip suites.

import type { ImportedShapes } from '../../../src/exporter/odrToShapes'
import type { DrawtonomySnapshot } from '../../../src/types'

export function snapshotFrom(imported: ImportedShapes): DrawtonomySnapshot {
  const shapes: unknown[] = []
  for (const p of imported.points) {
    shapes.push({
      id: p.id, type: 'point', x: p.x, y: p.y, rotation: 0, zIndex: 0,
      props: { color: 'black', visible: true, osmId: p.osmId },
    })
  }
  for (const ls of imported.linestrings) {
    shapes.push({
      id: ls.id, type: 'linestring', x: ls.x, y: ls.y, rotation: 0, zIndex: 0,
      props: {
        pointIds: ls.pointIds, color: 'black', strokeWidth: 2,
        attributes: ls.attributes, osmId: ls.osmId,
      },
    })
  }
  for (const lane of imported.lanes) {
    shapes.push({
      id: lane.id, type: 'lane', x: lane.x, y: lane.y, rotation: 0, zIndex: 0,
      props: {
        leftBoundaryId: lane.leftBoundaryId, rightBoundaryId: lane.rightBoundaryId,
        invertLeft: lane.invertLeft, invertRight: lane.invertRight,
        color: 'default', size: 'm', attributes: lane.attributes,
        next: lane.next, prev: lane.prev, osmId: lane.osmId,
        ...(lane.yieldLaneIds ? { yieldLaneIds: lane.yieldLaneIds } : {}),
      },
    })
  }
  for (const tl of imported.trafficLights) {
    shapes.push({
      id: tl.id, type: 'traffic_light', x: tl.x, y: tl.y, rotation: 0, zIndex: 0,
      props: {
        w: tl.w, h: tl.h, color: 'default', style: '', attributes: tl.attributes,
        osmId: tl.osmId, affectedLaneIds: tl.affectedLaneIds,
        stopLineId: tl.stopLineId, controllerId: tl.controllerId ?? '',
      },
    })
  }
  for (const ts of imported.trafficSigns ?? []) {
    shapes.push({
      id: ts.id, type: 'traffic_sign', x: ts.x, y: ts.y, rotation: 0, zIndex: 0,
      props: {
        w: ts.w, h: ts.h, color: 'default', attributes: ts.attributes,
        osmId: ts.osmId, affectedLaneIds: ts.affectedLaneIds, stopLineId: ts.stopLineId,
      },
    })
  }
  for (const cw of imported.crosswalks ?? []) {
    shapes.push({
      id: cw.id, type: 'crosswalk', x: cw.x, y: cw.y, rotation: 0, zIndex: 0,
      props: {
        startX: cw.startX, startY: cw.startY, endX: cw.endX, endY: cw.endY,
        crosswalkWidth: cw.crosswalkWidth, color: 'default', attributes: cw.attributes,
        osmId: cw.osmId, affectedLaneIds: cw.affectedLaneIds, stopLineId: cw.stopLineId,
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
