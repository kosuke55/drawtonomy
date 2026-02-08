export class Vec {
  constructor(public x: number, public y: number) {}

  static of(x: number, y: number): Vec {
    return new Vec(x, y)
  }

  static distance(a: Vec, b: Vec): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
  }

  static lerp(a: Vec, b: Vec, t: number): Vec {
    return new Vec(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
  }

  static add(a: Vec, b: Vec): Vec {
    return new Vec(a.x + b.x, a.y + b.y)
  }

  static subtract(a: Vec, b: Vec): Vec {
    return new Vec(a.x - b.x, a.y - b.y)
  }

  static angle(a: Vec, b: Vec): number {
    return Math.atan2(b.y - a.y, b.x - a.x)
  }

  static rotate(v: Vec, radians: number): Vec {
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)
    return new Vec(v.x * cos - v.y * sin, v.x * sin + v.y * cos)
  }

  static scale(v: Vec, factor: number): Vec {
    return new Vec(v.x * factor, v.y * factor)
  }

  static normalize(v: Vec): Vec {
    const len = Math.sqrt(v.x * v.x + v.y * v.y)
    if (len === 0) return new Vec(0, 0)
    return new Vec(v.x / len, v.y / len)
  }

  static normal(v: Vec): Vec {
    return new Vec(-v.y, v.x)
  }

  static dot(a: Vec, b: Vec): number {
    return a.x * b.x + a.y * b.y
  }

  static cross(a: Vec, b: Vec): number {
    return a.x * b.y - a.y * b.x
  }

  static length(v: Vec): number {
    return Math.sqrt(v.x * v.x + v.y * v.y)
  }

  static midpoint(a: Vec, b: Vec): Vec {
    return new Vec((a.x + b.x) / 2, (a.y + b.y) / 2)
  }
}
