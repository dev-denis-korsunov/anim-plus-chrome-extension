import { exportCssAnimation, type CssTarget } from './css-export.js';
import { load, type AnimationRun } from 'animplus';
import { DomAdapter } from 'animplus/dom';
import type { Bridge, Command, Snapshot, Track, TreeRow } from './protocol.js';

/** Dev-only bridge. Does not add UI; browser DevTools owns the Vue editor. */
export function installBridge(defaultRoot: HTMLElement = document.body): Bridge {
  if (window.__ANIMPLUS_DEVTOOLS__) return window.__ANIMPLUS_DEVTOOLS__;
  let root = defaultRoot, source = '', active = '', names: string[] = [], run: AnimationRun<HTMLElement> | null = null;
  let error = '', frame = 0, previous = 0, outlines = false, hovered: HTMLElement | null = null;
  const events: string[] = [];
  let cssTargets: CssTarget<HTMLElement>[] = [];
  const mouse = { x: 0, y: 0 };
  let selectedElement: HTMLElement | undefined;
  const trackMouse = (event: PointerEvent): void => { mouse.x = event.clientX; mouse.y = event.clientY; };
  document.addEventListener('pointermove', trackMouse, { passive: true });
  const selectorFor = (target: HTMLElement): string => {
    if (target.id && document.querySelectorAll(`#${CSS.escape(target.id)}`).length === 1) return `#${CSS.escape(target.id)}`;
    const parts: string[] = [];
    let element: Element | null = target;
    while (element) { parts.unshift(`${element.tagName.toLowerCase()}${element.parentElement ? `:nth-child(${[...element.parentElement.children].indexOf(element) + 1})` : ''}`); element = element.parentElement; }
    return parts.join(' > ');
  };
  let paths = new Map<HTMLElement, string>(), targets = new Map<string, HTMLElement>();
  let overlay: HTMLDivElement | null = null;
  const traversal = (): TreeRow[] => {
    const adapter = new DomAdapter(), rows: TreeRow[] = [];
    paths = new Map(); targets = new Map();
    const stack = [{ target: root, path: '', depth: 0 }];
    while (stack.length) {
      const row = stack.pop()!;
      if (rows.length >= 2000) throw new Error('Root exceeds 2000 DOM elements; select a smaller root');
      paths.set(row.target, row.path); targets.set(row.path, row.target);
      rows.push({ path: row.path, name: adapter.name(row.target), tag: row.target.tagName.toLowerCase(), depth: row.depth });
      const children = adapter.children(row.target);
      for (let i = children.length - 1; i >= 0; i--) stack.push({ target: children[i], path: row.path ? `${row.path}/${i}` : `${i}`, depth: row.depth + 1 });
    }
    return rows;
  };
  const highlight = (): void => {
    overlay?.remove(); overlay = null;
    const jobs = run?.inspect().transitions ?? [];
    const selected = outlines ? new Set(jobs.map(job => job.object)) : new Set<HTMLElement>();
    if (hovered) selected.add(hovered);
    if (!selected.size) return;
    overlay = document.createElement('div'); overlay.dataset.animplusTool = '';
    overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
    for (const target of selected) {
      if (!target.isConnected) continue;
      const rect = target.getBoundingClientRect(), box = document.createElement('div');
      box.style.cssText = `position:absolute;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;box-sizing:border-box;border:1px solid ${target === hovered ? '#ffd166' : '#69d695'};`;
      const candidates = jobs.filter(job => job.object === target);
      const current = candidates.filter(job => job.activation <= (run?.time ?? 0)).at(-1) ?? candidates[0];
      const label = document.createElement('span');
      label.dataset.animplusSelectionLabel = '';
      label.textContent = `index: ${current?.index ?? 0} · depth: ${current?.depth ?? (paths.get(target)?.split('/').filter(Boolean).length ?? 0)}`;
      label.style.cssText = `position:absolute;left:-1px;top:${rect.top >= 9 ? '-10px' : '0'};padding:0 2px;background:#69d695;color:#113b21;font:7px/9px ui-monospace,SFMono-Regular,Consolas,monospace;white-space:nowrap;letter-spacing:0;border-radius:1px;`;
      box.append(label); overlay.append(box);
    }
    document.documentElement.append(overlay);
  };
  const stopClock = (): void => { cancelAnimationFrame(frame); frame = 0; previous = 0; };
  const discard = (): void => { stopClock(); run?.reset(); run = null; };
  const compile = (): void => {
    discard(); events.length = 0;
    const library = load(source); names = library.names;
    if (!names.includes(active)) active = names[0] ?? '';
    traversal();
    const adapter = new DomAdapter();
    if (active) run = library.prepare(active, root, {
      adapter, bindings: { mouse, live: true, selected: selectedElement, geometry(target) { const rect = target.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }; } }, onEvent(name) { events.push(`${name} @ ${run?.time.toFixed(3)}s`); }
    });
    document.dispatchEvent(new CustomEvent('animplus:prepared', { detail: { objects: [...new Set(run?.inspect().transitions.map(job => job.object) ?? [])] } }));
    cssTargets = [...new Set(run?.inspect().transitions.map(job => job.object) ?? [])].map(object => ({ object, selector: selectorFor(object), name: adapter.name(object), transform: getComputedStyle(object).transform, baseline: Object.fromEntries(['opacity', 'pos.x', 'pos.y', 'pos.z', 'scale.x', 'scale.y', 'rot', 'skew.x', 'skew.y'].map(key => [key, adapter.read(object, key)])) }));
  };
  const tick = (now: number): void => {
    try {
      if (run?.status === 'Active') {
        run.advance(previous ? (now - previous) / 1000 : 0); previous = now; highlight();
        if (run.status === 'Active') frame = requestAnimationFrame(tick); else stopClock();
      }
    } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); stopClock(); }
  };
  const snapshot = (): Snapshot => {
    const tree = traversal(), tracks: Track[] = [];
    for (const job of run?.inspect().transitions ?? []) tracks.push({ target: paths.get(job.object) ?? null, label: job.key,
      activation: job.activation, start: job.start, end: Math.min(job.repeat === -1 ? Infinity : job.end, job.cancelledAt ?? Infinity), from: job.from, to: job.to, repeat: job.repeat, line: job.line });
    for (const event of run?.inspect().events ?? []) tracks.push({ target: null, label: `event '${event.name}'`, activation: event.start, start: event.start, end: event.end, line: event.line });
    const duration = run?.duration ?? 0;
    const horizon = Number.isFinite(duration) ? duration : Math.max(1, ...(run?.inspect().transitions.map(job => job.end) ?? []));
    // JSON cannot represent Infinity; infinite bars are rendered to preview horizon.
    return { root: new DomAdapter().name(root), names, active, tree, tracks: tracks.map(track => ({ ...track, end: Number.isFinite(track.end) ? track.end : horizon })),
      time: run?.time ?? 0, duration: Number.isFinite(duration) ? duration : null, horizon, status: run?.status ?? 'Ready', error, events: [...events] };
  };
  const bridge: Bridge = {
    version: '0.1.0', instanceId: crypto.randomUUID(),
    command(command: Command, selected?: unknown): Snapshot {
      try {
        if (selected instanceof HTMLElement) selectedElement = selected;
        if (command.type !== 'snapshot') error = '';
        if (command.type === 'root') {
          const next = command.selected ? selected : document.querySelector(command.selector || 'body');
          if (!(next instanceof HTMLElement) || !next.isConnected) throw new Error('Choose a connected HTML element in Elements, or enter a valid root selector');
          discard(); root = next; hovered = null; compile();
        } else if (command.type === 'source') {
          source = command.source; active = command.name ?? active; names = []; compile();
        } else if (command.type === 'export-css') {
          if (!run) throw new Error('Prepare an animation before exporting CSS.');
          return { ...snapshot(), css: exportCssAnimation(run.inspect().transitions, run.duration, cssTargets, active, run.inspect().events.length > 0) };
        } else if (command.type === 'play') {
          if (!run || ['Completed', 'Cancelled', 'Failed', 'TargetDestroyed'].includes(run.status)) compile();
          if (!run) throw new Error('Define an animation first');
          run.play(); stopClock(); frame = requestAnimationFrame(tick);
        } else if (command.type === 'pause') { stopClock(); run?.pause(); }
        else if (command.type === 'seek') { stopClock(); if (!run) throw new Error('Prepare an animation first'); run.seek(command.time); }
        else if (command.type === 'reset') { compile(); }
        else if (command.type === 'highlight') { if (command.selected !== undefined) outlines = command.selected; hovered = command.path === undefined ? null : targets.get(command.path) ?? null; }
        else if (command.type === 'dispose') { discard(); overlay?.remove(); document.removeEventListener('pointermove', trackMouse); delete window.__ANIMPLUS_DEVTOOLS__; }
        highlight();
        return snapshot();
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
        stopClock();
        // Preparation errors clear stale preview state, not the edited source.
        if (command.type === 'source' || command.type === 'root') { discard(); overlay?.remove(); }
        try { return snapshot(); } catch { return { root: '', names, active, tree: [], tracks: [], time: 0, duration: 0, horizon: 0, status: 'Failed', error, events: [...events] }; }
      }
    }
  };
  window.__ANIMPLUS_DEVTOOLS__ = bridge;
  return bridge;
}
