<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { Snapshot, Track } from '../../protocol.js';
import TimelineOverview from './TimelineOverview.vue';
import { TIMELINE_PADDING, timelineTicks } from '../timeline-scale.js';
const props = defineProps<{ state: Snapshot }>();
const emit = defineEmits<{ seek: [time: number]; hover: [path?: string] }>();
const canvas = ref<HTMLElement>();
const dragging = ref(false);
const hoveredTarget = ref<string | null>(null);
const viewStart = ref(0);
const viewSpan = ref(1);
const canvasWidth = ref(800);
const pointerFraction = ref(.5);
let panOrigin: { x: number; start: number } | null = null;
let observer: ResizeObserver | undefined;
watch(canvas, element => {
  observer?.disconnect();
  if (!element) return;
  observer = new ResizeObserver(([entry]) => { canvasWidth.value = Math.max(1, entry.contentRect.width); });
  observer.observe(element);
});
onBeforeUnmount(() => observer?.disconnect());
const tooltip = ref<{ track: Track; x: number; y: number } | null>(null);
function showTooltip(event: PointerEvent, track: Track) {
  if (dragging.value) return;
  tooltip.value = { track, x: Math.max(8, Math.min(event.clientX + 12, window.innerWidth - 308)),
    y: Math.max(8, Math.min(event.clientY + 18, window.innerHeight - 150)) };
}
function enterTrack(event: PointerEvent, track: Track) {
  showTooltip(event, track);
  hoveredTarget.value = track.target;
  emit('hover', track.target ?? undefined);
}
function leaveTrack() { tooltip.value = null; hoveredTarget.value = null; emit('hover'); }
function describe(track: Track) {
  return `${track.label}${track.target === null ? '' : ` · ${track.from} → ${track.to}`}\nStart: ${time(track.start)} · end: ${time(track.end)}\nDelay: ${time(track.start - track.activation)} · line ${track.line}${track.repeat === -1 ? '\nRepeat: infinite' : track.repeat ? `\nRepeats: ${track.repeat}` : ''}`;
}
const extent = computed(() => Math.max(props.state.horizon, .001));
// Keep the real range left-aligned and preserve the right margin during zoom.
const displayPadding = computed(() => TIMELINE_PADDING * viewSpan.value / extent.value);
const displayStart = computed(() => viewStart.value);
const displaySpan = computed(() => viewSpan.value + displayPadding.value);
const displayEnd = computed(() => displayStart.value + displaySpan.value);
// Match Performance's modern navigation and TimelineGrid's 64px, 1/2/5 ticks.
function resetZoom() { viewStart.value = 0; viewSpan.value = extent.value; }
watch([() => props.state.active, extent], resetZoom, { immediate: true });
const viewEnd = computed(() => viewStart.value + viewSpan.value);
const position = (value: number) => (value - displayStart.value) / displaySpan.value * 100;
function windowTimes(start: number, span: number) {
  viewSpan.value = Math.max(Math.min(.0005, extent.value), Math.min(extent.value, span));
  viewStart.value = Math.max(0, Math.min(extent.value - viewSpan.value, start));
  tooltip.value = null;
}
function zoom(factor: number, anchor = pointerFraction.value) {
  const span = Math.max(Math.min(.0005, extent.value), Math.min(extent.value, viewSpan.value * factor));
  windowTimes(viewStart.value + (viewSpan.value - span) * anchor, span);
}
function pan(pixels: number) { windowTimes(viewStart.value + pixels / canvasWidth.value * displaySpan.value, viewSpan.value); }
function fraction(clientX: number) {
  const bounds = canvas.value!.getBoundingClientRect();
  return Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
}
function wheel(event: WheelEvent) {
  event.preventDefault();
  const scroll = canvas.value!.closest('.timeline-scroll')!;
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroll.clientHeight : 1;
  const dx = event.deltaX * unit, dy = event.deltaY * unit;
  tooltip.value = null;
  // Wheel gestures only scroll. The overview handles and keyboard control zoom.
  if (event.shiftKey) pan(dx || dy);
  else {
    if (dx) pan(dx);
    if (dy) scroll.scrollTop += dy;
  }
}

function keyboard(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const factor = event.shiftKey ? .8 : .3;
  switch (event.code) {
    case 'KeyA': pan(-160); break;
    case 'KeyD': pan(160); break;
    case 'KeyW': case 'Equal': zoom(1 - factor); break;
    case 'KeyS': case 'Minus': zoom(1 + factor); break;
    case 'Digit0': resetZoom(); break;
    default: return;
  }
  event.preventDefault(); event.stopPropagation();
}
const ticks = computed(() => timelineTicks(displayStart.value, displaySpan.value, canvasWidth.value).filter(tick => tick.value >= 0 && tick.value <= extent.value + 1e-9));
function visible(start: number, end: number) { return end >= displayStart.value && start <= displayEnd.value; }
function intervalStyle(start: number, end: number) {
  const left = Math.max(displayStart.value, start), right = Math.min(displayEnd.value, end);
  return { left: `${position(left)}%`, width: `${Math.max(0, (right - left) / displaySpan.value * 100)}%` };
}
const rows = computed(() => {
  const groups = new Map<string, { key: string; name: string; target: string | null; lanes: { label: string; tracks: Track[] }[] }>();
  for (const track of props.state.tracks) {
    const key = track.target ?? '@events';
    if (!groups.has(key)) groups.set(key, { key, target: track.target, name: track.target === null ? 'Events' : props.state.tree.find(row => row.path === track.target)?.name ?? track.target, lanes: [] });
    const row = groups.get(key)!;
    let lane = row.lanes.find(lane => lane.label === track.label && lane.tracks.every(previous => previous.end <= track.activation));
    if (!lane) { lane = { label: track.label, tracks: [] }; row.lanes.push(lane); }
    lane.tracks.push(track);
  }
  return [...groups.values()];
});
const color = (track: Track) => track.label.startsWith('pos') ? '#7aabdf' : track.label.startsWith('scale') ? '#80b66e' : track.label === 'opacity' ? '#b18be8' : track.target === null ? '#e799b4' : '#f3d45b';
function seek(event: PointerEvent) {
  emit('seek', Math.max(0, Math.min(extent.value, displayStart.value + fraction(event.clientX) * displaySpan.value)));
}
function begin(event: PointerEvent) {
  if (event.button !== 0 && event.button !== 1) return;
  event.preventDefault(); tooltip.value = null; dragging.value = true;
  canvas.value!.focus({ preventScroll: true });
  canvas.value!.setPointerCapture(event.pointerId);
  if (event.shiftKey || event.button === 1) panOrigin = { x: event.clientX, start: viewStart.value };
  else seek(event);
}
function move(event: PointerEvent) {
  pointerFraction.value = Math.max(0, Math.min(1, (displayStart.value + fraction(event.clientX) * displaySpan.value - viewStart.value) / viewSpan.value));
  if (!dragging.value) return;
  if (panOrigin) windowTimes(panOrigin.start + (panOrigin.x - event.clientX) / canvasWidth.value * displaySpan.value, viewSpan.value);
  else seek(event);
}
function end() { dragging.value = false; panOrigin = null; }
const time = (value: number) => `${value.toFixed(3)}s`;
</script>
<template>
  <section class="panel debug-panel">
    <div v-if="!state.tracks.length" class="empty">No tracks. Select DOM objects, then add transitions.</div>
    <template v-else>
    <TimelineOverview :extent="extent" :minimum-boundary="0" :start="viewStart" :end="viewEnd" @change="(start, end) => windowTimes(start, end - start)" />
    <div class="timeline-scroll" @wheel="wheel">
      <div class="timeline-content">
      <div class="timeline-labels">
        <div class="ruler-label">{{ state.time.toFixed(2) }} / {{ state.duration === null ? '∞' : state.duration.toFixed(2) }} s</div>
        <div v-for="row in rows" :key="row.key" class="label-group" :class="{ 'scene-hovered': row.target !== null && hoveredTarget === row.target }" :style="{ height: `${row.lanes.length * 17 + 1}px` }" @mouseenter="emit('hover', row.target ?? undefined)" @mouseleave="emit('hover')">
          <div class="object-label" :title="row.name">{{ row.name }}</div>
        </div>
      </div>
      <div ref="canvas" class="timeline-canvas" :data-view-start="viewStart" :data-view-end="viewEnd" :data-display-start="displayStart" :data-display-end="displayEnd" tabindex="0" aria-label="Animation timeline" @keydown="keyboard" @dblclick="resetZoom" @pointerdown="begin" @pointermove="move" @pointerup="end" @pointercancel="end">
        <div class="timeline-grid" aria-hidden="true"><i v-for="tick in ticks" :key="tick.value" :style="{ left: `${tick.left}%` }" /></div>
        <div class="ruler" title="Wheel: scroll vertically · horizontal gesture / Shift + wheel: scroll horizontally · Shift + drag: pan · W/S: zoom · A/D: pan · double-click: reset zoom"><span v-for="tick in ticks" :key="tick.value" :style="{ left: `${tick.left}%` }">{{ tick.label }}</span></div>
        <div v-for="row in rows" :key="row.key" class="track-group">
          <div v-for="(lane, i) in row.lanes" :key="i" class="lane">
            <template v-for="(track, j) in lane.tracks" :key="j">
              <div v-if="track.start > track.activation && visible(track.activation, track.start)" class="delay" :style="intervalStyle(track.activation, track.start)" />
              <div v-if="visible(track.start, track.end)" class="segment" :class="{ instant: track.start === track.end }" :style="{ ...intervalStyle(track.start, track.end), '--track-color': color(track) }" @pointerenter="enterTrack($event, track)" @pointermove="showTooltip($event, track)" @pointerleave="leaveTrack"><span class="segment-label">{{ track.label }}{{ track.repeat === -1 ? ' ↻' : '' }}</span></div>
            </template>
          </div>
        </div>
        <div v-if="visible(state.time, state.time)" class="playhead" :style="{ left: `${position(state.time)}%` }"></div>
      </div>
      </div>
    </div>
    </template>
    <Teleport to="body">
      <div v-if="tooltip" class="track-tooltip" role="tooltip" :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }">{{ describe(tooltip.track) }}</div>
    </Teleport>
  </section>
</template>
