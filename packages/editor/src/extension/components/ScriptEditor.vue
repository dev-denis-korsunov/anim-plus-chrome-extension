<script setup lang="ts">
import Palette from './Palette.vue';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { sourceCommands } from '../command-source.js';
import { EditorState, Transaction } from '@codemirror/state';
import { completionKeymap, acceptCompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { EditorView, keymap, drawSelection } from '@codemirror/view';
import { indentMore, indentLess, defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { expandedCommands } from '../expanded-commands.js';
import { overriddenProperties } from '../overridden-properties.js';
import { commandToggles, disabledCommandStyle } from '../command-toggles.js';
import { animplusLanguage } from '../animplus-language.js';
const model = defineModel<string>({ required: true });
const emit = defineEmits<{ prepare: [] }>();
const host = ref<HTMLElement>();
const panel = ref<HTMLElement>();
const storedWidth = Number(localStorage.getItem('animplus.sidebar-width'));
const sidebarWidth = ref(Number.isFinite(storedWidth) && storedWidth >= 160 ? storedWidth : 210);
let resizeObserver: ResizeObserver | undefined;
let resizing: { x: number; width: number; cursor: string; userSelect: string } | null = null;
function maximumWidth() { return Math.max(160, Math.min(600, (panel.value?.clientWidth ?? 1100) - 280)); }
function resizeWidth(width: number) { sidebarWidth.value = Math.max(160, Math.min(maximumWidth(), width)); }
function startResize(event: PointerEvent) {
  if (event.button !== 0) return;
  event.preventDefault();
  resizing = { x: event.clientX, width: sidebarWidth.value, cursor: document.body.style.cursor, userSelect: document.body.style.userSelect };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
}
function moveResize(event: PointerEvent) { if (resizing) resizeWidth(resizing.width + resizing.x - event.clientX); }
function stopResize() {
  if (!resizing) return;
  document.body.style.cursor = resizing.cursor; document.body.style.userSelect = resizing.userSelect;
  resizing = null; localStorage.setItem('animplus.sidebar-width', String(sidebarWidth.value));
}
function resizeKey(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  resizeWidth(event.key === 'Home' ? 160 : event.key === 'End' ? maximumWidth() : sidebarWidth.value + (event.key === 'ArrowLeft' ? 10 : -10));
  localStorage.setItem('animplus.sidebar-width', String(sidebarWidth.value));
}
const sidebarTab = ref<'variables' | 'palette'>('variables');
const variables = computed(() => sourceCommands(model.value).filter(command => !command.indent && command.tokens[0] === 'let' && /^[A-Za-z_]\w*$/.test(command.tokens[1] ?? '') && command.tokens[2] === '=').map(command => ({ name: command.tokens[1], expression: command.tokens.slice(3).join(' '), line: command.line })));
function revealVariable(line: number) {
  if (!view) return;
  const position = view.state.doc.line(Math.min(line, view.state.doc.lines)).from;
  view.dispatch({ selection: { anchor: position }, effects: EditorView.scrollIntoView(position, { y: 'center' }) });
  view.focus();
}
function bindVariable(lineNumber: number, value: string) {
  if (!view) return;
  const line = view.state.doc.line(lineNumber);
  const command = sourceCommands(line.text)[0];
  if (!command || command.tokens[0] !== 'let') return;
  const expression = value.trim();
  view.dispatch({ changes: { from: line.from, to: line.to, insert: `let ${command.tokens[1]} = ${expression}${command.comment ? ` ${command.comment}` : ''}` }, annotations: Transaction.userEvent.of('input.binding') });
  emit('prepare');
}
let view: EditorView | undefined;
onMounted(() => {
  resizeWidth(sidebarWidth.value);
  resizeObserver = new ResizeObserver(() => { if (panel.value!.clientWidth > 0) resizeWidth(sidebarWidth.value); }); resizeObserver.observe(panel.value!);
  view = new EditorView({
    parent: host.value!,
    state: EditorState.create({
      doc: model.value,
      extensions: [
        history(), drawSelection(), closeBrackets(), animplusLanguage, commandToggles(() => emit('prepare')), expandedCommands(() => emit('prepare')), overriddenProperties, disabledCommandStyle,
        keymap.of([{ key: 'Tab', run: view => acceptCompletion(view) || indentMore(view) }, { key: 'Shift-Tab', run: indentLess },
          { key: 'Mod-Enter', run: () => { emit('prepare'); return true; } }, ...completionKeymap, ...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap]),
        EditorView.contentAttributes.of({ 'aria-label': 'Anim+ source', spellcheck: 'false' }),
        EditorView.updateListener.of(update => { if (update.docChanged) model.value = update.state.doc.toString(); }),
        EditorView.theme({
          '&': { height: '100%', color: 'var(--sys-color-on-surface)', backgroundColor: 'var(--sys-color-base-container)', fontSize: '11px' },
          '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', lineHeight: '1.5' },
          '.cm-line': { padding: '0 10px' },
          '.cm-content': { padding: '8px 0', caretColor: 'var(--sys-color-on-surface)' },
          '.cm-tooltip': { backgroundColor: 'var(--sys-color-base-container-elevated)', color: 'var(--sys-color-on-surface)', border: '1px solid var(--sys-color-divider)', fontSize: '11px' },
          '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'var(--sys-color-selection)', color: 'var(--sys-color-on-surface)' },
          '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--sys-color-selection)' }
        }, { dark: document.documentElement.dataset.theme !== 'light' })
      ]
    })
  });
  // CodeMirror hides decorative gutters from assistive technology by default.
  // This gutter contains interactive checkboxes and must remain accessible.
  view.dom.querySelector('.cm-gutters')?.removeAttribute('aria-hidden');
});
watch(model, value => {
  if (view && value !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
});
onUnmounted(() => { stopResize(); resizeObserver?.disconnect(); view?.destroy(); });
</script>
<template>
  <section ref="panel" class="panel script-panel">
    <div ref="host" class="source-editor" />
    <aside class="editor-variables" aria-label="Editor tools" :style="{ flexBasis: `${sidebarWidth}px` }">
      <div class="sidebar-splitter" role="separator" aria-label="Resize editor sidebar" aria-orientation="vertical" tabindex="0" :aria-valuenow="sidebarWidth" aria-valuemin="160" :aria-valuemax="maximumWidth()" @pointerdown="startResize" @pointermove="moveResize" @pointerup="stopResize" @pointercancel="stopResize" @lostpointercapture="stopResize" @keydown="resizeKey" />
      <div class="sidebar-tabs" role="tablist" aria-label="Editor tools">
        <button id="variables-tab" role="tab" :aria-selected="sidebarTab === 'variables'" aria-controls="variables-view" :tabindex="sidebarTab === 'variables' ? 0 : -1" @click="sidebarTab = 'variables'" @keydown.right.prevent="sidebarTab = 'palette'; (($event.currentTarget as HTMLElement).nextElementSibling as HTMLElement)?.focus()">Variables</button>
        <button id="palette-tab" role="tab" :aria-selected="sidebarTab === 'palette'" aria-controls="palette-view" :tabindex="sidebarTab === 'palette' ? 0 : -1" @click="sidebarTab = 'palette'" @keydown.left.prevent="sidebarTab = 'variables'; (($event.currentTarget as HTMLElement).previousElementSibling as HTMLElement)?.focus()">Palette</button>
      </div>
      <div v-show="sidebarTab === 'variables'" id="variables-view" class="sidebar-tab-panel" role="tabpanel" aria-labelledby="variables-tab">
      <div class="editor-variables-section">File</div>
      <div v-for="variable in variables" :key="variable.line" class="editor-variable declared">
        <button class="editor-variable-name" :aria-label="`Go to variable ${variable.name}`" :title="`Go to declaration on line ${variable.line}`" @click="revealVariable(variable.line)">{{ variable.name }}</button>
        <input class="editor-variable-expression" :aria-label="`Binding for ${variable.name}`" :title="variable.expression" :value="variable.expression" list="variable-bindings" spellcheck="false" @change="bindVariable(variable.line, ($event.target as HTMLInputElement).value)" @keydown.enter.prevent="($event.target as HTMLInputElement).blur()" />
      </div>
      <datalist id="variable-bindings"><option value="mouse.x" /><option value="mouse.y" /><option value="$0" /><option value="$('.card')" /><option value="$$('.card')" /></datalist>
      <div v-if="!variables.length" class="editor-variables-empty">Declare variables with<br /><code>let duration = .4</code></div>
      </div>
      <div v-show="sidebarTab === 'palette'" id="palette-view" class="sidebar-tab-panel" role="tabpanel" aria-labelledby="palette-tab"><Palette /></div>
    </aside>
  </section>
</template>
