export const TIMELINE_PADDING = .125;

/** Performance TimelineGrid: at least 64px between ticks, rounded 1/2/5 steps. */
export function timelineTicks(start: number, span: number, width: number) {
  const pixelsPerTime = Math.max(1, width) / span;
  let step = 10 ** Math.ceil(Math.log10(span * 64 / Math.max(1, width)));
  if (step * pixelsPerTime >= 5 * 64) step /= 5;
  if (step * pixelsPerTime >= 2 * 64) step /= 2;
  step = Math.max(.01, step);
  const first = Math.ceil(start / step) * step;
  const result = [];
  for (let i = 0; i < Math.ceil((start + span - first) / step) + 1; i++) {
    const value = first + step * i;
    result.push({ value, left: (value - start) / span * 100,
      label: `${(Math.round(value * 100) * 10).toLocaleString('en-US')} ms` });
  }
  return result;
}
