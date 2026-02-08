import React from 'react'
import { ShapeRenderer } from '../core/ShapeRenderer'
import { ShapeRecord } from '../core/types'

interface TextProps {
  text: string
  fontSize: number
  fontFamily: string
  color: string
  textAlign: 'left' | 'center' | 'right'
  opacity: number
}

type TextShape = ShapeRecord<'text', TextProps>

export class TextRenderer extends ShapeRenderer<TextShape> {
  static override type = 'text'

  getDefaultProps(): TextProps {
    return { text: '', fontSize: 16, fontFamily: 'Inter, sans-serif', color: '#1a1a1a', textAlign: 'left', opacity: 1 }
  }

  override getBounds(shape: TextShape) {
    const { text, fontSize } = shape.props
    const lines = text.split('\n')
    const width = Math.max(...lines.map(l => l.length * fontSize * 0.6), 20)
    const height = lines.length * fontSize * 1.4
    return { x: shape.x, y: shape.y, width, height }
  }

  render(shape: TextShape) {
    const { text, fontSize, fontFamily, color, textAlign, opacity } = shape.props
    return (
      <div style={{
        fontSize: `${fontSize}px`, fontFamily, color, textAlign, opacity,
        whiteSpace: 'pre-wrap', minWidth: '20px', lineHeight: 1.4, userSelect: 'none',
      }}>
        {text || '\u200B'}
      </div>
    )
  }
}
