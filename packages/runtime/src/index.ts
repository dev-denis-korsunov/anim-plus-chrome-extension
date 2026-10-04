export { parse } from './parser.js';
export { prepare, AnimationRun } from './runtime.js';
export { ObjectAdapter } from './object-adapter.js';
import { parse } from './parser.js';
import { prepare } from './runtime.js';
import type { RunOptions } from './types.js';
export type * from './types.js';

export function load(source: string) {
  const program = parse(source);
  return {
    names: [...program.definitions.keys()],
    prepare<T extends object>(name: string, root: T, options?: RunOptions<T>) { return prepare(program, name, root, options); },
  };
}
