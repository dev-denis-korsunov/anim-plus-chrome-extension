import { ObjectAdapter } from './object-adapter.js';
import { tree, select } from './selection.js';
import type { Definition, Program, RunOptions, Plan, Row, Transition, EventSegment, Status, Context, Adapter } from './types.js';

const ownership = new WeakMap();
const terminal = new Set(['Completed', 'Cancelled', 'Failed', 'TargetDestroyed']);
const finiteTime = (value: number, name: string): number => {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${name}: ${value}`);
  return value;
};

export function prepare<T extends object>(program: Program, name: string, root: T, { adapter = new ObjectAdapter() as Adapter<T>, onEvent = () => {}, variables = {}, bindings: inputs = {} }: RunOptions<T> = {}): AnimationRun<T> {
  if (!program.definitions.has(name)) throw new Error(`Unknown animation: ${name}`);
  const scene = tree(root, adapter), snapshots = new Map<T, Map<string, number>>(), transitions: Transition<T>[] = [], events: EventSegment[] = [];
  const bindings: Context = Object.create(null);
  const targets = new Map<string, T[]>();
  const refreshEndpoints: (() => void)[] = [];
  function evaluateBindings(initial: boolean) {
    if (inputs.mouse) {
      if (!Number.isFinite(inputs.mouse.x) || !Number.isFinite(inputs.mouse.y)) throw new Error('Mouse coordinates must be finite');
      bindings['mouse.x'] = inputs.mouse.x; bindings['mouse.y'] = inputs.mouse.y;
    }
    for (const [key, declaration] of program.variables) {
      try {
        const binding = declaration.binding;
        const value = !initial && targets.has(key) ? targets.get(key) : Object.hasOwn(variables, key) ? variables[key] : binding
          ? binding.kind === 'selected' ? inputs.selected : inputs.query ? inputs.query(binding.selector, binding.all) : adapter.query?.(binding.selector, binding.all)
          : declaration.evaluate!(bindings);
        if (binding || typeof value === 'object') {
          if (value == null) throw new Error(`Binding ${key} did not resolve an element`);
          const objects = Array.isArray(value) ? value : [value];
          if (objects.some(object => !scene.byObject.has(object as T))) throw new Error(`Binding ${key} must reference elements inside the animation root`);
          targets.set(key, [...new Set(objects as T[])]);
          if (objects.length === 1) {
            const point = (inputs.geometry ?? (target => adapter.geometry(target)))(objects[0] as T);
            bindings[`${key}.x`] = point.x; bindings[`${key}.y`] = point.y;
          }
        } else {
          if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Variable ${key} must be finite`);
          bindings[key] = value;
        }
      } catch (cause) { throw new Error(`Line ${declaration.line}: ${cause.message}`, { cause }); }
    }
  }
  for (const key of Object.keys(variables)) if (!program.variables.has(key)) throw new Error(`Unknown variable override: ${key}`);
  evaluateBindings(true);
  function baseline(object: T, key: string): number {
    if (!snapshots.has(object)) snapshots.set(object, new Map());
    const values = snapshots.get(object)!;
    if (!values.has(key)) values.set(key, adapter.read(object, key));
    return values.get(key)!;
  }
  function build(definition: Definition, inherited: Row<T>[] | null, roots: T[], activation: number, ancestry: string[]): { barrier: number; lifetime: number } {
    if (ancestry.includes(definition.name)) throw new Error(`Recursive animation: ${definition.name}`);
    if (ancestry.length >= 128) throw new Error('Animation call depth limit exceeded');
    let selection = inherited, hadActions = false, lastEnd = activation, lifetime = activation;
    const groups = new Map<number, number>();
    for (const node of definition.nodes) {
      try {
        if (node.kind === 'selection') {
          if (hadActions) { selection = null; hadActions = false; }
          selection = select(node, selection, roots, scene, adapter, targets); continue;
        }
        const startActivation = node.parent === null ? activation : groups.get(node.parent);
        if (startActivation === undefined) throw new Error('Invalid Pipe parent');
        let groupEnd = startActivation, groupLifetime = startActivation;
        if (node.kind === 'call') {
          const qualified = node.name.includes('.') ? node.name : definition.namespace ? `${definition.namespace}.${node.name}` : node.name;
          const called = program.definitions.get(qualified);
          if (!called) throw new Error(`Unknown animation: ${qualified}`);
          const collection = selection ?? [];
          const result = build(called, collection, collection.map(item => item.object), startActivation, [...ancestry, definition.name]);
          groupEnd = result.barrier; groupLifetime = result.lifetime;
        } else if (node.kind === 'event') {
          const context = { ...bindings, count: selection?.length ?? 0 };
          const delay = finiteTime(node.delayValue(context), 'delay'), duration = finiteTime(node.durationValue(context), 'time');
          events.push({ name: node.name, start: startActivation + delay, end: startActivation + delay + duration, line: node.line });
          groupEnd = groupLifetime = startActivation + delay + duration;
        } else {
          for (const item of selection ?? []) {
            const channels = adapter.channels(node.property);
            const context = { ...bindings, index: item.index ?? 0, depth: item.depth, sibling: item.sibling, count: selection!.length, self: baseline(item.object, channels[0]) };
            const delay = finiteTime(node.delayValue(context), 'delay'), duration = finiteTime(node.durationValue(context), 'time');
            if (duration === 0 && node.repeat === -1) throw new Error('Zero-time infinite repeat');
            const start = startActivation + delay;
            const end = start + duration * (node.repeat === -1 ? 1 : node.repeat + 1);
            for (const key of channels) {
              const values = { ...context, self: baseline(item.object, key) };
              const job = { object: item.object, key, from: node.fromValue(values), to: node.toValue(values), activation: startActivation, start, end, duration, repeat: node.repeat, direction: node.direction, easing: node.easeValue, easingName: node.easingName, line: node.line, index: context.index, depth: context.depth };
              transitions.push(job);
              if (inputs.live) refreshEndpoints.push(() => {
                const live = { ...values, ...bindings };
                job.from = node.fromValue(live); job.to = node.toValue(live);
              });
            }
            groupEnd = Math.max(groupEnd, end);
            groupLifetime = node.repeat === -1 ? Infinity : Math.max(groupLifetime, end);
          }
        }
        hadActions = true; groups.set(node.id, groupEnd);
        lastEnd = Math.max(lastEnd, groupEnd); lifetime = Math.max(lifetime, groupLifetime);
      } catch (error) { throw new Error(`Line ${node.line}: ${error.message}`, { cause: error }); }
    }
    return { barrier: lastEnd, lifetime };
  }
  build(program.definitions.get(name)!, null, [root], 0, []);
  transitions.sort((a, b) => a.activation - b.activation);
  events.sort((a, b) => a.start - b.start);
  const owners = new Map<T, Map<string, Transition<T>>>();
  for (const job of transitions) {
    let channels = owners.get(job.object);
    if (!channels) { channels = new Map(); owners.set(job.object, channels); }
    const previous = channels.get(job.key);
    if (previous) previous.cancelledAt = job.activation;
    channels.set(job.key, job);
  }
  const lifetime = Math.max(0, ...events.map(event => event.end), ...transitions.map(job =>
    Math.min(job.repeat === -1 ? Infinity : job.end, job.cancelledAt ?? Infinity)));

  return new AnimationRun({ adapter, snapshots, transitions, events, duration: lifetime, onEvent,
    refresh: inputs.live ? () => { evaluateBindings(false); for (const refresh of refreshEndpoints) refresh(); } : undefined });
}

export class AnimationRun<T extends object = object> {
  readonly owner: symbol;
  status: Status;
  time: number;
  readonly duration: number;
  private _plan: Plan<T>;
  private _claimed: boolean;
  private _fired: Set<EventSegment>;
  constructor(plan: Plan<T>) {
    this.owner = Symbol('Anim+ run'); this.status = 'Pending'; this.time = 0;
    this.duration = plan.duration; this._plan = plan; this._claimed = false; this._fired = new Set();
  }
  _claim() {
    const { snapshots } = this._plan;
    if (this._claimed) {
      for (const [object, values] of snapshots) for (const key of values.keys()) {
        if (ownership.get(object)?.get(key) !== this) throw new Error(`Channel ${key} was replaced by another run`);
      }
      return;
    }
    for (const [object, values] of snapshots) for (const key of values.keys()) {
      const other = ownership.get(object)?.get(key);
      if (other && other !== this && !terminal.has(other.status)) throw new Error(`Channel ${key} is owned by another active run`);
    }
    for (const [object, values] of snapshots) {
      if (!ownership.has(object)) ownership.set(object, new Map());
      for (const key of values.keys()) ownership.get(object).set(key, this);
    }
    this._claimed = true;
  }
  _pose(time: number) {
    const { adapter, snapshots, transitions } = this._plan;
    if ([...snapshots.keys()].some(object => !adapter.alive(object))) { this.status = 'TargetDestroyed'; this._release(); return; }
    this._plan.refresh?.();
    for (const [object, values] of snapshots) {
      for (const [key, value] of values) if (ownership.get(object)?.get(key) === this) adapter.write(object, key, value);
    }
    for (const job of transitions) {
      if (time < job.activation || time >= (job.cancelledAt ?? Infinity) || !adapter.alive(job.object) || ownership.get(job.object)?.get(job.key) !== this) continue;
      let progress = 0;
      if (time >= job.start) {
        if (job.duration === 0 || (job.repeat !== -1 && time >= job.end)) progress = job.direction === 'alternate' && job.repeat % 2 === 1 ? 0 : 1;
        else {
          const elapsed = time - job.start, remainder = elapsed % job.duration;
          const boundary = elapsed > 0 && remainder < 1e-12;
          const cycle = Math.floor(elapsed / job.duration) - (boundary ? 1 : 0);
          progress = boundary ? 1 : remainder / job.duration;
          if (job.direction === 'alternate' && cycle % 2 === 1) progress = 1 - progress;
        }
      }
      adapter.write(job.object, job.key, job.from + (job.to - job.from) * job.easing(progress));
    }
  }
  play() {
    if (terminal.has(this.status)) throw new Error('Prepare a new run after completion/cancellation');
    this._claim(); this.status = 'Active';
    try { this._pose(this.time); this.advance(0); }
    catch (cause) { this.status = 'Failed'; this._release(); throw cause; }
    return this;
  }
  pause() { if (this.status === 'Active') this.status = 'Paused'; return this; }
  advance(delta: number) {
    finiteTime(delta, 'delta');
    if (this.status !== 'Active') return this;
    const targetTime = Math.min(this.duration, this.time + delta);
    try {
      for (const event of this._plan.events) {
        if (event.start > targetTime || this._fired.has(event)) continue;
        this.time = event.start; this._pose(this.time);
        if (this.status !== 'Active') return this;
        this._fired.add(event); this._plan.onEvent(event.name, this);
        if (this.status !== 'Active') return this;
      }
      this.time = targetTime; this._pose(this.time);
      if (this.status !== 'Active') return this;
      if (this.time >= this.duration) this.status = 'Completed';
    } catch (error) { this.status = 'Failed'; this._release(); throw error; }
    return this;
  }
  seek(time: number) {
    finiteTime(time, 'seek time');
    if (this.status === 'Cancelled' || this.status === 'Failed' || this.status === 'TargetDestroyed') throw new Error('Cannot seek a cancelled/failed run');
    this._claim(); this.time = Math.min(this.duration, time); this.status = 'Paused';
    this._fired = new Set(this._plan.events.filter(event => event.start <= this.time));
    this._pose(this.time); return this;
  }
  cancel() { this.status = 'Cancelled'; this._release(); return this; }
  /** Read-only debug projection. No editor dependency is retained by runtime. */
  inspect(): { transitions: readonly Readonly<Transition<T>>[]; events: readonly Readonly<EventSegment>[] } {
    return { transitions: this._plan.transitions.filter(job => job.cancelledAt === undefined || job.cancelledAt > job.activation).map(job => ({
      ...job, start: Math.min(job.start, job.cancelledAt ?? Infinity),
      end: Math.min(job.end, job.cancelledAt ?? Infinity)
    })), events: this._plan.events.map(event => ({ ...event })) };
  }
  reset() {
    const { adapter, snapshots } = this._plan;
    for (const [object, values] of snapshots) if (adapter.alive(object)) {
      for (const [key, value] of values) if (ownership.get(object)?.get(key) === this) adapter.write(object, key, value);
    }
    return this.cancel();
  }
  _release() {
    for (const [object, values] of this._plan.snapshots) for (const key of values.keys()) {
      if (ownership.get(object)?.get(key) === this) ownership.get(object).delete(key);
    }
    this._claimed = false;
  }
}
