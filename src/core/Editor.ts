import {
  ShapeRecord,
  ShapeId,
  Point,
  SelectionState,
  CursorState,
  InputState,
  ViewportState,
} from './types'
import { ShapeRenderer } from './ShapeRenderer'
import { ToolHandler } from './ToolHandler'

export function generateId(): ShapeId {
  return `shape:${Math.random().toString(36).substr(2, 9)}`
}

export class Editor {
  private shapes: Map<ShapeId, ShapeRecord> = new Map()
  private renderers: Map<string, ShapeRenderer> = new Map()
  private tools: Map<string, ToolHandler> = new Map()
  private activeTool: ToolHandler | null = null
  private selection: SelectionState = { selectedIds: new Set() }
  private cursor: CursorState = { type: 'default', rotation: 0 }
  public inputs: InputState = {
    cursorPosition: { x: 0, y: 0 },
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
  }
  private viewport: ViewportState = { x: 0, y: 0, zoom: 1.0 }
  private container: HTMLElement | null = null
  private listeners: Set<() => void> = new Set()

  constructor() {}

  setContainer(el: HTMLElement) { this.container = el }
  getContainer(): HTMLElement | null { return this.container }

  registerRenderer(renderer: ShapeRenderer) {
    const type = (renderer.constructor as typeof ShapeRenderer).type
    this.renderers.set(type, renderer)
  }

  getRenderer<T extends ShapeRenderer>(type: string): T {
    const r = this.renderers.get(type)
    if (!r) throw new Error(`Renderer not found: ${type}`)
    return r as T
  }

  registerTool(tool: ToolHandler) {
    const id = (tool.constructor as typeof ToolHandler).id
    this.tools.set(id, tool)
  }

  setActiveTool(toolId: string) {
    this.activeTool?.onExit?.()
    this.activeTool = this.tools.get(toolId) ?? null
    this.activeTool?.onEnter?.()
    this.notify()
  }

  getActiveToolId(): string | null {
    if (!this.activeTool) return null
    return (this.activeTool.constructor as typeof ToolHandler).id
  }

  addShape<T extends ShapeRecord>(partial: Partial<T> & { type: string }): T {
    const renderer = this.getRenderer(partial.type)
    const shape: T = {
      id: generateId(),
      x: 0,
      y: 0,
      rotation: 0,
      zIndex: this.shapes.size,
      props: renderer.getDefaultProps(),
      ...partial,
    } as T
    this.shapes.set(shape.id, shape)
    this.notify()
    return shape
  }

  patchShape<T extends ShapeRecord>(id: ShapeId, partial: Partial<T>) {
    const existing = this.shapes.get(id)
    if (!existing) return
    const updated = { ...existing, ...partial }
    if (partial.props) {
      updated.props = { ...existing.props, ...partial.props }
    }
    this.shapes.set(id, updated)
    this.notify()
  }

  removeShape(id: ShapeId) {
    this.shapes.delete(id)
    this.selection.selectedIds.delete(id)
    this.notify()
  }

  getShape<T extends ShapeRecord>(id: ShapeId): T | undefined {
    return this.shapes.get(id) as T | undefined
  }

  getAllShapes(): ShapeRecord[] {
    return Array.from(this.shapes.values())
  }

  getShapesByType<T extends ShapeRecord>(type: string): T[] {
    return this.getAllShapes().filter(s => s.type === type) as T[]
  }

  select(...ids: ShapeId[]) {
    this.selection.selectedIds = new Set(ids)
    this.notify()
  }

  selectAll() {
    this.selection.selectedIds = new Set(this.shapes.keys())
    this.notify()
  }

  clearSelection() {
    this.selection.selectedIds.clear()
    this.notify()
  }

  getSelectedIds(): Set<ShapeId> {
    return this.selection.selectedIds
  }

  getSelectedShapes(): ShapeRecord[] {
    return Array.from(this.selection.selectedIds)
      .map(id => this.shapes.get(id))
      .filter(Boolean) as ShapeRecord[]
  }

  getViewport(): ViewportState {
    return { ...this.viewport }
  }

  setViewport(v: Partial<ViewportState>) {
    this.viewport = { ...this.viewport, ...v }
    this.notify()
  }

  viewportToWorld(screenX: number, screenY: number): Point {
    return {
      x: (screenX - this.viewport.x) / this.viewport.zoom,
      y: (screenY - this.viewport.y) / this.viewport.zoom,
    }
  }

  worldToViewport(worldX: number, worldY: number): Point {
    return {
      x: worldX * this.viewport.zoom + this.viewport.x,
      y: worldY * this.viewport.zoom + this.viewport.y,
    }
  }

  getCursor(): CursorState { return { ...this.cursor } }

  setCursor(cursor: Partial<CursorState>) {
    this.cursor = { ...this.cursor, ...cursor }
    this.notify()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify() {
    this.listeners.forEach(fn => fn())
  }
}
