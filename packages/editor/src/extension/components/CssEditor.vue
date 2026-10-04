<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
const props = defineProps<{ css: string; busy: boolean; error: string }>();
defineEmits<{ regenerate: []; copy: [] }>();
const host = ref<HTMLElement>();
let view: EditorView | undefined;
onMounted(() => { view = new EditorView({ parent: host.value!, state: EditorState.create({ doc: props.css, extensions: [EditorState.readOnly.of(true), EditorView.editable.of(false), EditorView.contentAttributes.of({ 'aria-label': 'Generated CSS', tabindex: '0' }), EditorView.theme({ '&': { height: '100%', fontSize: '11px', color: 'var(--sys-color-on-surface)' }, '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', lineHeight: '1.5' }, '.cm-content': { padding: '8px 10px' } })] }) }); });
watch(() => props.css, css => { if (view && css !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: css } }); });
onUnmounted(() => view?.destroy());
</script>
<template>
  <section class="css-panel" aria-label="CSS animation export">
    <div class="css-tools"><span>{{ busy ? 'Generating CSS…' : 'Keyframes for the selected animation and DOM elements' }}</span><button :disabled="busy" @click="$emit('regenerate')">Regenerate</button><button :disabled="busy || !css || Boolean(error)" @click="$emit('copy')">Copy CSS</button></div>
    <div v-if="error" class="css-export-error" role="alert">{{ error }}</div>
    <div ref="host" class="source-editor" />
  </section>
</template>
