// PROJ.4 string helpers used by the OpenDRIVE exporter to populate
// <header><geoReference>.
//
// OpenDRIVE 1.8 expects the <geoReference> child of <header> to declare the
// coordinate reference system as a PROJ.4 string (or similar). Without it,
// downstream tools (esmini, RoadRunner, CARLA, asam-qc-opendrive) cannot
// interpret the map's coordinates consistently.
//
// No external dependencies — these are pure formatting helpers.

/**
 * Geographic anchor expressed as WGS84 lat/lon (and optional heading).
 * Used to derive a local PROJ string anchored at this point.
 */
export interface GeoOrigin {
  lat: number
  lon: number
  /** Heading of the local page +x axis clockwise from north, in radians. */
  headingRad?: number
}

/**
 * Fallback PROJ string used when no geographic origin is available. It still
 * declares WGS84 explicitly so downstream tools see a defined CRS rather than
 * an empty <geoReference>.
 */
export const FALLBACK_GEO_REFERENCE = '+proj=longlat +datum=WGS84 +no_defs'

/**
 * Build a Transverse Mercator (tmerc) PROJ.4 string anchored at the given
 * lat/lon. tmerc is preferred over UTM for small-area maps (sub-km) because
 * it avoids UTM zone boundary distortion and minimises error near the origin.
 */
export function latLonToTmercProj(lat: number, lon: number): string {
  return [
    '+proj=tmerc',
    `+lat_0=${lat.toFixed(8)}`,
    `+lon_0=${lon.toFixed(8)}`,
    '+k=1',
    '+x_0=0',
    '+y_0=0',
    '+datum=WGS84',
    '+units=m',
    '+no_defs',
  ].join(' ')
}

/**
 * Build a UTM PROJ.4 string for the UTM zone containing the given lon. The
 * hemisphere is selected from the sign of lat. Use this when the consumer
 * expects a globally-named UTM zone rather than a tmerc-at-origin.
 */
export function latLonToUtmProj(lat: number, lon: number): string {
  const zone = Math.floor((lon + 180) / 6) + 1
  const parts = ['+proj=utm', `+zone=${zone}`]
  if (lat < 0) parts.push('+south')
  parts.push('+datum=WGS84', '+units=m', '+no_defs')
  return parts.join(' ')
}

/**
 * Choose a PROJ.4 string for the given origin. Defaults to tmerc-at-origin,
 * which is appropriate for the small-area maps that this SDK typically
 * exports. Falls back to a generic WGS84 longlat string when origin is absent
 * or malformed.
 */
export function originToProjString(
  origin: GeoOrigin | undefined | null,
  method: 'tmerc' | 'utm' = 'tmerc'
): string {
  if (
    !origin ||
    typeof origin.lat !== 'number' ||
    typeof origin.lon !== 'number' ||
    !Number.isFinite(origin.lat) ||
    !Number.isFinite(origin.lon)
  ) {
    return FALLBACK_GEO_REFERENCE
  }
  return method === 'utm'
    ? latLonToUtmProj(origin.lat, origin.lon)
    : latLonToTmercProj(origin.lat, origin.lon)
}
