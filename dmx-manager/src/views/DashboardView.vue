<script setup lang="ts">
import { computed } from 'vue'
import { useDevicesStore } from '../stores/devices'

const devicesStore = useDevicesStore()

const stats = computed(() => {
  const devices = devicesStore.deviceList
  const online = devices.filter(d => d.isOnline)
  const statuses = Array.from(devicesStore.deviceStatuses.values())

  // Calculate average signal strength
  const rssiValues = statuses
    .filter(s => s.wifi_rssi)
    .map(s => s.wifi_rssi)
  const avgRssi = rssiValues.length > 0
    ? Math.round(rssiValues.reduce((a, b) => a + b, 0) / rssiValues.length)
    : 0

  // Count firmware versions
  const firmwareVersions = new Map<string, number>()
  devices.forEach(d => {
    const count = firmwareVersions.get(d.firmwareVersion) || 0
    firmwareVersions.set(d.firmwareVersion, count + 1)
  })

  // Receiving sACN count
  const receivingSacn = statuses.filter(s => s.last_packet_ms_ago !== undefined && s.last_packet_ms_ago < 1000).length

  return {
    total: devices.length,
    online: online.length,
    offline: devices.length - online.length,
    receivingSacn,
    avgRssi,
    firmwareVersions: Array.from(firmwareVersions.entries())
  }
})
</script>

<template>
  <div class="p-6">
    <h1 class="text-2xl font-semibold text-gray-100 mb-6">Dashboard</h1>

    <!-- Stats grid -->
    <div class="grid grid-cols-4 gap-4 mb-8">
      <!-- Total devices -->
      <div class="bg-gray-800 rounded-xl p-6">
        <div class="text-3xl font-bold text-gray-100">{{ stats.total }}</div>
        <div class="text-sm text-gray-400 mt-1">Total Devices</div>
      </div>

      <!-- Online devices -->
      <div class="bg-gray-800 rounded-xl p-6">
        <div class="text-3xl font-bold text-green-400">{{ stats.online }}</div>
        <div class="text-sm text-gray-400 mt-1">Online</div>
      </div>

      <!-- Offline devices -->
      <div class="bg-gray-800 rounded-xl p-6">
        <div class="text-3xl font-bold" :class="stats.offline > 0 ? 'text-red-400' : 'text-gray-400'">
          {{ stats.offline }}
        </div>
        <div class="text-sm text-gray-400 mt-1">Offline</div>
      </div>

      <!-- Receiving sACN -->
      <div class="bg-gray-800 rounded-xl p-6">
        <div class="text-3xl font-bold text-blue-400">{{ stats.receivingSacn }}</div>
        <div class="text-sm text-gray-400 mt-1">Receiving sACN</div>
      </div>
    </div>

    <!-- Additional info -->
    <div class="grid grid-cols-2 gap-6">
      <!-- Signal strength -->
      <div class="bg-gray-800 rounded-xl p-6">
        <h2 class="text-lg font-medium text-gray-100 mb-4">Average Signal Strength</h2>
        <div class="flex items-center gap-4">
          <div class="text-4xl font-bold text-gray-100">{{ stats.avgRssi }} dBm</div>
          <div class="flex-1">
            <div class="h-4 bg-gray-700 rounded-full overflow-hidden">
              <div
                class="h-full rounded-full transition-all"
                :class="{
                  'bg-green-500': stats.avgRssi > -50,
                  'bg-yellow-500': stats.avgRssi <= -50 && stats.avgRssi > -70,
                  'bg-red-500': stats.avgRssi <= -70
                }"
                :style="{ width: `${Math.min(100, Math.max(0, (stats.avgRssi + 100) / 60 * 100))}%` }"
              ></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Firmware versions -->
      <div class="bg-gray-800 rounded-xl p-6">
        <h2 class="text-lg font-medium text-gray-100 mb-4">Firmware Versions</h2>
        <div v-if="stats.firmwareVersions.length === 0" class="text-gray-400">
          No devices discovered
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="[version, count] in stats.firmwareVersions"
            :key="version"
            class="flex items-center justify-between"
          >
            <span class="text-gray-300 font-mono">{{ version }}</span>
            <span class="text-gray-400">{{ count }} device(s)</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-if="stats.total === 0"
      class="mt-12 text-center text-gray-400"
    >
      <div class="text-6xl mb-4">📡</div>
      <div class="text-xl mb-2">No devices discovered</div>
      <div class="text-sm">Make sure your DMX bridges are powered on and connected to the network</div>
    </div>
  </div>
</template>
