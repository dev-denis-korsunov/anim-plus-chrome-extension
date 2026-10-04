import { Transaction, type Text } from '@codemirror/state';
import { Decoration, EditorView, GutterMarker, ViewPlugin, gutter, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { compositionCommands } from 'animplus/language';

function commandLine(text: string) {
  const match = /^(\s*)((?:\/\/ )*)([a-z][a-z-]*)(?=\s|$)/.exec(text);
  if (!match || (match[3] !== 'anim' && !compositionCommands.has(match[3]))) return null;
  return { indent: match[1].length, disabled: Boolean(match[2]), command: match[3] };
}
function disabledAncestor(doc: Text, lineNumber: number, indent: number) {
  let depth = indent;
  for (let i = lineNumber - 1; i >= 1; i--) {
    const text = doc.line(i).text;
    if (!text.trim()) continue;
    const parentIndent = /^\s*/.exec(text)![0].length;
    if (parentIndent >= depth) continue;
    const parent = commandLine(text);
    if (parent?.disabled) return true;
    depth = parentIndent;
    if (!depth) break;
  }
  return false;
}
function toggle(view: EditorView, position: number, prepare: () => void) {
  const doc = view.state.doc, line = doc.lineAt(position), command = commandLine(line.text);
  if (!command || disabledAncestor(doc, line.number, command.indent)) return;
  const changes = [];
  // Toggle the entire Pipe branch. Existing comments receive an extra prefix
  // and retain their original disabled state when the parent is re-enabled.
  for (let i = line.number; i <= doc.lines; i++) {
    const current = doc.line(i), indent = /^\s*/.exec(current.text)![0].length;
    if (i !== line.number && current.text.trim() && indent <= command.indent) break;
    if (!current.text.trim()) continue;
    const from = current.from + indent;
    if (!command.disabled) changes.push({ from, insert: '// ' });
    else if (current.text.slice(indent).startsWith('// ')) changes.push({ from, to: from + 3, insert: '' });
  }
  view.dispatch({ changes, annotations: Transaction.userEvent.of('input.toggleCommand') });
  prepare();
}
class CommandToggle extends GutterMarker {
  constructor(readonly position: number, readonly line: number, readonly command: string,
    readonly enabled: boolean, readonly blocked: boolean, readonly prepare: () => void) { super(); }
  eq(other: GutterMarker) {
    return other instanceof CommandToggle && this.position === other.position && this.line === other.line &&
      this.command === other.command && this.enabled === other.enabled && this.blocked === other.blocked;
  }
  toDOM(view: EditorView) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.checked = this.enabled; checkbox.disabled = this.blocked;
    checkbox.setAttribute('aria-label', `Toggle line ${this.line}: ${this.command}`);
    checkbox.title = this.blocked ? 'Enable the parent command first' : `${this.enabled ? 'Disable' : 'Enable'} ${this.command} (line ${this.line})`;
    checkbox.addEventListener('pointerdown', event => event.stopPropagation());
    checkbox.addEventListener('change', event => { event.stopPropagation(); toggle(view, this.position, this.prepare); });
    return checkbox;
  }
}
export function commandToggles(prepare: () => void) {
  return gutter({
    class: 'cm-command-gutter',
    lineMarker(view, block) {
      const line = view.state.doc.lineAt(block.from), command = commandLine(line.text);
      if (!command) return null;
      const blocked = disabledAncestor(view.state.doc, line.number, command.indent);
      return new CommandToggle(line.from, line.number, command.command, !command.disabled && !blocked, blocked, prepare);
    },
    lineMarkerChange: update => update.docChanged
  });
}

function disabledDecorations(view: EditorView) {
  const marks = [], prefixes = [];
  for (let i = 1; i <= view.state.doc.lines; i++) {
    const line = view.state.doc.line(i), command = commandLine(line.text);
    if (!command?.disabled) continue;
    const prefix = /^(\s*)((?:\/\/ )+)/.exec(line.text)!;
    const from = line.from + prefix[1].length, to = from + prefix[2].length;
    const hidden = Decoration.replace({}).range(from, to);
    prefixes.push(hidden); marks.push(hidden);
    marks.push(Decoration.line({ class: 'cm-disabled-command' }).range(line.from));
  }
  return { decorations: Decoration.set(marks, true), prefixes: Decoration.set(prefixes, true) };
}
const disabledCommandView = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  prefixes: DecorationSet;
  constructor(view: EditorView) { const state = disabledDecorations(view); this.decorations = state.decorations; this.prefixes = state.prefixes; }
  update(update: ViewUpdate) {
    if (!update.docChanged) return;
    const state = disabledDecorations(update.view); this.decorations = state.decorations; this.prefixes = state.prefixes;
  }
}, { decorations: plugin => plugin.decorations });
export const disabledCommandStyle = [disabledCommandView,
  EditorView.atomicRanges.of(view => view.plugin(disabledCommandView)?.prefixes ?? Decoration.none)];
