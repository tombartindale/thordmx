<script setup lang="ts">
import { ref } from 'vue'
import type { Device } from '../../api/types'
import StatusIndicator from '../common/StatusIndicator.vue'
import { DeviceClient } from '../../api/client'

const props = defineProps<{
  device: Device
  isSelected: boolean
}>()

const emit = defineEmits<{
  (e: 'click'): void
  (e: 'toggle-select'): void
}>()

const isIdentifying = ref(false)

function handleCheckboxClick(event: Event) {
  event.stopPropagation()
  emit('toggle-select')
}

async function handleIdentify(event: Event) {
  event.stopPropagation()
  if (!props.device.isOnline || isIdentifying.value) return

  isIdentifying.value = true
  try {
    const client = new DeviceClient(props.device)
    await client.identify(5)
  } catch (error) {
    console.error('Failed to identify device:', error)
  } finally {
    setTimeout(() => {
      isIdentifying.value = false
    }, 5000)
  }
}
</script>

<template>
  <div
    class="grid grid-cols-[auto_1fr_150px_70px_100px_80px_auto] gap-4 px-4 py-3 border-b border-gray-700 hover:bg-gray-800 cursor-pointer transition-colors"
    :class="{ 'bg-gray-800/50': isSelected }"
    @click="emit('click')"
  >
    <!-- Checkbox -->
    <div class="flex items-center">
      <input
        type="checkbox"
        :checked="isSelected"
        @click="handleCheckboxClick"
        class="rounded bg-gray-700 border-gray-600 text-primary-500 focus:ring-primary-500"
      />
    </div>

    <!-- Name -->
    <div class="flex items-center gap-2 min-w-0">
      <span class="truncate font-medium text-gray-100">{{ device.name }}</span>
      <span v-if="device.isManual" class="text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded">manual</span>
    </div>

    <!-- IP:Port -->
    <div class="flex items-center text-sm text-gray-400 font-mono">
      {{ device.ip }}<span v-if="device.port !== 80" class="text-gray-500">:{{ device.port }}</span>
    </div>

    <!-- Universe -->
    <div class="flex items-center text-sm text-gray-300">
      {{ device.universe }}
    </div>

    <!-- Firmware -->
    <div class="flex items-center text-sm text-gray-400">
      {{ device.firmwareVersion }}
    </div>

    <!-- Status -->
    <div class="flex items-center gap-2">
      <StatusIndicator :status="device.isOnline ? 'online' : 'offline'" />
      <span class="text-sm" :class="device.isOnline ? 'text-green-400' : 'text-red-400'">
        {{ device.isOnline ? 'Online' : 'Offline' }}
      </span>
    </div>

    <!-- Identify -->
    <div class="flex items-center">
      <button
        @click="handleIdentify"
        :disabled="!device.isOnline || isIdentifying"
        class="p-1.5 rounded text-gray-400 hover:text-yellow-400 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        :class="{ 'text-yellow-400 animate-pulse': isIdentifying }"
        title="Identify device"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
        </svg>
      </button>
    </div>
  </div>
</template>
