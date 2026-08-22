// Layer 4 unit tests: geometric continuity, including the threshold
// calibration that keeps real maps out of the red.

import { describe, it, expect } from 'vitest'
import { validateOpenDrive, DEFAULT_GEOMETRY_THRESHOLDS } from '../../src/validator/index'
import type { OdrFinding } from '../../src/validator/index'
import { loadFixtureCorpus } from './corpus'

const findingsFor = (xml: string, opts = {}): OdrFinding[] =>
  validateOpenDrive(xml, opts).findings
const rulesFor = (xml: string, opts = {}): string[] => findingsFor(xml, opts).map(f => f.rule)
const geomRules = (xml: string, opts = {}): string[] =>
  rulesFor(xml, opts).filter(r => r.startsWith('geom.'))

/** One road, two collinear line geometries meeting exactly. */
const straight = (secondX: number, length = 100, hdg = 0): string => `<?xml version="1.0"?>
<OpenDRIVE>
  <header revMajor="1" revMinor="6"/>
  <road name="a" length="${length}" id="1" junction="-1">
    <planView>
      <geometry s="0" x="0" y="0" hdg="0" length="50"><line/></geometry>
      <geometry s="50" x="${secondX}" y="0" hdg="${hdg}" length="50"><line/></geometry>
    </planView>
    <lanes><laneSection s="0">
      <center><lane id="0" type="none" level="false"/></center>
      <right><lane id="-1" type="driving" level="false">
        <width sOffset="0" a="3.5" b="0" c="0" d="0"/>
      </lane></right>
    </laneSection></lanes>
  </road>
</OpenDRIVE>`

describe('checkGeometry', () => {
  it('accepts a continuous road', () => {
    expect(geomRules(straight(50))).toEqual([])
  })

  describe('plan-view continuity', () => {
    it('flags a position gap above the threshold', () => {
      const found = findingsFor(straight(55)).filter(f => f.rule === 'geom.plan-view-gap')
      expect(found).toHaveLength(1)
      expect(found[0].message).toContain('5.000 m')
      expect(found[0].location?.roadId).toBe('1')
    })

    it('accepts a gap below the threshold', () => {
      expect(geomRules(straight(50.01))).toEqual([])
    })

    it('flags a heading discontinuity', () => {
      expect(geomRules(straight(50, 100, 0.5))).toContain('geom.plan-view-heading')
    })

    it('accepts a heading step below the threshold', () => {
      expect(geomRules(straight(50, 100, 0.001))).toEqual([])
    })

    it('honours a caller-supplied threshold', () => {
      const strict = { geometry: { planViewGapMeters: 0.001 } }
      expect(geomRules(straight(50.01), strict)).toContain('geom.plan-view-gap')
    })
  })

  describe('road length', () => {
    it('flags a length disagreeing with the plan-view sum', () => {
      const found = findingsFor(straight(50, 150)).filter(
        f => f.rule === 'geom.road-length-mismatch'
      )
      expect(found).toHaveLength(1)
      expect(found[0].message).toContain('sum to 100.000 m')
    })

    it('accepts a length within 1 %', () => {
      expect(geomRules(straight(50, 100.5))).toEqual([])
    })

    it('flags a road with length but no plan view', () => {
      const xml = straight(50).replace(/<planView>[\s\S]*?<\/planView>/, '<planView></planView>')
      expect(geomRules(xml)).toContain('geom.no-plan-view')
    })
  })

  describe('lane widths', () => {
    it('flags a negative width', () => {
      const xml = straight(50).replace('a="3.5"', 'a="-3.5"')
      const found = findingsFor(xml).filter(f => f.rule === 'geom.negative-lane-width')
      expect(found).toHaveLength(1)
      expect(found[0].location?.laneId).toBe(-1)
    })

    it('flags a width ramping negative before its span ends', () => {
      // 1.0 - 0.1 * ds is negative from ds = 10 on, and the span is 100 m.
      const xml = straight(50).replace('a="3.5" b="0"', 'a="1.0" b="-0.1"')
      expect(geomRules(xml)).toContain('geom.negative-lane-width')
    })

    it('accepts a lane that tapers to exactly zero', () => {
      // The real-world case behind the tolerance: 3.5 - 0.0042*ds^2 +
      // 0.000056*ds^3 reaches 0 at ds = 50 and lands ~1e-15 below it.
      const xml = straight(50)
        .replace('length="100"', 'length="50"')
        .replace(
          '<geometry s="50" x="50" y="0" hdg="0" length="50"><line/></geometry>',
          ''
        )
        .replace('a="3.5" b="0" c="0" d="0"', 'a="3.5" b="0" c="-0.0042" d="0.000056"')
      expect(geomRules(xml)).toEqual([])
    })

    it('still flags a width below the tolerance floor', () => {
      const xml = straight(50).replace('a="3.5"', 'a="-0.5"')
      expect(geomRules(xml)).toContain('geom.negative-lane-width')
    })
  })

  describe('road link contact', () => {
    // Road A runs along y = 0 from x = 0 to x = 100. Road B starts at
    // (bx, by). Each carries one 3.5 m right lane, so a road's lane boundaries
    // sit at its centre line (the reference line shifted by its laneOffset)
    // and 3.5 m to the right of it.
    const pair = (
      bx: number,
      opts: { by?: number; offsetA?: string; offsetB?: string } = {}
    ): string => {
      const { by = 0, offsetA = 'a="0" b="0"', offsetB = 'a="0" b="0"' } = opts
      return `<?xml version="1.0"?>
<OpenDRIVE>
  <header revMajor="1" revMinor="6"/>
  <road name="a" length="100" id="1" junction="-1">
    <link><successor elementType="road" elementId="2" contactPoint="start"/></link>
    <planView><geometry s="0" x="0" y="0" hdg="0" length="100"><line/></geometry></planView>
    <lanes>
      <laneOffset s="0" ${offsetA} c="0" d="0"/>
      <laneSection s="0">
        <center><lane id="0" type="none" level="false"/></center>
        <right><lane id="-1" type="driving" level="false"><width sOffset="0" a="3.5" b="0" c="0" d="0"/></lane></right>
      </laneSection>
    </lanes>
  </road>
  <road name="b" length="100" id="2" junction="-1">
    <link><predecessor elementType="road" elementId="1" contactPoint="end"/></link>
    <planView><geometry s="0" x="${bx}" y="${by}" hdg="0" length="100"><line/></geometry></planView>
    <lanes>
      <laneOffset s="0" ${offsetB} c="0" d="0"/>
      <laneSection s="0">
        <center><lane id="0" type="none" level="false"/></center>
        <right><lane id="-1" type="driving" level="false"><width sOffset="0" a="3.5" b="0" c="0" d="0"/></lane></right>
      </laneSection>
    </lanes>
  </road>
</OpenDRIVE>`
    }

    /**
     * Two roads linked end-to-start, with each side's lane content injectable.
     * Road A runs along y = 0 from x = 0 to x = 100; road B starts at
     * (100, by). Defaults give both a single 3.5 m right lane, so their lane
     * boundaries coincide and the pair is clean.
     */
    const twoRoads = (opts: {
      by?: number
      aLanes?: string
      bLanes?: string
      aSections?: string
      bOffset?: string
    }): string => {
      const {
        by = 0,
        aLanes = '<lane id="-1" type="driving" level="false"><width sOffset="0" a="3.5" b="0" c="0" d="0"/></lane>',
        bLanes = '<lane id="-1" type="driving" level="false"><width sOffset="0" a="3.5" b="0" c="0" d="0"/></lane>',
        aSections,
        bOffset = '',
      } = opts
      const aLaneXml =
        aSections ??
        `<laneSection s="0"><center><lane id="0" type="none" level="false"/></center><right>${aLanes}</right></laneSection>`
      return `<?xml version="1.0"?>
<OpenDRIVE>
  <header revMajor="1" revMinor="6"/>
  <road name="a" length="100" id="1" junction="-1">
    <link><successor elementType="road" elementId="2" contactPoint="start"/></link>
    <planView><geometry s="0" x="0" y="0" hdg="0" length="100"><line/></geometry></planView>
    <lanes>${aLaneXml}</lanes>
  </road>
  <road name="b" length="100" id="2" junction="-1">
    <link><predecessor elementType="road" elementId="1" contactPoint="end"/></link>
    <planView><geometry s="0" x="100" y="${by}" hdg="0" length="100"><line/></geometry></planView>
    <lanes>${bOffset}
      <laneSection s="0"><center><lane id="0" type="none" level="false"/></center><right>${bLanes}</right></laneSection>
    </lanes>
  </road>
</OpenDRIVE>`
    }

    it('accepts roads that touch', () => {
      expect(geomRules(pair(100))).toEqual([])
    })

    it('warns, never errors, on a separation', () => {
      const found = findingsFor(pair(150)).filter(f => f.rule === 'geom.road-link-gap')
      expect(found.length).toBeGreaterThan(0)
      expect(found.every(f => f.severity === 'warning')).toBe(true)
      // A gap between roads must not redden a map: shipped maps contain them.
      expect(validateOpenDrive(pair(150)).verdict).toBe('yellow')
    })

    it('reports the lane distance, not the reference-line distance', () => {
      const found = findingsFor(pair(150)).filter(f => f.rule === 'geom.road-link-gap')
      expect(found[0].message).toContain('lane boundaries')
      expect(found[0].message).toContain('50.000 m apart')
    })

    // The false positive this rule exists to avoid. Road B's reference line is
    // pushed 5 m off road A's by a laneOffset that ramps along s, so a check
    // comparing reference-line endpoints (even after subtracting the offset
    // difference at the contact) sees a gap — while the lanes themselves meet
    // exactly. Measured on a real map, every report of the old proxy was of
    // this shape and every one had a true lane distance of 0.000 m.
    it('accepts lanes that meet while the reference lines are far apart', () => {
      // A: no offset, so its centre is y = 0 and its lane edge y = -3.5.
      // B: reference line at y = -5, laneOffset ramping from +5 at s = 0, so
      // its centre is also y = 0 at the contact and its lane edge y = -3.5.
      const xml = pair(100, { by: -5, offsetB: 'a="5" b="-0.02"' })
      expect(geomRules(xml)).toEqual([])
    })

    it('still detects lanes that are genuinely apart', () => {
      // Same construction, but B's offset leaves its lanes 1.5 m off A's.
      const xml = pair(100, { by: -5, offsetB: 'a="3.5" b="-0.02"' })
      const found = findingsFor(xml).filter(f => f.rule === 'geom.road-link-gap')
      expect(found.length).toBeGreaterThan(0)
      expect(found[0].message).toContain('1.500 m apart')
    })

    it('honours a caller-supplied threshold', () => {
      const xml = pair(100, { by: -5, offsetB: 'a="3.5" b="-0.02"' })
      expect(geomRules(xml, { geometry: { roadLinkGapMeters: 2 } })).toEqual([])
    })

    // A lateral mismatch is not a gap. Lane counts and widths routinely differ
    // across a link (merges, ramps and junction connectors: 91 of the 156
    // links on one real map), so the rule asks whether the two cross sections
    // *touch*, not whether they are congruent. What it must catch is the two
    // sections being wholly apart, which is the soderleden defect.
    it('accepts a link where the roads touch but the lane counts differ', () => {
      const xml = twoRoads({
        aLanes: '<lane id="-1" type="driving" level="false"><width sOffset="0" a="3.5" b="0" c="0" d="0"/></lane>',
        bLanes:
          '<lane id="-1" type="driving" level="false"><width sOffset="0" a="3.5" b="0" c="0" d="0"/></lane>' +
          '<lane id="-2" type="driving" level="false"><width sOffset="0" a="3.5" b="0" c="0" d="0"/></lane>',
      })
      expect(geomRules(xml)).toEqual([])
    })

    it('measures a multi-section road at the section covering the contact', () => {
      // Road A's lane widens to 5 m from s = 50, and road B is shifted so that
      // it meets that widened edge. Reading A's *first* section would place its
      // edge 1.5 m away and report a gap that does not exist.
      const xml = twoRoads({
        aSections:
          '<laneSection s="0"><center><lane id="0" type="none" level="false"/></center>' +
          '<right><lane id="-1" type="driving" level="false"><width sOffset="0" a="3.5" b="0" c="0" d="0"/></lane></right></laneSection>' +
          '<laneSection s="50"><center><lane id="0" type="none" level="false"/></center>' +
          '<right><lane id="-1" type="driving" level="false"><width sOffset="0" a="5.0" b="0" c="0" d="0"/></lane></right></laneSection>',
        // B is a lone boundary pair 5 m below the reference line: its centre is
        // at y = -5.0, exactly A's widened outer edge.
        by: -5,
        bLanes: '<lane id="-1" type="driving" level="false"><width sOffset="0" a="0" b="0" c="0" d="0"/></lane>',
      })
      expect(xml).toContain('laneSection s="50"')
      expect(geomRules(xml)).toEqual([])

      // The same B against a road whose lane never widens is 1.5 m short.
      const narrow = twoRoads({
        by: -5,
        bLanes: '<lane id="-1" type="driving" level="false"><width sOffset="0" a="0" b="0" c="0" d="0"/></lane>',
      })
      const found = findingsFor(narrow).filter(f => f.rule === 'geom.road-link-gap')
      expect(found.length).toBeGreaterThan(0)
      expect(found[0].message).toContain('1.500 m apart')
    })

    it('evaluates the width record covering the contact, not the first', () => {
      // One lane section, two <width> records: 3.5 m up to sOffset 50 and 6.0 m
      // after it. The contact at s = 100 must read 6.0 m, putting A's outer
      // edge at y = -6.0 where B's lone boundary sits.
      const xml = twoRoads({
        aLanes:
          '<lane id="-1" type="driving" level="false">' +
          '<width sOffset="0" a="3.5" b="0" c="0" d="0"/>' +
          '<width sOffset="50" a="6.0" b="0" c="0" d="0"/>' +
          '</lane>',
        by: -6,
        bLanes: '<lane id="-1" type="driving" level="false"><width sOffset="0" a="0" b="0" c="0" d="0"/></lane>',
      })
      expect(geomRules(xml)).toEqual([])

      // Reading only the first record would have put A's edge at -3.5, which
      // is where this B sits — and that must be reported as 2.5 m away.
      const wrong = twoRoads({
        aLanes:
          '<lane id="-1" type="driving" level="false">' +
          '<width sOffset="0" a="3.5" b="0" c="0" d="0"/>' +
          '<width sOffset="50" a="6.0" b="0" c="0" d="0"/>' +
          '</lane>',
        by: -3.5,
        bLanes: '<lane id="-1" type="driving" level="false"><width sOffset="0" a="0" b="0" c="0" d="0"/></lane>',
      })
      const found = findingsFor(wrong).filter(f => f.rule === 'geom.road-link-gap')
      expect(found.length).toBeGreaterThan(0)
      expect(found[0].message).toContain('2.500 m apart')
    })

    it('takes the nearer end when the link declares no contact point', () => {
      const xml = pair(100).replace(' contactPoint="start"', '')
      expect(geomRules(xml)).toEqual([])
    })
  })

  describe('false-positive calibration', () => {
    it('leaves every fixture free of geometry errors', () => {
      for (const entry of loadFixtureCorpus()) {
        const errors = findingsFor(entry.xml).filter(
          f => f.rule.startsWith('geom.') && f.severity === 'error'
        )
        expect(errors, `${entry.name}: ${JSON.stringify(errors)}`).toEqual([])
      }
    })

    it('keeps the documented default thresholds', () => {
      // These values are calibrated against measured corpus statistics (see the
      // note in layers/geometry.ts). Changing one without re-measuring is how a
      // validator starts reddening real maps, so the defaults are pinned.
      expect(DEFAULT_GEOMETRY_THRESHOLDS).toEqual({
        planViewGapMeters: 0.02,
        planViewHeadingRad: 0.005,
        roadLinkGapMeters: 0.3,
        lengthMismatchRatio: 0.01,
        negativeWidthToleranceMeters: 0.001,
      })
    })
  })
})
