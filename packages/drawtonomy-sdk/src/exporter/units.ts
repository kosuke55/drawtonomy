// Coordinate / unit conversions shared by the OpenDRIVE / OpenSCENARIO
// exporters.
//
// The drawtonomy canvas uses pixels with y growing downward.
// OpenDRIVE / OpenSCENARIO both use ENU meters with y growing upward.

/** Conversion factor from canvas pixels to meters. */
export const PIXELS_PER_METER = 16.67

/** Canvas pixels → meters (scalar). */
export function pxToMeter(px: number): number {
  return px / PIXELS_PER_METER
}

/** Canvas x → ENU x (no axis flip). */
export function pxToEnuX(x: number): number {
  return pxToMeter(x)
}

/** Canvas y → ENU y (axis flipped: canvas y is down, ENU y is up). */
export function pxToEnuY(y: number): number {
  return -pxToMeter(y)
}

/**
 * Format a number for OpenDRIVE / OpenSCENARIO output: 6 decimal places, no
 * exponential. Non-finite values become "0".
 */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return n.toFixed(6)
}

/**
 * Full-precision number formatting (shortest round-trip representation) for
 * attributes whose magnitude can sit far below the 6-decimal grid, e.g. arc
 * curvatures and paramPoly3 cubic coefficients. xsd:double accepts both plain
 * and exponent notation.
 */
export function fmtPrecise(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return String(n)
}

/** XML attribute / text escaping. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
