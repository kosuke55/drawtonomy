import { describe, it, expect } from 'vitest'
import {
  FALLBACK_GEO_REFERENCE,
  latLonToTmercProj,
  latLonToUtmProj,
  originToProjString,
} from '../../src/exporter/projection'

describe('latLonToTmercProj', () => {
  it('builds a tmerc PROJ.4 string anchored at the given lat/lon', () => {
    const proj = latLonToTmercProj(35.6280, 139.7400)
    expect(proj).toContain('+proj=tmerc')
    expect(proj).toContain('+lat_0=35.62800000')
    expect(proj).toContain('+lon_0=139.74000000')
    expect(proj).toContain('+datum=WGS84')
    expect(proj).toContain('+units=m')
    expect(proj).toContain('+no_defs')
  })

  it('uses 8 decimal places for sub-cm precision', () => {
    const proj = latLonToTmercProj(0.123456789, -0.987654321)
    expect(proj).toContain('+lat_0=0.12345679')
    expect(proj).toContain('+lon_0=-0.98765432')
  })
})

describe('latLonToUtmProj', () => {
  it('picks the right UTM zone for Tokyo', () => {
    const proj = latLonToUtmProj(35.6280, 139.7400)
    expect(proj).toMatch(/\+proj=utm\b/)
    expect(proj).toContain('+zone=54')
    expect(proj).not.toContain('+south')
  })

  it('appends +south in the southern hemisphere', () => {
    const proj = latLonToUtmProj(-33.86, 151.21)
    expect(proj).toContain('+south')
  })

  it('handles the zone boundary correctly', () => {
    // longitude 0° should be zone 31 (zones start from -180°, 6° wide)
    expect(latLonToUtmProj(0, 0)).toContain('+zone=31')
    expect(latLonToUtmProj(0, -180)).toContain('+zone=1')
    expect(latLonToUtmProj(0, 179.99)).toContain('+zone=60')
  })
})

describe('originToProjString', () => {
  it('returns tmerc by default for a valid origin', () => {
    const proj = originToProjString({ lat: 35.6280, lon: 139.7400 })
    expect(proj).toContain('+proj=tmerc')
  })

  it('returns UTM when method is "utm"', () => {
    const proj = originToProjString({ lat: 35.6280, lon: 139.7400 }, 'utm')
    expect(proj).toMatch(/\+proj=utm\b/)
  })

  it('falls back to WGS84 longlat when origin is missing', () => {
    expect(originToProjString(undefined)).toBe(FALLBACK_GEO_REFERENCE)
    expect(originToProjString(null)).toBe(FALLBACK_GEO_REFERENCE)
  })

  it('falls back when origin contains non-finite values', () => {
    expect(originToProjString({ lat: NaN, lon: 0 })).toBe(FALLBACK_GEO_REFERENCE)
    expect(originToProjString({ lat: 0, lon: Infinity })).toBe(FALLBACK_GEO_REFERENCE)
  })

  it('falls back when origin fields are not numbers', () => {
    expect(originToProjString({ lat: 'x' as unknown as number, lon: 0 })).toBe(
      FALLBACK_GEO_REFERENCE
    )
  })
})
