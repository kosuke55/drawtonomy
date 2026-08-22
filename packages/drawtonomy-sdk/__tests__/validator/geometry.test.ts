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
    const pair = (bx: number, offsetA = 0, offsetB = 0): string => `<?xml version="1.0"?>
<OpenDRIVE>
  <header revMajor="1" revMinor="6"/>
  <road name="a" length="100" id="1" junction="-1">
    <link><successor elementType="road" elementId="2" contactPoint="start"/></link>
    <planView><geometry s="0" x="0" y="0" hdg="0" length="100"><line/></geometry></planView>
    <lanes>
      <laneOffset s="0" a="${offsetA}" b="0" c="0" d="0"/>
      <laneSection s="0">
        <center><lane id="0" type="none" level="false"/></center>
        <right><lane id="-1" type="driving" level="false"><width sOffset="0" a="3.5" b="0" c="0" d="0"/></lane></right>
      </laneSection>
    </lanes>
  </road>
  <road name="b" length="100" id="2" junction="-1">
    <link><predecessor elementType="road" elementId="1" contactPoint="end"/></link>
    <planView><geometry s="0" x="${bx}" y="0" hdg="0" length="100"><line/></geometry></planView>
    <lanes>
      <laneOffset s="0" a="${offsetB}" b="0" c="0" d="0"/>
      <laneSection s="0">
        <center><lane id="0" type="none" level="false"/></center>
        <right><lane id="-1" type="driving" level="false"><width sOffset="0" a="3.5" b="0" c="0" d="0"/></lane></right>
      </laneSection>
    </lanes>
  </road>
</OpenDRIVE>`

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

    it('subtracts the lane-offset difference', () => {
      // fabriksgatan's pattern: a connecting road with laneOffset 1.75 linking
      // to a mainline with 0. The reference lines are 1.75 m apart by design.
      expect(geomRules(pair(101.75, 1.75, 0))).toEqual([])
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
        roadLinkGapMeters: 0.5,
        lengthMismatchRatio: 0.01,
        negativeWidthToleranceMeters: 0.001,
      })
    })
  })
})
