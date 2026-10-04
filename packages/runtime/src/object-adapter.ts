const keys = new Set(['opacity', 'rot', 'pos.x', 'pos.y', 'pos.z', 'scale.x', 'scale.y', 'skew.x', 'skew.y']);
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
import type { Adapter } from './types.js';
export class ObjectAdapter implements Adapter<any> {
  children(object: any): any[] { return object.children ?? []; }
  name(object: any): string { return object.name ?? ''; }
  type(object: any, category: string): boolean {
    if (!['sprite', 'label', 'clickable', 'layout', 'container'].includes(category)) throw new Error(`Unsupported type: ${category}`);
    return object.type === category || object.types?.includes(category) === true;
  }
  channels(property: string): string[] {
    if (property === 'scale') return ['scale.x', 'scale.y'];
    if (!keys.has(property)) throw new Error(`Unsupported property: ${property}`);
    return [property];
  }
  read(object: any, key: string): number {
    const parts = key.split('.');
    if (parts.some(part => forbidden.has(part))) throw new Error('Unsafe property');
    const value = parts.reduce((value, part) => value?.[part], object);
    if (!Number.isFinite(value)) throw new Error(`Expected finite ${key} on ${this.name(object)}`);
    return value;
  }
  write(object: any, key: string, value: number): void {
    const parts = key.split('.'), leaf = parts.pop()!;
    const parent = parts.reduce((value, part) => value[part], object);
    parent[leaf] = value;
  }
  geometry(object: any): { x: number; y: number } {
    if (!object.geometry || !Number.isFinite(object.geometry.x) || !Number.isFinite(object.geometry.y)) throw new Error(`Missing grid geometry: ${this.name(object)}`);
    return object.geometry;
  }
  alive(object: any): boolean { return object.destroyed !== true; }
}
