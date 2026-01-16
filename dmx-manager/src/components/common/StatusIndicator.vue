<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  status: 'online' | 'offline' | 'updating' | 'warning'
  size?: 'sm' | 'md' | 'lg'
  pulse?: boolean
}>()

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm': return 'w-2 h-2'
    case 'lg': return 'w-4 h-4'
    default: return 'w-2.5 h-2.5'
  }
})

const statusClasses = computed(() => {
  switch (props.status) {
    case 'online': return 'bg-green-500'
    case 'offline': return 'bg-red-500'
    case 'updating': return 'bg-yellow-500'
    case 'warning': return 'bg-orange-500'
  }
})
</script>

<template>
  <span
    class="rounded-full inline-block"
    :class="[sizeClasses, statusClasses, { 'animate-pulse': pulse || status === 'updating' }]"
  ></span>
</template>
