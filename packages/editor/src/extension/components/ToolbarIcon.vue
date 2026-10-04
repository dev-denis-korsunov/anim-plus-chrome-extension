<script setup lang="ts">
defineProps<{ name: 'play' | 'pause' | 'stop' | 'copy' | 'apply' }>();
</script>
<template>
  <svg class="toolbar-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path v-if="name === 'play'" d="M6 3.5 16 10 6 16.5Z" />
    <g v-else-if="name === 'pause'"><path d="M5.5 4h3v12h-3zM11.5 4h3v12h-3z" /></g>
    <g v-else-if="name === 'stop'"><circle cx="10" cy="10" r="7.5" /><path d="m4.7 15.3 10.6-10.6" /></g>
    <path v-else-if="name === 'apply'" d="m3.5 10 4 4 9-9" />
    <g v-else><path d="M7 6.5h9v11H7zM13 6.5V2.5H3v11h4" /></g>
  </svg>
</template>
