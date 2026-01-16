<script setup lang="ts">
import { useSettingsStore } from '../stores/settings'

const settingsStore = useSettingsStore()
</script>

<template>
  <div class="p-6">
    <h1 class="text-2xl font-semibold text-gray-100 mb-6">Settings</h1>

    <div class="max-w-2xl space-y-6">
      <!-- Discovery settings -->
      <div class="bg-gray-800 rounded-xl p-6">
        <h2 class="text-lg font-medium text-gray-100 mb-4">Discovery</h2>

        <div class="space-y-4">
          <label class="flex items-center justify-between">
            <span class="text-gray-300">Enable automatic discovery</span>
            <input
              type="checkbox"
              :checked="settingsStore.settings.discoveryEnabled"
              @change="settingsStore.updateSetting('discoveryEnabled', ($event.target as HTMLInputElement).checked)"
              class="rounded bg-gray-700 border-gray-600 text-primary-500 focus:ring-primary-500"
            />
          </label>

          <div>
            <label class="block text-sm text-gray-400 mb-2">Status poll interval (ms)</label>
            <input
              type="number"
              :value="settingsStore.settings.statusPollInterval"
              @input="settingsStore.updateSetting('statusPollInterval', parseInt(($event.target as HTMLInputElement).value))"
              min="1000"
              max="60000"
              step="1000"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      </div>

      <!-- Firmware update settings -->
      <div class="bg-gray-800 rounded-xl p-6">
        <h2 class="text-lg font-medium text-gray-100 mb-4">Firmware Updates</h2>

        <div class="space-y-4">
          <div>
            <label class="block text-sm text-gray-400 mb-2">Max concurrent updates</label>
            <input
              type="number"
              :value="settingsStore.settings.maxConcurrentUpdates"
              @input="settingsStore.updateSetting('maxConcurrentUpdates', parseInt(($event.target as HTMLInputElement).value))"
              min="1"
              max="10"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label class="block text-sm text-gray-400 mb-2">Retry count</label>
            <input
              type="number"
              :value="settingsStore.settings.updateRetryCount"
              @input="settingsStore.updateSetting('updateRetryCount', parseInt(($event.target as HTMLInputElement).value))"
              min="0"
              max="10"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      </div>

      <!-- UI settings -->
      <div class="bg-gray-800 rounded-xl p-6">
        <h2 class="text-lg font-medium text-gray-100 mb-4">Interface</h2>

        <div class="space-y-4">
          <label class="flex items-center justify-between">
            <span class="text-gray-300">Show offline devices</span>
            <input
              type="checkbox"
              :checked="settingsStore.settings.showOfflineDevices"
              @change="settingsStore.updateSetting('showOfflineDevices', ($event.target as HTMLInputElement).checked)"
              class="rounded bg-gray-700 border-gray-600 text-primary-500 focus:ring-primary-500"
            />
          </label>

          <label class="flex items-center justify-between">
            <span class="text-gray-300">Confirm destructive actions</span>
            <input
              type="checkbox"
              :checked="settingsStore.settings.confirmDestructiveActions"
              @change="settingsStore.updateSetting('confirmDestructiveActions', ($event.target as HTMLInputElement).checked)"
              class="rounded bg-gray-700 border-gray-600 text-primary-500 focus:ring-primary-500"
            />
          </label>
        </div>
      </div>

      <!-- Notifications -->
      <div class="bg-gray-800 rounded-xl p-6">
        <h2 class="text-lg font-medium text-gray-100 mb-4">Notifications</h2>

        <div class="space-y-4">
          <label class="flex items-center justify-between">
            <span class="text-gray-300">Notify when device goes offline</span>
            <input
              type="checkbox"
              :checked="settingsStore.settings.notifyDeviceOffline"
              @change="settingsStore.updateSetting('notifyDeviceOffline', ($event.target as HTMLInputElement).checked)"
              class="rounded bg-gray-700 border-gray-600 text-primary-500 focus:ring-primary-500"
            />
          </label>

          <label class="flex items-center justify-between">
            <span class="text-gray-300">Notify when update completes</span>
            <input
              type="checkbox"
              :checked="settingsStore.settings.notifyUpdateComplete"
              @change="settingsStore.updateSetting('notifyUpdateComplete', ($event.target as HTMLInputElement).checked)"
              class="rounded bg-gray-700 border-gray-600 text-primary-500 focus:ring-primary-500"
            />
          </label>
        </div>
      </div>

      <!-- Reset -->
      <div class="bg-gray-800 rounded-xl p-6">
        <h2 class="text-lg font-medium text-gray-100 mb-4">Reset</h2>
        <button
          @click="settingsStore.resetSettings()"
          class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  </div>
</template>
