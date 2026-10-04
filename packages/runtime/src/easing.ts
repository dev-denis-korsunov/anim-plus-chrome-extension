const bounceOut = (t: number): number => {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375;
  return n * (t -= 2.625 / d) * t + .984375;
};
const families: Record<string, (t: number) => number> = {
  sin: t => 1 - Math.cos(t * Math.PI / 2),
  quad: t => t * t, cubic: t => t ** 3, quart: t => t ** 4, quint: t => t ** 5,
  expo: t => 2 ** (10 * t - 10), circ: t => 1 - Math.sqrt(1 - t * t),
  back: t => 2.70158 * t ** 3 - 1.70158 * t * t,
  bounce: t => 1 - bounceOut(1 - t),
  elastic: t => -(2 ** (10 * t - 10)) * Math.sin((10 * t - 10.75) * 2 * Math.PI / 3),
};
export function easing(name = 'linear'): (t: number) => number {
  if (name === 'linear') return t => t;
  const bezier = /^bezier\(([^)]+)\)$/.exec(name);
  if (bezier) {
    const values = bezier[1].split(',').map(Number);
    if (values.length !== 4 || !values.every(Number.isFinite) || values[0] < 0 || values[0] > 1 || values[2] < 0 || values[2] > 1) throw new Error(`Invalid Bezier: ${name}`);
    const [x1, y1, x2, y2] = values;
    const curve = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
    return x => {
      if (x === 0 || x === 1) return x;
      let lo = 0, hi = 1;
      for (let i = 0; i < 48; i++) { const mid = (lo + hi) / 2; if (curve(mid, x1, x2) < x) lo = mid; else hi = mid; }
      return curve((lo + hi) / 2, y1, y2);
    };
  }
  const match = /^(sin|quad|cubic|quart|quint|expo|circ|elastic|back|bounce)-(in-out|in|out)$/.exec(name);
  if (!match) throw new Error(`Unsupported easing: ${name}`);
  const fn = families[match[1]], mode = match[2];
  return t => {
    if (t === 0 || t === 1) return t;
    if (mode === 'in') return fn(t);
    if (mode === 'out') return 1 - fn(1 - t);
    return t < .5 ? fn(2 * t) / 2 : 1 - fn(2 - 2 * t) / 2;
  };
}
