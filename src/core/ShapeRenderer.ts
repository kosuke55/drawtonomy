import { ReactElement } from 'react'
import { ShapeRecord } from './types'
import type { Editor } from './Editor'

export type CoordinateType = 'self-contained' | 'point-based'

export abstract class ShapeRenderer<Shape extends ShapeRecord = ShapeRecord> {
  static type: string

  constructor(public editor: Editor) {}

  get coordinateType(): CoordinateType {
    return 'self-contained'
  }

  abstract getDefaultProps(): Shape['props']

  canRotate(_shape: Shape): boolean {
    return true
  }

  canEdit(_shape: Shape): boolean {
    return true
  }

  getBounds(shape: Shape): { x: number; y: number; width: number; height: number } {
    return { x: shape.x, y: shape.y, width: 100, height: 100 }
  }

  abstract render(shape: Shape): ReactElement | null

  renderSelection(shape: Shape): ReactElement | null {
    return null
  }

  hitTest(shape: Shape, point: { x: number; y: number }): boolean {
    const bounds = this.getBounds(shape)
    return (
      point.x >= bounds.x &&
      point.x <= bounds.x + bounds.width &&
      point.y >= bounds.y &&
      point.y <= bounds.y + bounds.height
    )
  }
}
