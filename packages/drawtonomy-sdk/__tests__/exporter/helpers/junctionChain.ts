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
  reidentifyBoundariesOf(imported, Array.from({ length: junctionCount }, (_, k) => String(1000 + k)))
}

/**
 * The same re-identification, on a named set of roads rather than a prefix of
 * the chain. Splitting an arbitrary subset is what makes a road the cascade
 * drags in land on a round that built no bundle for it.
 */
export function reidentifyBoundariesOf(imported: ImportedShapes, roadIds: readonly string[]): void {
  let nextId = 900000
  for (const rid of roadIds) {
    const rec = imported.sidecar.roadRecords![rid]
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

/**
 * The 8-junction chain, with junction 2002 naming only lane -1 of roads 1001 /
 * 1002, and a `<signal>` the importer never shapes on the unedited road 1002.
 *
 * This is the shape where a road broken into several bundles still keeps its
 * id, because the plan hands it to the side the table names. The signal exists
 * only in the carried text, so it survives exactly while road 1002 stays
 * verbatim — which is to say, while junction 2002 is still carried.
 */
export function partialLaneLinkChainXodr(): string {
  let xml = chainXodr(8).replace(
    `    <connection id="0" incomingRoad="1001" connectingRoad="1002" contactPoint="start">
      <laneLink from="-1" to="-1"/>
      <laneLink from="-2" to="-2"/>
    </connection>`,
    `    <connection id="0" incomingRoad="1001" connectingRoad="1002" contactPoint="start">
      <laneLink from="-1" to="-1"/>
    </connection>`
  )
  // ... so road 1002's lane -2 must not claim a predecessor the table no
  // longer links, or the input itself carries a dangling lane reference.
  const road1002 = xml.match(/ {2}<road name="conn2"[\s\S]*?<\/road>/)![0]
  xml = xml.replace(
    road1002,
    road1002.replace(
      '<link><predecessor id="-2"/><successor id="-2"/></link>',
      '<link><successor id="-2"/></link>'
    )
  )
  return withSidecarOnlySignal(xml, '1002', '500')
}

/** Swap two of a road's recorded lane shapes in the snapshot array. */
export function reverseRecordedLaneOrder(imported: ImportedShapes, roadId: string): void {
  const ids = imported.sidecar.roadRecords![roadId]?.laneShapeIds ?? []
  if (ids.length < 2) return
  const a = imported.lanes.findIndex(l => l.id === ids[0])
  const b = imported.lanes.findIndex(l => l.id === ids[1])
  if (a < 0 || b < 0) return
  ;[imported.lanes[a], imported.lanes[b]] = [imported.lanes[b], imported.lanes[a]]
}

/** Which of a connecting road's two lanes a junction's <connection> names. */
export type LaneSides = 'first' | 'second' | 'both'

export interface ChainVariantSpec {
  junctionCount: number
  /** Per junction k, the lane sides its <connection> links. */
  sides: readonly LaneSides[]
  /**
   * Junctions that get a SECOND junction naming the other side of the same
   * incoming road, through a duplicate connecting road. This is the shape the
   * merged-demand bug needed: two junctions wanting opposite sides of one road,
   * so rejecting either one must stop its side from counting.
   */
  twinAt?: readonly number[]
}

/**
 * The chain of `chainXodr`, but with each junction naming only the lane sides
 * it is told to, and optionally a twin junction on the other side.
 *
 * A lane whose side no junction names must not claim a link across that end
 * either, or the INPUT carries a dangling lane reference and the comparison is
 * measuring a broken document rather than the planner.
 */
export function chainVariantXodr(spec: ChainVariantSpec): string {
  const { junctionCount, sides, twinAt = [] } = spec
  const twins = new Set(twinAt)
  const linkedSides = (k: number): { first: boolean; second: boolean } => {
    // A road is entered by junction k and left towards junction k+1, so both
    // ends have to agree about which lanes are linked. Keep a lane's links
    // only while some junction at either end names it.
    const at = (i: number): LaneSides | undefined => (i >= 0 && i < junctionCount ? sides[i] : undefined)
    const names = (s: LaneSides | undefined, which: 'first' | 'second'): boolean =>
      s === 'both' || s === which
    const here = at(k)
    const next = at(k + 1)
    const twinHere = twins.has(k) || twins.has(k - 1)
    return {
      first: names(here, 'first') || names(next, 'first') || twinHere,
      second: names(here, 'second') || names(next, 'second') || twinHere,
    }
  }
  const laneBlock = (first: boolean, second: boolean): string =>
    `    <lanes>
      <laneSection s="0">
        <right>
          <lane id="-1" type="driving" level="false">
${first ? `            <link><predecessor id="-1"/><successor id="-1"/></link>` : ''}
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
          </lane>
          <lane id="-2" type="driving" level="false">
${second ? `            <link><predecessor id="-2"/><successor id="-2"/></link>` : ''}
            <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
          </lane>
        </right>
      </laneSection>
    </lanes>`

  const parts: string[] = [
    `<?xml version="1.0"?>`,
    `<OpenDRIVE>`,
    `  <header revMajor="1" revMinor="6" name="chain">`,
    `    <geoReference><![CDATA[+proj=tmerc +lat_0=35.0 +lon_0=139.0 +datum=WGS84]]></geoReference>`,
    `  </header>`,
    `  <road name="head" length="40" id="0" junction="-1">`,
    `    <link><successor elementType="junction" elementId="2000"/></link>`,
    `    <planView><geometry s="0" x="0" y="0" hdg="0" length="40"><line/></geometry></planView>`,
    laneBlock(false, false),
    `  </road>`,
  ]
  for (let k = 0; k < junctionCount; k++) {
    const id = 1000 + k
    const prev = k === 0 ? 0 : 1000 + k - 1
    const x = (k + 1) * 40
    const { first, second } = linkedSides(k)
    parts.push(
      `  <road name="conn${k}" length="40" id="${id}" junction="${2000 + k}">`,
      `    <link>`,
      `      <predecessor elementType="road" elementId="${prev}" contactPoint="end"/>`,
      k + 1 < junctionCount
        ? `      <successor elementType="road" elementId="${1000 + k + 1}" contactPoint="start"/>`
        : `      <successor elementType="road" elementId="9999" contactPoint="start"/>`,
      `    </link>`,
      `    <planView><geometry s="0" x="${x}" y="0" hdg="0" length="40"><line/></geometry></planView>`,
      laneBlock(first, second),
      `  </road>`
    )
  }
  // The twin connecting roads: a copy of road 1000+k laid beside it, reached
  // by its own junction, which names the side the main junction does not.
  for (const k of twins) {
    const id = 1100 + k
    const prev = k === 0 ? 0 : 1000 + k - 1
    const x = (k + 1) * 40
    parts.push(
      `  <road name="twin${k}" length="40" id="${id}" junction="${2100 + k}">`,
      `    <link>`,
      `      <predecessor elementType="road" elementId="${prev}" contactPoint="end"/>`,
      `    </link>`,
      `    <planView><geometry s="0" x="${x}" y="-12" hdg="0" length="40"><line/></geometry></planView>`,
      laneBlock(true, true),
      `  </road>`
    )
  }
  parts.push(
    `  <road name="tail" length="40" id="9999" junction="-1">`,
    `    <link><predecessor elementType="junction" elementId="${2000 + junctionCount - 1}"/></link>`,
    `    <planView><geometry s="0" x="${(junctionCount + 1) * 40}" y="0" hdg="0" length="40"><line/></geometry></planView>`,
    laneBlock(false, false),
    `  </road>`
  )
  const laneLinks = (s: LaneSides): string[] => {
    const out: string[] = []
    if (s === 'first' || s === 'both') out.push(`      <laneLink from="-1" to="-1"/>`)
    if (s === 'second' || s === 'both') out.push(`      <laneLink from="-2" to="-2"/>`)
    return out
  }
  for (let k = 0; k < junctionCount; k++) {
    const incoming = k === 0 ? 0 : 1000 + k - 1
    parts.push(
      `  <junction name="j${k}" id="${2000 + k}">`,
      `    <connection id="0" incomingRoad="${incoming}" connectingRoad="${1000 + k}" contactPoint="start">`,
      ...laneLinks(sides[k]),
      `    </connection>`,
      `  </junction>`
    )
  }
  for (const k of twins) {
    const incoming = k === 0 ? 0 : 1000 + k - 1
    // The other side from what junction 2000+k names, so the two compete for
    // the incoming road's id.
    const other: LaneSides = sides[k] === 'first' ? 'second' : 'first'
    parts.push(
      `  <junction name="t${k}" id="${2100 + k}">`,
      `    <connection id="0" incomingRoad="${incoming}" connectingRoad="${1100 + k}" contactPoint="start">`,
      ...laneLinks(other),
      `    </connection>`,
      `  </junction>`
    )
  }
  parts.push(`</OpenDRIVE>`)
  return parts.join('\n')
}

/**
 * Add a `<signal>` the importer never shapes (unknown type) to a road, so the
 * comparison has something that exists ONLY in the carried text. It survives
 * exactly while that road stays verbatim, which is what a wrongly dropped
 * junction takes away.
 */
export function withSidecarOnlySignal(xml: string, roadId: string, signalId: string): string {
  const open = xml.match(new RegExp(`<road [^>]*\\bid="${roadId}"[^>]*>`))?.[0]
  if (!open) return xml
  return xml.replace(
    open,
    `${open}\n    <signals><signal s="10" t="-1" id="${signalId}" type="999999" dynamic="yes" orientation="+"/></signals>`
  )
}
