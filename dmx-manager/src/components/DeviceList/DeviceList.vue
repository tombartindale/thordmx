<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDevicesStore } from '../../stores/devices'
import DeviceRow from './DeviceRow.vue'
import type { Device } from '../../api/types'

const emit = defineEmits<{
  (e: 'select-device', device: Device): void
}>()

const devicesStore = useDevicesStore()
const searchQuery = ref('')
const sortField = ref<'name' | 'ip' | 'universe' | 'status'>('name')
const sortDirection = ref<'asc' | 'desc'>('asc')
const showOffline = ref(true)

const filteredDevices = computed(() => {
  let devices = devicesStore.deviceList

  // Filter by search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    devices = devices.filter(d =>
      d.name.toLowerCase().includes(query) ||
      d.ip.includes(query) ||
      d.mac.toLowerCase().includes(query)
    )
  }

  // Filter offline devices
  if (!showOffline.value) {
    devices = devices.filter(d => d.isOnline)
  }

  // Sort
  devices = [...devices].sort((a, b) => {
    let comparison = 0
    switch (sortField.value) {
      case 'name':
        comparison = a.name.localeCompare(b.name)
        break
      case 'ip':
        comparison = a.ip.localeCompare(b.ip)
        break
      case 'universe':
        comparison = a.universe - b.universe
        break
      case 'status':
        comparison = (a.isOnline ? 1 : 0) - (b.isOnline ? 1 : 0)
        break
    }
    return sortDirection.value === 'asc' ? comparison : -comparison
  })

  return devices
})

const selectedCount = computed(() => devicesStore.selectedDeviceIds.size)

function toggleSort(field: typeof sortField.value) {
  if (sortField.value === field) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortDirection.value = 'asc'
  }
}

function handleSelectDevice(device: Device) {
  emit('select-device', device)
}

function handleRefresh() {
  devicesStore.refreshDiscovery()
  devicesStore.fetchAllStatuses()
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Toolbar -->
    <div class="p-4 border-b border-gray-700 space-y-3">
      <!-- Search and actions -->
      <div class="flex items-center gap-3">
        <div class="relative flex-1">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search devices..."
            class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 pl-10 text-sm text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
        </div>

        <button
          @click="handleRefresh"
          class="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm text-gray-300 transition-colors"
          title="Refresh"
        >
          ↻
        </button>

        <label class="flex items-center gap-2 text-sm text-gray-400">
          <input
            v-model="showOffline"
            type="checkbox"
            class="rounded bg-gray-700 border-gray-600 text-primary-500 focus:ring-primary-500"
          />
          Show offline
        </label>
      </div>

      <!-- Selection info -->
      <div v-if="selectedCount > 0" class="flex items-center gap-3 text-sm">
        <span class="text-gray-400">{{ selectedCount }} selected</span>
        <button
          @click="devicesStore.selectNone()"
          class="text-primary-400 hover:text-primary-300"
        >
          Clear selection
        </button>
        <button
          @click="devicesStore.selectAll()"
          class="text-primary-400 hover:text-primary-300"
        >
          Select all
        </button>
      </div>
    </div>

    <!-- Header row -->
    <div class="grid grid-cols-[auto_1fr_120px_80px_100px_80px] gap-4 px-4 py-2 bg-gray-800 border-b border-gray-700 text-xs text-gray-400 uppercase tracking-wide">
      <div class="w-6"></div>
      <button @click="toggleSort('name')" class="text-left hover:text-gray-200">
        Name {{ sortField === 'name' ? (sortDirection === 'asc' ? '↑' : '↓') : '' }}
      </button>
      <button @click="toggleSort('ip')" class="text-left hover:text-gray-200">
        IP {{ sortField === 'ip' ? (sortDirection === 'asc' ? '↑' : '↓') : '' }}
      </button>
      <button @click="toggleSort('universe')" class="text-left hover:text-gray-200">
        Universe {{ sortField === 'universe' ? (sortDirection === 'asc' ? '↑' : '↓') : '' }}
      </button>
      <div>Firmware</div>
      <button @click="toggleSort('status')" class="text-left hover:text-gray-200">
        Status {{ sortField === 'status' ? (sortDirection === 'asc' ? '↑' : '↓') : '' }}
      </button>
    </div>

    <!-- Device list -->
    <div class="flex-1 overflow-auto">
      <div v-if="filteredDevices.length === 0" class="flex items-center justify-center h-full text-gray-400">
        <div class="text-center">
          <div class="text-4xl mb-3">📡</div>
          <div v-if="devicesStore.isDiscovering">Searching for devices...</div>
          <div v-else>No devices found</div>
        </div>
      </div>

      <div v-else>
        <DeviceRow
          v-for="device in filteredDevices"
          :key="device.id"
          :device="device"
          :is-selected="devicesStore.selectedDeviceIds.has(device.id)"
          @click="handleSelectDevice(device)"
          @toggle-select="devicesStore.toggleDeviceSelection(device.id)"
        />
      </div>
    </div>
  </div>
</template>
