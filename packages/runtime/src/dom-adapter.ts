import type { Adapter } from './types.js';

type Vector = { x: number; y: number; z?: number };
interface State {
  values: Record<string, number>; baseline: Record<string, number>;
  original: Map<string, { value: string; priority: string }>;
  geometry: { x: number; y: number }; transform: string;
}
const excluded = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'HEAD', 'NOSCRIPT', 'TEMPLATE']);
const categories = new Set(['sprite', 'label', 'clickable', 'layout', 'container']);
const channels = new Set(['opacity', 'rot', 'pos.x', 'pos.y', 'pos.z', 'scale.x', 'scale.y', 'skew.x', 'skew.y']);
const groups: Record<string, string[]> = {
  translate: ['pos.x', 'pos.y', 'pos.z'], scale: ['scale.x', 'scale.y'], rotate: ['rot'],
  opacity: ['opacity'], transform: ['skew.x', 'skew.y']
};
const angle = (value: string): number => {
  if (value === 'none') return 0;
  const match = /^(-?[\d.e+]+)(deg|rad|turn)?$/.exec(value);
  if (!match) throw new Error(`Unsupported DOM angle: ${value}`);
  return Number(match[1]) * (match[2] === 'rad' ? 180 / Math.PI : match[2] === 'turn' ? 360 : 1);
};
function translation(value: string): Vector {
  if (value === 'none') return { x: 0, y: 0, z: 0 };
  const parts = value.split(/\s+/);
  if (parts.some(part => !/^-?(?:\d*\.)?\d+(?:px)?$/.test(part))) throw new Error('DOM translate must use pixel units; percentages are not supported');
  return { x: parseFloat(parts[0]), y: parseFloat(parts[1] ?? '0'), z: parseFloat(parts[2] ?? '0') };
}

/** Layout-independent CSS offsets. Existing transform is preserved, not decomposed. */
export class DomAdapter implements Adapter<HTMLElement> {
  private states = new WeakMap<HTMLElement, State>();
  query(selector: string, all: boolean): HTMLElement | HTMLElement[] | null {
    const found = all ? [...document.querySelectorAll(selector)] : [document.querySelector(selector)];
    if (found.some(element => element && !(element instanceof HTMLElement))) throw new Error('Bindings require HTML elements');
    const elements = found.filter((element): element is HTMLElement => element instanceof HTMLElement);
    return all ? elements : elements[0] ?? null;
  }
  children(target: HTMLElement): HTMLElement[] {
    return [...target.children].filter((child): child is HTMLElement => child instanceof HTMLElement && !excluded.has(child.tagName) && !child.hasAttribute('data-animplus-tool'));
  }
  name(target: HTMLElement): string { return target.dataset.animName || target.id || target.getAttribute('name') || target.tagName.toLowerCase(); }
  type(target: HTMLElement, category: string): boolean {
    if (!categories.has(category)) throw new Error(`Unsupported type: ${category}`);
    if (!(target instanceof HTMLElement)) return false;
    if (target.dataset.animType?.split(/\s+/).includes(category)) return true;
    const tag = target.tagName;
    if (category === 'sprite') return ['IMG', 'PICTURE', 'CANVAS', 'VIDEO'].includes(tag);
    if (category === 'clickable') return ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(tag) || target.getAttribute('role') === 'button';
    if (category === 'label') return ['SPAN', 'P', 'LABEL', 'H1', 'H2', 'H3', 'H4'].includes(tag);
    if (category === 'layout') return /^(grid|inline-grid|flex|inline-flex)$/.test(getComputedStyle(target).display);
    return target.children.length > 0;
  }
  channels(property: string): string[] {
    if (property === 'scale') return ['scale.x', 'scale.y'];
    if (!channels.has(property)) throw new Error(`Unsupported property: ${property}`);
    return [property];
  }
  private state(target: HTMLElement): State {
    const previous = this.states.get(target); if (previous) return previous;
    const css = getComputedStyle(target), pos = translation(css.translate);
    const scales = css.scale === 'none' ? [1, 1] : css.scale.split(/\s+/).map(Number);
    const values = { opacity: Number(css.opacity), rot: angle(css.rotate), 'pos.x': pos.x, 'pos.y': pos.y, 'pos.z': pos.z ?? 0,
      'scale.x': scales[0], 'scale.y': scales[1] ?? scales[0], 'skew.x': 0, 'skew.y': 0 };
    if (!Object.values(values).every(Number.isFinite)) throw new Error(`Unsupported DOM baseline on ${this.name(target)}`);
    const original = new Map<string, { value: string; priority: string }>();
    for (const key of [...Object.keys(groups), 'transition']) original.set(key, { value: target.style.getPropertyValue(key), priority: target.style.getPropertyPriority(key) });
    const rect = target.getBoundingClientRect();
    const state = { values, baseline: { ...values }, original, geometry: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }, transform: css.transform };
    this.states.set(target, state); return state;
  }
  read(target: HTMLElement, key: string): number {
    this.channels(key);
    return this.state(target).values[key];
  }
  write(target: HTMLElement, key: string, value: number): void {
    this.channels(key); if (!Number.isFinite(value)) throw new Error(`Non-finite DOM value: ${key}`);
    const state = this.state(target), v = state.values; v[key] = value;
    const group = Object.keys(groups).find(name => groups[name].includes(key))!;
    const restore = (property: string): void => {
      const saved = state.original.get(property)!;
      if (saved.value) target.style.setProperty(property, saved.value, saved.priority); else target.style.removeProperty(property);
    };
    target.style.setProperty('transition', 'none', 'important');
    if (groups[group].every(channel => v[channel] === state.baseline[channel])) restore(group);
    else {
      const value = group === 'translate' ? `${v['pos.x']}px ${v['pos.y']}px ${v['pos.z']}px`
        : group === 'scale' ? `${v['scale.x']} ${v['scale.y']}`
        : group === 'rotate' ? `${v.rot}deg`
        : group === 'opacity' ? `${v.opacity}`
        : `${state.transform === 'none' ? '' : state.transform} skew(${v['skew.x']}deg, ${v['skew.y']}deg)`;
      target.style.setProperty(group, value, 'important');
    }
    if (Object.keys(v).every(channel => v[channel] === state.baseline[channel])) restore('transition');
  }
  geometry(target: HTMLElement): { x: number; y: number } { return this.state(target).geometry; }
  alive(target: HTMLElement): boolean { return target.isConnected; }
}
