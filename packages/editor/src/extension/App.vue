<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { send } from './client.js';
import type { Command, Snapshot } from '../protocol.js';
import { presets } from '../presets.js';
import { compactAnimationDefaults } from './command-source.js';
import CssEditor from './components/CssEditor.vue';
import ScriptEditor from './components/ScriptEditor.vue';
import Timeline from './components/Timeline.vue';
import ToolbarIcon from './components/ToolbarIcon.vue';
import VerticalSplit from './components/VerticalSplit.vue';
const source = ref(localStorage.getItem('animplus.source') ?? presets.Reveal);
const rootSelector = ref(localStorage.getItem('animplus.root') ?? 'body');
const state = ref<Snapshot>({ root: '', names: [], active: '', tree: [], tracks: [], time: 0, duration: 0, horizon: 0, status: 'Connecting', error: '', events: [] });
const editorTab = ref<'editor' | 'css'>('editor');
const generatedCss = ref(''), cssError = ref(''), cssBusy = ref(false);
async function generateCss() {
  cssBusy.value = true; cssError.value = ''; generatedCss.value = '';
  try {
    await apply();
    if (state.value.error) throw new Error(state.value.error);
    await command({ type: 'export-css' });
    if (state.value.error) throw new Error(state.value.error);
    generatedCss.value = state.value.css ?? '';
  } catch (error) { cssError.value = error instanceof Error ? error.message : String(error); }
  finally { cssBusy.value = false; }
}
function openCss() { editorTab.value = 'css'; void generateCss(); }
const keyboardNavigation = ref(false);
const showSelected = ref(false), notice = ref(''), connected = ref(false);
let timer: ReturnType<typeof setInterval>;
let queue = Promise.resolve();
async function command(payload: Command) {
  queue = queue.then(async () => {
    try { state.value = await send(payload); connected.value = true; }
    catch (cause) { state.value.error = cause instanceof Error ? cause.message : String(cause); connected.value = false; }
  });
  return queue;
}
function apply() {
  source.value = compactAnimationDefaults(source.value);
  localStorage.setItem('animplus.source', source.value);
  return command({ type: 'source', source: source.value, name: state.value.active });
}
async function setRoot(selected = false) {
  localStorage.setItem('animplus.root', rootSelector.value);
  await command({ type: 'root', selector: rootSelector.value, selected });
  await apply();
  if (editorTab.value === 'css') await generateCss();
}
async function selectAnimation(name: string) { await command({ type: 'source', source: source.value, name }); if (editorTab.value === 'css') await generateCss(); }
async function selectPreset(name: string) { source.value = presets[name]; await apply(); if (editorTab.value === 'css') await generateCss(); }
async function play() { await apply(); if (!state.value.error) await command({ type: 'play' }); }
async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); notice.value = `Copied: ${text}`; }
  catch { notice.value = `Copy: ${text}`; }
}
function keys(event: KeyboardEvent) {
  if (event.key === 'Tab') keyboardNavigation.value = true;
  const target = event.target as HTMLElement | null;
  const editing = target?.isContentEditable || ['TEXTAREA', 'INPUT', 'SELECT'].includes(target?.tagName ?? '');
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void apply(); }
  else if (event.code === 'Space' && !editing) { event.preventDefault(); void (state.value.status === 'Active' ? command({ type: 'pause' }) : command({ type: 'play' })); }
}
onMounted(async () => {
  window.addEventListener('keydown', keys);
  await setRoot();
  timer = setInterval(() => {
    // Poll only while active. Navigation/reload is handled by explicit Refresh.
    if (state.value.status === 'Active') void command({ type: 'snapshot' });
  }, 100);
});
onUnmounted(() => { clearInterval(timer); window.removeEventListener('keydown', keys); });
</script>
<template>
  <main :class="{ 'keyboard-navigation': keyboardNavigation }" @pointerdown.capture="keyboardNavigation = false">
    <div class="topbar"><strong>Anim<span>+</span></strong><span class="badge">DEVTOOLS</span><div class="editor-tabs" role="tablist" aria-label="Animation editing mode">
        <button id="editor-tab" role="tab" :aria-selected="editorTab === 'editor'" aria-controls="editor-view" :tabindex="editorTab === 'editor' ? 0 : -1" @click="editorTab = 'editor'" @keydown.right.prevent="openCss(); (($event.currentTarget as HTMLElement).nextElementSibling as HTMLElement)?.focus()">Editor</button>
        <button id="css-tab" role="tab" :aria-selected="editorTab === 'css'" aria-controls="css-view" :tabindex="editorTab === 'css' ? 0 : -1" @click="openCss" @keydown.left.prevent="editorTab = 'editor'; (($event.currentTarget as HTMLElement).previousElementSibling as HTMLElement)?.focus()">CSS</button>
      </div><span class="connection">{{ connected ? `Root: ${state.root}` : 'Connect to an inspected page' }}</span>
      <input v-model="rootSelector" aria-label="Root selector" placeholder="Root CSS selector" @keydown.enter="setRoot()" />
      <button @click="setRoot()">Refresh root</button><button title="Use the element selected in the browser Elements panel" @click="setRoot(true)">Use $0</button>
    </div>
    <VerticalSplit>
      <template #top>
    <div class="workspace">

      <div v-show="editorTab === 'editor'" id="editor-view" class="editor-tab-panel" role="tabpanel" aria-labelledby="editor-tab"><ScriptEditor v-model="source" @prepare="apply" /></div>
      <div v-if="editorTab === 'css'" id="css-view" class="editor-tab-panel" role="tabpanel" aria-labelledby="css-tab"><CssEditor :css="generatedCss" :busy="cssBusy" :error="cssError" @regenerate="generateCss" @copy="copy(generatedCss)" /></div>
    </div>
      </template>
      <template #bottom>
    <div class="transport" role="toolbar" aria-label="Animation playback">
      <button class="icon-button" :class="{ active: state.status === 'Active' }" aria-label="Play" title="Play animation (Space)" @click="play"><ToolbarIcon name="play" /></button>
      <button class="icon-button" :class="{ active: state.status === 'Paused' }" aria-label="Pause" title="Pause animation (Space)" @click="command({ type: 'pause' })"><ToolbarIcon name="pause" /></button>
      <button class="icon-button" aria-label="Stop / Reset" title="Stop and restore initial values" @click="command({ type: 'reset' })"><ToolbarIcon name="stop" /></button>
      <button class="icon-button" aria-label="Apply / Validate" title="Apply / Validate (Ctrl/Cmd+Enter)" @click="apply"><ToolbarIcon name="apply" /></button>
      <span class="toolbar-separator" aria-hidden="true" />
      <select aria-label="Animation" :value="state.active" @change="selectAnimation(($event.target as HTMLSelectElement).value)"><option v-for="name in state.names" :key="name">{{ name }}</option></select>
      <select aria-label="Preset" @change="selectPreset(($event.target as HTMLSelectElement).value)"><option disabled selected>Load example…</option><option v-for="(_, name) in presets" :key="name">{{ name }}</option></select>
      <span class="toolbar-separator" aria-hidden="true" />
      <label class="toolbar-checkbox"><span class="checkbox-hit"><input v-model="showSelected" type="checkbox" @change="command({ type: 'highlight', selected: showSelected })" /></span> Show selection</label>
      <span class="status">{{ state.status }} · {{ state.time.toFixed(3) }}s</span>
      <span class="toolbar-separator" aria-hidden="true" />
      <button class="icon-button" aria-label="Copy file" title="Copy .anim source" @click="copy(source)"><ToolbarIcon name="copy" /></button>
    </div>
    <Timeline :state="state" @seek="time => command({ type: 'seek', time })" @hover="path => command({ type: 'highlight', path })" />
      </template>
    </VerticalSplit>
    <div class="statusbar">
      <div v-if="state.error" class="error" role="alert" :title="state.error">{{ state.error }}</div>
      <div v-else class="message" :title="notice || 'Scrub the timeline to apply intermediate DOM values. Events are suppressed while seeking.'">{{ notice || 'Scrub the timeline to apply intermediate DOM values. Events are suppressed while seeking.' }}</div>
      <div v-if="state.events.length" class="event-log" :title="state.events.join(' · ')">{{ state.events.join(' · ') }}</div>
    </div>
  </main>
</template>
