// OpenDRIVE validator: a strict counterpart to the lenient importer.
//
// `validateOpenDrive(xml)` returns a report of findings without modifying or
// repairing anything. The module is dependency-free and runtime-agnostic (no
// fs, no child_process), so it runs in a browser as well as in Node; the
// external road-manager layer is fed in through `opts.externalFindings`.

export { validateOpenDrive, buildReport } from './validateOpenDrive.js'
export {
  parseEsminiOutput,
  esminiSkipped,
  type EsminiRunOutput,
} from './esminiAdapter.js'
export {
  DEFAULT_GEOMETRY_THRESHOLDS,
  countFindings,
  deriveVerdict,
  resolveGeometryThresholds,
  type OdrFinding,
  type OdrFindingCategory,
  type OdrFindingLocation,
  type OdrFindingSeverity,
  type OdrGeometryThresholds,
  type OdrValidationCounts,
  type OdrValidationOptions,
  type OdrValidationReport,
  type OdrVerdict,
  type ResolvedGeometryThresholds,
} from './types.js'
