// Layer 2: reference integrity (`ref.*`).
//
// OpenDRIVE is a graph encoded as a flat list of elements wired together by
// id. The importer resolves those ids best-effort and drops what it cannot
// find, which means a document can lose whole connections without complaint.
// This layer resolves every cross-reference explicitly and reports the ones
// that point at nothing.
//
// Checked here:
//   ref.dangling-road-link         <road><link><predecessor|successor> target
//   ref.dangling-connection-road   <connection incomingRoad|connectingRoad>
//   ref.dangling-lane-link         <lane><link> target lane id
//   ref.dangling-controller-signal <controller><control signalId>
//   ref.duplicate-road-id / ref.duplicate-junction-id
//   ref.road-junction-unknown      road@junction naming no <junction>
//
// The complementary direction — a junction that does not list a road claiming
// membership — is layer 3, since it is about junction structure rather than a
// broken pointer.

import type {
  OdrLaneSection,
  OdrMap,
  OdrRoad,
  OdrRoadLink,
} from '../../exporter/opendriveParser.js'
import type { OdrFinding } from '../types.js'

/** All lane ids present in a lane section (both sides plus centre). */
function laneIdsOf(section: OdrLaneSection): Set<number> {
  const ids = new Set<number>()
  for (const lane of [...section.left, ...section.center, ...section.right]) ids.add(lane.id)
  return ids
}

/**
 * The lane section a road-level link lands on. `predecessor` links attach to
 * the *first* lane section of the target when the contact point is its start
 * and to the last when it is its end (and vice versa for `successor`).
 */
function contactSection(road: OdrRoad, contact: 'start' | 'end'): OdrLaneSection | null {
  if (road.laneSections.length === 0) return null
  return contact === 'start' ? road.laneSections[0] : road.laneSections[road.laneSections.length - 1]
}

export function checkReferences(map: OdrMap): OdrFinding[] {
  const findings: OdrFinding[] = []

  const roadById = new Map<string, OdrRoad>()
  for (const road of map.roads) {
    if (roadById.has(road.id)) {
      findings.push({
        severity: 'error',
        category: 'MAP_DEFECT',
        rule: 'ref.duplicate-road-id',
        message: `road id "${road.id}" is used by more than one <road>`,
        location: { roadId: road.id },
      })
      continue
    }
    roadById.set(road.id, road)
  }

  const junctionIds = new Set<string>()
  for (const junction of map.junctions) {
    if (junctionIds.has(junction.id)) {
      findings.push({
        severity: 'error',
        category: 'MAP_DEFECT',
        rule: 'ref.duplicate-junction-id',
        message: `junction id "${junction.id}" is used by more than one <junction>`,
        location: { junctionId: junction.id },
      })
      continue
    }
    junctionIds.add(junction.id)
  }

  // Every signal id defined anywhere in the document (controllers may govern
  // signals on any road).
  const signalIds = new Set<string>()
  for (const road of map.roads) {
    for (const signal of road.signals) signalIds.add(signal.id)
  }

  // --- road <link> targets -------------------------------------------------
  const checkRoadLink = (road: OdrRoad, link: OdrRoadLink | undefined, which: 'predecessor' | 'successor'): void => {
    if (!link) return
    if (link.elementId === '') {
      findings.push({
        severity: 'error',
        category: 'MAP_DEFECT',
        rule: 'ref.dangling-road-link',
        message: `road ${road.id} <${which}> has an empty elementId`,
        location: { roadId: road.id },
      })
      return
    }
    if (link.elementType === 'road') {
      if (!roadById.has(link.elementId)) {
        findings.push({
          severity: 'error',
          category: 'MAP_DEFECT',
          rule: 'ref.dangling-road-link',
          message: `road ${road.id} <${which}> points at road "${link.elementId}", which does not exist`,
          location: { roadId: road.id },
        })
      }
      return
    }
    if (!junctionIds.has(link.elementId)) {
      // A road linking to an absent *junction* is reported as a warning, not
      // an error, because it is the signature of a legitimately excerpted map:
      // cutting one junction out of a city map leaves its boundary roads
      // pointing at the junctions that were left behind. (The checked-in
      // town04-junction106 fixture is exactly this — a Town04 slice whose four
      // boundary roads reference junctions 252/281/741/773 outside the slice.)
      // A link to an absent *road* stays an error: nothing legitimate produces
      // one, since a road is a leaf, not a cut point.
      findings.push({
        severity: 'warning',
        category: 'MAP_DEFECT',
        rule: 'ref.unresolved-junction-link',
        message: `road ${road.id} <${which}> points at junction "${link.elementId}", which this document does not define (expected if the map is an excerpt)`,
        location: { roadId: road.id, junctionId: link.elementId },
      })
    }
  }

  for (const road of map.roads) {
    checkRoadLink(road, road.predecessor, 'predecessor')
    checkRoadLink(road, road.successor, 'successor')

    // road@junction must name a junction that exists ("-1" = not in a junction).
    // Same excerpt caveat as the junction link above: warning, not error.
    if (road.junction !== '' && road.junction !== '-1' && !junctionIds.has(road.junction)) {
      findings.push({
        severity: 'warning',
        category: 'MAP_DEFECT',
        rule: 'ref.road-junction-unknown',
        message: `road ${road.id} declares junction="${road.junction}", but this document defines no such <junction>`,
        location: { roadId: road.id, junctionId: road.junction },
      })
    }
  }

  // --- junction connection road references ---------------------------------
  for (const junction of map.junctions) {
    for (const conn of junction.connections) {
      for (const [attr, value] of [
        ['incomingRoad', conn.incomingRoad],
        ['connectingRoad', conn.connectingRoad],
      ] as const) {
        if (value === '') {
          findings.push({
            severity: 'error',
            category: 'MAP_DEFECT',
            rule: 'ref.dangling-connection-road',
            message: `junction ${junction.id} connection ${conn.id} has no ${attr}`,
            location: { junctionId: junction.id },
          })
          continue
        }
        if (!roadById.has(value)) {
          findings.push({
            severity: 'error',
            category: 'MAP_DEFECT',
            rule: 'ref.dangling-connection-road',
            message: `junction ${junction.id} connection ${conn.id} ${attr}="${value}" refers to a road that does not exist`,
            location: { junctionId: junction.id, roadId: value },
          })
        }
      }
    }
  }

  // --- lane <link> targets -------------------------------------------------
  //
  // Within a road, a lane's successor names a lane of the *next* lane section
  // and its predecessor a lane of the previous one. Only the outermost links
  // (successor of the last section, predecessor of the first) cross into the
  // linked road, and then only when that link is road-typed: links into a
  // junction are resolved through the junction's laneLinks instead, so a lane
  // id that does not exist in the incoming road is not checkable here.
  for (const road of map.roads) {
    const sections = road.laneSections
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i]
      const lanes = [...section.left, ...section.center, ...section.right]

      const targetIds = (
        side: 'predecessor' | 'successor'
      ): { ids: Set<number>; where: string } | null => {
        const inner = side === 'predecessor' ? i - 1 : i + 1
        if (inner >= 0 && inner < sections.length) {
          return {
            ids: laneIdsOf(sections[inner]),
            where: `lane section ${inner} of road ${road.id}`,
          }
        }
        const link = side === 'predecessor' ? road.predecessor : road.successor
        if (!link || link.elementType !== 'road') return null
        const target = roadById.get(link.elementId)
        if (!target) return null // already reported as a dangling road link
        // Default contact point for a successor is the target's start, for a
        // predecessor its end (ASAM OpenDRIVE 1.8 §9.2).
        const contact = link.contactPoint ?? (side === 'successor' ? 'start' : 'end')
        const targetSection = contactSection(target, contact)
        if (!targetSection) return null
        return {
          ids: laneIdsOf(targetSection),
          where: `road ${target.id} at its ${contact}`,
        }
      }

      for (const side of ['predecessor', 'successor'] as const) {
        const target = targetIds(side)
        if (!target) continue
        for (const lane of lanes) {
          const linked = side === 'predecessor' ? lane.predecessorIds : lane.successorIds
          for (const id of linked) {
            if (!target.ids.has(id)) {
              findings.push({
                severity: 'error',
                category: 'MAP_DEFECT',
                rule: 'ref.dangling-lane-link',
                message: `road ${road.id} lane section ${i} lane ${lane.id} <${side}> names lane ${id}, which does not exist in ${target.where}`,
                location: { roadId: road.id, laneId: lane.id, s: section.s },
              })
            }
          }
        }
      }
    }
  }

  // --- controller signal references ----------------------------------------
  for (const controller of map.controllers) {
    for (const control of controller.controls) {
      if (!signalIds.has(control.signalId)) {
        findings.push({
          severity: 'error',
          category: 'MAP_DEFECT',
          rule: 'ref.dangling-controller-signal',
          message: `controller ${controller.id} governs signal "${control.signalId}", which no road defines`,
        })
      }
    }
  }

  // --- signalReference targets ---------------------------------------------
  for (const road of map.roads) {
    for (const ref of road.signalReferences) {
      if (!signalIds.has(ref.id)) {
        findings.push({
          severity: 'error',
          category: 'MAP_DEFECT',
          rule: 'ref.dangling-signal-reference',
          message: `road ${road.id} <signalReference id="${ref.id}"> refers to a signal that no road defines`,
          location: { roadId: road.id, s: ref.s },
        })
      }
    }
  }

  return findings
}
