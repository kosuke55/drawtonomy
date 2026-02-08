import React from 'react'
import { ShapeRenderer } from '../core/ShapeRenderer'
import { ShapeRecord } from '../core/types'

interface EllipseProps {
  width: number
  height: number
  color: string
  fill: string
  strokeWidth: number
  opacity: number
}

type EllipseShape = ShapeRecord<'ellipse', EllipseProps>

export class EllipseRenderer extends ShapeRenderer<EllipseShape> {
  static override type = 'ellipse'

  getDefaultProps(): EllipseProps {
    return { width: 100, height: 80, color: '#1a1a1a', fill: 'none', strokeWidth: 2, opacity: 1 }
  }

  override getBounds(shape: EllipseShape) {
    return { x: shape.x, y: shape.y, width: shape.props.width, height: shape.props.height }
  }

  override hitTest(shape: EllipseShape, point: { x: number; y: number }): boolean {
    const { width, height } = shape.props
    const cx = shape.x + width / 2
    const cy = shape.y + height / 2
    const dx = (point.x - cx) / (width / 2)
    const dy = (point.y - cy) / (height / 2)
    return dx * dx + dy * dy <= 1
  }

  render(shape: EllipseShape) {
    const { width, height, color, fill, strokeWidth, opacity } = shape.props
    return (
      <svg width={width} height={height} style={{ opacity, overflow: 'visible' }}>
        <ellipse
          cx={width / 2} cy={height / 2}
          rx={width / 2 - strokeWidth / 2} ry={height / 2 - strokeWidth / 2}
          stroke={color} fill={fill} strokeWidth={strokeWidth}
        />
      </svg>
    )
  }
}
