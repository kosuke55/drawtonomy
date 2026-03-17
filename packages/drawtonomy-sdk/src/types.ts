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
}

export interface LinestringProps {
  pointIds: string[]
  color: string
  strokeWidth: number
  opacity?: number | null
  attributes: { type: string; subtype: string }
  osmId: string
  isPath?: boolean
  arrowHead?: string | null
  arrowHeadSize?: number | null
  smooth?: boolean | null
  segments?: Record<string, { color?: string; strokeWidth?: number; opacity?: number }> | null
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
  attributes: { type: string; subtype: string; speed_limit?: string }
  next: string[]
  prev: string[]
  osmId: string
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
  attributes: { type: 'traffic_light'; subtype?: string }
  osmId: string
}

export interface CrosswalkProps {
  pointIds: string[]
  color: string
  stripeWidth?: number
  stripeGap?: number
  attributes: { type: 'crosswalk'; subtype?: string }
  osmId: string
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
}

// Extension Capability
export type ExtensionCapability =
  | 'shapes:write'
  | 'shapes:read'
  | 'snapshot:read'
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
