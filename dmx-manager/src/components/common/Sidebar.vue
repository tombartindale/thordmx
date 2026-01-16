<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDevicesStore } from '../../stores/devices'

const route = useRoute()
const router = useRouter()
const devicesStore = useDevicesStore()

const onlineCount = computed(() => devicesStore.onlineDevices.length)
const totalCount = computed(() => devicesStore.deviceList.length)

interface NavItem {
  name: string
  path: string
  icon: string
  badge?: number
}

const navItems: NavItem[] = [
  { name: 'Devices', path: '/', icon: '📡' },
  { name: 'Dashboard', path: '/dashboard', icon: '📊' },
  { name: 'Firmware', path: '/firmware', icon: '⬆️' },
  { name: 'Settings', path: '/settings', icon: '⚙️' }
]

function isActive(path: string): boolean {
  return route.path === path
}

function navigate(path: string) {
  router.push(path)
}
</script>

<template>
  <aside class="w-56 bg-gray-800 border-r border-gray-700 flex flex-col">
    <!-- Status summary -->
    <div class="p-4 border-b border-gray-700">
      <div class="text-xs text-gray-400 uppercase tracking-wide mb-2">Fleet Status</div>
      <div class="flex items-center gap-2">
        <span class="status-dot status-online"></span>
        <span class="text-sm text-gray-300">{{ onlineCount }} / {{ totalCount }} Online</span>
      </div>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 p-2">
      <ul class="space-y-1">
        <li v-for="item in navItems" :key="item.path">
          <button
            @click="navigate(item.path)"
            class="titlebar-no-drag w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors"
            :class="isActive(item.path)
              ? 'bg-primary-600 text-white'
              : 'text-gray-300 hover:bg-gray-700 hover:text-white'"
          >
            <span class="text-lg">{{ item.icon }}</span>
            <span class="text-sm font-medium">{{ item.name }}</span>
            <span
              v-if="item.badge"
              class="ml-auto bg-primary-500 text-white text-xs px-2 py-0.5 rounded-full"
            >
              {{ item.badge }}
            </span>
          </button>
        </li>
      </ul>
    </nav>

    <!-- Version info -->
    <div class="p-4 border-t border-gray-700">
      <div class="text-xs text-gray-500">DMX Bridge Manager v1.0.0</div>
    </div>
  </aside>
</template>
