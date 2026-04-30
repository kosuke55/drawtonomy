import { describe, it, expect } from 'vitest'
import { parseDrawtonomySvg } from '../src/snapshot'
import type { DrawtonomySnapshot } from '../src/types'

function encodePayload(snapshot: DrawtonomySnapshot): string {
  const json = JSON.stringify(snapshot)
  // Mirror the editor's encoder: btoa(unescape(encodeURIComponent(json))).
  // In Node, Buffer.from(json, 'utf-8').toString('base64') produces the
  // same result.
  return Buffer.from(json, 'utf-8').toString('base64')
}

function makeSvg(attrName: string, payload: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" ${attrName}="${payload}">
  <rect x="10" y="10" width="80" height="80" fill="red"/>
</svg>`
}

const sampleSnapshot: DrawtonomySnapshot = {
  version: '1.1',
  timestamp: '2026-04-30T00:00:00Z',
  shapes: [
    {
      id: 'p1',
      type: 'point',
      x: 10,
      y: 20,
      rotation: 0,
      zIndex: 0,
      props: { color: 'black', visible: true, osmId: '' },
    },
  ],
}

describe('parseDrawtonomySvg', () => {
  it('returns the embedded snapshot from data-drawtonomy-snapshot', () => {
    const svg = makeSvg('data-drawtonomy-snapshot', encodePayload(sampleSnapshot))
    const out = parseDrawtonomySvg(svg)
    expect(out).not.toBeNull()
    expect(out!.version).toBe('1.1')
    expect(out!.shapes).toHaveLength(1)
    expect(out!.shapes[0].id).toBe('p1')
  })

  it('falls back to the legacy data-drawauto-snapshot attribute', () => {
    const svg = makeSvg('data-drawauto-snapshot', encodePayload(sampleSnapshot))
    const out = parseDrawtonomySvg(svg)
    expect(out).not.toBeNull()
    expect(out!.shapes[0].id).toBe('p1')
  })

  it('preserves multibyte content in shape props', () => {
    const snapshot: DrawtonomySnapshot = {
      ...sampleSnapshot,
      shapes: [
        {
          id: 't1',
          type: 'text',
          x: 0,
          y: 0,
          rotation: 0,
          zIndex: 0,
          props: { text: '交差点', color: 'black' } as any,
        },
      ],
    }
    const svg = makeSvg('data-drawtonomy-snapshot', encodePayload(snapshot))
    const out = parseDrawtonomySvg(svg)
    expect(out).not.toBeNull()
    expect((out!.shapes[0].props as any).text).toBe('交差点')
  })

  it('returns null for SVGs without an embedded snapshot', () => {
    const svg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>`
    expect(parseDrawtonomySvg(svg)).toBeNull()
  })

  it('returns null when the embedded payload is not valid base64 JSON', () => {
    const svg = makeSvg('data-drawtonomy-snapshot', 'not-base64-!!!')
    expect(parseDrawtonomySvg(svg)).toBeNull()
  })

  it('returns null when the decoded payload is missing shapes[]', () => {
    const bogus = Buffer.from(JSON.stringify({ version: '1.0' }), 'utf-8').toString('base64')
    const svg = makeSvg('data-drawtonomy-snapshot', bogus)
    expect(parseDrawtonomySvg(svg)).toBeNull()
  })

  it('returns null for non-string inputs', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(parseDrawtonomySvg(null as any)).toBeNull()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(parseDrawtonomySvg(undefined as any)).toBeNull()
  })
})
