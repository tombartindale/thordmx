<script setup lang="ts">
import type { Device } from '../../api/types'
import StatusIndicator from '../common/StatusIndicator.vue'

const props = defineProps<{
  device: Device
  isSelected: boolean
}>()

const emit = defineEmits<{
  (e: 'click'): void
  (e: 'toggle-select'): void
}>()

function handleCheckboxClick(event: Event) {
  event.stopPropagation()
  emit('toggle-select')
}
</script>

<template>
  <div
    class="grid grid-cols-[auto_1fr_120px_80px_100px_80px] gap-4 px-4 py-3 border-b border-gray-700 hover:bg-gray-800 cursor-pointer transition-colors"
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

    <!-- IP -->
    <div class="flex items-center text-sm text-gray-400 font-mono">
      {{ device.ip }}
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
  </div>
</template>
