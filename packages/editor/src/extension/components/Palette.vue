<script setup lang="ts">
import { computed, ref } from 'vue';
import { compositionCommands, properties, parameters, metrics, categories, easingNames } from 'animplus/language';
import { helpFor } from '../language-help.js';
type Entry = { keyword: string; text: string; description?: string; unavailable?: boolean };
const search = ref('');
const entry = (keyword: string, text = keyword): Entry => ({ keyword, text, description: helpFor(keyword)?.description });
const selection: Record<string, string> = { find: 'find card_*', depth: 'depth 1', 'depth-only': 'depth-only 1', filter: 'filter title', ignore: 'ignore bg*', 'of-type': 'of-type clickable', index: 'index 0,2', path: 'path 0/1', parent: 'parent', reverse: 'reverse', grid: 'grid center' };
const parameter: Record<string, string> = { from: 'from +40', to: 'to self+100', time: 'time .4', delay: 'delay index*.04', repeat: 'repeat 2', direction: 'direction alternate' };
const groups = [
  { name: 'File', entries: [entry('namespace', 'namespace demo'), entry('let', 'let duration = .4'), { ...entry('Animation name', 'reveal'), description: 'Declare an animation at column zero.' }] },
  { name: 'Selection', entries: [...compositionCommands].map(keyword => entry(keyword, selection[keyword])) },
  { name: 'Actions', entries: [entry('anim', 'anim opacity from 0'), entry('event', 'event ready')] },
  { name: 'Properties', entries: [...properties].map(keyword => entry(keyword)) },
  { name: 'Parameters', entries: parameters.map(keyword => entry(keyword, parameter[keyword])) },
  { name: 'Easing', entries: [...easingNames, 'easy.bezier'].map(keyword => entry(keyword, keyword === 'easy.bezier' ? 'easy.bezier(.25,.1,.25,1)' : keyword)) },
  { name: 'Built-in variables', entries: [...metrics.map(keyword => entry(keyword)), entry('mouse.x'), entry('mouse.y'), { keyword: '$0', text: 'let target = $0', description: 'The HTML element selected in DevTools Elements, captured when preparing.' }] },
  { name: 'Expressions', entries: [entry('min', 'min(.1,1)'), entry('max', 'max(.1,1)')] },
  { name: 'Types', entries: categories.map(keyword => ({ ...entry(keyword), description: `Element category for of-type and type filters: ${keyword}.` })) },
  { name: 'Extensions', entries: ['sound', 'spine'].map(keyword => ({ ...entry(keyword, keyword), unavailable: true, description: 'Not implemented by the current DOM runtime.' })) }
];
const filtered = computed(() => groups.map(group => ({ ...group, entries: group.entries.filter(entry => `${entry.keyword} ${entry.text} ${entry.description ?? ''}`.toLowerCase().includes(search.value.trim().toLowerCase())) })).filter(group => group.entries.length));
</script>
<template>
  <section class="palette-panel" aria-label="Instruction palette">
    <input v-model="search" class="palette-filter" type="search" aria-label="Filter instructions" placeholder="Filter keywords" />
    <div class="palette-entries">
      <details v-for="group in filtered" :key="group.name" open><summary>{{ group.name }}</summary>
        <div v-for="item in group.entries" :key="item.keyword" class="palette-entry" :class="{ unavailable: item.unavailable }" :title="`${item.description ?? item.keyword}\n${item.text}`"><code>{{ item.keyword }}</code><span v-if="item.unavailable">Unavailable</span><small v-else-if="item.text !== item.keyword">{{ item.text }}</small></div>
      </details>
      <div v-if="!filtered.length" class="editor-variables-empty">No matching keywords.</div>
    </div>
  </section>
</template>
