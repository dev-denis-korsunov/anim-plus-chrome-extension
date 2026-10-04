<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
const defaultHeight = 312;
const storedHeight = Number(localStorage.getItem('animplus.playbackHeight'));
const preferredHeight = ref(Number.isFinite(storedHeight) && storedHeight > 0 ? storedHeight : defaultHeight);
const container = ref<HTMLElement>();
const available = ref(600);
const dragging = ref(false);
const minimum = computed(() => Math.min(140, available.value * .4));
const maximum = computed(() => Math.max(minimum.value, available.value - Math.min(140, available.value * .4)));
const height = computed(() => Math.max(minimum.value, Math.min(maximum.value, preferredHeight.value)));
let startY = 0, startHeight = 0;
let observer: ResizeObserver | undefined;
function save() { localStorage.setItem('animplus.playbackHeight', String(preferredHeight.value)); }
function begin(event: PointerEvent) {
  if (event.button !== 0) return;
  event.preventDefault();
  startY = event.clientY; startHeight = height.value; dragging.value = true;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  document.documentElement.classList.add('resizing-panels');
}
function move(event: PointerEvent) {
  if (!dragging.value) return;
  preferredHeight.value = Math.max(minimum.value, Math.min(maximum.value, startHeight + startY - event.clientY));
}
function end() {
  if (!dragging.value) return;
  dragging.value = false;
  document.documentElement.classList.remove('resizing-panels');
  save();
}
function reset() { preferredHeight.value = defaultHeight; save(); }
function keys(event: KeyboardEvent) {
  let next: number;
  if (event.key === 'ArrowUp') next = height.value + (event.shiftKey ? 50 : 10);
  else if (event.key === 'ArrowDown') next = height.value - (event.shiftKey ? 50 : 10);
  else if (event.key === 'Home') next = minimum.value;
  else if (event.key === 'End') next = maximum.value;
  else return;
  event.preventDefault();
  preferredHeight.value = Math.max(minimum.value, Math.min(maximum.value, next)); save();
}
onMounted(() => {
  observer = new ResizeObserver(() => { available.value = container.value!.clientHeight; });
  available.value = container.value!.clientHeight;
  observer.observe(container.value!);
});
onUnmounted(() => { observer?.disconnect(); document.documentElement.classList.remove('resizing-panels'); });
</script>
<template>
  <div ref="container" class="vertical-split">
    <div id="editor-pane" class="split-top"><slot name="top" /></div>
    <div class="panel-splitter" :style="{ bottom: `${height - 3}px` }" :class="{ dragging }" role="separator" aria-label="Playback panel height" aria-orientation="horizontal" aria-controls="playback-pane" :aria-valuemin="Math.round(minimum)" :aria-valuemax="Math.round(maximum)" :aria-valuenow="Math.round(height)" tabindex="0" @pointerdown="begin" @pointermove="move" @pointerup="end" @pointercancel="end" @lostpointercapture="end" @keydown="keys" @dblclick="reset" />
    <div id="playback-pane" class="split-bottom" :style="{ height: `${height}px` }"><slot name="bottom" /></div>
  </div>
</template>
