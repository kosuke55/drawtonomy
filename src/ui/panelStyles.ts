import React from 'react'

export const PANEL_COLORS = {
  bgDefault: '#f4f4f5',
  bgActive: '#e0e7ff',
  bgValue: '#f9fafb',
  bgWhite: '#ffffff',

  textMuted: '#71717a',
  textActive: '#4f46e5',
  textSecondary: '#6b7280',
  textLabel: '#374151',
  textIndex: '#9ca3af',
  textDark: '#1e1e1e',

  borderDefault: '#e4e4e7',
  borderActive: '#a5b4fc',

  separator: '#e4e4e7',
  sliderBg: '#e4e4e7',
  danger: '#dc2626',
} as const

export type PanelColorKey = keyof typeof PANEL_COLORS

export const PANEL_SPACING = {
  xs: '2px',
  sm: '4px',
  md: '6px',
  lg: '8px',
  indent: '16px',
} as const

export const PANEL_TYPOGRAPHY = {
  sectionTitle: { fontSize: '0.5625rem', fontWeight: 600 },
  button: { fontSize: '0.5625rem', fontWeight: 500 },
  label: { fontSize: '0.625rem', fontWeight: 400 },
  value: { fontSize: '0.5625rem', fontWeight: 500 },
} as const

export const COLOR_GRID = {
  buttonSize: 22,
  columns: 6,
  gap: 2,
} as const

export const sectionTitleStyle: React.CSSProperties = {
  fontSize: '0.5625rem',
  fontWeight: 600,
  color: PANEL_COLORS.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: PANEL_SPACING.sm,
}

export const buttonStyle: React.CSSProperties = {
  flex: 1,
  padding: '4px',
  fontSize: '0.5625rem',
  backgroundColor: PANEL_COLORS.bgDefault,
  color: PANEL_COLORS.textMuted,
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  transition: 'all 0.15s',
  fontWeight: 500,
  outline: 'none',
}

export const activeButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  backgroundColor: PANEL_COLORS.bgActive,
  color: PANEL_COLORS.textActive,
}

export const sliderStyle: React.CSSProperties = {
  width: '100%',
  height: '4px',
  appearance: 'none',
  backgroundColor: PANEL_COLORS.sliderBg,
  borderRadius: '2px',
  cursor: 'pointer',
  outline: 'none',
}

export const buttonGroupStyle: React.CSSProperties = {
  display: 'flex',
  gap: PANEL_SPACING.sm,
}

export const templateGridStyle: React.CSSProperties = {
  display: 'flex',
  gap: PANEL_SPACING.sm,
  flexWrap: 'wrap',
}

export const getButtonStyle = (isActive: boolean): React.CSSProperties => {
  return isActive ? activeButtonStyle : buttonStyle
}
