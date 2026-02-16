<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { Device, DeviceStatus, DeviceConfig } from '../../api/types'
import { createDeviceClient } from '../../api/client'
import { useDevicesStore } from '../../stores/devices'
import StatusIndicator from '../common/StatusIndicator.vue'

const props = defineProps<{
  device: Device
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update'): void
}>()

const devicesStore = useDevicesStore()

const activeTab = ref<'status' | 'config' | 'actions'>('status')
const config = ref<DeviceConfig | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)
const actionInProgress = ref<string | null>(null)

// Use store's status reactively, with fallback to local fetch
const status = computed(() => devicesStore.deviceStatuses.get(props.device.id) || null)

// Config form
const configForm = ref({
  device_name: '',
  sacn_universe: 1,
  dmx_start_channel: 1,
  wifi_ssid: '',
  wifi_password: ''
})

const client = computed(() => createDeviceClient(props.device))

async function fetchStatus() {
  isLoading.value = true
  error.value = null
  try {
    await devicesStore.fetchDeviceStatus(props.device)
  } catch (e) {
    error.value = 'Failed to fetch device status'
  } finally {
    isLoading.value = false
  }
}

async function fetchConfig() {
  try {
    config.value = await client.value.getConfig()
    configForm.value = {
      device_name: config.value.device_name,
      sacn_universe: config.value.sacn_universe,
      dmx_start_channel: config.value.dmx_start_channel,
      wifi_ssid: config.value.wifi_ssid,
      wifi_password: ''
    }
  } catch (e) {
    error.value = 'Failed to fetch device config'
  }
}

async function saveConfig() {
  isLoading.value = true
  error.value = null
  try {
    const updates: any = {}
    if (configForm.value.device_name !== config.value?.device_name) {
      updates.device_name = configForm.value.device_name
    }
    if (configForm.value.sacn_universe !== config.value?.sacn_universe) {
      updates.sacn_universe = configForm.value.sacn_universe
    }
    if (configForm.value.dmx_start_channel !== config.value?.dmx_start_channel) {
      updates.dmx_start_channel = configForm.value.dmx_start_channel
    }
    if (configForm.value.wifi_ssid && configForm.value.wifi_ssid !== config.value?.wifi_ssid) {
      updates.wifi_ssid = configForm.value.wifi_ssid
      if (configForm.value.wifi_password) {
        updates.wifi_password = configForm.value.wifi_password
      }
    }

    if (Object.keys(updates).length > 0) {
      const result = await client.value.setConfig(updates)
      if (result.success) {
        await fetchConfig()
        emit('update')
      } else {
        error.value = result.error || 'Failed to save config'
      }
    }
  } catch (e) {
    error.value = 'Failed to save configuration'
  } finally {
    isLoading.value = false
  }
}

async function handleReboot() {
  if (!confirm('Are you sure you want to reboot this device?')) return
  actionInProgress.value = 'reboot'
  try {
    await client.value.reboot()
  } catch (e) {
    // Expected - device will disconnect
  } finally {
    actionInProgress.value = null
  }
}

async function handleIdentify() {
  actionInProgress.value = 'identify'
  try {
    await client.value.identify(5)
  } catch (e) {
    error.value = 'Failed to identify device'
  } finally {
    actionInProgress.value = null
  }
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  return `${hours}h ${minutes}m ${secs}s`
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(0)} KB`
}

watch(() => props.device, () => {
  fetchStatus()
  fetchConfig()
}, { immediate: true })

onMounted(() => {
  fetchStatus()
  fetchConfig()
})
</script>

<template>
  <div class="h-full flex flex-col bg-gray-800 border-l border-gray-700">
    <!-- Header -->
    <div class="p-4 border-b border-gray-700">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <StatusIndicator :status="device.isOnline ? 'online' : 'offline'" size="lg" />
          <div>
            <h2 class="text-lg font-semibold text-gray-100">{{ device.name }}</h2>
            <div class="text-sm text-gray-400">{{ device.ip }}</div>
          </div>
        </div>
        <button
          @click="emit('close')"
          class="text-gray-400 hover:text-gray-200 text-xl"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex border-b border-gray-700">
      <button
        v-for="tab in ['status', 'config', 'actions'] as const"
        :key="tab"
        @click="activeTab = tab"
        class="px-4 py-2 text-sm font-medium capitalize transition-colors"
        :class="activeTab === tab
          ? 'text-primary-400 border-b-2 border-primary-400'
          : 'text-gray-400 hover:text-gray-200'"
      >
        {{ tab }}
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-auto p-4">
      <!-- Loading state -->
      <div v-if="isLoading && !status" class="flex items-center justify-center h-full">
        <div class="text-gray-400">Loading...</div>
      </div>

      <!-- Error state -->
      <div v-else-if="error" class="bg-red-900/20 border border-red-700 rounded-lg p-4 text-red-400">
        {{ error }}
      </div>

      <!-- Status tab -->
      <div v-else-if="activeTab === 'status' && status" class="space-y-6">
        <!-- Network -->
        <section>
          <h3 class="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">Network</h3>
          <dl class="space-y-2 text-sm">
            <div class="flex justify-between">
              <dt class="text-gray-400">IP Address</dt>
              <dd class="text-gray-100 font-mono">{{ status.ip_address }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-gray-400">WiFi SSID</dt>
              <dd class="text-gray-100">{{ status.wifi_ssid }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-gray-400">Signal Strength</dt>
              <dd class="text-gray-100">{{ status.wifi_rssi }} dBm ({{ status.wifi_signal_quality }})</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-gray-400">MAC Address</dt>
              <dd class="text-gray-100 font-mono">{{ status.mac_address }}</dd>
            </div>
          </dl>
        </section>

        <!-- sACN Status -->
        <section>
          <h3 class="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">sACN Status</h3>
          <dl class="space-y-2 text-sm">
            <div class="flex justify-between">
              <dt class="text-gray-400">Universe</dt>
              <dd class="text-gray-100">{{ status.sacn_universe }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-gray-400">Start Channel</dt>
              <dd class="text-gray-100">{{ status.dmx_start_channel }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-gray-400">Source</dt>
              <dd class="text-gray-100">{{ status.sacn_source_name || 'N/A' }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-gray-400">Packets Received</dt>
              <dd class="text-gray-100">{{ status.sacn_packets_received.toLocaleString() }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-gray-400">Errors</dt>
              <dd class="text-gray-100">{{ status.sacn_packets_errors }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-gray-400">DMX FPS</dt>
              <dd class="text-gray-100">{{ status.dmx_fps.toFixed(1) }}</dd>
            </div>
          </dl>
        </section>

        <!-- System -->
        <section>
          <h3 class="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">System</h3>
          <dl class="space-y-2 text-sm">
            <div class="flex justify-between">
              <dt class="text-gray-400">Firmware</dt>
              <dd class="text-gray-100">{{ status.firmware_version }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-gray-400">Uptime</dt>
              <dd class="text-gray-100">{{ formatUptime(status.uptime_seconds) }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-gray-400">Free Heap</dt>
              <dd class="text-gray-100">{{ formatBytes(status.free_heap_bytes) }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-gray-400">Reboots</dt>
              <dd class="text-gray-100">{{ status.reboot_count }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-gray-400">Last Reset</dt>
              <dd class="text-gray-100">{{ status.last_reboot_reason }}</dd>
            </div>
          </dl>
        </section>
      </div>

      <!-- Config tab -->
      <div v-else-if="activeTab === 'config'" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-400 mb-1">Device Name</label>
          <input
            v-model="configForm.device_name"
            type="text"
            class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-400 mb-1">sACN Universe</label>
          <input
            v-model.number="configForm.sacn_universe"
            type="number"
            min="1"
            max="63999"
            class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-400 mb-1">DMX Start Channel</label>
          <input
            v-model.number="configForm.dmx_start_channel"
            type="number"
            min="1"
            max="512"
            class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-400 mb-1">WiFi SSID</label>
          <input
            v-model="configForm.wifi_ssid"
            type="text"
            class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-400 mb-1">WiFi Password</label>
          <input
            v-model="configForm.wifi_password"
            type="password"
            placeholder="Leave blank to keep current"
            class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <button
          @click="saveConfig"
          :disabled="isLoading"
          class="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
        >
          {{ isLoading ? 'Saving...' : 'Save Configuration' }}
        </button>
      </div>

      <!-- Actions tab -->
      <div v-else-if="activeTab === 'actions'" class="space-y-3">
        <button
          @click="handleIdentify"
          :disabled="actionInProgress !== null"
          class="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
        >
          <span>💡</span>
          <span>{{ actionInProgress === 'identify' ? 'Identifying...' : 'Identify Device' }}</span>
        </button>

        <button
          @click="handleReboot"
          :disabled="actionInProgress !== null"
          class="w-full flex items-center justify-center gap-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
        >
          <span>🔄</span>
          <span>{{ actionInProgress === 'reboot' ? 'Rebooting...' : 'Reboot Device' }}</span>
        </button>

        <button
          @click="fetchStatus"
          :disabled="isLoading"
          class="w-full flex items-center justify-center gap-2 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
        >
          <span>↻</span>
          <span>Refresh Status</span>
        </button>
      </div>
    </div>
  </div>
</template>
