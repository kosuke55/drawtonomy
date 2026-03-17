// SDK Helpers - Factory functions for creating shapes
import type {
  BaseShape,
  PointProps,
  LinestringProps,
  LaneProps,
  VehicleProps,
  PedestrianProps,
  RectangleProps,
  EllipseProps,
  TextProps,
  DrawtonomySnapshot,
} from './types'

let idCounter = 0

function nextId(prefix = 'ext'): string {
  return `${prefix}_${++idCounter}_${Date.now().toString(36)}`
}

export function resetIdCounter() {
  idCounter = 0
}

// --- Point ---

export function createPoint(
  x: number,
  y: number,
  options?: Partial<PointProps> & { id?: string }
): BaseShape<'point', PointProps> {
  return {
    id: options?.id ?? nextId('pt'),
    type: 'point',
    x,
    y,
    rotation: 0,
    zIndex: 0,
    props: {
      color: options?.color ?? 'black',
      visible: options?.visible ?? true,
      osmId: options?.osmId ?? '',
    },
  }
}

// --- Linestring ---

export function createLinestring(
  x: number,
  y: number,
  pointIds: string[],
  options?: Partial<LinestringProps> & { id?: string }
): BaseShape<'linestring', LinestringProps> {
  return {
    id: options?.id ?? nextId('ls'),
    type: 'linestring',
    x,
    y,
    rotation: 0,
    zIndex: 0,
    props: {
      pointIds,
      color: options?.color ?? 'black',
      strokeWidth: options?.strokeWidth ?? 2,
      attributes: options?.attributes ?? { type: 'linestring', subtype: 'solid' },
      osmId: options?.osmId ?? '',
    },
  }
}

// --- Lane ---

export function createLane(
  x: number,
  y: number,
  leftBoundaryId: string,
  rightBoundaryId: string,
  options?: Partial<LaneProps> & { id?: string }
): BaseShape<'lane', LaneProps> {
  return {
    id: options?.id ?? nextId('lane'),
    type: 'lane',
    x,
    y,
    rotation: 0,
    zIndex: 0,
    props: {
      leftBoundaryId,
      rightBoundaryId,
      invertLeft: options?.invertLeft ?? false,
      invertRight: options?.invertRight ?? false,
      color: options?.color ?? 'default',
      size: options?.size ?? 'm',
      attributes: options?.attributes ?? { type: 'lanelet', subtype: 'road', speed_limit: '30' },
      next: options?.next ?? [],
      prev: options?.prev ?? [],
      osmId: options?.osmId ?? '',
    },
  }
}

// --- Lane with boundaries (convenience) ---

export interface LaneWithBoundariesOptions {
  laneOptions?: Partial<LaneProps> & { id?: string }
  leftOptions?: Partial<LinestringProps> & { id?: string }
  rightOptions?: Partial<LinestringProps> & { id?: string }
}

/**
 * Create a complete lane with its boundary linestrings and points.
 *
 * @param leftPoints - Array of {x, y} for left boundary
 * @param rightPoints - Array of {x, y} for right boundary
 * @param options - Optional configuration for lane and boundaries
 * @returns Array of shapes: points, linestrings, lane (in dependency order)
 */
export function createLaneWithBoundaries(
  leftPoints: Array<{ x: number; y: number }>,
  rightPoints: Array<{ x: number; y: number }>,
  options?: LaneWithBoundariesOptions
): BaseShape<string, any>[] {
  const shapes: BaseShape<string, any>[] = []

  // Create left boundary points
  const leftPointIds: string[] = []
  for (const pt of leftPoints) {
    const point = createPoint(pt.x, pt.y)
    leftPointIds.push(point.id)
    shapes.push(point)
  }

  // Create right boundary points
  const rightPointIds: string[] = []
  for (const pt of rightPoints) {
    const point = createPoint(pt.x, pt.y)
    rightPointIds.push(point.id)
    shapes.push(point)
  }

  // Create linestrings
  const leftLs = createLinestring(0, 0, leftPointIds, options?.leftOptions)
  const rightLs = createLinestring(0, 0, rightPointIds, options?.rightOptions)
  shapes.push(leftLs)
  shapes.push(rightLs)

  // Create lane
  const lane = createLane(0, 0, leftLs.id, rightLs.id, options?.laneOptions)
  shapes.push(lane)

  return shapes
}

// --- Vehicle ---

export function createVehicle(
  x: number,
  y: number,
  options?: Partial<VehicleProps> & { id?: string }
): BaseShape<'vehicle', VehicleProps> {
  return {
    id: options?.id ?? nextId('veh'),
    type: 'vehicle',
    x,
    y,
    rotation: options?.templateId ? 0 : 0,
    zIndex: 0,
    props: {
      w: options?.w ?? 90,
      h: options?.h ?? 45,
      color: options?.color ?? 'black',
      size: options?.size ?? 'm',
      attributes: options?.attributes ?? { type: 'vehicle', subtype: 'car' },
      osmId: options?.osmId ?? '',
      templateId: options?.templateId ?? 'default',
    },
  }
}

// --- Pedestrian ---

export function createPedestrian(
  x: number,
  y: number,
  options?: Partial<PedestrianProps> & { id?: string }
): BaseShape<'pedestrian', PedestrianProps> {
  return {
    id: options?.id ?? nextId('ped'),
    type: 'pedestrian',
    x,
    y,
    rotation: 0,
    zIndex: 0,
    props: {
      w: options?.w ?? 22,
      h: options?.h ?? 22,
      color: options?.color ?? 'black',
      size: options?.size ?? 'm',
      attributes: options?.attributes ?? { type: 'pedestrian', subtype: 'person' },
      osmId: options?.osmId ?? '',
      templateId: options?.templateId ?? 'filled',
    },
  }
}

// --- Rectangle ---

export function createRectangle(
  x: number,
  y: number,
  w: number,
  h: number,
  options?: Partial<RectangleProps> & { id?: string }
): BaseShape<'rectangle', RectangleProps> {
  return {
    id: options?.id ?? nextId('rect'),
    type: 'rectangle',
    x,
    y,
    rotation: 0,
    zIndex: 0,
    props: {
      w,
      h,
      color: options?.color ?? '#000000',
      fill: options?.fill ?? 'none',
      strokeWidth: options?.strokeWidth ?? 2,
    },
  }
}

// --- Ellipse ---

export function createEllipse(
  x: number,
  y: number,
  w: number,
  h: number,
  options?: Partial<EllipseProps> & { id?: string }
): BaseShape<'ellipse', EllipseProps> {
  return {
    id: options?.id ?? nextId('ell'),
    type: 'ellipse',
    x,
    y,
    rotation: 0,
    zIndex: 0,
    props: {
      w,
      h,
      color: options?.color ?? '#000000',
      fill: options?.fill ?? 'none',
      strokeWidth: options?.strokeWidth ?? 2,
    },
  }
}

// --- Text ---

export function createText(
  x: number,
  y: number,
  text: string,
  options?: Partial<TextProps> & { id?: string }
): BaseShape<'text', TextProps> {
  return {
    id: options?.id ?? nextId('txt'),
    type: 'text',
    x,
    y,
    rotation: 0,
    zIndex: 0,
    props: {
      w: options?.w ?? 200,
      h: options?.h ?? 32,
      text,
      color: options?.color ?? 'black',
      fontSize: options?.fontSize ?? 20,
      font: options?.font ?? 'sans',
      textAlign: options?.textAlign ?? 'left',
      autoSize: options?.autoSize ?? true,
    },
  }
}

// --- Snapshot ---

export function createSnapshot(shapes: BaseShape[]): DrawtonomySnapshot {
  return {
    version: '1.1',
    timestamp: new Date().toISOString(),
    shapes,
  }
}
