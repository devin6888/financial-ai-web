<script setup lang="ts">
defineProps<{ eyebrow?: string; title: string; desc?: string }>()
</script>

<template>
  <header class="page-header">
    <div class="head-main">
      <div class="fa-eyebrow">{{ eyebrow || 'FINANCIAL RESEARCH CONSOLE' }}</div>
      <h1 class="fa-title-lg">{{ title }}</h1>
      <p v-if="desc" class="desc">{{ desc }}</p>
    </div>
    <div class="head-actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding: 26px 32px 18px;
  border-bottom: 1px solid var(--rule);
}

.head-main {
  min-width: 0;
}

.fa-title-lg {
  margin-top: 8px;
}

.desc {
  margin: 6px 0 0;
  color: var(--ink-3);
  font-size: 12.5px;
  max-width: 640px;
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
</style>