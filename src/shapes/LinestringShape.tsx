import React from 'react'
import { ShapeRenderer, CoordinateType } from '../core/ShapeRenderer'
import { ShapeRecord, ShapeId, SegmentStyle } from '../core/types'

interface LinestringProps {
  pointIds: ShapeId[]
  color: string
  strokeWidth: number
  opacity: number
  dash: 'solid' | 'dashed' | 'dotted'
  segments?: Record<number, SegmentStyle>
}

type LinestringShape = ShapeRecord<'linestring', LinestringProps>

export class LinestringRenderer extends ShapeRenderer<LinestringShape> {
  static override type = 'linestring'

  override get coordinateType(): CoordinateType {
    return 'point-based'
  }

  getDefaultProps(): LinestringProps {
    return { pointIds: [], color: '#1a1a1a', strokeWidth: 2, opacity: 1, dash: 'solid' }
  }

  override getBounds(shape: LinestringShape) {
    const points = shape.props.pointIds
      .map(id => this.editor.getShape(id))
      .filter(Boolean)

    if (points.length === 0) return { x: shape.x, y: shape.y, width: 0, height: 0 }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const pt of points) {
      if (!pt) continue
      minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y)
      maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y)
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  }

  render(shape: LinestringShape) {
    const { pointIds, color, strokeWidth, opacity, dash } = shape.props
    const points = pointIds.map(id => this.editor.getShape(id)).filter(Boolean)
    if (points.length < 2) return null

    const d = points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt!.x} ${pt!.y}`).join(' ')
    const dashArray = dash === 'dashed' ? '8,4' : dash === 'dotted' ? '2,4' : undefined

    return (
      <svg style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', opacity }}>
        <path d={d} stroke={color} strokeWidth={strokeWidth} fill="none"
          strokeDasharray={dashArray} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
}
