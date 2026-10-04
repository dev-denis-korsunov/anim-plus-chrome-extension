import { compositionCommands, properties } from 'animplus/language';
export interface SourceCommand {
  line: number; indent: string; disabledPrefix: string; tokens: string[]; comment: string;
  kind: 'animation' | 'selection' | 'event' | 'definition' | 'declaration' | 'other';
}
export function sourceCommands(source: string): SourceCommand[] {
  return source.split(/\r?\n/).flatMap((raw, index) => {
    const match = /^(\s*)((?:\/\/ )*)(.*)$/.exec(raw)!;
    const [, indent, disabledPrefix, text] = match;
    let quote = '', escaped = false, stop = text.length;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (quote) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === quote) quote = ''; }
      else if (char === "'" || char === '"') quote = char;
      else if (char === '/' && text[i + 1] === '/') { stop = i; break; }
    }
    const tokens = text.slice(0, stop).match(/(?:'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|[^\s'"]+)+/g) ?? [];
    const command = tokens[0];
    if (!command || (disabledPrefix && command !== 'anim' && command !== 'event' && !compositionCommands.has(command))) return [];
    const kind = command === 'anim' ? 'animation' : compositionCommands.has(command) ? 'selection' : command === 'event' ? 'event' :
      ['namespace', 'let'].includes(command) ? 'declaration' : !indent && tokens.length === 1 ? 'definition' : 'other';
    return [{ line: index + 1, indent, disabledPrefix, tokens, comment: text.slice(stop), kind }];
  });
}

/** Omit explicit runtime defaults, preserving expressions and quoted literals. */
export function compactAnimationTokens(tokens: string[]): string[] {
  if (tokens[0] !== 'anim' || !properties.has(tokens[1])) return tokens;
  const seen = new Set<string>();
  for (let index = 2; index < tokens.length; index++) {
    const key = tokens[index], group = key.startsWith('easy.') ? 'easing' : key;
    if (seen.has(group)) return tokens;
    seen.add(group);
    if (group === 'easing') continue;
    if (!['from', 'to', 'time', 'delay', 'repeat', 'direction'].includes(key) || tokens[++index] === undefined) return tokens;
  }
  const result = tokens.slice(0, 2);
  for (let index = 2; index < tokens.length; index++) {
    const key = tokens[index];
    if (key === 'easy.linear') continue;
    const value = tokens[index + 1];
    const numeric = value !== undefined && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value);
    const isDefault = (key === 'direction' && value === 'normal') || (['from', 'to'].includes(key) && value === 'self') ||
      (numeric && ((key === 'time' && Number(value) === .25) || (key === 'delay' && Number(value) === 0) || (key === 'repeat' && /^-?\d+$/.test(value) && Number(value) === 0)));
    if (isDefault) index++;
    else { result.push(key); if (['from', 'to', 'time', 'delay', 'repeat', 'direction'].includes(key) && value !== undefined) result.push(tokens[++index]); }
  }
  return result;
}
export function compactAnimationDefaults(source: string): string {
  const lines = source.split(/\r?\n/);
  for (const command of sourceCommands(source)) {
    const tokens = compactAnimationTokens(command.tokens);
    if (tokens.length === command.tokens.length) continue;
    lines[command.line - 1] = command.indent + command.disabledPrefix + tokens.join(' ') + (command.comment ? ` ${command.comment}` : '');
  }
  return lines.join(source.includes('\r\n') ? '\r\n' : '\n');
}
