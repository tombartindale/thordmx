<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDevicesStore } from '../stores/devices'
import { createDeviceClient } from '../api/client'
import DeviceList from '../components/DeviceList/DeviceList.vue'
import DeviceDetail from '../components/DeviceDetail/DeviceDetail.vue'
import type { Device } from '../api/types'

const router = useRouter()
const devicesStore = useDevicesStore()
const selectedDevice = ref<Device | null>(null)
const showAddModal = ref(false)
const newDeviceIp = ref('')
const newDevicePort = ref(80)
const newDeviceName = ref('')

// Dashboard stats
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

  // Receiving sACN count
  const receivingSacn = statuses.filter(s => s.last_packet_ms_ago !== undefined && s.last_packet_ms_ago < 1000).length

  return {
    total: devices.length,
    online: online.length,
    offline: devices.length - online.length,
    receivingSacn,
    avgRssi
  }
})

function getSignalClass(rssi: number): string {
  if (rssi === 0) return 'text-gray-500'
  if (rssi > -50) return 'text-green-400'
  if (rssi > -60) return 'text-green-500'
  if (rssi > -70) return 'text-yellow-500'
  return 'text-red-500'
}

function handleSelectDevice(device: Device) {
  selectedDevice.value = device
}

function handleCloseDetail() {
  selectedDevice.value = null
}

function handleAddDevice() {
  if (newDeviceIp.value) {
    const port = newDevicePort.value || 80
    devicesStore.addManualDevice(
      newDeviceIp.value,
      newDeviceName.value || `Device-${newDeviceIp.value}:${port}`,
      port
    )
    newDeviceIp.value = ''
    newDevicePort.value = 80
    newDeviceName.value = ''
    showAddModal.value = false
  }
}

async function handleRemoveSelected() {
  await devicesStore.removeSelectedDevices()
  // Clear detail panel if the selected device was removed
  if (selectedDevice.value && !devicesStore.devices.has(selectedDevice.value.id)) {
    selectedDevice.value = null
  }
}

// Batch action handlers
const showBatchConfigModal = ref(false)
const batchConfigForm = ref({
  sacn_universe: null as number | null,
  wifi_ssid: '',
  wifi_password: ''
})
const batchActionInProgress = ref(false)
const batchActionResults = ref<Map<string, { success: boolean; error?: string }>>(new Map())

function handleConfigureSelected() {
  batchConfigForm.value = {
    sacn_universe: null,
    wifi_ssid: '',
    wifi_password: ''
  }
  batchActionResults.value.clear()
  showBatchConfigModal.value = true
}

async function handleBatchConfigSubmit() {
  const selectedOnline = devicesStore.selectedDevices.filter(d => d.isOnline)
  if (selectedOnline.length === 0) return

  batchActionInProgress.value = true
  batchActionResults.value.clear()

  for (const device of selectedOnline) {
    try {
      const client = createDeviceClient(device)
      const updates: Record<string, any> = {}

      if (batchConfigForm.value.sacn_universe !== null) {
        updates.sacn_universe = batchConfigForm.value.sacn_universe
      }
      if (batchConfigForm.value.wifi_ssid) {
        updates.wifi_ssid = batchConfigForm.value.wifi_ssid
        if (batchConfigForm.value.wifi_password) {
          updates.wifi_password = batchConfigForm.value.wifi_password
        }
      }

      if (Object.keys(updates).length > 0) {
        const result = await client.setConfig(updates)
        batchActionResults.value.set(device.id, {
          success: result.success,
          error: result.error
        })
      } else {
        batchActionResults.value.set(device.id, { success: true })
      }
    } catch (error: any) {
      batchActionResults.value.set(device.id, {
        success: false,
        error: error.message || 'Failed to configure'
      })
    }
  }

  batchActionInProgress.value = false
}

function handleUpdateFirmwareSelected() {
  router.push('/firmware')
}

async function handleRebootSelected() {
  const selectedOnline = devicesStore.selectedDevices.filter(d => d.isOnline)
  if (selectedOnline.length === 0) return

  const count = selectedOnline.length
  if (!confirm(`Are you sure you want to reboot ${count} device(s)?`)) return

  for (const device of selectedOnline) {
    try {
      const client = createDeviceClient(device)
      await client.reboot()
    } catch {
      // Expected - device will disconnect during reboot
    }
  }
}

onMounted(() => {
  devicesStore.startDiscovery()
  devicesStore.startStatusPolling(5000)
})

onUnmounted(() => {
  devicesStore.stopDiscovery()
  devicesStore.stopStatusPolling()
})
</script>

<template>
  <div class="h-full flex">
    <!-- Device list -->
    <div class="flex-1 flex flex-col">
      <!-- Stats bar -->
      <div class="px-4 py-3 border-b border-gray-700 bg-gray-800/50">
        <div class="flex items-center gap-6">
          <!-- Total -->
          <div class="flex items-center gap-2">
            <span class="text-2xl font-bold text-gray-100">{{ stats.total }}</span>
            <span class="text-xs text-gray-500 uppercase">Devices</span>
          </div>

          <div class="h-8 w-px bg-gray-700"></div>

          <!-- Online -->
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-green-500"></span>
            <span class="text-sm font-medium text-green-400">{{ stats.online }}</span>
            <span class="text-xs text-gray-500">Online</span>
          </div>

          <!-- Offline -->
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-red-500"></span>
            <span class="text-sm font-medium" :class="stats.offline > 0 ? 'text-red-400' : 'text-gray-500'">{{ stats.offline }}</span>
            <span class="text-xs text-gray-500">Offline</span>
          </div>

          <div class="h-8 w-px bg-gray-700"></div>

          <!-- Receiving sACN -->
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-blue-400">{{ stats.receivingSacn }}</span>
            <span class="text-xs text-gray-500">Receiving sACN</span>
          </div>

          <!-- Avg Signal -->
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium" :class="getSignalClass(stats.avgRssi)">
              {{ stats.avgRssi === 0 ? '--' : stats.avgRssi }} dBm
            </span>
            <span class="text-xs text-gray-500">Avg Signal</span>
          </div>

          <!-- Spacer -->
          <div class="flex-1"></div>

          <!-- Add Device button -->
          <button
            @click="showAddModal = true"
            class="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            + Add Device
          </button>
        </div>
      </div>

      <!-- Device list component -->
      <DeviceList
        class="flex-1"
        @select-device="handleSelectDevice"
      />

      <!-- Batch action bar (when devices selected) -->
      <div
        v-if="devicesStore.selectedDeviceIds.size > 0"
        class="p-4 border-t border-gray-700 bg-gray-800 flex items-center gap-3"
      >
        <span class="text-sm text-gray-400">
          {{ devicesStore.selectedDeviceIds.size }} device(s) selected
        </span>
        <button
          @click="handleConfigureSelected"
          class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-sm text-gray-300 rounded-lg transition-colors"
        >
          Configure Selected
        </button>
        <button
          @click="handleUpdateFirmwareSelected"
          class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-sm text-gray-300 rounded-lg transition-colors"
        >
          Update Firmware
        </button>
        <button
          @click="handleRebootSelected"
          class="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-sm text-white rounded-lg transition-colors"
        >
          Reboot Selected
        </button>
        <button
          @click="handleRemoveSelected"
          class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-sm text-white rounded-lg transition-colors"
        >
          Remove Selected
        </button>
      </div>
    </div>

    <!-- Device detail panel -->
    <div
      v-if="selectedDevice"
      class="w-96"
    >
      <DeviceDetail
        :device="selectedDevice"
        @close="handleCloseDetail"
        @update="devicesStore.fetchDeviceStatus(selectedDevice!)"
      />
    </div>

    <!-- Add device modal -->
    <div
      v-if="showAddModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      @click.self="showAddModal = false"
    >
      <div class="bg-gray-800 rounded-xl p-6 w-96 shadow-xl">
        <h2 class="text-lg font-semibold text-gray-100 mb-4">Add Device Manually</h2>

        <div class="space-y-4">
          <div class="flex gap-3">
            <div class="flex-1">
              <label class="block text-sm font-medium text-gray-400 mb-1">IP Address</label>
              <input
                v-model="newDeviceIp"
                type="text"
                placeholder="192.168.1.50"
                class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div class="w-24">
              <label class="block text-sm font-medium text-gray-400 mb-1">Port</label>
              <input
                v-model.number="newDevicePort"
                type="number"
                min="1"
                max="65535"
                placeholder="80"
                class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-400 mb-1">Name (optional)</label>
            <input
              v-model="newDeviceName"
              type="text"
              placeholder="Stage-Left"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div class="flex gap-3 mt-6">
          <button
            @click="showAddModal = false"
            class="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 font-medium rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            @click="handleAddDevice"
            :disabled="!newDeviceIp"
            class="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors"
          >
            Add Device
          </button>
        </div>
      </div>
    </div>

    <!-- Batch config modal -->
    <div
      v-if="showBatchConfigModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      @click.self="showBatchConfigModal = false"
    >
      <div class="bg-gray-800 rounded-xl p-6 w-[480px] shadow-xl">
        <h2 class="text-lg font-semibold text-gray-100 mb-4">
          Configure {{ devicesStore.selectedDevices.filter(d => d.isOnline).length }} Device(s)
        </h2>

        <p class="text-sm text-gray-400 mb-4">
          Only fill in the fields you want to change. Empty fields will be left unchanged.
        </p>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-400 mb-1">sACN Universe</label>
            <input
              v-model.number="batchConfigForm.sacn_universe"
              type="number"
              min="1"
              max="63999"
              placeholder="Leave blank to keep current"
              :disabled="batchActionInProgress"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-400 mb-1">WiFi SSID</label>
            <input
              v-model="batchConfigForm.wifi_ssid"
              type="text"
              placeholder="Leave blank to keep current"
              :disabled="batchActionInProgress"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-400 mb-1">WiFi Password</label>
            <input
              v-model="batchConfigForm.wifi_password"
              type="password"
              placeholder="Required if changing SSID"
              :disabled="batchActionInProgress || !batchConfigForm.wifi_ssid"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
            />
          </div>
        </div>

        <!-- Results -->
        <div v-if="batchActionResults.size > 0" class="mt-4 max-h-40 overflow-auto space-y-1">
          <div
            v-for="device in devicesStore.selectedDevices.filter(d => d.isOnline)"
            :key="device.id"
            class="flex items-center justify-between text-sm p-2 rounded"
            :class="batchActionResults.get(device.id)?.success ? 'bg-green-900/20' : 'bg-red-900/20'"
          >
            <span class="text-gray-300">{{ device.name }}</span>
            <span v-if="batchActionResults.get(device.id)?.success" class="text-green-400">✓</span>
            <span v-else class="text-red-400" :title="batchActionResults.get(device.id)?.error">✗</span>
          </div>
        </div>

        <div class="flex gap-3 mt-6">
          <button
            @click="showBatchConfigModal = false"
            :disabled="batchActionInProgress"
            class="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 text-gray-300 font-medium rounded-lg transition-colors"
          >
            {{ batchActionResults.size > 0 ? 'Close' : 'Cancel' }}
          </button>
          <button
            v-if="batchActionResults.size === 0"
            @click="handleBatchConfigSubmit"
            :disabled="batchActionInProgress || (!batchConfigForm.sacn_universe && !batchConfigForm.wifi_ssid)"
            class="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors"
          >
            {{ batchActionInProgress ? 'Applying...' : 'Apply to All' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
