// Element scans must stop at their own element.
//
// `<tag [^>]*(?:/>|>...</tag>)` looks like it handles both forms, but the
// attribute run is greedy and `>` only ends it when nothing later matches:
// on `<a/><b>...</b>` it walks past the slash of the first element and the
// `>...</tag>` branch matches to the SECOND element's closing tag. Two
// siblings come back as one match, so whatever the caller decides from the
// first element's attributes is applied to both.
//
// For <signalReference> that meant a rewrite driven by the first id: the
// second reference was deleted along with it, or left pointing at an id that
// no longer existed. The same shape of scan is used for <connection>,
// <signal>, <controller> and <lane>.

import { describe, it, expect } from 'vitest'
import { extractOdrDocument, rewriteSignalReferences } from '../../src/exporter/odrCarryThrough'

/** A road's `<signals>` block with the two reference forms interleaved. */
const roadWith = (refs: string): string =>
  `  <road name="r" length="40" id="2" junction="-1">
    <planView><geometry s="0" x="0" y="0" hdg="0" length="40"><line/></geometry></planView>
    <lanes><laneSection s="0"><right><lane id="-1" type="driving"><width sOffset="0" a="3.5" b="0" c="0" d="0"/></lane></right></laneSection></lanes>
    <signals>
${refs}
    </signals>
  </road>`

const SELF_THEN_CHILD = roadWith(
  `      <signalReference s="10" t="-1" id="100" orientation="+"/>
      <signalReference s="25" t="1" id="101" orientation="-">
        <validity fromLane="-1" toLane="-1"/>
      </signalReference>`
)

const CHILD_THEN_SELF = roadWith(
  `      <signalReference s="25" t="1" id="101" orientation="-">
        <validity fromLane="-1" toLane="-1"/>
      </signalReference>
      <signalReference s="10" t="-1" id="100" orientation="+"/>`
)

const THREE_MIXED = roadWith(
  `      <signalReference s="10" t="-1" id="100" orientation="+"/>
      <signalReference s="25" t="1" id="101" orientation="-">
        <validity fromLane="-1" toLane="-1"/>
      </signalReference>
      <signalReference s="30" t="-2" id="102" orientation="+"/>`
)

/** ids of the `<signalReference>` records left in `text`, in order. */
const refIds = (text: string): string[] => {
  const ids: string[] = []
  for (const tag of text.match(/<signalReference\b[^>]*?(?:\/>|>)/g) ?? []) {
    const id = tag.match(/\bid="([^"]*)"/)?.[1]
    if (id !== undefined) ids.push(id)
  }
  return ids
}

describe('signalReference rewriting respects element boundaries', () => {
  it('drops only the reference whose signal is gone (self-closing first)', () => {
    const out = rewriteSignalReferences(SELF_THEN_CHILD, sid => (sid === '100' ? null : sid))
    expect(refIds(out)).toEqual(['101'])
    // The survivor keeps every byte of its own record.
    expect(out).toContain('<signalReference s="25" t="1" id="101" orientation="-">')
    expect(out).toContain('<validity fromLane="-1" toLane="-1"/>')
  })

  it('drops only the reference whose signal is gone (child form first)', () => {
    const out = rewriteSignalReferences(CHILD_THEN_SELF, sid => (sid === '101' ? null : sid))
    expect(refIds(out)).toEqual(['100'])
    expect(out).toContain('<signalReference s="10" t="-1" id="100" orientation="+"/>')
    expect(out).not.toContain('<validity')
  })

  it('retargets every id, not only the first of a run', () => {
    const map: Record<string, string> = { '100': '102', '101': '103' }
    const out = rewriteSignalReferences(SELF_THEN_CHILD, sid => map[sid] ?? sid)
    expect(refIds(out)).toEqual(['102', '103'])
    // Placement travels with each record.
    expect(out).toContain('<signalReference s="10" t="-1" id="102" orientation="+"/>')
    expect(out).toContain('<signalReference s="25" t="1" id="103" orientation="-">')
    expect(out).toContain('<validity fromLane="-1" toLane="-1"/>')
  })

  it('handles keep / retarget / drop in one run', () => {
    const out = rewriteSignalReferences(THREE_MIXED, sid => {
      if (sid === '100') return '100' // keep
      if (sid === '101') return '900' // retarget
      return null // drop 102
    })
    expect(refIds(out)).toEqual(['100', '900'])
    expect(out).toContain('<signalReference s="10" t="-1" id="100" orientation="+"/>')
    expect(out).toContain('<signalReference s="25" t="1" id="900" orientation="-">')
    expect(out).not.toContain('id="102"')
  })
})

describe('document extraction respects element boundaries', () => {
  it('reads a self-closing <connection> and its full-form sibling separately', () => {
    const xml = `<?xml version="1.0"?>
<OpenDRIVE>
  <junction id="1" name="j">
    <connection id="0" incomingRoad="10" connectingRoad="11" contactPoint="start"/>
    <connection id="1" incomingRoad="12" connectingRoad="13" contactPoint="end">
      <laneLink from="-1" to="-2"/>
    </connection>
  </junction>
</OpenDRIVE>`
    const doc = extractOdrDocument(xml)!
    const conns = doc.junctions[0].connections
    expect(conns.map(c => c.connectingRoad)).toEqual(['11', '13'])
    expect(conns[0]).toMatchObject({ incomingRoad: '10', contactPoint: 'start', laneLinks: [] })
    expect(conns[1]).toMatchObject({
      incomingRoad: '12',
      contactPoint: 'end',
      laneLinks: [{ from: -1, to: -2 }],
    })
    // The lane link of the second must not be attributed to the first.
    expect(conns[0].laneLinks).toEqual([])
    expect(doc.junctions[0].memberRoadIds).toEqual(['10', '11', '12', '13'])
  })

  it('reads a self-closing <controller> and its full-form sibling separately', () => {
    const xml = `<?xml version="1.0"?>
<OpenDRIVE>
  <controller id="9" name="a"/>
  <controller id="10" name="b">
    <control signalId="5" type="0"/>
  </controller>
</OpenDRIVE>`
    const doc = extractOdrDocument(xml)!
    expect(doc.controllers.map(c => c.id)).toEqual(['9', '10'])
    expect(doc.controllers[0].signalIds).toEqual([])
    expect(doc.controllers[1].signalIds).toEqual(['5'])
  })

  it('reads a self-closing <road> and its full-form sibling separately', () => {
    const xml = `<?xml version="1.0"?>
<OpenDRIVE>
  <road name="stub" length="1" id="1" junction="-1"/>
  <road name="real" length="40" id="2" junction="-1">
    <link><successor elementType="road" elementId="3" contactPoint="start"/></link>
    <planView><geometry s="0" x="0" y="0" hdg="0" length="40"><line/></geometry></planView>
  </road>
</OpenDRIVE>`
    const doc = extractOdrDocument(xml)!
    expect(doc.roads.map(r => r.id)).toEqual(['1', '2'])
    // The link of the second road is not attributed to the first.
    expect(doc.roads[0].linkRoadRefs).toEqual([])
    expect(doc.roads[1].roadLinks).toEqual([
      { end: 'successor', elementId: '3', contactPoint: 'start' },
    ])
  })
})
