<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useDevicesStore } from '../stores/devices'
import { createDeviceClient } from '../api/client'
import type { Device, FirmwareInfo } from '../api/types'

const devicesStore = useDevicesStore()
const selectedFile = ref<File | null>(null)
const uploading = ref(false)
const uploadProgress = ref<Map<string, number>>(new Map())
const uploadResults = ref<Map<string, { success: boolean; error?: string }>>(new Map())

// Rollback state
const rollingBack = ref(false)
const rollbackResults = ref<Map<string, { success: boolean; error?: string }>>(new Map())
const firmwareInfo = ref<Map<string, FirmwareInfo>>(new Map())

const eligibleDevices = computed(() =>
  devicesStore.deviceList.filter(d => d.isOnline)
)

// Devices that have rollback available
const rollbackEligibleDevices = computed(() =>
  selectedDevices.value.filter(d => {
    const info = firmwareInfo.value.get(d.id)
    return info?.rollback_available === true
  })
)

const selectedDevices = computed(() =>
  devicesStore.selectedDevices.filter(d => d.isOnline)
)

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    selectedFile.value = input.files[0]
  }
}

async function uploadToDevice(device: Device, firmware: ArrayBuffer) {
  const client = createDeviceClient(device)
  uploadProgress.value.set(device.id, 0)

  try {
    await client.uploadFirmware(firmware, (progress) => {
      uploadProgress.value.set(device.id, progress)
    })
    uploadResults.value.set(device.id, { success: true })
  } catch (error: any) {
    uploadResults.value.set(device.id, { success: false, error: error.message })
  }
}

async function startUpload() {
  if (!selectedFile.value || selectedDevices.value.length === 0) return

  uploading.value = true
  uploadProgress.value.clear()
  uploadResults.value.clear()

  const firmware = await selectedFile.value.arrayBuffer()

  // Upload to devices sequentially (could be parallelized with limit)
  for (const device of selectedDevices.value) {
    await uploadToDevice(device, firmware)
  }

  uploading.value = false
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Fetch firmware info for a device
async function fetchFirmwareInfo(device: Device) {
  try {
    const client = createDeviceClient(device)
    const info = await client.getFirmwareInfo()
    // console.log(info)
    firmwareInfo.value.set(device.id, info)
  } catch (error) {
    // Device might not support firmware info endpoint
    console.warn(`Failed to fetch firmware info for ${device.name}:`, error)
  }
}

// Fetch firmware info for all eligible devices
async function refreshFirmwareInfo() {
  await Promise.all(eligibleDevices.value.map(fetchFirmwareInfo))
}

// Rollback firmware for a single device
async function rollbackDevice(device: Device): Promise<{ success: boolean; error?: string }> {
  try {
    const client = createDeviceClient(device)
    const result = await client.rollbackFirmware()
    if (result.success) {
      return { success: true }
    }
    return { success: false, error: result.error || 'Rollback failed' }
  } catch (error: any) {
    return { success: false, error: error.message || 'Rollback failed' }
  }
}

// Start rollback for selected devices
async function startRollback() {
  if (rollbackEligibleDevices.value.length === 0) return

  rollingBack.value = true
  rollbackResults.value.clear()

  for (const device of rollbackEligibleDevices.value) {
    const result = await rollbackDevice(device)
    rollbackResults.value.set(device.id, result)
  }

  rollingBack.value = false

  // Refresh firmware info after rollback
  await refreshFirmwareInfo()
}

// Fetch firmware info on mount and when devices change
onMounted(() => {
  refreshFirmwareInfo()
})

watch(eligibleDevices, () => {
  refreshFirmwareInfo()
})
</script>

<template>
  <div class="p-6">
    <h1 class="text-2xl font-semibold text-gray-100 mb-6">Firmware Update</h1>

    <div class="max-w-2xl space-y-6">
      <!-- File selection -->
      <div class="bg-gray-800 rounded-xl p-6">
        <h2 class="text-lg font-medium text-gray-100 mb-4">Select Firmware File</h2>

        <div class="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center">
          <input
            type="file"
            accept=".bin"
            @change="handleFileSelect"
            class="hidden"
            id="firmware-file"
          />
          <label
            for="firmware-file"
            class="cursor-pointer"
          >
            <div v-if="selectedFile" class="space-y-2">
              <div class="text-4xl">📦</div>
              <div class="text-gray-100 font-medium">{{ selectedFile.name }}</div>
              <div class="text-sm text-gray-400">{{ formatFileSize(selectedFile.size) }}</div>
              <div class="text-sm text-primary-400 hover:text-primary-300">Click to change</div>
            </div>
            <div v-else class="space-y-2">
              <div class="text-4xl">📁</div>
              <div class="text-gray-300">Click to select firmware file</div>
              <div class="text-sm text-gray-500">or drag and drop a .bin file</div>
            </div>
          </label>
        </div>
      </div>

      <!-- Device selection -->
      <div class="bg-gray-800 rounded-xl p-6">
        <h2 class="text-lg font-medium text-gray-100 mb-4">Target Devices</h2>

        <div v-if="eligibleDevices.length === 0" class="text-gray-400 text-center py-4">
          No online devices available
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="device in eligibleDevices"
            :key="device.id"
            class="flex items-center gap-3 p-3 bg-gray-700/50 rounded-lg"
          >
            <input
              type="checkbox"
              :checked="devicesStore.selectedDeviceIds.has(device.id)"
              @change="devicesStore.toggleDeviceSelection(device.id)"
              class="rounded bg-gray-700 border-gray-600 text-primary-500 focus:ring-primary-500"
            />
            <div class="flex-1">
              <div class="text-gray-100">{{ device.name }}</div>
              <div class="text-sm text-gray-400">{{ device.ip }} • v{{ device.firmwareVersion }}</div>
            </div>

            <!-- Progress -->
            <div v-if="uploadProgress.has(device.id)" class="w-32">
              <div class="h-2 bg-gray-600 rounded-full overflow-hidden">
                <div
                  class="h-full bg-primary-500 transition-all"
                  :style="{ width: `${uploadProgress.get(device.id)}%` }"
                ></div>
              </div>
              <div class="text-xs text-gray-400 text-center mt-1">
                {{ uploadProgress.get(device.id) }}%
              </div>
            </div>

            <!-- Result -->
            <div v-else-if="uploadResults.has(device.id)">
              <span
                v-if="uploadResults.get(device.id)?.success"
                class="text-green-400"
              >✓</span>
              <span v-else class="text-red-400" :title="uploadResults.get(device.id)?.error">✗</span>
            </div>
          </div>
        </div>

        <div class="mt-4 flex gap-3">
          <button
            @click="devicesStore.selectAll()"
            class="text-sm text-primary-400 hover:text-primary-300"
          >
            Select all
          </button>
          <button
            @click="devicesStore.selectNone()"
            class="text-sm text-primary-400 hover:text-primary-300"
          >
            Select none
          </button>
        </div>
      </div>

      <!-- Upload button -->
      <button
        @click="startUpload"
        :disabled="!selectedFile || selectedDevices.length === 0 || uploading"
        class="w-full py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors"
      >
        <span v-if="uploading">Uploading...</span>
        <span v-else>Update {{ selectedDevices.length }} Device(s)</span>
      </button>

      <!-- Firmware Rollback -->
      <div class="bg-gray-800 rounded-xl p-6">
        <h2 class="text-lg font-medium text-gray-100 mb-2">Firmware Rollback</h2>
        <p class="text-sm text-gray-400 mb-4">
          Roll back to the previous firmware version on selected devices. Only devices with a previous firmware available can be rolled back.
        </p>

        <div v-if="selectedDevices.length === 0" class="text-gray-400 text-center py-4">
          Select devices above to see rollback options
        </div>

        <div v-else class="space-y-3">
          <!-- Rollback status per device -->
          <div
            v-for="device in selectedDevices"
            :key="device.id"
            class="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg"
          >
            <div class="flex-1">
              <div class="text-gray-100">{{ device.name }}</div>
              <div class="text-sm text-gray-400">
                v{{ device.firmwareVersion }}
                <!-- {{ device }} -->
                <span v-if="firmwareInfo.get(device.id)?.rollback_available" class="text-yellow-400 ml-2">
                  (rollback available)
                </span>
                <span v-else-if="firmwareInfo.has(device.id)" class="text-gray-500 ml-2">
                  (no rollback available)
                </span>
                <span v-else class="text-gray-500 ml-2">
                  (checking...)
                </span>
              </div>
            </div>

            <!-- Rollback result -->
            <div v-if="rollbackResults.has(device.id)">
              <span
                v-if="rollbackResults.get(device.id)?.success"
                class="text-green-400"
                title="Rollback successful"
              >✓ Rolled back</span>
              <span
                v-else
                class="text-red-400"
                :title="rollbackResults.get(device.id)?.error"
              >✗ Failed</span>
            </div>
          </div>

          <!-- Rollback button -->
          <button
            @click="startRollback"
            :disabled="rollbackEligibleDevices.length === 0 || rollingBack || uploading"
            class="w-full py-3 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors"
          >
            <span v-if="rollingBack">Rolling back...</span>
            <span v-else-if="rollbackEligibleDevices.length === 0">No devices eligible for rollback</span>
            <span v-else>Rollback {{ rollbackEligibleDevices.length }} Device(s)</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
