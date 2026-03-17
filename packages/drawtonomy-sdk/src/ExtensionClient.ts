// Extension Client - postMessage communication wrapper for extension side
import type {
  InitPayload,
  ShapeFilter,
  BaseShape,
  DrawtonomySnapshot,
} from './types'

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  timeout: ReturnType<typeof setTimeout>
}

export class ExtensionClient {
  private manifestId: string
  private initPromise: Promise<InitPayload>
  private initResolve!: (payload: InitPayload) => void
  private pendingRequests = new Map<string, PendingRequest>()
  private requestTimeout: number

  constructor(manifestId: string, options?: { requestTimeout?: number }) {
    this.manifestId = manifestId
    this.requestTimeout = options?.requestTimeout ?? 30_000

    this.initPromise = new Promise(resolve => {
      this.initResolve = resolve
    })

    window.addEventListener('message', this.handleMessage.bind(this))

    // Send ready signal
    this.send({ type: 'ext:ready', payload: { manifestId } })
  }

  /**
   * Wait for the host to send init payload
   */
  async waitForInit(): Promise<InitPayload> {
    return this.initPromise
  }

  // --- shapes:write ---

  addShapes(shapes: BaseShape[]) {
    this.send({ type: 'ext:shapes-add', payload: { shapes } })
  }

  updateShapes(updates: Array<{ id: string; props: Record<string, unknown> }>) {
    this.send({ type: 'ext:shapes-update', payload: { updates } })
  }

  deleteShapes(ids: string[]) {
    this.send({ type: 'ext:shapes-delete', payload: { ids } })
  }

  // --- shapes:read ---

  async requestShapes(filter?: ShapeFilter): Promise<BaseShape[]> {
    const requestId = this.nextRequestId()
    this.send({ type: 'ext:shapes-request', payload: { requestId, filter } })
    const response = await this.waitForResponse(requestId) as { shapes: BaseShape[] }
    return response.shapes
  }

  // --- snapshot:read ---

  async requestSnapshot(): Promise<DrawtonomySnapshot> {
    const requestId = this.nextRequestId()
    this.send({ type: 'ext:snapshot-request', payload: { requestId } })
    const response = await this.waitForResponse(requestId) as { snapshot: DrawtonomySnapshot }
    return response.snapshot
  }

  // --- viewport:read ---

  async requestViewport(): Promise<{ x: number; y: number; zoom: number; width: number; height: number }> {
    const requestId = this.nextRequestId()
    this.send({ type: 'ext:viewport-request', payload: { requestId } })
    return await this.waitForResponse(requestId) as { x: number; y: number; zoom: number; width: number; height: number }
  }

  // --- selection:read ---

  async requestSelection(): Promise<{ ids: string[] }> {
    const requestId = this.nextRequestId()
    this.send({ type: 'ext:selection-request', payload: { requestId } })
    return await this.waitForResponse(requestId) as { ids: string[] }
  }

  // --- ui:notify ---

  notify(message: string, level: 'info' | 'success' | 'error' = 'info') {
    this.send({ type: 'ext:notify', payload: { message, level } })
  }

  // --- ui:panel ---

  resize(height: number, width?: number) {
    this.send({ type: 'ext:resize', payload: { height, width } })
  }

  // --- Internal ---

  private send(message: unknown) {
    window.parent.postMessage(message, '*')
  }

  private handleMessage(event: MessageEvent) {
    const data = event.data
    if (!data || typeof data !== 'object' || typeof data.type !== 'string') return
    if (!data.type.startsWith('ext:')) return

    if (data.type === 'ext:init') {
      this.initResolve(data.payload)
      return
    }

    // Handle responses
    if (data.type === 'ext:error' && data.payload?.requestId) {
      const pending = this.pendingRequests.get(data.payload.requestId)
      if (pending) {
        clearTimeout(pending.timeout)
        this.pendingRequests.delete(data.payload.requestId)
        pending.reject(new Error(data.payload.message))
      }
      return
    }

    const requestId = data.payload?.requestId
    if (requestId) {
      const pending = this.pendingRequests.get(requestId)
      if (pending) {
        clearTimeout(pending.timeout)
        this.pendingRequests.delete(requestId)
        pending.resolve(data.payload)
      }
    }
  }

  private requestIdCounter = 0

  private nextRequestId(): string {
    return `${this.manifestId}_${++this.requestIdCounter}_${Date.now().toString(36)}`
  }

  private waitForResponse(requestId: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        reject(new Error(`Request ${requestId} timed out`))
      }, this.requestTimeout)

      this.pendingRequests.set(requestId, { resolve, reject, timeout })
    })
  }
}
