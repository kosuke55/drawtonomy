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
} from './types.js'
import { evaluatePathAt, uniformTValues } from './geometry.js'

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
  // Optional props are spread through rather than enumerated. Enumerating them
  // silently dropped everything the explicit list did not mention (isPath,
  // arrowHead, footprint, footprintIds, smooth, segments, opacity), even though
  // the signature accepts Partial<LinestringProps> — so callers got no type
  // error and lost the values at runtime. That is how paths built by
  // createPathWithFootprints ended up without isPath, which made the
  // OpenSCENARIO exporter skip their <Trajectory> entirely.
  const { id: _id, pointIds: _pointIds, color, strokeWidth, attributes, osmId, ...rest } = options ?? {}
  return {
    id: options?.id ?? nextId('ls'),
    type: 'linestring',
    x,
    y,
    rotation: 0,
    zIndex: 0,
    props: {
      ...rest,
      pointIds,
      color: color ?? 'black',
      strokeWidth: strokeWidth ?? 2,
      attributes: attributes ?? { type: 'linestring', subtype: 'solid' },
      osmId: osmId ?? '',
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
      w: options?.w ?? 30,
      h: options?.h ?? 56,
      color: options?.color ?? 'black',
      size: options?.size ?? 'm',
      attributes: options?.attributes ?? { type: 'vehicle', subtype: 'car' },
      osmId: options?.osmId ?? '',
      templateId: options?.templateId ?? 'default',
    },
  }
}

// --- Pedestrian ---

/**
 * Pedestrians are stored as `type: 'vehicle'` with a pedestrian `templateId`.
 *
 * This is not a quirk of this helper: the editor has only ever had the
 * `vehicle` shape type for placed participants, and the OpenSCENARIO
 * exporter decides `<Pedestrian>` vs `<Vehicle>` from `templateId`
 * (see PEDESTRIAN_PATTERNS in exporter/openscenario.ts).
 *
 * Emitting `type: 'pedestrian'` here produced shapes that no consumer
 * recognised — they were skipped by the exporter (0 ScenarioObjects) and
 * unknown to the editor.
 */
export function createPedestrian(
  x: number,
  y: number,
  options?: Partial<PedestrianProps> & { id?: string }
): BaseShape<'vehicle', PedestrianProps> {
  return {
    id: options?.id ?? nextId('ped'),
    type: 'vehicle',
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

// --- Path with Footprints ---

export interface PathWithFootprintsOptions {
  /** Number of footprints for uniform spacing (default: 5) */
  count?: number
  /** Vehicle template (default: 'sedan') */
  template?: string
  /** Path and footprint color (default: 'green') */
  color?: string
  /** Path stroke width (default: 3) */
  strokeWidth?: number
  /** Dashed line (default: true) */
  dashed?: boolean
  /** Arrow at path end (default: true) */
  arrowHead?: boolean
  /** Anchor offset along travel direction (default: 0) */
  anchorOffset?: number
  /** Footprint opacity (default: 1) */
  footprintOpacity?: number
}

export function createPathWithFootprints(
  pathPoints: Array<{ x: number; y: number }>,
  options?: PathWithFootprintsOptions
): BaseShape<string, any>[] {
  const shapes: BaseShape<string, any>[] = []
  const count = options?.count ?? 5
  const templateId = options?.template ?? 'sedan'
  const color = options?.color ?? 'green'
  const anchorOffset = options?.anchorOffset ?? 0

  // Create path vertex points
  const ptShapes = pathPoints.map(p => createPoint(p.x, p.y, { visible: true, osmId: '' }))
  shapes.push(...ptShapes)

  // Compute footprint positions using arc-length parameterization
  const tValues = uniformTValues(count)
  const footprintIds: string[] = []

  // Create the path linestring
  const pathLs = createLinestring(0, 0, ptShapes.map(p => p.id), {
    color,
    strokeWidth: options?.strokeWidth ?? 3,
    attributes: {
      type: 'linestring',
      subtype: options?.dashed !== false ? 'dashed' : 'solid',
    },
    isPath: true,
    arrowHead: options?.arrowHead !== false ? 'end' : null,
    arrowHeadSize: 15,
    opacity: 0.85,
  })

  // Compute interval in pixels for footprint config
  let totalLen = 0
  for (let i = 1; i < pathPoints.length; i++) {
    const dx = pathPoints[i].x - pathPoints[i - 1].x
    const dy = pathPoints[i].y - pathPoints[i - 1].y
    totalLen += Math.sqrt(dx * dx + dy * dy)
  }
  const interval = count > 1 ? Math.round(totalLen / (count - 1)) : Math.round(totalLen)

  // Create footprint vehicles
  for (let i = 0; i < tValues.length; i++) {
    const evalResult = evaluatePathAt(pathPoints, tValues[i])
    const rotationDeg = evalResult.tangentAngleDeg

    // Apply anchor offset along tangent direction
    let fx = evalResult.position.x
    let fy = evalResult.position.y
    if (anchorOffset !== 0) {
      fx -= anchorOffset * evalResult.tangentVec.x
      fy -= anchorOffset * evalResult.tangentVec.y
    }

    const vehicle = createVehicle(fx, fy, {
      templateId,
      color,
      opacity: options?.footprintOpacity ?? 1,
      w: 30,
      h: 56,
    })
    // Set rotation directly
    ;(vehicle as any).rotation = rotationDeg
    // Set parentPathId
    ;(vehicle.props as any).parentPathId = pathLs.id

    footprintIds.push(vehicle.id)
    shapes.push(vehicle)
  }

  // Set footprint config on path
  const pathProps = pathLs.props as any
  pathProps.footprint = { interval, offset: 0, templateId, anchorOffset }
  pathProps.footprintIds = footprintIds

  shapes.push(pathLs)
  return shapes
}

// --- Snapshot ---

export function createSnapshot(shapes: BaseShape[]): DrawtonomySnapshot {
  return {
    version: '1.1',
    timestamp: new Date().toISOString(),
    shapes,
  }
}
