// drawtonomy SDK — exporter modules.
//
// These exporters convert a `DrawtonomySnapshot` into target-format strings
// (OpenDRIVE / OpenSCENARIO) without depending on the editor runtime, so
// they can be used in headless tooling, server-side pipelines, or browser
// extensions.

export { exportToOpenDrive } from './opendrive'
export {
  exportToOpenScenario,
  templateIdToVehicleCategory,
  type OpenScenarioExportOptions,
  type TemplateResolver,
} from './openscenario'
export {
  buildPathTrajectory,
  DEFAULT_PATH_SPEED_MPS,
  type PathSamplePoint,
  type PathTrajectoryInput,
} from './trajectory'
export {
  computeCenterlineWithWidth,
  sampleAtParam,
  computeHeadings,
  type Point2D,
  type CenterlineSample,
} from './laneCenterline'
export { buildEsminiZip, type EsminiPackageOptions, type EsminiPackageResult } from './packageEsmini'
export { buildZip, type ZipEntry } from './zip'
export { sanitizeFileBaseName } from './sanitize'
export { PIXELS_PER_METER } from './units'
