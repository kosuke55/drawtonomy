// Layer 3: junction consistency (`junction.*`).
//
// A junction is described twice over — once by the <junction> element listing
// its connections, and once by the roads that declare `junction="<id>"` — and
// the two descriptions have to agree. The importer reads only one side of that
// pair per question, so a junction whose <connection> records are deleted
// imports as a set of unrelated roads with no complaint at all.
//
// Checked here:
//   junction.connection-missing  a road claims junction membership but no
//                                <connection connectingRoad> names it
//   junction.road-not-member     the same defect seen from the junction: the
//                                road is not reachable from any connection
//   junction.empty               a <junction> with no connections at all
//   junction.connecting-road-unmarked  a connecting road that forgot its
//                                junction attribute
//   junction.contact-point-mismatch    contactPoint disagrees with the
//                                connecting road's own <link>
//   junction.incoming-link-missing     the incoming road does not link back
//
// Direct junctions (`<junction type="direct">`, OpenDRIVE 1.5+) are structurally
// different: they have no separate connecting road, so `linkedRoad` names an
// ordinary road that does *not* carry a junction attribute. Membership and
// contact-point rules that assume a connecting road are skipped for them.

import type { OdrJunction, OdrMap, OdrRoad } from '../../exporter/opendriveParser.js'
import type { OdrFinding } from '../types.js'

const isDirect = (junction: OdrJunction): boolean => junction.type === 'direct'

export function checkJunctions(map: OdrMap): OdrFinding[] {
  const findings: OdrFinding[] = []

  const roadById = new Map<string, OdrRoad>()
  for (const road of map.roads) {
    if (!roadById.has(road.id)) roadById.set(road.id, road)
  }
  const junctionById = new Map<string, OdrJunction>()
  for (const junction of map.junctions) {
    if (!junctionById.has(junction.id)) junctionById.set(junction.id, junction)
  }

  // Which roads each junction reaches through its connections, split by role.
  const connectingRoadsOf = new Map<string, Set<string>>()
  const incomingRoadsOf = new Map<string, Set<string>>()
  for (const junction of map.junctions) {
    const connecting = new Set<string>()
    const incoming = new Set<string>()
    for (const conn of junction.connections) {
      if (conn.connectingRoad !== '') connecting.add(conn.connectingRoad)
      if (conn.incomingRoad !== '') incoming.add(conn.incomingRoad)
    }
    connectingRoadsOf.set(junction.id, connecting)
    incomingRoadsOf.set(junction.id, incoming)
  }

  // --- empty junctions -----------------------------------------------------
  for (const junction of map.junctions) {
    if (junction.connections.length === 0) {
      findings.push({
        severity: 'error',
        category: 'MAP_DEFECT',
        rule: 'junction.empty',
        message: `junction ${junction.id} declares no <connection>; nothing can route through it`,
        location: { junctionId: junction.id },
      })
    }
  }

  // --- roads claiming membership -------------------------------------------
  //
  // A road with `junction="<id>"` is by definition a connecting road of that
  // junction and must be named by one of its connections. This is the check
  // that catches a deleted <connection>: the road survives, its claim of
  // membership survives, and only the connection that made it real is gone.
  //
  // The same broken pair can be read from either side, so exactly one finding
  // is emitted per road, choosing the rule by what the rest of the document
  // says. If the road is wired into the junction's traffic — its own <link>s
  // reach roads the junction connects — then the road was a genuine member and
  // the connection record is what went missing. If it is wired to nothing the
  // junction knows about, the membership claim itself is the wrong part.
  // Emitting both rules for one defect would double every junction count in
  // the report, which is why this is a branch and not two loops.
  for (const road of map.roads) {
    if (road.junction === '' || road.junction === '-1') continue
    const junction = junctionById.get(road.junction)
    // A junction that does not exist at all is layer 2's finding
    // (ref.road-junction-unknown); do not report it twice.
    if (!junction) continue
    if (isDirect(junction)) continue
    if (connectingRoadsOf.get(junction.id)?.has(road.id)) continue

    const junctionRoads = new Set([
      ...(connectingRoadsOf.get(junction.id) ?? []),
      ...(incomingRoadsOf.get(junction.id) ?? []),
    ])
    const wiredIntoJunction = [road.predecessor, road.successor].some(
      l =>
        l !== undefined &&
        ((l.elementType === 'junction' && l.elementId === junction.id) ||
          (l.elementType === 'road' && junctionRoads.has(l.elementId)))
    )

    if (wiredIntoJunction) {
      findings.push({
        severity: 'error',
        category: 'MAP_DEFECT',
        rule: 'junction.connection-missing',
        message: `junction ${junction.id} has no <connection> for road ${road.id}, which belongs to it and links into its roads — the connection record is missing`,
        location: { junctionId: junction.id, roadId: road.id },
      })
    } else {
      findings.push({
        severity: 'error',
        category: 'MAP_DEFECT',
        rule: 'junction.road-not-member',
        message: `road ${road.id} declares junction="${junction.id}", but no <connection> of that junction names it and it links to none of the junction's roads`,
        location: { roadId: road.id, junctionId: junction.id },
      })
    }
  }

  // --- connecting roads that forgot to declare membership ------------------
  for (const junction of map.junctions) {
    if (isDirect(junction)) continue
    for (const roadId of connectingRoadsOf.get(junction.id) ?? []) {
      const road = roadById.get(roadId)
      if (!road) continue // layer 2 reported it as a dangling connection road
      if (road.junction === junction.id) continue
      findings.push({
        severity: 'error',
        category: 'MAP_DEFECT',
        rule: 'junction.connecting-road-unmarked',
        message: `road ${roadId} is a connectingRoad of junction ${junction.id} but declares junction="${road.junction}"`,
        location: { roadId, junctionId: junction.id },
      })
    }
  }

  // --- per-connection consistency ------------------------------------------
  for (const junction of map.junctions) {
    for (const conn of junction.connections) {
      const connecting = roadById.get(conn.connectingRoad)
      const incoming = roadById.get(conn.incomingRoad)
      if (!connecting || !incoming) continue // dangling: layer 2's finding

      // The incoming road must link into this junction from one of its ends.
      // Without that link the connection is one-directional and a router
      // entering from the incoming road never discovers the junction.
      const linksHere = [incoming.predecessor, incoming.successor].some(
        l => l?.elementType === 'junction' && l.elementId === junction.id
      )
      // A direct junction's incoming road may instead link straight to the
      // linked road, which is the whole point of the construct.
      const linksToConnecting = [incoming.predecessor, incoming.successor].some(
        l => l?.elementType === 'road' && l.elementId === conn.connectingRoad
      )
      if (!linksHere && !(isDirect(junction) && linksToConnecting)) {
        findings.push({
          severity: 'warning',
          category: 'MAP_DEFECT',
          rule: 'junction.incoming-link-missing',
          message: `junction ${junction.id} connection ${conn.id}: incoming road ${conn.incomingRoad} has no <link> pointing at this junction`,
          location: { junctionId: junction.id, roadId: conn.incomingRoad },
        })
      }

      if (isDirect(junction)) continue

      // contactPoint names the end of the connecting road that meets the
      // incoming road, so the connecting road's link at that end must be the
      // incoming road (directly, or via this junction).
      const endLink = conn.contactPoint === 'start' ? connecting.predecessor : connecting.successor
      if (!endLink) {
        findings.push({
          severity: 'warning',
          category: 'MAP_DEFECT',
          rule: 'junction.contact-point-mismatch',
          message: `junction ${junction.id} connection ${conn.id}: connecting road ${conn.connectingRoad} has no <${conn.contactPoint === 'start' ? 'predecessor' : 'successor'}> at its declared contactPoint="${conn.contactPoint}"`,
          location: { junctionId: junction.id, roadId: conn.connectingRoad },
        })
        continue
      }
      const pointsAtIncoming =
        (endLink.elementType === 'road' && endLink.elementId === conn.incomingRoad) ||
        (endLink.elementType === 'junction' && endLink.elementId === junction.id)
      if (!pointsAtIncoming) {
        findings.push({
          severity: 'warning',
          category: 'MAP_DEFECT',
          rule: 'junction.contact-point-mismatch',
          message: `junction ${junction.id} connection ${conn.id}: connecting road ${conn.connectingRoad} contactPoint="${conn.contactPoint}" but its link there points at ${endLink.elementType} ${endLink.elementId}, not incoming road ${conn.incomingRoad}`,
          location: { junctionId: junction.id, roadId: conn.connectingRoad },
        })
      }
    }
  }

  return findings
}
