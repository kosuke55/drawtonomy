// OpenSCENARIO 1.3 (.xosc) exporter — emits scenario actors and trajectories
// from a snapshot. No external library dependencies.
//
// Design:
// - Each Vehicle / Pedestrian shape becomes a ScenarioObject
// - 3D rendering is delegated to the player; we only emit BoundingBox + category
// - Initial pose is a WorldPosition + TeleportAction
// - The road network is referenced via <LogicFile> pointing to the paired .xodr
// - Dynamic animations are emitted as <FollowTrajectoryAction> stories

import type {
  BaseShape,
  DrawtonomySnapshot,
  LinestringProps,
  PointProps,
  VehicleProps,
} from '../types'
import { buildPathTrajectory, type PathSamplePoint } from './trajectory'
import { escapeXml, fmt, pxToEnuX, pxToEnuY, pxToMeter } from './units'

type VehicleShape = BaseShape<'vehicle', VehicleProps>
type LinestringShape = BaseShape<'linestring', LinestringProps>
type PointShape = BaseShape<'point', PointProps>

/** Map a vehicle template id to a normalized form (legacy id rewrites). */
const LEGACY_TEMPLATE_ID_MAP: Record<string, string> = {
  black: 'filled', // legacy "black" pedestrian template renamed to "filled"
}

/** Pedestrian template id patterns. */
const PEDESTRIAN_PATTERNS = [/^pedestrian/, /^walk/, /^simple/, /^filled/]

/**
 * Hook for callers that want to override pedestrian / category resolution
 * (e.g. when their host knows about custom templates not bundled with the
 * SDK).
 */
export interface TemplateResolver {
  /** Normalize a template id, applying any legacy rewrites. */
  resolveTemplateId?: (templateId: string) => string
  /** True if the resolved id refers to a pedestrian template. */
  isPedestrianTemplate?: (templateId: string) => boolean
}

function defaultResolveTemplateId(id: string): string {
  return LEGACY_TEMPLATE_ID_MAP[id] || id
}

function defaultIsPedestrianTemplate(id: string): boolean {
  const resolved = defaultResolveTemplateId(id || '')
  return PEDESTRIAN_PATTERNS.some((re) => re.test(resolved))
}

/**
 * Map a vehicle template id to an OpenSCENARIO vehicleCategory.
 * Spec values: car, van, truck, trailer, semitrailer, bus, motorbike, bicycle, train, tram.
 */
export function templateIdToVehicleCategory(
  templateId: string,
  resolver?: TemplateResolver
): string {
  const resolveId = resolver?.resolveTemplateId ?? defaultResolveTemplateId
  const id = resolveId(templateId)
  switch (id) {
    case 'sedan': return 'car'
    case 'bus': return 'bus'
    case 'truck': return 'truck'
    case 'motorcycle':
    case 'motorcycle2':
      return 'motorbike'
    case 'bicycle':
    case 'bicycle2':
      return 'bicycle'
    case 'amr':
    case 'amr2':
    case 'robovac':
      return 'car'
    default:
      return 'car'
  }
}

/**
 * Default Performance values per category (matches esmini demo conventions).
 */
function defaultPerformance(category: string): { maxSpeed: number; maxAccel: number; maxDecel: number } {
  switch (category) {
    case 'truck':
    case 'bus':
      return { maxSpeed: 25, maxAccel: 2, maxDecel: 6 }
    case 'motorbike':
      return { maxSpeed: 60, maxAccel: 6, maxDecel: 9 }
    case 'bicycle':
      return { maxSpeed: 8, maxAccel: 2, maxDecel: 4 }
    default:
      return { maxSpeed: 50, maxAccel: 5, maxDecel: 10 }
  }
}

function defaultAxles(length: number, width: number): {
  front: { positionX: number; trackWidth: number }
  rear: { positionX: number; trackWidth: number }
} {
  const wheelbase = Math.max(length * 0.6, 0.3)
  const trackWidth = Math.max(width * 0.85, 0.3)
  return {
    front: { positionX: wheelbase, trackWidth },
    rear: { positionX: 0, trackWidth },
  }
}

interface VehicleEntity {
  shape: VehicleShape
  isPedestrian: boolean
  /** Unique name for the ScenarioObject. */
  name: string
  /** Meters. */
  width: number
  length: number
  height: number
  category: string
  worldX: number
  worldY: number
  /** ENU heading (rad). */
  heading: number
}

function collectEntities(snapshot: DrawtonomySnapshot, resolver?: TemplateResolver): VehicleEntity[] {
  const out: VehicleEntity[] = []
  let counter = 0
  const isPedestrian = resolver?.isPedestrianTemplate ?? defaultIsPedestrianTemplate
  const resolveId = resolver?.resolveTemplateId ?? defaultResolveTemplateId

  // Path footprints are a canvas-side "trail preview" — multiple ghost copies
  // of the same vehicle along a path. In a 3D scene we want a single moving
  // vehicle, so only the leading footprint (footprintIds[0]) is exported as
  // a ScenarioObject; the rest are dropped.
  const followerFootprintIds = new Set<string>()
  for (const shape of snapshot.shapes) {
    if (shape.type !== 'linestring') continue
    const ls = shape as unknown as LinestringShape
    if (!ls.props.isPath) continue
    const ids = ls.props.footprintIds ?? []
    for (let i = 1; i < ids.length; i++) followerFootprintIds.add(ids[i])
  }

  for (const shape of snapshot.shapes) {
    if (shape.type !== 'vehicle') continue
    if (followerFootprintIds.has(shape.id)) continue
    const v = shape as unknown as VehicleShape
    const id = resolveId(v.props.templateId || '')
    const isPed = isPedestrian(v.props.templateId || '')

    // Vehicle template orientation: front faces -Y in canvas space, so the
    // shape's bbox dimensions map as length=h (front-back axis), width=w.
    const widthM = pxToMeter(v.props.w)
    const lengthM = pxToMeter(v.props.h)
    const category = isPed ? 'pedestrian' : templateIdToVehicleCategory(id, resolver)

    let heightM: number
    if (isPed) heightM = 1.7
    else if (category === 'truck' || category === 'bus') heightM = 3.0
    else if (category === 'motorbike') heightM = 1.2
    else if (category === 'bicycle') heightM = 1.2
    else heightM = 1.5

    out.push({
      shape: v,
      isPedestrian: isPed,
      name: isPed ? `Pedestrian_${counter++}` : `Vehicle_${counter++}`,
      width: widthM,
      length: lengthM,
      height: heightM,
      category,
      worldX: pxToEnuX(v.x),
      worldY: pxToEnuY(v.y),
      // SVG template orientation: front faces -Y in canvas space, so a
      // rotation=0 vehicle points "up" on the canvas. ENU has y-up and CCW
      // positive headings, so canvas -Y maps to ENU +Y, i.e. heading=π/2
      // when rotation=0. The π/2 offset and sign flip account for both.
      heading: -((v.rotation || 0) * Math.PI) / 180 + Math.PI / 2,
    })
  }
  return out
}

function emitFileHeader(): string {
  const date = new Date().toISOString()
  return `  <FileHeader revMajor="1" revMinor="3" date="${date}" description="Generated by drawtonomy" author="drawtonomy"/>`
}

/**
 * Map a vehicleCategory to a bundled esmini 3D model path. An explicit
 * model3d is required, otherwise scaleMode is ignored and the BoundingBox
 * has no effect on rendering size.
 */
function getModel3d(category: string): string {
  switch (category) {
    case 'truck': return '../models/truck_yellow.osgb'
    case 'bus': return '../models/bus_blue.osgb'
    case 'motorbike': return '../models/mc.osgb'
    case 'bicycle': return '../models/cyclist.osgb'
    case 'pedestrian': return '../models/walkman.osgb'
    default: return '../models/car_white.osgb'
  }
}

function emitVehicleEntity(e: VehicleEntity): string {
  const perf = defaultPerformance(e.category)
  const axles = defaultAxles(e.length, e.width)
  const model3d = getModel3d(e.category)
  const lines: string[] = []
  lines.push(`    <ScenarioObject name="${escapeXml(e.name)}">`)
  lines.push(
    `      <Vehicle name="${escapeXml(e.shape.props.templateId || 'vehicle')}" vehicleCategory="${e.category}" model3d="${model3d}">`
  )
  lines.push(`        <BoundingBox>`)
  lines.push(`          <Center x="${fmt(e.length / 2)}" y="0" z="${fmt(e.height / 2)}"/>`)
  lines.push(`          <Dimensions width="${fmt(e.width)}" length="${fmt(e.length)}" height="${fmt(e.height)}"/>`)
  lines.push(`        </BoundingBox>`)
  lines.push(
    `        <Performance maxSpeed="${fmt(perf.maxSpeed)}" maxAcceleration="${fmt(perf.maxAccel)}" maxDeceleration="${fmt(perf.maxDecel)}"/>`
  )
  lines.push(`        <Axles>`)
  lines.push(
    `          <FrontAxle maxSteering="0.5" wheelDiameter="0.5" trackWidth="${fmt(axles.front.trackWidth)}" positionX="${fmt(axles.front.positionX)}" positionZ="0.25"/>`
  )
  lines.push(
    `          <RearAxle maxSteering="0" wheelDiameter="0.5" trackWidth="${fmt(axles.rear.trackWidth)}" positionX="${fmt(axles.rear.positionX)}" positionZ="0.25"/>`
  )
  lines.push(`        </Axles>`)
  // scaleMode=ModelToBB tells the player to deform the model so it matches
  // the BoundingBox dimensions. Without it the model is drawn at its native
  // size and the BoundingBox has no visual effect. The name is read as
  // "Model is fitted To BoundingBox" — the model is what gets scaled.
  lines.push(`        <Properties>`)
  lines.push(`          <Property name="scaleMode" value="ModelToBB"/>`)
  lines.push(`        </Properties>`)
  lines.push(`      </Vehicle>`)
  lines.push(`    </ScenarioObject>`)
  return lines.join('\n')
}

function emitPedestrianEntity(e: VehicleEntity): string {
  const model3d = getModel3d('pedestrian')
  const lines: string[] = []
  lines.push(`    <ScenarioObject name="${escapeXml(e.name)}">`)
  lines.push(
    `      <Pedestrian name="${escapeXml(e.shape.props.templateId || 'pedestrian')}" pedestrianCategory="pedestrian" mass="80" model3d="${model3d}">`
  )
  lines.push(`        <BoundingBox>`)
  lines.push(`          <Center x="0" y="0" z="${fmt(e.height / 2)}"/>`)
  lines.push(`          <Dimensions width="${fmt(e.width)}" length="${fmt(e.length)}" height="${fmt(e.height)}"/>`)
  lines.push(`        </BoundingBox>`)
  lines.push(`        <Properties>`)
  lines.push(`          <Property name="scaleMode" value="ModelToBB"/>`)
  lines.push(`        </Properties>`)
  lines.push(`      </Pedestrian>`)
  lines.push(`    </ScenarioObject>`)
  return lines.join('\n')
}

function emitInitTeleport(e: VehicleEntity): string {
  return emitInitTeleportAt(e, e.worldX, e.worldY, e.heading)
}

function emitInitTeleportAt(
  e: VehicleEntity,
  x: number,
  y: number,
  heading: number
): string {
  const lines: string[] = []
  lines.push(`        <Private entityRef="${escapeXml(e.name)}">`)
  lines.push(`          <PrivateAction>`)
  lines.push(`            <TeleportAction>`)
  lines.push(`              <Position>`)
  lines.push(
    `                <WorldPosition x="${fmt(x)}" y="${fmt(y)}" z="0" h="${fmt(heading)}" p="0" r="0"/>`
  )
  lines.push(`              </Position>`)
  lines.push(`            </TeleportAction>`)
  lines.push(`          </PrivateAction>`)
  lines.push(`        </Private>`)
  return lines.join('\n')
}

export interface OpenScenarioExportOptions {
  /** Filename of the paired .xodr (referenced by <LogicFile>). Empty if absent. */
  xodrFilename?: string
  /** Scenario name. */
  scenarioName?: string
  /** Optional template resolver hook. */
  templateResolver?: TemplateResolver
}

interface PathTrajectoryAssignment {
  entityName: string
  trajectoryName: string
  samples: PathSamplePoint[]
}

function collectPathAssignments(
  snapshot: DrawtonomySnapshot,
  entities: VehicleEntity[]
): PathTrajectoryAssignment[] {
  const out: PathTrajectoryAssignment[] = []
  const shapeMap = new Map<string, BaseShape>()
  for (const s of snapshot.shapes) shapeMap.set(s.id, s)
  const shapeIdToEntityName = new Map<string, string>()
  for (const e of entities) shapeIdToEntityName.set(e.shape.id, e.name)

  let trajCounter = 0
  for (const shape of snapshot.shapes) {
    if (shape.type !== 'linestring') continue
    const ls = shape as unknown as LinestringShape
    if (!ls.props.isPath) continue
    const footprintIds = ls.props.footprintIds ?? []
    const fp = ls.props.footprint
    if (footprintIds.length === 0) continue
    const headFootprintId = footprintIds[0]
    const entityName = shapeIdToEntityName.get(headFootprintId)
    if (!entityName) continue

    const points: { x: number; y: number }[] = []
    for (const pid of ls.props.pointIds) {
      const p = shapeMap.get(pid) as unknown as PointShape | undefined
      if (p) points.push({ x: p.x, y: p.y })
    }
    if (points.length < 2) continue

    const samples = buildPathTrajectory({
      points,
      tValues: (fp as { tValues?: number[] } | undefined)?.tValues,
      interval: fp?.interval,
      offset: fp?.offset,
    })
    if (samples.length < 2) continue

    out.push({
      entityName,
      trajectoryName: `path${trajCounter++}_${entityName}`,
      samples,
    })
  }
  return out
}

function emitFollowTrajectoryStory(assignments: PathTrajectoryAssignment[]): string[] {
  if (!assignments.length) return []
  const lines: string[] = []
  lines.push(`    <Story name="MovingStory">`)
  lines.push(`      <Act name="MovingAct">`)
  for (const a of assignments) {
    lines.push(`        <ManeuverGroup name="MG_${escapeXml(a.entityName)}" maximumExecutionCount="1">`)
    lines.push(`          <Actors selectTriggeringEntities="false">`)
    lines.push(`            <EntityRef entityRef="${escapeXml(a.entityName)}"/>`)
    lines.push(`          </Actors>`)
    lines.push(`          <Maneuver name="MV_${escapeXml(a.entityName)}">`)
    lines.push(`            <Event name="EV_${escapeXml(a.entityName)}" priority="override">`)
    lines.push(`              <Action name="ACT_${escapeXml(a.entityName)}">`)
    lines.push(`                <PrivateAction>`)
    lines.push(`                  <RoutingAction>`)
    lines.push(`                    <FollowTrajectoryAction>`)
    lines.push(`                      <TrajectoryRef>`)
    lines.push(`                        <Trajectory name="${escapeXml(a.trajectoryName)}" closed="false">`)
    lines.push(`                          <ParameterDeclarations/>`)
    lines.push(`                          <Shape>`)
    lines.push(`                            <Polyline>`)
    for (const s of a.samples) {
      lines.push(`                              <Vertex time="${fmt(s.time)}">`)
      lines.push(`                                <Position>`)
      lines.push(
        `                                  <WorldPosition x="${fmt(s.x)}" y="${fmt(s.y)}" z="0" h="${fmt(s.heading)}" p="0" r="0"/>`
      )
      lines.push(`                                </Position>`)
      lines.push(`                              </Vertex>`)
    }
    lines.push(`                            </Polyline>`)
    lines.push(`                          </Shape>`)
    lines.push(`                        </Trajectory>`)
    lines.push(`                      </TrajectoryRef>`)
    lines.push(`                      <TimeReference>`)
    lines.push(
      `                        <Timing domainAbsoluteRelative="absolute" scale="1.0" offset="0.0"/>`
    )
    lines.push(`                      </TimeReference>`)
    lines.push(
      `                      <TrajectoryFollowingMode followingMode="position"/>`
    )
    lines.push(`                    </FollowTrajectoryAction>`)
    lines.push(`                  </RoutingAction>`)
    lines.push(`                </PrivateAction>`)
    lines.push(`              </Action>`)
    lines.push(`              <StartTrigger>`)
    lines.push(`                <ConditionGroup>`)
    lines.push(
      `                  <Condition name="Start_${escapeXml(a.entityName)}" delay="0" conditionEdge="none">`
    )
    lines.push(`                    <ByValueCondition>`)
    lines.push(
      `                      <SimulationTimeCondition value="0" rule="greaterOrEqual"/>`
    )
    lines.push(`                    </ByValueCondition>`)
    lines.push(`                  </Condition>`)
    lines.push(`                </ConditionGroup>`)
    lines.push(`              </StartTrigger>`)
    lines.push(`            </Event>`)
    lines.push(`          </Maneuver>`)
    lines.push(`        </ManeuverGroup>`)
  }
  lines.push(`        <StartTrigger>`)
  lines.push(`          <ConditionGroup>`)
  lines.push(
    `            <Condition name="ActStart" delay="0" conditionEdge="none">`
  )
  lines.push(`              <ByValueCondition>`)
  lines.push(
    `                <SimulationTimeCondition value="0" rule="greaterOrEqual"/>`
  )
  lines.push(`              </ByValueCondition>`)
  lines.push(`            </Condition>`)
  lines.push(`          </ConditionGroup>`)
  lines.push(`        </StartTrigger>`)
  lines.push(`      </Act>`)
  lines.push(`    </Story>`)
  return lines
}

/**
 * Build an OpenSCENARIO 1.3 XML document from a snapshot.
 */
export function exportToOpenScenario(
  snapshot: DrawtonomySnapshot,
  options: OpenScenarioExportOptions = {}
): string {
  const xodrFilename = options.xodrFilename ?? ''
  const entities = collectEntities(snapshot, options.templateResolver)

  const lines: string[] = []
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`)
  lines.push(`<OpenSCENARIO>`)
  lines.push(emitFileHeader())
  lines.push(`  <ParameterDeclarations/>`)
  lines.push(`  <CatalogLocations/>`)
  lines.push(`  <RoadNetwork>`)
  if (xodrFilename) {
    lines.push(`    <LogicFile filepath="${escapeXml(xodrFilename)}"/>`)
  } else {
    lines.push(`    <LogicFile filepath=""/>`)
  }
  lines.push(`  </RoadNetwork>`)

  lines.push(`  <Entities>`)
  for (const e of entities) {
    lines.push(e.isPedestrian ? emitPedestrianEntity(e) : emitVehicleEntity(e))
  }
  lines.push(`  </Entities>`)

  // For entities bound to a trajectory, snap the Init TeleportAction to the
  // trajectory start so the entity does not "jump" once the trajectory takes
  // over. The path assignments are computed before Init Actions are emitted.
  const pathAssignments = collectPathAssignments(snapshot, entities)
  const pathStartByEntity = new Map<string, PathSamplePoint>()
  for (const a of pathAssignments) {
    if (a.samples.length > 0) pathStartByEntity.set(a.entityName, a.samples[0])
  }

  lines.push(`  <Storyboard>`)
  lines.push(`    <Init>`)
  lines.push(`      <Actions>`)
  for (const e of entities) {
    const pathStart = pathStartByEntity.get(e.name)
    if (pathStart) {
      lines.push(emitInitTeleportAt(e, pathStart.x, pathStart.y, pathStart.heading))
    } else {
      lines.push(emitInitTeleport(e))
    }
  }
  lines.push(`      </Actions>`)
  lines.push(`    </Init>`)
  for (const line of emitFollowTrajectoryStory(pathAssignments)) {
    lines.push(line)
  }
  lines.push(`    <StopTrigger>`)
  lines.push(`      <ConditionGroup>`)
  lines.push(`        <Condition name="StopCondition" delay="0" conditionEdge="rising">`)
  lines.push(`          <ByValueCondition>`)
  lines.push(`            <SimulationTimeCondition value="60" rule="greaterThan"/>`)
  lines.push(`          </ByValueCondition>`)
  lines.push(`        </Condition>`)
  lines.push(`      </ConditionGroup>`)
  lines.push(`    </StopTrigger>`)
  lines.push(`  </Storyboard>`)

  lines.push(`</OpenSCENARIO>`)
  return lines.join('\n')
}
