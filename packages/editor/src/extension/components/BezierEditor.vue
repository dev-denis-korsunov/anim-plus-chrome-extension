<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
type Points = [number, number, number, number];
type Viewport = { scale: number; x: number; y: number; snap?: boolean };
const props = defineProps<{ points: Points; viewport?: Viewport }>();
const emit = defineEmits<{ change: [points: Points]; viewportChange: [viewport: Viewport] }>();
const camera = ref<Viewport>({ ...props.viewport ?? { scale: 1, x: 0, y: 0 } });
const panning = ref(false);
const snap = ref(props.viewport?.snap ?? false);
let panStart = { x: 0, y: 0, offsetX: 0, offsetY: 0 };
const transform = computed(() => `translate(${camera.value.x} ${camera.value.y}) scale(${camera.value.scale})`);
function saveViewport() { emit('viewportChange', { ...camera.value, snap: snap.value }); }
function localPoint(event: MouseEvent) {
  const point = chart.value!.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
  return point.matrixTransform(chart.value!.getScreenCTM()!.inverse());
}
function zoom(event: WheelEvent) {
  if (dragging.value !== null || panning.value) return;
  const point = localPoint(event);
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 240 : 1);
  const scale = Math.max(.25, Math.min(8, camera.value.scale * Math.exp(-delta * .002)));
  const ratio = scale / camera.value.scale;
  camera.value = { scale, x: point.x - (point.x - camera.value.x) * ratio, y: point.y - (point.y - camera.value.y) * ratio };
  saveViewport();
}
function pan(event: PointerEvent) {
  if (event.button !== 0 || dragging.value !== null) return;
  event.preventDefault();
  const point = localPoint(event);
  panStart = { x: point.x, y: point.y, offsetX: camera.value.x, offsetY: camera.value.y };
  panning.value = true; chart.value!.setPointerCapture(event.pointerId);
}
function toggleSnap() { snap.value = !snap.value; saveViewport(); }
function resetView() { camera.value = { scale: 1, x: 0, y: 0 }; saveViewport(); }
const current = ref<Points>([...props.points]);
const dragging = ref<0 | 1 | null>(null);
const chart = ref<SVGSVGElement>();
watch(() => props.points, points => { if (dragging.value === null) current.value = [...points]; });
const x = (value: number) => 32 + 176 * value;
const y = (value: number) => 208 - 176 * value;
const snapGrid = Array.from({ length: 9 }, (_, index) => {
  const position = 32 + (index + 1) * 17.6;
  return `M${position} 32V208M32 ${position}H208`;
}).join('');
const curve = computed(() => `M32,208 C${x(current.value[0])},${y(current.value[1])} ${x(current.value[2])},${y(current.value[3])} 208,32`);
function begin(event: PointerEvent, handle: 0 | 1) {
  if (event.button !== 0) return;
  event.preventDefault(); event.stopPropagation(); dragging.value = handle;
  chart.value!.setPointerCapture(event.pointerId);
}
function move(event: PointerEvent) {
  const point = localPoint(event);
  if (panning.value) {
    camera.value.x = panStart.offsetX + point.x - panStart.x;
    camera.value.y = panStart.offsetY + point.y - panStart.y;
    saveViewport(); return;
  }
  if (dragging.value === null) return;
  const local = { x: (point.x - camera.value.x) / camera.value.scale, y: (point.y - camera.value.y) / camera.value.scale };
  const offset = dragging.value * 2;
  const precision = snap.value ? 100 : 1000;
  current.value[offset] = Math.round(Math.max(0, Math.min(1, (local.x - 32) / 176)) * precision) / precision;
  current.value[offset + 1] = Math.round((208 - local.y) / 176 * precision) / precision;
}
function end() { panning.value = false; if (dragging.value === null) return; dragging.value = null; emit('change', [...current.value]); }
function field(index: number, value: string) {
  const number = Number(value); if (!Number.isFinite(number)) return;
  current.value[index] = index % 2 === 0 ? Math.max(0, Math.min(1, number)) : number;
  emit('change', [...current.value]);
}
const preview = ref<HTMLElement>();
let animation: Animation | undefined;
function playPreview() {
  animation?.cancel();
  const distance = Math.max(0, preview.value!.parentElement!.clientWidth - 12);
  animation = preview.value!.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${distance}px)` }], { duration: 1000, easing: `cubic-bezier(${current.value.join(',')})`, fill: 'forwards' });
}
onUnmounted(() => animation?.cancel());
</script>
<template>
  <div class="bezier-editor">
    <div class="bezier-graph">
    <button type="button" class="bezier-snap" :class="{ active: snap }" aria-label="Snap control points" :aria-pressed="snap" title="Snap control points in 0.01 increments" @click="toggleSnap">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2v6a5 5 0 0 0 10 0V2h-3v6a2 2 0 0 1-4 0V2Z" /><path d="M3 5h3m4 0h3" /></svg><span>Snap</span>
    </button>
    <svg ref="chart" class="bezier-chart" viewBox="0 0 240 240" :class="{ panning }" aria-label="Cubic Bezier curve" title="Scroll to zoom. Drag the graph to pan. Drag a control point to edit. Double-click to reset the view." @wheel.prevent.stop="zoom" @pointerdown="pan" @dblclick.prevent="resetView" @pointermove="move" @pointerup="end" @pointercancel="end" @lostpointercapture="end">
      <g :transform="transform">
      <path v-if="snap" class="bezier-snap-grid" :d="snapGrid" />
      <path class="bezier-grid" d="M32 32H208M32 120H208M32 208H208M32 32V208M120 32V208M208 32V208" />
      <path class="bezier-guide" :d="`M32 208L${x(current[0])} ${y(current[1])}M208 32L${x(current[2])} ${y(current[3])}`" />
      <path class="bezier-linear" d="M32 208L208 32" />
      <path class="bezier-curve" :d="curve" />
      <circle v-for="handle in [0, 1] as const" :key="handle" :cx="x(current[handle * 2])" :cy="y(current[handle * 2 + 1])" :r="5 / camera.scale" :class="['bezier-handle', `bezier-handle-${handle}`]" :aria-label="`Bezier control point ${handle + 1}`" @pointerdown="begin($event, handle)" />
      <circle cx="32" cy="208" :r="3 / camera.scale" class="bezier-endpoint" /><circle cx="208" cy="32" :r="3 / camera.scale" class="bezier-endpoint" />
      <text x="30" y="223">0</text><text x="205" y="223">1</text><text x="104" y="236">Time</text><text transform="translate(13 141) rotate(-90)">Progress</text>
      </g>
    </svg>
    </div>
    <div class="bezier-view-tools"><span>{{ Math.round(camera.scale * 100) }}%</span><button type="button" aria-label="Reset curve view" @click="resetView">Reset view</button></div>
    <div class="bezier-preview"><button type="button" aria-label="Preview curve" @click="playPreview">▶ Preview</button><div class="bezier-preview-lane"><span ref="preview" class="bezier-preview-dot" /></div></div>
    <div class="bezier-values"><label v-for="(name, index) in ['X1', 'Y1', 'X2', 'Y2']" :key="name">{{ name }}<input type="number" step=".01" :min="index % 2 === 0 ? 0 : undefined" :max="index % 2 === 0 ? 1 : undefined" :value="current[index]" :aria-label="`Bezier ${name}`" @change="field(index, ($event.target as HTMLInputElement).value)" /></label></div>
  </div>
</template>
