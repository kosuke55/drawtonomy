// Public SDK Type Definitions
// These types are intended for extension developers

export type ShapeId = string

export interface BaseShape<Type extends string = string, Props = Record<string, unknown>> {
  id: ShapeId
  type: Type
  x: number
  y: number
  rotation: number
  zIndex: number
  index?: string
  props: Props
}

export interface PointProps {
  color: string
  visible: boolean
  osmId: string
  /**
   * Height above the map datum (m), in world units — NOT canvas pixels like
   * the shape's `x` / `y`. Set by importers that read a third dimension
   * (currently OpenDRIVE `<elevationProfile>`); absent or 0 means "no
   * elevation", which round-trips to an empty `<elevationProfile/>`.
   *
   * Because the height rides on the point, plain 2D editing (dragging,
   * arrow-key nudges, rotation bake) preserves it without extra plumbing.
   */
  z?: number
}

export interface LinestringProps {
  pointIds: string[]
  color: string
  strokeWidth: number
  opacity?: number | null
  attributes: { type: string; subtype: string } & Record<string, string | undefined>
  osmId: string
  isPath?: boolean
  arrowHead?: string | null
  arrowHeadSize?: number | null
  smooth?: boolean | null
  segments?: Record<string, { color?: string; strokeWidth?: number; opacity?: number }> | null
  footprint?: {
    interval: number
    offset: number
    templateId: string
    anchorOffset?: number
  }
  footprintIds?: string[]
}

export interface LaneProps {
  leftBoundaryId: string | null
  rightBoundaryId: string | null
  invertLeft: boolean
  invertRight: boolean
  color: string
  opacity?: number | null
  smooth?: boolean | null
  size: string
  attributes: { type: string; subtype: string; speed_limit?: string } & Record<string, string | undefined>
  next: string[]
  prev: string[]
  osmId: string
  /**
   * Lane shape ids that must yield to this lane (regulatory layer).
   * Exported as a Lanelet2 `right_of_way` regulatory element whose
   * "right_of_way" member is this lane and "yield" members are these lanes.
   */
  yieldLaneIds?: string[]
}

export interface VehicleProps {
  w: number
  h: number
  color: string
  size: string
  opacity?: number | null
  attributes: { type: 'vehicle'; subtype: string }
  osmId: string
  templateId: string
  parentPathId?: string
}

export interface PedestrianProps {
  w: number
  h: number
  color: string
  size: string
  opacity?: number | null
  attributes: { type: 'pedestrian'; subtype: string }
  osmId: string
  templateId: string
}

export interface RectangleProps {
  w: number
  h: number
  color: string
  fill: string
  strokeWidth: number
  opacity?: number | null
}

export interface EllipseProps {
  w: number
  h: number
  color: string
  fill: string
  strokeWidth: number
  opacity?: number | null
}

export interface ArrowProps {
  w: number
  h: number
  color: string
  fill: string
  strokeWidth: number
  opacity?: number | null
  direction: string
  headPosition: number
  bodyThickness: number
}

export interface TextProps {
  w: number
  h: number
  text: string
  color: string
  fontSize: number
  font: string
  textAlign: 'left' | 'center' | 'right'
  autoSize: boolean
}

export interface PolygonProps {
  pointIds: string[]
  color: string
  strokeWidth: number
  fillOpacity?: number | null
  attributes: Record<string, unknown>
  osmId: string
  smooth?: boolean | null
  segments?: Record<string, { color?: string; strokeWidth?: number; opacity?: number }> | null
}

export interface TrafficLightProps {
  w: number
  h: number
  color: string
  /** Visual style identifier (e.g. "pedestrian", "traffic_red"). */
  style: string
  /** Currently lit lamp index for the configured style. */
  activeLight?: string
  size?: string
  attributes: { type?: string; subtype?: string } & Record<string, string>
  osmId: string
  /**
   * Lane shape ids whose traffic this signal controls (regulatory layer).
   * Exported as a Lanelet2 regulatory element / OpenDRIVE signal validity.
   */
  affectedLaneIds?: string[]
  /** Linestring shape id of the associated stop line, or null when absent. */
  stopLineId?: string | null
  /**
   * Signal group id. Signals sharing the same controllerId belong to one
   * intersection controller (exported as an OpenDRIVE <controller>).
   */
  controllerId?: string
}

export interface TrafficSignProps {
  w: number
  h: number
  color: string
  size?: string
  /**
   * Sign metadata. `sign_code` carries the Lanelet2 traffic sign subtype
   * (ISO 3166 region code + sign number, e.g. "de274" / "usR1-1");
   * `sign_type` carries a speed limit value with unit (e.g. "50 km/h") for
   * speed limit regulatory elements that do not originate from a sign code.
   */
  attributes: { type?: string; subtype?: string; sign_code?: string; sign_type?: string } & Record<
    string,
    string
  >
  osmId: string
  /**
   * Lane shape ids whose traffic this sign regulates (regulatory layer).
   * Exported as a Lanelet2 `traffic_sign` / `speed_limit` regulatory element
   * referenced by the affected lanelets, and as an OpenDRIVE static signal
   * (`dynamic="no"`) with per-lane validity.
   */
  affectedLaneIds?: string[]
  /** Linestring shape id of the associated stop line, or null when absent. */
  stopLineId?: string | null
}

export interface CrosswalkProps {
  /** Crosswalk axis start in shape-local coordinates. */
  startX: number
  startY: number
  /** Crosswalk axis end in shape-local coordinates. */
  endX: number
  endY: number
  /** Stripe band thickness across the road. */
  crosswalkWidth: number
  /** Width of each white stripe. */
  stripeWidth?: number
  /** Spacing between stripes. */
  stripeSpacing?: number
  color: string
  opacity?: number | null
  attributes: { type?: string; subtype?: string } & Record<string, string>
  osmId: string
  /**
   * Lane shape ids whose traffic this crosswalk regulates (regulatory layer).
   * Exported as a Lanelet2 `crosswalk` regulatory element referenced by the
   * affected lanelets.
   */
  affectedLaneIds?: string[]
  /** Linestring shape id of the associated stop line, or null when absent. */
  stopLineId?: string | null
}

export interface FreehandProps {
  points: Array<{ x: number; y: number }>
  color: string
  strokeWidth: number
  opacity?: number | null
  isComplete: boolean
}

// Snapshot
export interface DrawtonomySnapshot {
  version: string
  timestamp: string
  shapes: BaseShape[]
  camera?: { x: number; y: number; z: number }
  /**
   * Optional geographic anchor for the scene, expressed as WGS84 lat/lon plus
   * an optional heading of the page +x axis clockwise from north (radians).
   * When present, the OpenDRIVE exporter uses this to populate
   * <header><geoReference> with a PROJ.4 string.
   */
  origin?: {
    lat: number
    lon: number
    headingRad?: number
  }
}

// Extension Capability
export type ExtensionCapability =
  | 'shapes:write'
  | 'shapes:read'
  | 'snapshot:read'
  | 'snapshot:export'
  | 'viewport:read'
  | 'selection:read'
  | 'ui:panel'
  | 'ui:notify'

// Extension Manifest
export interface ExtensionManifest {
  id: string
  name: string
  version: string
  description: string
  author: { name: string; url?: string }
  entry: string
  icon?: string
  capabilities: ExtensionCapability[]
  minHostVersion?: string
}

// Export
export type ExportFormat = 'svg' | 'png' | 'jpeg' | 'eps' | 'pdf' | 'drawtonomy.svg' | 'json'

export interface ExportResponse {
  requestId: string
  data: string
  mimeType: string
  filename: string
}

// Message types (for extension-side use)
export interface ShapeFilter {
  types?: string[]
  ids?: string[]
  selectedOnly?: boolean
}

export interface ShapeUpdate {
  id: string
  props: Record<string, unknown>
}

export interface InitPayload {
  hostVersion: string
  grantedCapabilities: ExtensionCapability[]
  viewport: { width: number; height: number }
}
