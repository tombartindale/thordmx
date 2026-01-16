<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useDevicesStore } from '../stores/devices'
import DeviceList from '../components/DeviceList/DeviceList.vue'
import DeviceDetail from '../components/DeviceDetail/DeviceDetail.vue'
import type { Device } from '../api/types'

const devicesStore = useDevicesStore()
const selectedDevice = ref<Device | null>(null)
const showAddModal = ref(false)
const newDeviceIp = ref('')
const newDeviceName = ref('')

function handleSelectDevice(device: Device) {
  selectedDevice.value = device
}

function handleCloseDetail() {
  selectedDevice.value = null
}

function handleAddDevice() {
  if (newDeviceIp.value) {
    devicesStore.addManualDevice(
      newDeviceIp.value,
      newDeviceName.value || `Device-${newDeviceIp.value}`
    )
    newDeviceIp.value = ''
    newDeviceName.value = ''
    showAddModal.value = false
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
      <!-- Action bar -->
      <div class="p-4 border-b border-gray-700 flex items-center justify-between">
        <h1 class="text-xl font-semibold text-gray-100">Devices</h1>
        <div class="flex items-center gap-2">
          <button
            @click="showAddModal = true"
            class="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
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
          class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-sm text-gray-300 rounded-lg transition-colors"
        >
          Configure Selected
        </button>
        <button
          class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-sm text-gray-300 rounded-lg transition-colors"
        >
          Update Firmware
        </button>
        <button
          class="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-sm text-white rounded-lg transition-colors"
        >
          Reboot Selected
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
          <div>
            <label class="block text-sm font-medium text-gray-400 mb-1">IP Address</label>
            <input
              v-model="newDeviceIp"
              type="text"
              placeholder="192.168.1.50"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
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
  </div>
</template>
