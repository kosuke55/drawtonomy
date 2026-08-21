// Layer 1 unit tests: the truncation / balance detector.

import { describe, it, expect } from 'vitest'
import { checkXmlIntegrity } from '../../src/validator/layers/xmlIntegrity'
import { validateOpenDrive } from '../../src/validator/index'
import { loadFixtureCorpus, readFixture } from './corpus'

const rules = (xml: string): string[] => checkXmlIntegrity(xml).findings.map(f => f.rule)

describe('checkXmlIntegrity', () => {
  it('accepts every fixture unchanged', () => {
    for (const entry of loadFixtureCorpus()) {
      const result = checkXmlIntegrity(entry.xml)
      expect(result.findings, `${entry.name}: ${JSON.stringify(result.findings)}`).toEqual([])
      expect(result.fatal).toBe(false)
    }
  })

  it('flags an empty document', () => {
    expect(rules('')).toEqual(['xml.empty'])
    expect(rules('   \n  ')).toEqual(['xml.empty'])
  })

  it('flags a missing root element', () => {
    expect(rules('<notOpenDrive><a/></notOpenDrive>')).toEqual(['xml.no-root'])
  })

  it('flags a document cut mid-file as truncated', () => {
    const xml = readFixture('fabriksgatan.xodr')
    const cut = xml.slice(0, Math.floor(xml.length * 0.6))
    expect(rules(cut)).toContain('xml.truncated')
    expect(checkXmlIntegrity(cut).fatal).toBe(true)
  })

  it('flags a document cut inside a tag', () => {
    expect(rules('<OpenDRIVE><road id="1" leng')).toContain('xml.truncated')
  })

  it('flags a document cut inside a comment', () => {
    expect(rules('<OpenDRIVE><!-- unfinished')).toContain('xml.truncated')
  })

  it('flags mismatched tags', () => {
    const found = checkXmlIntegrity('<OpenDRIVE><road></lane></OpenDRIVE>')
    expect(found.findings.map(f => f.rule)).toEqual(['xml.unbalanced-tags'])
    expect(found.fatal).toBe(true)
  })

  it('flags a stray closing tag', () => {
    expect(rules('<OpenDRIVE></road></OpenDRIVE>')).toEqual(['xml.unbalanced-tags'])
  })

  it('does not mistake markup inside comments, CDATA or attributes for tags', () => {
    const xml =
      '<?xml version="1.0"?>\n' +
      '<OpenDRIVE>\n' +
      '  <!-- <road id="ghost"> not a real tag -->\n' +
      '  <header><geoReference><![CDATA[+proj=tmerc <not a tag>]]></geoReference></header>\n' +
      '  <road name="a > b" id="1" junction="-1"/>\n' +
      '</OpenDRIVE>'
    expect(rules(xml)).toEqual([])
  })

  it('accepts self-closing elements', () => {
    expect(rules('<OpenDRIVE><road id="1"/><junction id="2"/></OpenDRIVE>')).toEqual([])
  })

  it('short-circuits later layers when the document is truncated', () => {
    // A truncated document must not spray dangling-reference findings that are
    // artefacts of the missing bytes: exactly one finding, and it is the cause.
    const xml = readFixture('fabriksgatan.xodr')
    const report = validateOpenDrive(xml.slice(0, Math.floor(xml.length * 0.6)))
    expect(report.findings.map(f => f.rule)).toEqual(['xml.truncated'])
    expect(report.verdict).toBe('red')
  })
})
