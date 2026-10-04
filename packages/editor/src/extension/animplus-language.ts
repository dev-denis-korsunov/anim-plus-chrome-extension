import { hoverTooltip } from '@codemirror/view';
import { helpFor } from './language-help.js';
import { StreamLanguage, HighlightStyle, syntaxHighlighting, indentUnit, indentService } from '@codemirror/language';
import { autocompletion, type CompletionContext, type Completion } from '@codemirror/autocomplete';
import { linter, type Diagnostic } from '@codemirror/lint';
import { tags } from '@lezer/highlight';
import { parse } from 'animplus';
import { compositionCommands, properties, parameters, metrics, categories, easingNames } from 'animplus/language';

const keywords = new Set(['namespace', 'let', 'anim', 'event', 'sound', 'spine', ...compositionCommands, ...parameters]);
const disabledCommandPrefix = new RegExp(`(?:// )+(?=(?:anim|${[...compositionCommands].join('|')})(?:\\s|$))`);
const language = StreamLanguage.define({
  name: 'Anim+',
  token(stream) {
    if (stream.eatSpace()) return null;
    if (!stream.string.slice(0, stream.pos).trim() && stream.match(disabledCommandPrefix)) return null;
    if (stream.match('//')) { stream.skipToEnd(); return 'comment'; }
    const quote = stream.peek();
    if (quote === "'" || quote === '"') {
      stream.next();
      let escaped = false, character;
      while ((character = stream.next()) !== undefined) {
        if (character === quote && !escaped) return 'string';
        if (character === '\\' && !escaped) escaped = true; else escaped = false;
      }
      return 'invalid';
    }
    if (stream.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/)) return 'number';
    if (stream.match(/easy\.[a-z]+(?:-[a-z]+)*/)) return 'operator';
    if (stream.match(/[A-Za-z_][A-Za-z_0-9]*(?:[.-][A-Za-z_][A-Za-z_0-9]*)*/)) {
      const word = stream.current();
      if (keywords.has(word)) return 'keyword';
      if (properties.has(word)) return 'propertyName';
      if ((metrics as readonly string[]).includes(word)) return 'variableName.special';
      if (word === 'min' || word === 'max') return 'function';
      return stream.start === 0 ? 'variableName.definition' : 'variableName';
    }
    if (stream.match(/\$0|\$\$?/)) return 'variableName.special';
    if (stream.match(/[+*/=,-]/)) return 'operator';
    if (stream.match(/[()]/)) return 'paren';
    stream.next(); return 'invalid';
  },
  languageData: { commentTokens: { line: '//' }, closeBrackets: { brackets: ['(', "'", '"'] } }
});

const option = (label: string, type: string, detail?: string): Completion => ({ label, type, detail });
function insideLiteralOrComment(prefix: string): boolean {
  // Use token rules to suppress suggestions inside both quote styles and comments.
  let quote: string | null = null, escaped = false;
  for (let i = 0; i < prefix.length; i++) {
    const c = prefix[i];
    if (quote) {
      if (c === quote && !escaped) quote = null;
      if (c === '\\' && !escaped) escaped = true; else escaped = false;
    } else if (c === "'" || c === '"') quote = c;
    else if (c === '/' && prefix[i + 1] === '/') return true;
  }
  return quote !== null;
}

function complete(context: CompletionContext) {
  const line = context.state.doc.lineAt(context.pos);
  const prefix = line.text.slice(0, context.pos - line.from);
  if (insideLiteralOrComment(prefix)) return null;
  const word = context.matchBefore(/[\w.$:-]*/);
  if (!word || (!word.text && !context.explicit)) return null;
  const before = prefix.slice(0, prefix.length - word.text.length);
  const source = context.state.doc.toString();
  const declarations = [...source.matchAll(/^let\s+([A-Za-z_]\w*)\s*=/gm)].map(match => option(match[1], 'variable', 'Declared variable'));
  const centers = [...source.matchAll(/^let\s+([A-Za-z_]\w*)\s*=\s*(?:\$0|\$\(|document\.querySelector\()/gm)].flatMap(match => ['x', 'y'].map(axis => option(`${match[1]}.${axis}`, 'variable', 'Bound element viewport center')));
  let options: Completion[];
  if (!before.trim()) {
    options = line.text.startsWith(' ') ? [...compositionCommands, 'anim', 'event'].map(label => option(label, 'keyword'))
      : ['namespace', 'let'].map(label => option(label, 'keyword'));
  } else if (/\banim\s+$/.test(before)) {
    options = [...properties].map(label => option(label, 'property'));
    options.push(...[...source.matchAll(/^([A-Za-z_]\w*(?:\.\w+)*)\s*$/gm)].map(match => option(match[1], 'function', 'Animation call')));
  } else if (/\bof-type\s+$/.test(before) || word.text.startsWith('type:')) {
    options = categories.map(label => option(word.text.startsWith('type:') ? `type:${label}` : label, 'type'));
  } else if (/\b(?:from|to|time|delay)\s+[^\s]*$/.test(before) || /^let\s+\w+\s*=/.test(before)) {
    options = [...metrics.map(label => option(label, 'variable')), ...declarations, ...centers, option('min', 'function'), option('max', 'function')];
    if (/^let\s+\w+\s*=/.test(before)) options.push(option('mouse.x', 'variable', 'Mouse X in viewport pixels'), option('mouse.y', 'variable', 'Mouse Y in viewport pixels'), option('$0', 'variable', 'Selected element in Elements'), { label: '$', apply: "$('selector')", type: 'function', detail: 'First element matching a CSS selector' }, { label: '$$', apply: "$$('selector')", type: 'function', detail: 'All elements matching a CSS selector' });
  } else if (/\bdirection\s+$/.test(before)) {
    options = ['normal', 'alternate'].map(label => option(label, 'constant'));
  } else if (/\brepeat\s+$/.test(before)) {
    options = ['0', '1', '2', '-1'].map(label => option(label, 'constant'));
  } else if (/\bgrid\s+$/.test(before)) {
    options = ['start', 'end', 'center', 'edges'].map(label => option(label, 'keyword'));
  } else if (/^\s*event\s/.test(before)) {
    options = ['time', 'delay'].filter(label => !new RegExp(`\\b${label}\\b`).test(before.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, ''))).map(label => option(label, 'keyword'));
  } else if (/^\s*anim\s/.test(before)) {
    const used = new Set(before.match(/\b(?:from|to|time|delay|repeat|direction)\b/g));
    options = [...parameters.filter(label => !used.has(label)).map(label => option(label, 'keyword')),
      ...easingNames.map(label => option(label, 'function')), option('easy.bezier', 'function')];
  } else return null;

  return { from: word.from, options, validFor: /^[\w.$:-]*$/ };
}

export const animplusLanguage = [
  language, indentUnit.of('  '),
  indentService.of((context, pos) => {
    const line = context.lineAt(pos, -1);
    const before = line.text.slice(0, pos - line.from);
    const spaces = /^ */.exec(before)![0].length;
    return spaces === 0 && /^[A-Za-z_]\w*(?:\.\w+)*$/.test(before) && !keywords.has(before) ? 2 : spaces;
  }),
  autocompletion({ override: [complete], icons: false, maxRenderedOptions: 30 }),
  hoverTooltip((view, pos, side) => {
    const line = view.state.doc.lineAt(pos);
    const prefix = line.text.slice(0, pos - line.from);
    if (insideLiteralOrComment(prefix)) return null;
    const match = [...line.text.matchAll(/[A-Za-z_][\w.-]*/g)].find(match => {
      const start = line.from + match.index!, end = start + match[0].length;
      return pos >= start && pos <= end && !(pos === start && side < 0) && !(pos === end && side > 0);
    });
    if (!match) return null;
    const help = helpFor(match[0]);
    if (!help) return null;
    return { pos: line.from + match.index!, end: line.from + match.index! + match[0].length, above: true,
      create() {
        const dom = document.createElement('div'); dom.className = 'language-help';
        const description = document.createElement('div'); description.textContent = help.description;
        const example = document.createElement('code'); example.textContent = help.example;
        dom.append(description, example); return { dom };
      }
    };
  }, { hoverTime: 350 }),
  syntaxHighlighting(HighlightStyle.define([
    { tag: tags.keyword, color: 'var(--sys-color-token-keyword)' }, { tag: tags.string, color: 'var(--sys-color-token-string)' },
    { tag: tags.number, color: 'var(--sys-color-token-number)' }, { tag: tags.comment, color: 'var(--sys-color-on-surface-light)', fontStyle: 'italic' },
    { tag: tags.propertyName, color: 'var(--sys-color-token-property)' }, { tag: tags.special(tags.variableName), color: 'var(--sys-color-token-definition)' },
    { tag: tags.operator, color: 'var(--sys-color-on-surface-subtle)' }, { tag: tags.definition(tags.variableName), color: 'var(--sys-color-token-definition)' },
    { tag: tags.invalid, textDecoration: 'underline wavy #ff8c8c' }
  ])),
  linter(view => {
    try { parse(view.state.doc.toString()); return []; }
    catch (cause) {
      const error = cause as Error & { cause?: { location?: { start: { line: number; column: number }; end: { line: number; column: number } } } };
      const location = error.cause?.location;
      const lineNumber = Math.min(view.state.doc.lines, location?.start.line ?? Number(/^Line (\d+):/.exec(error.message)?.[1] ?? 1));
      const line = view.state.doc.line(lineNumber);
      const from = Math.min(line.to, line.from + (location ? location.start.column - 1 : /^\s*/.exec(line.text)![0].length));
      return [{ from, to: Math.min(line.to, location ? from + Math.max(1, location.end.column - location.start.column) : line.to), severity: 'error', message: error.message } satisfies Diagnostic];
    }
  }, { delay: 200 })
];
