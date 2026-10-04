<script setup lang="ts">
import type { TreeRow } from '../../protocol.js';
defineProps<{ rows: TreeRow[]; selected: Set<string> }>();
const emit = defineEmits<{ hover: [path?: string]; copy: [row: TreeRow, path: boolean] }>();
</script>
<template>
  <section class="panel scene-panel">
    <header>Scene — live DOM</header>
    <div class="tree scroll" @mouseleave="emit('hover')">
      <div v-for="row in rows" :key="row.path" class="tree-row" :class="{ matched: selected.has(row.path) }" :style="{ paddingLeft: `${12 + row.depth * 14}px` }" @mouseenter="emit('hover', row.path)">
        <span class="tree-label">{{ row.name }} <small>&lt;{{ row.tag }}&gt;</small></span>
        <button title="Copy find" @click="emit('copy', row, false)">find</button>
        <button v-if="row.path" title="Copy path" @click="emit('copy', row, true)">path</button>
      </div>
    </div>
  </section>
</template>
