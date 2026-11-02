<script setup lang="ts">
import type { Segment } from '@/utils/answer'
import CiteChip from '@/components/CiteChip.vue'

/**
 * 一组内联片段（文字 / 粗体 / 引用 chip / 换行）。
 *
 * 为什么单独抽出来：表格单元格里也要能点引用，而模板里再写一遍同样的循环
 * 会有四处副本（段落、有序、无序、表格），改一处忘了另一处就会「表里的 chip 点不动」。
 */
defineProps<{ segments: Segment[]; citations: number; active?: number | null }>()
const emit = defineEmits<{ cite: [number] }>()
</script>

<template>
  <template v-for="(segment, si) in segments" :key="si">
    <br v-if="segment.kind === 'break'" />
    <CiteChip
      v-else-if="segment.kind === 'cite'"
      :number="segment.number"
      :citations="citations"
      :active="active"
      @cite="emit('cite', $event)"
    />
    <strong v-else-if="segment.kind === 'bold'" class="bold">{{ segment.text }}</strong>
    <span v-else class="text">{{ segment.text }}</span>
  </template>
</template>

<style scoped>
.bold { font-weight: 600; }

</style>
