<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { TIMELINE_PADDING, timelineTicks } from '../timeline-scale.js';
const props = defineProps<{ extent: number; minimumBoundary: number; start: number; end: number }>();
const emit = defineEmits<{ change: [start: number, end: number] }>();
const plot = ref<HTMLElement>();
const width = ref(800);
let observer: ResizeObserver | undefined;
let drag: { mode: 'start' | 'end' | 'window'; time: number; start: number; end: number } | null = null;
watch(plot, element => {
  observer?.disconnect();
  if (!element) return;
  observer = new ResizeObserver(([entry]) => { width.value = Math.max(1, entry.contentRect.width); });
  observer.observe(element);
});
onBeforeUnmount(() => observer?.disconnect());
const displayStart = computed(() => props.minimumBoundary);
const displayEnd = computed(() => props.extent + TIMELINE_PADDING);
const span = computed(() => displayEnd.value - displayStart.value);
const ticks = computed(() => timelineTicks(displayStart.value, span.value, width.value).filter(tick => tick.value >= props.minimumBoundary && tick.value <= props.extent + 1e-9));
const percent = (value: number) => (value - displayStart.value) / span.value * 100;
const minimum = computed(() => Math.min(.0005, span.value));
function point(event: PointerEvent) {
  const rect = plot.value!.getBoundingClientRect();
  return Math.max(props.minimumBoundary, Math.min(props.extent, displayStart.value + (event.clientX - rect.left) / rect.width * span.value));
}
function begin(event: PointerEvent) {
  if (event.button !== 0) return;
  event.preventDefault();
  const edge = (event.target as HTMLElement).closest<HTMLElement>('[data-edge]')?.dataset.edge;
  const time = point(event);
  let start = props.start, end = props.end;
  if (!edge && (time < start || time > end)) {
    const span = end - start;
    start = Math.max(props.minimumBoundary, Math.min(props.extent - span, time - span / 2));
    end = start + span;
    emit('change', start, end);
  }
  drag = { mode: edge === 'start' || edge === 'end' ? edge : 'window', time, start, end };
  plot.value!.setPointerCapture(event.pointerId);
}
function move(event: PointerEvent) {
  if (!drag) return;
  const time = point(event);
  if (drag.mode === 'start') emit('change', Math.min(drag.end - minimum.value, time), drag.end);
  else if (drag.mode === 'end') emit('change', drag.start, Math.max(drag.start + minimum.value, time));
  else {
    const span = drag.end - drag.start;
    const start = Math.max(props.minimumBoundary, Math.min(props.extent - span, drag.start + time - drag.time));
    emit('change', start, start + span);
  }
}
function finish() { drag = null; }
function keys(event: KeyboardEvent, edge: 'start' | 'end') {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault(); event.stopPropagation();
  const delta = (event.key === 'ArrowLeft' ? -1 : 1) * (props.end - props.start) * (event.shiftKey ? .1 : .02);
  if (edge === 'start') emit('change', Math.max(props.minimumBoundary, Math.min(props.end - minimum.value, props.start + delta)), props.end);
  else emit('change', props.start, Math.min(props.extent, Math.max(props.start + minimum.value, props.end + delta)));
}
</script>
<template>
  <div class="timeline-overview">
    <div class="timeline-labels overview-summary">{{ Math.round(minimumBoundary * 1000) }} – {{ (Math.round(extent * 100) * 10).toLocaleString('en-US') }} ms</div>
    <div ref="plot" class="overview-plot" aria-label="Timeline overview" @pointerdown="begin" @pointermove="move" @pointerup="finish" @pointercancel="finish" @lostpointercapture="finish" @dblclick="emit('change', minimumBoundary, extent)">
      <div class="overview-ticks" aria-hidden="true"><span v-for="tick in ticks" :key="tick.value" :style="{ left: `${tick.left}%` }">{{ tick.label }}</span></div>
      <div class="overview-window" :style="{ left: `${percent(start)}%`, width: `${(end - start) / span * 100}%` }" />
      <div class="overview-handle" data-edge="start" role="slider" tabindex="0" aria-label="Visible range start" :aria-valuemin="minimumBoundary * 1000" :aria-valuemax="end * 1000" :aria-valuenow="start * 1000" :aria-valuetext="`${Math.round(start * 1000)} ms`" :style="{ left: `${percent(start)}%` }" @keydown="keys($event, 'start')" />
      <div class="overview-handle" data-edge="end" role="slider" tabindex="0" aria-label="Visible range end" :aria-valuemin="start * 1000" :aria-valuemax="extent * 1000" :aria-valuenow="end * 1000" :aria-valuetext="`${Math.round(end * 1000)} ms`" :style="{ left: `${percent(end)}%` }" @keydown="keys($event, 'end')" />
    </div>
  </div>
</template>
