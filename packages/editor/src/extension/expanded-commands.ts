import { StateEffect, StateField, Transaction } from '@codemirror/state';
import { Decoration, EditorView, GutterMarker, WidgetType, gutter, type DecorationSet } from '@codemirror/view';
import { h, render } from 'vue';
import BezierEditor from './components/BezierEditor.vue';
import { parse } from 'animplus';
import { compositionCommands, properties, parameters, easingNames } from 'animplus/language';
import { sourceCommands, compactAnimationTokens } from './command-source.js';

const expand = StateEffect.define<number>();
const opened = StateField.define<number[]>({
  create: () => [],
  update(value, transaction) {
    let positions = value.map(position => transaction.changes.mapPos(position, -1));
    for (const effect of transaction.effects) if (effect.is(expand)) positions = positions.includes(effect.value) ? positions.filter(position => position !== effect.value) : [...positions, effect.value];
    return [...new Set(positions)].filter(position => {
      const line = transaction.state.doc.lineAt(position);
      return line.from === position && expandable(line.text);
    });
  }
});
function expandable(text: string) {
  const block = sourceCommands(text)[0];
  return block && ['animation', 'selection'].includes(block.kind) ? block : null;
}
const defaults: Record<string, string> = { from: 'self', to: 'self', time: '.25', delay: '0', repeat: '0', direction: 'normal' };
const curveViewports = new WeakMap<EditorView, Map<number, { scale: number; x: number; y: number; snap?: boolean }>>();
const mountedCurves = new WeakMap<HTMLElement, HTMLElement>();
class Fields extends WidgetType {
  constructor(readonly position: number, readonly text: string, readonly prepare: () => void) { super(); }
  eq(other: Fields) { return this.position === other.position && this.text === other.text; }
  toDOM(view: EditorView) {
    const block = expandable(this.text)!;
    const root = document.createElement('div'); root.className = 'cm-command-fields';
    root.style.paddingLeft = `${10 + block.indent.length * 7.2}px`;
    root.setAttribute('aria-label', 'Expanded command fields');
    const edit = (key: string, value: string) => {
      const line = view.state.doc.lineAt(this.position), current = expandable(line.text);
      if (!current) return;
      const tokens = [...current.tokens];
      if (key === 'property') { tokens[1] = value; if (!properties.has(value)) tokens.splice(2); }
      else if (key === 'command') tokens[0] = value;
      else if (key === 'arguments') tokens.splice(1, tokens.length, value);
      else if (key === 'easing') {
        const index = tokens.findIndex(token => token.startsWith('easy.'));
        const ease = value === 'easy.bezier' ? 'easy.bezier(.25,.1,.25,1)' : value;
        if (index < 0) tokens.push(ease); else tokens[index] = ease;
      } else {
        const index = tokens.indexOf(key, 2);
        if (index < 0 && value.trim()) tokens.push(key, value.trim());
        else if (index >= 0) { if (value.trim()) tokens[index + 1] = value.trim(); else tokens.splice(index, 2); }
      }
      const insert = current.indent + current.disabledPrefix + compactAnimationTokens(tokens).join(' ') + (current.comment ? ` ${current.comment}` : '');
      if (insert === line.text) return;
      view.dispatch({ changes: { from: line.from, to: line.to, insert }, annotations: Transaction.userEvent.of('input.commandField') });
      this.prepare();
    };
    const field = (key: string, value: string, options?: string[], explicit = true) => {
      const row = document.createElement('label'); row.className = `cm-command-field${explicit ? '' : ' implicit'}`;
      const name = document.createElement('span'); name.textContent = `${key}:`; row.append(name);
      const input = document.createElement(options ? 'select' : 'input');
      input.setAttribute('aria-label', `Line ${view.state.doc.lineAt(this.position).number} ${key} field`);
      if (options) for (const item of [...new Set([value, ...options])]) { const option = document.createElement('option'); option.value = item; option.textContent = item; input.append(option); }
      input.value = value;
      if (!explicit) input.title = 'Default value. Editing adds this field to the source.';
      input.addEventListener('change', () => { const value = input.value; queueMicrotask(() => edit(key, value)); });
      input.addEventListener('keydown', event => { if ((event as KeyboardEvent).key === 'Enter' && input instanceof HTMLInputElement) { event.preventDefault(); input.dispatchEvent(new Event('change')); } });
      row.append(input); root.append(row);
    };
    if (block.kind === 'animation') {
      let names: string[] = [];
      try { names = [...parse(view.state.doc.toString()).definitions.keys()]; } catch { /* Keep fields available while typing incomplete source. */ }
      field('property', block.tokens[1] ?? 'opacity', [...properties, ...names]);
      if (!properties.has(block.tokens[1])) return root;
      for (const key of parameters) { const index = block.tokens.indexOf(key, 2); field(key, index < 0 ? defaults[key] : block.tokens[index + 1], key === 'direction' ? ['normal', 'alternate'] : undefined, index >= 0); }
      const ease = block.tokens.find(token => token.startsWith('easy.'));
      field('easing', ease?.startsWith('easy.bezier(') ? 'easy.bezier' : ease ?? 'easy.linear', [...easingNames, 'easy.bezier'], Boolean(ease));
      if (ease?.startsWith('easy.bezier(')) {
        const points = /^easy\.bezier\(([^)]+)\)$/.exec(ease)?.[1].split(',').map(Number);
        if (points?.length === 4 && points.every(Number.isFinite)) {
          const row = document.createElement('div'); row.className = 'cm-inline-curve';
          const label = document.createElement('span'); label.textContent = 'curve:'; row.append(label);
          const host = document.createElement('div'); row.append(host); root.append(row);
          const viewports = curveViewports.get(view) ?? new Map(); curveViewports.set(view, viewports);
          render(h(BezierEditor, { viewport: viewports.get(this.position), onViewportChange: (viewport: { scale: number; x: number; y: number; snap?: boolean }) => viewports.set(this.position, viewport), points: points as [number, number, number, number], onChange: (value: number[]) => queueMicrotask(() => edit('easing', `easy.bezier(${value.join(',')})`)) }), host);
          mountedCurves.set(root, host);
        }
      }
    } else { field('command', block.tokens[0], [...compositionCommands]); field('arguments', block.tokens.slice(1).join(' ')); }
    return root;
  }
  destroy(dom: HTMLElement) { const host = mountedCurves.get(dom); if (host) render(null, host); }
  ignoreEvent() { return true; }
}
class Disclosure extends GutterMarker {
  constructor(readonly position: number, readonly line: number, readonly expanded: boolean) { super(); }
  eq(other: Disclosure) { return this.position === other.position && this.line === other.line && this.expanded === other.expanded; }
  toDOM(view: EditorView) {
    const button = document.createElement('button'); button.className = 'cm-command-disclosure'; button.textContent = this.expanded ? '▾' : '▸';
    button.setAttribute('aria-label', `Expand line ${this.line} fields`); button.setAttribute('aria-expanded', String(this.expanded));
    button.title = this.expanded ? 'Collapse command fields' : 'Expand command fields';
    button.addEventListener('click', () => view.dispatch({ effects: expand.of(this.position) })); return button;
  }
}
export function expandedCommands(prepare: () => void) {
  const fields = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(value, transaction) {
      if (!transaction.docChanged && !transaction.effects.some(effect => effect.is(expand))) return value;
      return Decoration.set(transaction.state.field(opened).map(position => {
        const line = transaction.state.doc.lineAt(position);
        return Decoration.widget({ widget: new Fields(position, line.text, prepare), block: true, side: 1 }).range(line.to);
      }), true);
    },
    provide: field => EditorView.decorations.from(field)
  });
  return [opened, fields, gutter({
    class: 'cm-disclosure-gutter',
    lineMarker(view, line) { const text = view.state.doc.lineAt(line.from); return expandable(text.text) ? new Disclosure(text.from, text.number, view.state.field(opened).includes(text.from)) : null; },
    lineMarkerChange: update => update.docChanged || update.startState.field(opened) !== update.state.field(opened)
  })];
}
