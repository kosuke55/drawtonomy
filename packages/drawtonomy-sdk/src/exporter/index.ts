// drawtonomy SDK — exporter modules.
//
// These exporters convert a `DrawtonomySnapshot` into target-format strings
// (OpenDRIVE / OpenSCENARIO / Lanelet2 OSM) without depending on the editor
// runtime, so they can be used in headless tooling, server-side pipelines, or
// browser extensions. The Lanelet2 module additionally exposes a parser that
// turns OSM XML back into editor-ready primitives (points / linestrings /
// lanes), enabling round-trip workflows.

export { exportToOpenDrive, type OpenDriveExportOptions } from './opendrive'
export {
  latLonToTmercProj,
  latLonToUtmProj,
  originToProjString,
  FALLBACK_GEO_REFERENCE,
  type GeoOrigin,
} from './projection'
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
export {
  exportToLanelet2,
  trafficSignCode,
  trafficSignRelationSubtype,
  DEFAULT_ORIGIN_LAT,
  DEFAULT_ORIGIN_LON,
  type Lanelet2ExportOptions,
  type OsmSidecar,
  type MapOrigin,
} from './lanelet2'
export {
  parseOsmXml,
  latLonToCanvas,
  canvasToLatLon,
  type OsmData,
  type OsmNode,
  type OsmWay,
  type OsmRelation,
} from './osmParser'
export {
  osmToShapes,
  alignBoundaries,
  createShapeIdAllocator,
  type ImportedShapes,
  type ImportedPoint,
  type ImportedLinestring,
  type ImportedLane,
  type ImportedTrafficLight,
  type ImportedTrafficSign,
  type ImportedCrosswalk,
  type ImportBounds,
  type OsmToShapesOptions,
  type ShapeIdAllocator,
} from './osmToShapes'
export {
  parseOpenDriveXml,
  type OdrMap,
  type OdrHeader,
  type OdrRoad,
  type OdrGeometry,
  type OdrLane,
  type OdrLaneSection,
  type OdrLaneOffset,
  type OdrWidth,
  type OdrRoadMark,
  type OdrRoadLink,
  type OdrSignal,
  type OdrSignalValidity,
  type OdrObject,
  type OdrObjectRepeat,
  type OdrJunction,
  type OdrJunctionConnection,
  type OdrJunctionLaneLink,
  type OdrCubic,
  type OdrElevation,
} from './opendriveParser'
export {
  evalElevation,
  evalGeometry,
  evalPoly3,
  fresnel,
  sampleReferenceLine,
  type GeomPose,
  type ReferenceSample,
  type SampleReferenceLineOptions,
} from './odrGeometry'
export {
  evalElevationRecords,
  fitElevationProfile,
  type ElevationRecord,
  type ElevationSample,
  type FitElevationOptions,
} from './odrElevationFit'
export {
  odrToShapes,
  parseGeoReferenceOrigin,
  type OdrImportResult,
  type OdrRoadRecord,
  type OdrSidecar,
  type OdrToShapesOptions,
} from './odrToShapes'
