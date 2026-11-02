<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppRail from '@/components/AppRail.vue'

const route = useRoute()
const isPublic = computed(() => route.meta.public === true)
</script>

<template>
  <!-- 登录页没有外壳：一屏里就是品牌与入口 -->
  <router-view v-if="isPublic" />
  <div v-else class="fa-app">
    <AppRail />
    <router-view />
  </div>
</template>