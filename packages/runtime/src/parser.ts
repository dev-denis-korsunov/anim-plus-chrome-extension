import { parse as parseGrammar } from './generated-parser.js';
import { expression, endpoint } from './expression.js';
import { easing } from './easing.js';
import type { Definition, Program, VariableBinding } from './types.js';

import { compositionCommands, properties } from './language.js';
export { compositionCommands, properties } from './language.js';
const identifier = /^[A-Za-z_][A-Za-z_0-9]*(?:\.[A-Za-z_][A-Za-z_0-9]*)*$/;

function parseAction(tokens: string[]): any {
  const target = tokens[1];
  if (!target) throw new Error('Missing action');
  if (!properties.has(target) && !['event', 'sound', 'spine'].includes(target)) {
    if (tokens.length !== 2 || !identifier.test(target)) throw new Error('Invalid animation reference');
    return { kind: 'call', name: target };
  }
  if (['event', 'sound', 'spine'].includes(target) && tokens[0] === 'anim') throw new Error(`Use ${target} directly, without anim`);
  if (target === 'sound' || target === 'spine') throw new Error(`${target} extension is not implemented`);
  const node: any = { kind: target === 'event' ? 'event' : 'transition', property: target, from: 'self', to: 'self', time: target === 'event' ? '0' : '.25', delay: '0', repeat: 0, ease: 'linear' };
  let i = 2;
  if (node.kind === 'event') { node.name = tokens[i++]; if (!node.name) throw new Error('Missing event name'); }
  const seen = new Set();
  while (i < tokens.length) {
    const key = tokens[i++];
    if (key.startsWith('easy.')) {
      if (node.kind === 'event' || seen.has('ease')) throw new Error('Invalid/duplicate easing');
      seen.add('ease'); node.ease = key.slice(5); continue;
    }
    if (!['from', 'to', 'time', 'delay', 'repeat', 'direction'].includes(key) || seen.has(key) || i === tokens.length) throw new Error(`Invalid/duplicate parameter: ${key}`);
    if (node.kind === 'event' && !['time', 'delay'].includes(key)) throw new Error(`Event does not support ${key}`);
    seen.add(key); const value = tokens[i++];
    if (key === 'direction') {
      if (!['normal', 'alternate'].includes(value)) throw new Error('Invalid direction');
      node.direction = value;
    } else if (key === 'repeat') {
      if (!/^-?\d+$/.test(value) || Number(value) < -1 || !Number.isSafeInteger(Number(value))) throw new Error('Invalid repeat');
      node.repeat = Number(value);
    } else node[key] = value;
  }
  node.durationValue = expression(node.time); node.delayValue = expression(node.delay);
  if (node.kind === 'transition') { node.fromValue = endpoint(node.from); node.toValue = endpoint(node.to); node.easeValue = easing(node.ease); node.easingName = node.ease; }
  return node;
}

export function parse(source: string): Program {
  if (typeof source !== 'string') throw new TypeError('Expected .anim source text');
  const definitions = new Map<string, Definition>(), variables: Program['variables'] = new Map();
  let namespace = '', current: Definition | null = null, stack: { indent: number; action: number | null }[] = [], serial = 0;
  let lines;
  try { lines = parseGrammar(source.replace(/^\uFEFF/, '')); }
  catch (cause) {
    const line = cause.location?.start.line ?? 1;
    const column = cause.location?.start.column ?? 1;
    throw new Error(`Line ${line}: Invalid syntax at column ${column}: ${cause.message}`, { cause });
  }
  for (const { tokens, indent: whitespace, line } of lines) {
    try {
      if (!tokens.length) continue;
      if (whitespace.includes('\t')) throw new Error('Tabs are not allowed in indentation');
      const indent = whitespace.length, command = tokens[0];
      if (indent % 2) throw new Error('Indentation must use two-space levels');
      if (command === 'let') {
        const declaration = tokens.length === 4 && tokens[2] === '=' ? /^([A-Za-z_][A-Za-z_0-9]*)=(.+)$/.exec(`${tokens[1]}=${tokens[3]}`) : null;
        if (indent || current || !declaration) throw new Error('Use file-level let name = expression before animations');
        const [, name, value] = declaration;
        if (compositionCommands.has(name) || properties.has(name) || ['namespace', 'let', 'anim', 'event', 'sound', 'spine', 'index', 'depth', 'sibling', 'count', 'self', '__proto__', 'constructor', 'prototype'].includes(name) || variables.has(name)) throw new Error(`Reserved/duplicate variable: ${name}`);
        const query = /^(\$\$?|document\.querySelector(All)?)\((.+)\)$/.exec(value);
        const binding: VariableBinding | undefined = value === '$0' ? { kind: 'selected' }
          : query ? { kind: 'selector', selector: query[3], all: query[1] === '$$' || Boolean(query[2]) } : undefined;
        variables.set(name, { source: value, ...(binding ? { binding } : { evaluate: expression(value) }), line }); continue;
      }
      if (command === 'namespace') {
        if (indent || definitions.size || variables.size || namespace || tokens.length !== 2 || !identifier.test(tokens[1])) throw new Error('Invalid namespace declaration');
        namespace = tokens[1]; continue;
      }
      if (!indent) {
        if (tokens.length !== 1 || !identifier.test(command) || compositionCommands.has(command) || properties.has(command) || ['anim', 'event', 'sound', 'spine', 'let'].includes(command)) throw new Error('Expected animation name at column zero');
        const name = namespace ? `${namespace}.${command}` : command;
        if (definitions.has(name)) throw new Error(`Duplicate animation: ${name}`);
        current = { name, namespace, nodes: [] }; definitions.set(name, current); stack = []; continue;
      }
      if (!current) throw new Error('Instruction before animation declaration');
      if ((!stack.length && indent !== 2) || (stack.length && indent > stack.at(-1)!.indent + 2)) throw new Error('Indentation cannot skip levels');
      while (stack.length && stack.at(-1)!.indent > indent) stack.pop();
      if (stack.length && stack.at(-1)!.indent < indent) stack.push({ indent, action: null });
      else if (!stack.length) stack.push({ indent, action: null });
      const level = stack.at(-1)!;
      const parent = stack.slice(0, -1).findLast(entry => entry.action !== null)?.action ?? null;
      const node = command === 'anim' ? parseAction(tokens) : ['event', 'sound', 'spine'].includes(command) ? parseAction(['custom', command, ...tokens.slice(1)]) : compositionCommands.has(command) ? { kind: 'selection', command, args: tokens.slice(1) } : null;
      if (!node) throw new Error(`Unknown instruction: ${command}`);
      if (node.kind !== 'selection' && indent > 2 && parent === null) throw new Error('Indented action requires a preceding action parent');
      Object.assign(node, { id: serial++, line, parent });
      current.nodes.push(node);
      if (node.kind !== 'selection') level.action = node.id;
    } catch (error) { throw new Error(`Line ${line}: ${error.message}`, { cause: error }); }
  }
  return { standard: '0.1-draft', definitions, variables };
}
