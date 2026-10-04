import type { Transition } from 'animplus';
export interface CssTarget<T extends object> { object: T; selector: string; name: string; baseline: Record<string, number>; transform: string }
const number = (value: number) => String(Math.round(value * 1e7) / 1e7);
const comment = (value: string) => value.replace(/\*\//g, '* /').replace(/[\r\n]/g, ' ');
const suffix = (key: string) => key.replace(/\./g, '-');
const unit = (key: string) => key.startsWith('pos.') ? 'px' : key === 'rot' || key.startsWith('skew.') ? 'deg' : '';
const value = (key: string, scalar: number) => `${number(scalar)}${unit(key)}`;
function timing<T extends object>(job: Readonly<Transition<T>>) {
  const name = job.easingName;
  if (name === 'linear') return 'linear';
  if (name?.startsWith('bezier(')) return `cubic-${name}`;
  const exact: Record<string, string> = {
    'quad-in': 'cubic-bezier(.3333333333,0,.6666666667,.3333333333)',
    'quad-out': 'cubic-bezier(.3333333333,.6666666667,.6666666667,1)',
    'cubic-in': 'cubic-bezier(.3333333333,0,.6666666667,0)',
    'cubic-out': 'cubic-bezier(.3333333333,1,.6666666667,1)'
  };
  if (name && exact[name]) return exact[name];
  return `linear(${Array.from({ length: 201 }, (_, index) => number(job.easing(index / 200))).join(', ')})`;
}
function progress<T extends object>(job: Readonly<Transition<T>>, time: number) {
  if (time < job.start) return 0;
  if (!job.duration || (job.repeat !== -1 && time >= job.start + job.duration * (job.repeat + 1))) return job.direction === 'alternate' && job.repeat % 2 === 1 ? 0 : 1;
  const elapsed = time - job.start, remainder = elapsed % job.duration;
  const boundary = elapsed > 0 && remainder < 1e-12;
  const cycle = Math.floor(elapsed / job.duration) - (boundary ? 1 : 0);
  const fraction = boundary ? 1 : remainder / job.duration;
  return job.direction === 'alternate' && cycle % 2 === 1 ? 1 - fraction : fraction;
}
/** Export independent tracks; registered CSS properties keep simultaneous axes separate. */
export function exportCssAnimation<T extends object>(jobs: readonly Readonly<Transition<T>>[], _duration: number, targets: CssTarget<T>[], name: string, hasEvents = false): string {
  const lines = ['/* Generated from Anim+. Each track has its own timing and keyframes. */'];
  if (hasEvents) lines.push('/* Events require JavaScript and are not included in CSS. */');
  if (!jobs.length) return lines.join('\n') + '\n\n/* No property animations for the current selection. */\n';
  const prefix = `anim-${name.replace(/[^A-Za-z0-9_-]/g, '-') || 'animation'}`;
  for (const [index, target] of targets.entries()) {
    const transitions = jobs.filter(job => job.object === target.object).sort((a, b) => a.activation - b.activation);
    if (!transitions.length) continue;
    const channels = new Set(transitions.map(job => job.key));
    const variable = (key: string) => `--${prefix}-${index + 1}-${suffix(key)}`;
    const reference = (key: string) => channels.has(key) ? `var(${variable(key)})` : value(key, target.baseline[key]);
    for (const key of channels) lines.push('', `@property ${variable(key)} {`, `  syntax: "${unit(key) === 'px' ? '<length>' : unit(key) === 'deg' ? '<angle>' : '<number>'}";`, '  inherits: false;', `  initial-value: ${value(key, target.baseline[key])};`, '}');
    const animations: string[] = [], keyframes: string[] = [];
    const frames = (identifier: string, property: string, from: number, to: number, key: string) => {
      keyframes.push('', `@keyframes ${identifier} {`, `  from { ${property}: ${value(key, from)}; }`, `  to { ${property}: ${value(key, to)}; }`, '}');
    };
    for (const [track, job] of transitions.entries()) {
      const identifier = `${prefix}-${index + 1}-${suffix(job.key)}-${track + 1}`, property = variable(job.key);
      const gap = Math.max(0, job.start - job.activation);
      keyframes.push('', `/* ${comment(target.name)} · ${job.key} · line ${job.line} */`);
      if (job.cancelledAt !== undefined) {
        // A replacement can cut a cycle halfway through. Sample only this track,
        // so its truncated endpoint and original curve remain correct.
        const span = Math.max(0, job.cancelledAt - job.activation), steps = Math.min(600, Math.max(1, Math.ceil(span * 120)));
        const times = new Set(Array.from({ length: steps + 1 }, (_, step) => span * step / steps));
        const boundary = (time: number) => {
          if (time < job.activation || time > job.cancelledAt!) return;
          times.add(time - job.activation);
          if (time > job.activation) times.add(Math.max(0, time - job.activation - .000001));
          if (time < job.cancelledAt!) times.add(Math.min(span, time - job.activation + .000001));
        };
        boundary(job.start);
        if (job.duration) for (let cycle = 1; cycle <= 10000 && job.start + cycle * job.duration < job.cancelledAt; cycle++) boundary(job.start + cycle * job.duration);
        animations.push(`${identifier} ${number(span)}s linear ${number(job.activation)}s 1 normal forwards`);
        keyframes.push(`@keyframes ${identifier} {`);
        for (const elapsed of [...times].sort((a, b) => a - b)) keyframes.push(`  ${number(span ? elapsed / span * 100 : 100)}% { ${property}: ${value(job.key, job.from + (job.to - job.from) * job.easing(progress(job, job.activation + elapsed)))}; }`);
        keyframes.push('}'); continue;
      }
      // Applying `from` happens at activation, before the runtime delay. A hold
      // is needed for delayed Pipe actions, without backwards-filling over parents.
      if (gap > 0 && job.activation > 0) {
        const hold = `${identifier}-hold`;
        animations.push(`${hold} ${number(gap)}s linear ${number(job.activation)}s 1 normal forwards`);
        frames(hold, property, job.from, job.from, job.key);
      }
      const fill = gap > 0 && job.activation === 0 ? 'both' : 'forwards';
      animations.push(`${identifier} ${number(job.duration)}s ${timing(job)} ${number(job.start)}s ${job.repeat === -1 ? 'infinite' : job.repeat + 1} ${job.direction ?? 'normal'} ${fill}`);
      frames(identifier, property, job.from, job.to, job.key);
    }
    lines.push('', `/* ${comment(target.name)} */`, `${target.selector} {`);
    for (const key of channels) lines.push(`  ${variable(key)}: ${value(key, target.baseline[key])};`);
    if (channels.has('opacity')) lines.push(`  opacity: ${reference('opacity')};`);
    if (['pos.x', 'pos.y', 'pos.z'].some(key => channels.has(key))) lines.push(`  translate: ${['pos.x', 'pos.y', 'pos.z'].map(reference).join(' ')};`);
    if (['scale.x', 'scale.y'].some(key => channels.has(key))) lines.push(`  scale: ${['scale.x', 'scale.y'].map(reference).join(' ')};`);
    if (channels.has('rot')) lines.push(`  rotate: ${reference('rot')};`);
    if (['skew.x', 'skew.y'].some(key => channels.has(key))) lines.push(`  transform: ${target.transform === 'none' ? '' : `${target.transform} `}skew(${reference('skew.x')}, ${reference('skew.y')});`);
    lines.push(`  animation:\n    ${animations.join(',\n    ')};`, '}', ...keyframes);
  }
  return lines.join('\n') + '\n';
}
