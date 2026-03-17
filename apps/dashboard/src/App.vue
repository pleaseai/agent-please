<script setup lang="ts">
import ThemeToggle from '@/components/ThemeToggle.vue'
</script>

<template>
  <div class="min-h-screen">
    <header class="flex items-center justify-end p-4 max-w-6xl mx-auto">
      <ThemeToggle />
    </header>
    <main class="px-6 pb-6 max-w-6xl mx-auto">
      <RouterView />
    </main>
  </div>
</template>
