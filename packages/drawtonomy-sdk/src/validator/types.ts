// OpenDRIVE validator — finding schema and report types.
//
// The importer (`parseOpenDriveXml` / `odrToShapes`) is deliberately lenient:
// it recovers as much of a map as it can and silently ignores what it cannot
// represent. That is right for an editor, but it means a defective map can be
// imported with no visible complaint (a document truncated mid-file imports as
// however many roads survived; a junction with its <connection> records
// deleted imports as disconnected roads). This module is the strict counterpart
// used for QA: it never repairs, it only reports.
//
// Findings carry an explicit *attribution* so a report can be read without
// knowing the tool's internals:
//
//   MAP_DEFECT      the source document is wrong or self-inconsistent — the
//                   author of the map has something to fix.
//   TOOL_LIMITATION the document is legal OpenDRIVE, but drawtonomy cannot
//                   represent this construct faithfully. Nothing to fix in the
//                   map; the round trip will be lossy.
//   INFO            neutral observations (counts, skipped optional layers).
//
// Only MAP_DEFECT errors make a verdict red, so a map that merely uses features
// the editor does not model never looks "broken".

/** Severity of a single finding. */
export type OdrFindingSeverity = 'error' | 'warning' | 'info'

/** Attribution of a finding: whose problem is it? */
export type OdrFindingCategory = 'MAP_DEFECT' | 'TOOL_LIMITATION' | 'INFO'

/** Where in the document a finding applies (all fields optional). */
export interface OdrFindingLocation {
  roadId?: string
  junctionId?: string
  laneId?: number
  /** Station along the road reference line (m). */
  s?: number
}

/** A single validation finding. */
export interface OdrFinding {
  severity: OdrFindingSeverity
  category: OdrFindingCategory
  /**
   * Stable machine-readable rule id, namespaced by layer:
   * `xml.*` (document integrity), `ref.*` (reference integrity),
   * `junction.*` (junction consistency), `geom.*` (geometric continuity),
   * `esmini.*` (external road-manager adapter).
   */
  rule: string
  message: string
  location?: OdrFindingLocation
}

/** Overall document verdict, derived from the findings. */
export type OdrVerdict = 'green' | 'yellow' | 'red'

/** Aggregated counts, keyed by severity and by category. */
export interface OdrValidationCounts {
  error: number
  warning: number
  info: number
  MAP_DEFECT: number
  TOOL_LIMITATION: number
  INFO: number
}

/** Result of validating one OpenDRIVE document. */
export interface OdrValidationReport {
  findings: OdrFinding[]
  counts: OdrValidationCounts
  /**
   * red    at least one MAP_DEFECT error — the map is defective.
   * yellow any warning, or any TOOL_LIMITATION finding — usable, but lossy or
   *        suspicious.
   * green  informational findings only.
   */
  verdict: OdrVerdict
}

/** Tunable thresholds for the geometric continuity layer (layer 4). */
export interface OdrGeometryThresholds {
  /**
   * Maximum allowed position gap between consecutive plan-view geometries of
   * one road (m). Default 0.02.
   */
  planViewGapMeters?: number
  /**
   * Maximum allowed heading step between consecutive plan-view geometries of
   * one road (rad). Default 0.005.
   */
  planViewHeadingRad?: number
  /**
   * Maximum allowed position gap at a road-to-road link contact point (m).
   * Default 0.5.
   */
  roadLinkGapMeters?: number
  /**
   * Maximum allowed relative deviation between `road@length` and the summed
   * plan-view geometry lengths. Default 0.01 (1 %).
   */
  lengthMismatchRatio?: number
}

/** Options for {@link validateOpenDrive}. */
export interface OdrValidationOptions {
  /** Overrides for the layer-4 geometry thresholds. */
  geometry?: OdrGeometryThresholds
  /**
   * Pre-computed findings from an external road-manager run (layer 6). The
   * validator core stays pure: the CLI spawns the binary and passes the parsed
   * findings in here.
   */
  externalFindings?: readonly OdrFinding[]
}

/** Resolved geometry thresholds (defaults applied). */
export interface ResolvedGeometryThresholds {
  planViewGapMeters: number
  planViewHeadingRad: number
  roadLinkGapMeters: number
  lengthMismatchRatio: number
}

export const DEFAULT_GEOMETRY_THRESHOLDS: ResolvedGeometryThresholds = {
  planViewGapMeters: 0.02,
  planViewHeadingRad: 0.005,
  roadLinkGapMeters: 0.5,
  lengthMismatchRatio: 0.01,
}

export function resolveGeometryThresholds(
  overrides: OdrGeometryThresholds | undefined
): ResolvedGeometryThresholds {
  return {
    planViewGapMeters: overrides?.planViewGapMeters ?? DEFAULT_GEOMETRY_THRESHOLDS.planViewGapMeters,
    planViewHeadingRad:
      overrides?.planViewHeadingRad ?? DEFAULT_GEOMETRY_THRESHOLDS.planViewHeadingRad,
    roadLinkGapMeters: overrides?.roadLinkGapMeters ?? DEFAULT_GEOMETRY_THRESHOLDS.roadLinkGapMeters,
    lengthMismatchRatio:
      overrides?.lengthMismatchRatio ?? DEFAULT_GEOMETRY_THRESHOLDS.lengthMismatchRatio,
  }
}

/** Tally findings by severity and category. */
export function countFindings(findings: readonly OdrFinding[]): OdrValidationCounts {
  const counts: OdrValidationCounts = {
    error: 0,
    warning: 0,
    info: 0,
    MAP_DEFECT: 0,
    TOOL_LIMITATION: 0,
    INFO: 0,
  }
  for (const f of findings) {
    counts[f.severity] += 1
    counts[f.category] += 1
  }
  return counts
}

/**
 * Derive the verdict. A MAP_DEFECT error is the only thing that turns a report
 * red: findings attributed to the tool never fail someone else's map.
 */
export function deriveVerdict(findings: readonly OdrFinding[]): OdrVerdict {
  let yellow = false
  for (const f of findings) {
    if (f.severity === 'error' && f.category === 'MAP_DEFECT') return 'red'
    if (f.severity === 'warning' || f.category === 'TOOL_LIMITATION') yellow = true
  }
  return yellow ? 'yellow' : 'green'
}
