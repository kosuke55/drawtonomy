// A chain of J junctions, for the re-planning cost tests.
//
// Junction k's connecting road is junction k+1's INCOMING road, so a
// rejection at k only becomes visible once k-1 has been seeded — the shape
// that made the plan / build fixpoint cost one full round per junction.

import type { ImportedShapes } from '../../../src/exporter/odrToShapes'

/**
 * A chain of J junctions. Junction k has incoming road (the previous
 * connecting road) and its own connecting road, which is in turn the incoming
 * road of junction k+1 — so a rejection at k only becomes visible once k-1 has
 * been seeded.
 *
 * Every road is a straight 40 m two-lane segment, so the geometry is trivial
 * and the cost measured is the planning, not the fitting.
 */
export function chainXodr(junctionCount: number): string {
  const parts: string[] = [
    `<?xml version="1.0"?>`,
    `<OpenDRIVE>`,
    `  <header revMajor="1" revMinor="6" name="chain">`,
    `    <geoReference><![CDATA[+proj=tmerc +lat_0=35.0 +lon_0=139.0 +datum=WGS84]]></geoReference>`,
    `  </header>`,
  ]
  const lanes = (withLinks: boolean): string =>
    `    <lanes>
      <laneSection s="0">
        <right>
          <lane id="-1" type="driving" level="false">
${withLinks ? `            <link><predecessor id="-1"/><successor id="-1"/></link>` : ''}
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
          </lane>
          <lane id="-2" type="driving" level="false">
${withLinks ? `            <link><predecessor id="-2"/><successor id="-2"/></link>` : ''}
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
          </lane>
        </right>
      </laneSection>
    </lanes>`

  // One head mainline, then a chain of connecting roads laid end to end.
  // Junction k's connecting road is junction k+1's INCOMING road, so a
  // rejection at k only becomes visible once k-1 has been seeded.
  parts.push(
    `  <road name="head" length="40" id="0" junction="-1">`,
    `    <link><successor elementType="junction" elementId="2000"/></link>`,
    `    <planView><geometry s="0" x="0" y="0" hdg="0" length="40"><line/></geometry></planView>`,
    lanes(false),
    `  </road>`
  )
  for (let k = 0; k < junctionCount; k++) {
    const id = 1000 + k
    const prev = k === 0 ? 0 : 1000 + k - 1
    const x = (k + 1) * 40
    parts.push(
      `  <road name="conn${k}" length="40" id="${id}" junction="${2000 + k}">`,
      `    <link>`,
      `      <predecessor elementType="road" elementId="${prev}" contactPoint="end"/>`,
      k + 1 < junctionCount
        ? `      <successor elementType="road" elementId="${1000 + k + 1}" contactPoint="start"/>`
        : `      <successor elementType="road" elementId="${9999}" contactPoint="start"/>`,
      `    </link>`,
      `    <planView><geometry s="0" x="${x}" y="0" hdg="0" length="40"><line/></geometry></planView>`,
      lanes(true),
      `  </road>`
    )
  }
  // Tail mainline so the last connecting road has somewhere to go.
  parts.push(
    `  <road name="tail" length="40" id="9999" junction="-1">`,
    `    <link><predecessor elementType="junction" elementId="${2000 + junctionCount - 1}"/></link>`,
    `    <planView><geometry s="0" x="${(junctionCount + 1) * 40}" y="0" hdg="0" length="40"><line/></geometry></planView>`,
    lanes(false),
    `  </road>`
  )
  for (let k = 0; k < junctionCount; k++) {
    const incoming = k === 0 ? 0 : 1000 + k - 1
    parts.push(
      `  <junction name="j${k}" id="${2000 + k}">`,
      `    <connection id="0" incomingRoad="${incoming}" connectingRoad="${1000 + k}" contactPoint="start">`,
      `      <laneLink from="-1" to="-1"/>`,
      `      <laneLink from="-2" to="-2"/>`,
      `    </connection>`,
      `  </junction>`
    )
  }
  parts.push(`</OpenDRIVE>`)
  return parts.join('\n')
}

/**
 * Replace the first lane's right boundary with a DIFFERENT linestring id over
 * the same points, on every connecting road. The coordinates are unchanged, so
 * the road hashes still match, but the lane partition sees new boundary ids.
 */
export function reidentifyConnectingBoundaries(imported: ImportedShapes, junctionCount: number): void {
  let nextId = 900000
  for (let k = 0; k < junctionCount; k++) {
    const rec = imported.sidecar.roadRecords![String(1000 + k)]
    if (!rec) continue
    const lane = imported.lanes.find(l => l.id === rec.laneShapeIds[0])
    if (!lane) continue
    const src = imported.linestrings.find(l => l.id === lane.rightBoundaryId)
    if (!src) continue
    const clone = { ...src, id: `ls_clone_${nextId++}`, pointIds: [...src.pointIds] }
    imported.linestrings.push(clone)
    lane.rightBoundaryId = clone.id
  }
}

