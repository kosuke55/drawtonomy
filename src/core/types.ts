export type ShapeId = string

export interface ShapeRecord<Type extends string = string, Props = any> {
  id: ShapeId
  type: Type
  x: number
  y: number
  rotation: number
  zIndex: number
  props: Props
}

export interface Point {
  x: number
  y: number
}

export interface SelectionState {
  selectedIds: Set<ShapeId>
}

export type ToolType =
  | 'select'
  | 'hand'
  | 'linestring'
  | 'lane'
  | 'crosswalk'
  | 'parallel_lane'
  | 'traffic_light'
  | 'rectangle'
  | 'ellipse'
  | 'arrow'
  | 'line_arrow'
  | 'vehicle'
  | 'pedestrian'
  | 'polygon'
  | 'freehand'
  | 'text'
  | 'path'
  | 'intersection'

export interface CursorState {
  type: 'default' | 'cross' | 'pointer' | 'move' | 'text' | 'grab' | 'grabbing'
  rotation: number
}

export interface InputState {
  cursorPosition: Point
  altKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
}

export interface ViewportState {
  x: number
  y: number
  zoom: number
}

export interface InputHandlers {
  onPointerDown?: (info: PointerInput) => void
  onPointerMove?: (info: PointerInput) => void
  onPointerUp?: (info: PointerInput) => void
  onKeyDown?: (info: KeyInput) => void
  onKeyUp?: (info: KeyInput) => void
}

export interface PointerInput {
  point: Point
  button: number
  target: EventTarget | null
}

export interface KeyInput {
  key: string
  code: string
  altKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
}

export type SegmentStyle = {
  color?: string
  strokeWidth?: number
  opacity?: number
}

export type LaneConnectionType = 'next' | 'previous' | 'left' | 'right'

export interface LaneConnection {
  type: LaneConnectionType
  targetId: ShapeId
}

export interface ShapeTemplate {
  id: string
  name: string
  category: string
  svgPath: string
  defaultWidth: number
  defaultHeight: number
  viewBox: { width: number; height: number }
  defaultColor?: string
}
