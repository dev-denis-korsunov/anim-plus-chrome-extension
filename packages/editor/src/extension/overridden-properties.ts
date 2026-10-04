import type { EditorState } from '@codemirror/state';
import { Decoration, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { compositionCommands, properties } from 'animplus/language';

function repeatedProperties(state: EditorState): DecorationSet {
  const preceding = new Map<string, { indent: number; from: number; to: number; property: string }>();
  const marks = [];
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i);
    const command = /^(\s*)([a-z][\w.-]*)(?=\s|$)/.exec(line.text);
    if (!command) continue;
    const indent = command[1].length;
    // A new definition or collection starts a separate scope. Returning from
    // a Pipe branch must not compare its actions with another nested branch.
    for (const [key, prior] of preceding) {
      if (!indent || prior.indent > indent || (compositionCommands.has(command[2]) && prior.indent >= indent)) preceding.delete(key);
    }
    if (command[2] !== 'anim') continue;
    const match = /^(\s*anim\s+)([a-z][\w.-]*)(?=\s|$)/.exec(line.text);
    if (!match || !properties.has(match[2])) continue;
    const property = match[2], key = `${indent}:${property}`;
    const prior = preceding.get(key);
    if (prior) marks.push(Decoration.mark({
      class: 'cm-overridden-property',
      attributes: { title: `${property} is repeated later at the same indentation level` }
    }).range(state.doc.lineAt(prior.from).from, state.doc.lineAt(prior.from).to));
    const from = line.from + match[1].length;
    preceding.set(key, { indent, property, from, to: from + property.length });
  }
  return Decoration.set(marks, true);
}
export const overriddenProperties = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: { state: EditorState }) { this.decorations = repeatedProperties(view.state); }
  update(update: ViewUpdate) { if (update.docChanged) this.decorations = repeatedProperties(update.state); }
}, { decorations: plugin => plugin.decorations });
