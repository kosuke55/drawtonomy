import React from 'react'
import { ShapeRenderer } from '../core/ShapeRenderer'
import { ShapeRecord } from '../core/types'

interface RectangleProps {
  width: number
  height: number
  color: string
  fill: string
  strokeWidth: number
  opacity: number
}

type RectangleShape = ShapeRecord<'rectangle', RectangleProps>

export class RectangleRenderer extends ShapeRenderer<RectangleShape> {
  static override type = 'rectangle'

  getDefaultProps(): RectangleProps {
    return { width: 100, height: 80, color: '#1a1a1a', fill: 'none', strokeWidth: 2, opacity: 1 }
  }

  override getBounds(shape: RectangleShape) {
    return { x: shape.x, y: shape.y, width: shape.props.width, height: shape.props.height }
  }

  render(shape: RectangleShape) {
    const { width, height, color, fill, strokeWidth, opacity } = shape.props
    return (
      <svg width={width} height={height} style={{ opacity, overflow: 'visible' }}>
        <rect
          x={strokeWidth / 2} y={strokeWidth / 2}
          width={width - strokeWidth} height={height - strokeWidth}
          stroke={color} fill={fill} strokeWidth={strokeWidth} rx={2} ry={2}
        />
      </svg>
    )
  }

  override renderSelection(shape: RectangleShape) {
    const { width, height } = shape.props
    return (
      <rect x={0} y={0} width={width} height={height}
        fill="none" stroke="#4f46e5" strokeWidth={1.5} rx={2} ry={2} />
    )
  }
}
