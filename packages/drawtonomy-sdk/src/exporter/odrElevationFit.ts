// Reconstruct an OpenDRIVE <elevationProfile> from per-point heights.
//
// The editor stores a height (m) on each boundary point. When a road is
// regenerated (its shapes were edited, so it cannot be re-emitted verbatim),
// the height samples along the reference line are refitted into the piecewise
// cubic form OpenDRIVE requires:
//
//   z(s) = a + b*ds + c*ds^2 + d*ds^3,   ds = s - record.s
//
// The fit is segment-wise and C0-continuous by construction: each segment's
// `a` is the height at its start station, and its cubic is solved so the
// segment ends exactly on the next height. Segments are only split where the
// data demands it, so a straight grade emits a single record.
//
// No external dependencies.

/** One (station, height) sample along a road's reference line. */
export interface ElevationSample {
  /** Station along the reference line (m), ascending. */
  s: number
  /** Height above the map datum (m). */
  z: number
}

/** One `<elevation>` record: `z(ds) = a + b*ds + c*ds^2 + d*ds^3`. */
export interface ElevationRecord {
  s: number
  a: number
  b: number
  c: number
  d: number
}

export interface FitElevationOptions {
  /**
   * Maximum allowed height error at any input sample (m). Matches the
   * plan-view fitter's default chord tolerance.
   */
  maxErrorMeters?: number
  /** Heights whose magnitude is below this count as "no elevation" (m). */
  flatEpsilonMeters?: number
}

const DEFAULT_MAX_ERROR = 0.05
const DEFAULT_FLAT_EPS = 1e-6
const S_EPS = 1e-9

/**
 * Evaluate a fitted profile at station `s` (same rule as the parser: the last
 * record with `record.s <= s` applies; before the first record the height is
 * 0).
 */
export function evalElevationRecords(records: readonly ElevationRecord[], s: number): number {
  if (records.length === 0) return 0
  let lo = 0
  let hi = records.length - 1
  if (s < records[0].s) return 0
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (records[mid].s <= s) lo = mid
    else hi = mid - 1
  }
  const rec = records[lo]
  const ds = s - rec.s
  return rec.a + rec.b * ds + rec.c * ds * ds + rec.d * ds * ds * ds
}

/**
 * Cubic Hermite record spanning [s0, s1] with the given end heights and end
 * slopes, expressed in OpenDRIVE's `a + b*ds + c*ds^2 + d*ds^3` form.
 */
function hermiteRecord(s0: number, s1: number, z0: number, z1: number, m0: number, m1: number): ElevationRecord {
  const h = s1 - s0
  if (!(h > S_EPS)) return { s: s0, a: z0, b: 0, c: 0, d: 0 }
  // p(t) with t = ds/h, then rescale into ds.
  //   p = z0 + (m0*h) t + (3(z1-z0) - 2 m0 h - m1 h) t^2 + (-2(z1-z0) + m0 h + m1 h) t^3
  const dz = z1 - z0
  const c2 = 3 * dz - 2 * m0 * h - m1 * h
  const c3 = -2 * dz + m0 * h + m1 * h
  return { s: s0, a: z0, b: m0, c: c2 / (h * h), d: c3 / (h * h * h) }
}

/** Finite-difference slopes at each sample (monotone-safe enough for roads). */
function estimateSlopes(samples: readonly ElevationSample[]): number[] {
  const n = samples.length
  const m = new Array<number>(n).fill(0)
  if (n < 2) return m
  for (let i = 0; i < n; i++) {
    const prev = samples[Math.max(0, i - 1)]
    const next = samples[Math.min(n - 1, i + 1)]
    const ds = next.s - prev.s
    m[i] = ds > S_EPS ? (next.z - prev.z) / ds : 0
  }
  return m
}

/**
 * Fit a piecewise cubic elevation profile through `samples`.
 *
 * Returns an empty array when the samples carry no usable height (all zero /
 * fewer than two samples), which the caller emits as `<elevationProfile/>` —
 * the existing "no elevation" convention.
 *
 * The returned records always start at s = 0 so the profile covers the whole
 * road, and every input sample is reproduced within `maxErrorMeters`.
 */
export function fitElevationProfile(
  samples: readonly ElevationSample[],
  options: FitElevationOptions = {}
): ElevationRecord[] {
  const maxError = options.maxErrorMeters ?? DEFAULT_MAX_ERROR
  const flatEps = options.flatEpsilonMeters ?? DEFAULT_FLAT_EPS

  // Deduplicate / sort by station; drop non-finite samples.
  const clean: ElevationSample[] = []
  for (const smp of [...samples].sort((p, q) => p.s - q.s)) {
    if (!Number.isFinite(smp.s) || !Number.isFinite(smp.z)) continue
    const last = clean[clean.length - 1]
    if (last && smp.s - last.s <= S_EPS) {
      // Same station twice: keep the later height (endpoints welded by the
      // boundary aligner can repeat a station).
      last.z = smp.z
      continue
    }
    clean.push({ s: smp.s, z: smp.z })
  }
  if (clean.length === 0) return []
  if (clean.every(smp => Math.abs(smp.z) <= flatEps)) return []

  // A single usable sample means a constant height over the whole road.
  if (clean.length === 1) return [{ s: 0, a: clean[0].z, b: 0, c: 0, d: 0 }]

  // Extend to s = 0 so the profile is defined from the road start.
  if (clean[0].s > S_EPS) clean.unshift({ s: 0, z: clean[0].z })

  const slopes = estimateSlopes(clean)

  // Greedy segment growth: extend a record as far as a single cubic through
  // (start, end) with the estimated end slopes stays within tolerance at every
  // intermediate sample. Emits one record for a constant grade.
  const records: ElevationRecord[] = []
  let i = 0
  while (i < clean.length - 1) {
    let best: { rec: ElevationRecord; end: number } | null = null
    for (let j = i + 1; j < clean.length; j++) {
      const rec = hermiteRecord(clean[i].s, clean[j].s, clean[i].z, clean[j].z, slopes[i], slopes[j])
      let ok = true
      for (let k = i + 1; k < j; k++) {
        const ds = clean[k].s - rec.s
        const z = rec.a + rec.b * ds + rec.c * ds * ds + rec.d * ds * ds * ds
        if (Math.abs(z - clean[k].z) > maxError) {
          ok = false
          break
        }
      }
      if (!ok) break
      best = { rec, end: j }
    }
    if (!best) {
      // Cannot even span one interval (degenerate station spacing): emit a
      // constant record and move on rather than dropping the height.
      records.push({ s: clean[i].s, a: clean[i].z, b: 0, c: 0, d: 0 })
      i++
      continue
    }
    records.push(best.rec)
    i = best.end
  }

  return records
}
