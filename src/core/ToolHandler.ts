import type { Editor } from './Editor'
import { InputHandlers, KeyInput, PointerInput } from './types'

export abstract class ToolHandler implements InputHandlers {
  static id: string

  constructor(public editor: Editor) {}

  onEnter?(): void
  onExit?(): void

  onPointerDown?(info: PointerInput): void
  onPointerMove?(info: PointerInput): void
  onPointerUp?(info: PointerInput): void
  onKeyDown?(info: KeyInput): void
  onKeyUp?(info: KeyInput): void
  onDoubleClick?(info: PointerInput): void

  isDrawing(): boolean {
    return false
  }
}
