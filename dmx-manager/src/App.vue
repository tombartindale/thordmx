<script setup lang="ts">
import { RouterView } from 'vue-router'
import Sidebar from './components/common/Sidebar.vue'
import Titlebar from './components/common/Titlebar.vue'
</script>

<template>
  <div class="h-screen flex flex-col bg-gray-900 text-gray-100">
    <!-- Title bar (macOS style) -->
    <Titlebar />

    <div class="flex flex-1 overflow-hidden">
      <!-- Sidebar navigation -->
      <Sidebar />

      <!-- Main content area -->
      <main class="flex-1 overflow-auto">
        <RouterView />
      </main>
    </div>
  </div>
</template>
