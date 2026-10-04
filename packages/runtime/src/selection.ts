import type { Adapter, Row, Scene, SelectionNode } from './types.js';
export function tree<T extends object>(root: T, adapter: Adapter<T>): Scene<T> {
  const rows: Row<T>[] = [], byObject = new Map<T, Row<T>>();
  const pending: Row<T>[] = [{ object: root, depth: 0, sibling: 0, parent: null }];
  while (pending.length) {
    const row = pending.pop()!;
    if (!row.object || typeof row.object !== 'object') throw new Error('Invalid scene object');
    if (byObject.has(row.object)) throw new Error('Scene must be a tree without shared children/cycles');
    rows.push(row); byObject.set(row.object, row);
    const children = adapter.children(row.object);
    for (let i = children.length - 1; i >= 0; i--) pending.push({ object: children[i], depth: row.depth + 1, sibling: i, parent: row.object });
  }
  return { rows, byObject };
}
const unique = <T extends object>(items: Row<T>[]): Row<T>[] => {
  const seen = new Set<T>();
  return items.filter(item => !seen.has(item.object) && !!seen.add(item.object));
};
const integer = (value: string): number => {
  if (!/^\d+$/.test(value ?? '') || !Number.isSafeInteger(Number(value))) throw new Error(`Expected nonnegative integer: ${value}`);
  return Number(value);
};
function matching<T extends object>(mask: string, adapter: Adapter<T>): (object: T) => boolean {
  if (mask.startsWith('type:')) {
    const category = mask.slice(5);
    // Validate categories even if the collection is empty.
    adapter.type({} as T, category);
    return object => adapter.type(object, category);
  }
  const regex = new RegExp(`^${mask.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  return object => regex.test(adapter.name(object));
}

export function select<T extends object>(node: Pick<SelectionNode, 'command' | 'args'>, selection: Row<T>[] | null, roots: T[], scene: Scene<T>, adapter: Adapter<T>, bindings = new Map<string, T[]>()): Row<T>[] {
  const { command, args } = node;
  const base = selection ?? roots.map(object => scene.byObject.get(object)!);
  function descendants(from: Row<T>[], includeRoot: boolean, maxDepth = Infinity, exact = false): Row<T>[] {
    const result: Row<T>[] = [];
    for (const row of from) {
      const pending = [{ object: row.object, level: 0 }];
      while (pending.length) {
        const { object, level } = pending.pop()!;
        if ((includeRoot || level > 0) && (!exact || level === maxDepth)) result.push(scene.byObject.get(object)!);
        if (level < maxDepth) {
          const children = adapter.children(object);
          for (let i = children.length - 1; i >= 0; i--) pending.push({ object: children[i], level: level + 1 });
        }
      }
    }
    return unique(result);
  }
  let result: Row<T>[];
  if (command === 'find' || command === 'path') {
    if (args.length < 1 || args.length > 2) throw new Error(`${command} requires target and optional depth`);
    const manual = args.length === 2;
    const from = manual ? roots.map(object => scene.byObject.get(object)!) : base;
    if (command === 'find') {
      const bound = bindings.get(args[0]);
      result = descendants(from, true).filter(row => bound ? bound.includes(row.object) : matching(args[0], adapter)(row.object));
    }
    else {
      const path = args[0].split('/').map(integer);
      result = unique(from.flatMap(row => {
        let object = row.object;
        for (const i of path) { object = adapter.children(object)[i]; if (!object) return []; }
        return [scene.byObject.get(object)!];
      }));
    }
    if (manual) {
      if (result.length !== 1) throw new Error('Manual selection must resolve exactly one object');
      const row = { ...result[0], depth: integer(args[1]) };
      const existing = (selection ?? []).find(item => item.object === row.object);
      if (existing && existing.depth !== row.depth) throw new Error('Duplicate manual object with different depth');
      result = unique([...(selection ?? []), row]);
    }
  } else if (command === 'depth' || command === 'depth-only') {
    if (args.length !== 1) throw new Error('Depth requires one argument');
    result = descendants(base, true, integer(args[0]), command === 'depth-only');
  } else if (['filter', 'ignore', 'of-type'].includes(command)) {
    if (args.length !== 1) throw new Error(`${command} requires one argument`);
    const bound = command === 'of-type' ? undefined : bindings.get(args[0]);
    const match = bound ? (object: T) => bound.includes(object) : matching(command === 'of-type' ? `type:${args[0]}` : args[0], adapter);
    result = (selection ?? descendants(base, true)).filter(row => match(row.object) !== (command === 'ignore'));
  } else if (command === 'index') {
    if (args.length !== 1) throw new Error('Index requires comma-separated indices');
    const indices = args[0].split(',').map(integer);
    result = unique(base.flatMap(row => indices.flatMap(i => {
      const child = adapter.children(row.object)[i]; return child ? [scene.byObject.get(child)!] : [];
    })));
  } else if (command === 'parent') {
    if (args.length) throw new Error('Parent takes no arguments');
    result = unique(base.flatMap(row => row.parent ? [scene.byObject.get(row.parent)!] : []));
  } else if (command === 'reverse') {
    if (args.length || selection === null) throw new Error('Reverse requires a collection and no arguments');
    // Preserve grid indices, otherwise assign the new traversal order below.
    result = [...selection].reverse();
  } else if (command === 'grid') {
    if (selection === null || args.length < 1 || args.length > 2 || (args[1] && !['x', 'y'].includes(args[1]))) throw new Error('Grid requires selection, origin and optional x/y axis');
    if (!selection.length) return [];
    const minDepth = Math.min(...selection.map(row => row.depth));
    const upper = selection.filter(row => row.depth === minDepth);
    const coordinates = upper.map(row => adapter.geometry(row.object));
    const axes = (['x', 'y'] as const).map(axis => {
      const values = coordinates.map(point => point[axis]).sort((a, b) => a - b);
      return values.filter((value, i) => !i || Math.abs(value - values[i - 1]) > 1e-6);
    });
    const nearest = (value: number, values: number[]) => values.reduce((best, v, i) => Math.abs(v - value) < Math.abs(values[best] - value) ? i : best, 0);
    const cells = coordinates.map(point => ({ x: nearest(point.x, axes[0]), y: nearest(point.y, axes[1]) }));
    let origin: { x: number; y: number };
    if (args[0] === 'start') origin = cells[0];
    else if (args[0] === 'end') origin = cells.at(-1)!;
    else if (args[0] === 'center' || args[0] === 'edges') origin = { x: (axes[0].length - 1) / 2, y: (axes[1].length - 1) / 2 };
    else {
      const targetNode = { command: /^\d+(\/\d+)*$/.test(args[0]) ? 'path' : 'find', args: [args[0]] };
      const found = select(targetNode, null, roots, scene, adapter, bindings);
      if (found.length !== 1) throw new Error('Grid origin must resolve one object');
      const point = adapter.geometry(found[0].object);
      const i = coordinates.reduce((best, candidate, index) => Math.hypot(candidate.x - point.x, candidate.y - point.y) < Math.hypot(coordinates[best].x - point.x, coordinates[best].y - point.y) ? index : best, 0);
      origin = cells[i];
    }
    result = selection.map(row => {
      let ancestor: T | null = row.object;
      while (ancestor && !upper.some(item => item.object === ancestor)) ancestor = scene.byObject.get(ancestor)?.parent ?? null;
      let i = upper.findIndex(item => item.object === ancestor);
      if (i < 0) {
        const point = adapter.geometry(row.object);
        i = coordinates.reduce((best, candidate, index) => Math.hypot(candidate.x - point.x, candidate.y - point.y) < Math.hypot(coordinates[best].x - point.x, coordinates[best].y - point.y) ? index : best, 0);
      }
      const cell = cells[i];
      const dx = args[1] === 'y' ? 0 : cell.x - origin.x, dy = args[1] === 'x' ? 0 : cell.y - origin.y;
      const edgeX = Math.min(cell.x, axes[0].length - 1 - cell.x), edgeY = Math.min(cell.y, axes[1].length - 1 - cell.y);
      const distance = args[0] === 'edges' ? args[1] === 'x' ? edgeX : args[1] === 'y' ? edgeY : Math.min(edgeX, edgeY) : Math.hypot(dx, dy);
      return { ...row, index: distance, grid: true };
    });
  } else throw new Error(`Unsupported composition: ${command}`);
  const members = new Set(result.map(row => row.object));
  return result.map((row, index) => {
    let depth = 0, ancestor = row.parent;
    while (ancestor) {
      if (members.has(ancestor)) depth++;
      ancestor = scene.byObject.get(ancestor)?.parent ?? null;
    }
    return { ...row, depth: (command === 'find' || command === 'path') && args.length === 2 ? row.depth : depth, index: row.grid ? row.index : index };
  });
}
