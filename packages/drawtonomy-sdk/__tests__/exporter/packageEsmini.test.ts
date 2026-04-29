import { describe, it, expect } from 'vitest'
import { buildEsminiZip } from '../../src/exporter/packageEsmini'
import type { DrawtonomySnapshot } from '../../src/types'

function makeSnapshot(): DrawtonomySnapshot {
  return {
    version: '1.1',
    timestamp: new Date().toISOString(),
    shapes: [
      { id: 'p1', type: 'point', x: 0, y: -5, rotation: 0, zIndex: 0, props: { color: 'black', visible: true, osmId: '' } },
      { id: 'p2', type: 'point', x: 100, y: -5, rotation: 0, zIndex: 0, props: { color: 'black', visible: true, osmId: '' } },
      { id: 'p3', type: 'point', x: 0, y: 5, rotation: 0, zIndex: 0, props: { color: 'black', visible: true, osmId: '' } },
      { id: 'p4', type: 'point', x: 100, y: 5, rotation: 0, zIndex: 0, props: { color: 'black', visible: true, osmId: '' } },
      { id: 'left', type: 'linestring', x: 0, y: 0, rotation: 0, zIndex: 0, props: { pointIds: ['p1', 'p2'], color: 'black', strokeWidth: 2, attributes: {}, osmId: '' } },
      { id: 'right', type: 'linestring', x: 0, y: 0, rotation: 0, zIndex: 0, props: { pointIds: ['p3', 'p4'], color: 'black', strokeWidth: 2, attributes: {}, osmId: '' } },
      {
        id: 'lane1', type: 'lane', x: 0, y: 0, rotation: 0, zIndex: 0,
        props: {
          leftBoundaryId: 'left', rightBoundaryId: 'right',
          invertLeft: false, invertRight: false,
          color: 'default', size: 'm',
          attributes: { type: 'lanelet', subtype: 'road', speed_limit: '30' },
          next: [], prev: [], osmId: '',
        },
      },
    ],
  }
}

describe('buildEsminiZip', () => {
  it('returns a blob and a sanitized base name', () => {
    const result = buildEsminiZip(makeSnapshot(), { baseName: 'My Scene/01' })
    expect(result.blob.type).toBe('application/zip')
    expect(result.blob.size).toBeGreaterThan(0)
    expect(result.baseName).toBe('My Scene_01')
  })

  it('falls back to "drawtonomy" when baseName is missing or invalid', () => {
    const r1 = buildEsminiZip(makeSnapshot())
    expect(r1.baseName).toBe('drawtonomy')

    const r2 = buildEsminiZip(makeSnapshot(), { baseName: '...' })
    expect(r2.baseName).toBe('drawtonomy')
  })
})
