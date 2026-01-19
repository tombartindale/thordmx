<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useProvisioning, type WifiNetwork } from '@/composables/useProvisioning'

const isDev = import.meta.env.DEV

const {
  isInitialized,
  isScanning,
  isProvisioning,
  networks,
  selectedAPs,
  currentStep,
  currentDeviceIndex,
  currentDeviceSsid,
  results,
  error,
  config,
  hasElectronAPI,
  progress,
  completedCount,
  failedCount,
  initialize,
  scanNetworks,
  toggleAPSelection,
  selectAllAPs,
  deselectAllAPs,
  startProvisioning,
  reset
} = useProvisioning()

const apPattern = ref('THOR-BRIDGE-*')
const step = ref<'scan' | 'configure' | 'provision' | 'complete'>('scan')
const credentialsLoaded = ref(false)

onMounted(async () => {
  if (hasElectronAPI.value) {
    const success = await initialize()
    // Check if credentials were loaded (SSID will be set if they were)
    credentialsLoaded.value = success && !!config.targetSsid
  }
})

async function handleScan() {
  await scanNetworks(apPattern.value)
}

function getSignalBars(quality: WifiNetwork['signalQuality']): string {
  switch (quality) {
    case 'excellent': return '████'
    case 'good': return '███░'
    case 'fair': return '██░░'
    case 'poor': return '█░░░'
    default: return '░░░░'
  }
}

function getSignalColor(quality: WifiNetwork['signalQuality']): string {
  switch (quality) {
    case 'excellent': return 'text-green-400'
    case 'good': return 'text-green-500'
    case 'fair': return 'text-yellow-500'
    case 'poor': return 'text-red-500'
    default: return 'text-gray-500'
  }
}

function goToStep(newStep: 'scan' | 'configure' | 'provision' | 'complete') {
  step.value = newStep
}

async function handleStartProvisioning() {
  step.value = 'provision'
  await startProvisioning()
  step.value = 'complete'
}

function handleReset() {
  reset()
  step.value = 'scan'
}

function getStepLabel(stepType: string): string {
  switch (stepType) {
    case 'connecting_to_ap': return 'Connecting to device AP...'
    case 'fetching_device_info': return 'Fetching device info...'
    case 'sending_config': return 'Sending configuration...'
    case 'waiting_for_reboot': return 'Waiting for reboot...'
    case 'reconnecting': return 'Reconnecting to network...'
    case 'verifying_device': return 'Verifying device...'
    case 'completed': return 'Completed'
    case 'failed': return 'Failed'
    default: return 'Waiting...'
  }
}
</script>

<template>
  <div class="p-6 max-w-4xl mx-auto">
    <h1 class="text-2xl font-bold text-white mb-6">Device Provisioning</h1>

    <!-- Not in Electron warning -->
    <div v-if="!hasElectronAPI" class="bg-yellow-900/50 border border-yellow-600 rounded-lg p-4 mb-6">
      <p class="text-yellow-200">
        WiFi provisioning requires the desktop application.
        This feature is not available in the web browser.
      </p>
    </div>

    <!-- Error display -->
    <div v-if="error" class="bg-red-900/50 border border-red-600 rounded-lg p-4 mb-6">
      <p class="text-red-200">{{ error }}</p>
    </div>

    <!-- Step indicator -->
    <div class="flex items-center mb-8" v-if="hasElectronAPI">
      <div
        class="flex items-center cursor-pointer"
        :class="step === 'scan' ? 'text-blue-400' : 'text-gray-400'"
        @click="!isProvisioning && goToStep('scan')"
      >
        <span class="w-8 h-8 rounded-full flex items-center justify-center border-2"
              :class="step === 'scan' ? 'border-blue-400 bg-blue-400/20' : 'border-gray-600'">1</span>
        <span class="ml-2">Scan</span>
      </div>
      <div class="flex-1 h-0.5 mx-4" :class="step !== 'scan' ? 'bg-blue-400' : 'bg-gray-600'"></div>
      <div
        class="flex items-center cursor-pointer"
        :class="step === 'configure' ? 'text-blue-400' : 'text-gray-400'"
        @click="!isProvisioning && selectedAPs.length > 0 && goToStep('configure')"
      >
        <span class="w-8 h-8 rounded-full flex items-center justify-center border-2"
              :class="step === 'configure' ? 'border-blue-400 bg-blue-400/20' : 'border-gray-600'">2</span>
        <span class="ml-2">Configure</span>
      </div>
      <div class="flex-1 h-0.5 mx-4" :class="['provision', 'complete'].includes(step) ? 'bg-blue-400' : 'bg-gray-600'"></div>
      <div
        class="flex items-center"
        :class="['provision', 'complete'].includes(step) ? 'text-blue-400' : 'text-gray-400'"
      >
        <span class="w-8 h-8 rounded-full flex items-center justify-center border-2"
              :class="['provision', 'complete'].includes(step) ? 'border-blue-400 bg-blue-400/20' : 'border-gray-600'">3</span>
        <span class="ml-2">Provision</span>
      </div>
    </div>

    <!-- Step 1: Scan for APs -->
    <div v-if="step === 'scan' && hasElectronAPI" class="space-y-6">
      <div class="bg-gray-800 rounded-lg p-6">
        <h2 class="text-lg font-semibold text-white mb-4">Scan for Device APs</h2>

        <div class="flex gap-4 mb-6">
          <input
            v-model="apPattern"
            type="text"
            placeholder="SSID pattern (e.g., DMX-Bridge-*)"
            class="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
          <button
            @click="handleScan"
            :disabled="isScanning"
            class="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {{ isScanning ? 'Scanning...' : 'Scan Networks' }}
          </button>
        </div>

        <!-- Network list -->
        <div v-if="networks.length > 0" class="space-y-2">
          <div class="flex justify-between items-center mb-4">
            <span class="text-gray-400">Found {{ networks.length }} networks</span>
            <div class="space-x-2">
              <button @click="selectAllAPs" class="text-sm text-blue-400 hover:text-blue-300">Select All</button>
              <button @click="deselectAllAPs" class="text-sm text-gray-400 hover:text-gray-300">Deselect All</button>
            </div>
          </div>

          <div
            v-for="network in networks"
            :key="network.bssid"
            @click="toggleAPSelection(network.ssid)"
            class="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors"
            :class="{ 'ring-2 ring-blue-500 bg-blue-900/20': selectedAPs.includes(network.ssid) }"
          >
            <div class="flex items-center gap-4">
              <input
                type="checkbox"
                :checked="selectedAPs.includes(network.ssid)"
                class="w-5 h-5 rounded bg-gray-600 border-gray-500 text-blue-600 focus:ring-blue-500"
                @click.stop
                @change="toggleAPSelection(network.ssid)"
              />
              <div>
                <p class="text-white font-medium">{{ network.ssid }}</p>
                <p class="text-gray-400 text-sm">{{ network.bssid }}</p>
              </div>
            </div>
            <div class="flex items-center gap-4">
              <span class="text-gray-400 text-sm">Ch {{ network.channel }}</span>
              <span :class="getSignalColor(network.signalQuality)" class="font-mono">
                {{ getSignalBars(network.signalQuality) }}
              </span>
              <span class="text-gray-400 text-sm">{{ network.signalStrength }} dBm</span>
            </div>
          </div>
        </div>

        <div v-else-if="!isScanning" class="text-center py-12 text-gray-400">
          <p>Click "Scan Networks" to discover device access points</p>
        </div>
      </div>

      <div class="flex justify-between">
        <button
          v-if="isDev"
          @click="goToStep('configure')"
          class="px-6 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors"
        >
          [DEV] Skip to Configure
        </button>
        <div v-else></div>
        <button
          @click="goToStep('configure')"
          :disabled="selectedAPs.length === 0"
          class="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          Next: Configure ({{ selectedAPs.length }} selected)
        </button>
      </div>
    </div>

    <!-- Step 2: Configure -->
    <div v-if="step === 'configure' && hasElectronAPI" class="space-y-6">
      <!-- Location Services hint -->
      <div v-if="!credentialsLoaded && isDev" class="bg-yellow-900/50 border border-yellow-600 rounded-lg p-4">
        <p class="text-yellow-200 text-sm">
          <strong>Tip:</strong> To auto-fill WiFi credentials, grant Location Services permission to Electron in
          System Settings → Privacy & Security → Location Services.
        </p>
      </div>

      <div class="bg-gray-800 rounded-lg p-6">
        <h2 class="text-lg font-semibold text-white mb-4">WiFi Configuration</h2>

        <div class="grid grid-cols-2 gap-6">
          <div>
            <label class="block text-gray-300 text-sm mb-2">Target Network SSID</label>
            <input
              v-model="config.targetSsid"
              type="text"
              placeholder="Your WiFi network name"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label class="block text-gray-300 text-sm mb-2">Target Network Password</label>
            <input
              v-model="config.targetPassword"
              type="password"
              placeholder="WiFi password"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      <div class="bg-gray-800 rounded-lg p-6">
        <h2 class="text-lg font-semibold text-white mb-4">Device Configuration</h2>

        <div class="grid grid-cols-3 gap-6">
          <div>
            <label class="block text-gray-300 text-sm mb-2">Device Name Template</label>
            <input
              v-model="config.deviceNameTemplate"
              type="text"
              placeholder="DMX-Stage-{n}"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
            <p class="text-gray-500 text-xs mt-1">Use {n} for sequential numbering</p>
          </div>
          <div>
            <label class="block text-gray-300 text-sm mb-2">Starting Number</label>
            <input
              v-model.number="config.startingNumber"
              type="number"
              min="1"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label class="block text-gray-300 text-sm mb-2">sACN Universe</label>
            <input
              v-model.number="config.sacnUniverse"
              type="number"
              min="1"
              max="63999"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      <!-- Preview -->
      <div class="bg-gray-800 rounded-lg p-6">
        <h2 class="text-lg font-semibold text-white mb-4">Preview</h2>
        <div class="space-y-2">
          <div v-for="(ssid, index) in selectedAPs.slice(0, 5)" :key="ssid" class="flex justify-between text-sm">
            <span class="text-gray-400">{{ ssid }}</span>
            <span class="text-white">→ {{ config.deviceNameTemplate.replace('{n}', String(config.startingNumber + index)) }} (Universe {{ config.sacnUniverse }})</span>
          </div>
          <p v-if="selectedAPs.length > 5" class="text-gray-500 text-sm">...and {{ selectedAPs.length - 5 }} more</p>
        </div>
      </div>

      <div class="flex justify-between">
        <button
          @click="goToStep('scan')"
          class="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
        >
          Back
        </button>
        <button
          @click="handleStartProvisioning"
          :disabled="!config.targetSsid || !config.targetPassword"
          class="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
        >
          Start Provisioning {{ selectedAPs.length }} Device(s)
        </button>
      </div>
    </div>

    <!-- Step 3: Provisioning Progress -->
    <div v-if="step === 'provision' && hasElectronAPI" class="space-y-6">
      <div class="bg-gray-800 rounded-lg p-6">
        <h2 class="text-lg font-semibold text-white mb-4">Provisioning Progress</h2>

        <!-- Overall progress -->
        <div class="mb-6">
          <div class="flex justify-between text-sm mb-2">
            <span class="text-gray-400">Overall Progress</span>
            <span class="text-white">{{ currentDeviceIndex }} / {{ selectedAPs.length }}</span>
          </div>
          <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              class="h-full bg-blue-500 transition-all duration-300"
              :style="{ width: `${progress}%` }"
            ></div>
          </div>
        </div>

        <!-- Current device status -->
        <div v-if="isProvisioning" class="bg-gray-700/50 rounded-lg p-4 mb-6">
          <div class="flex items-center gap-3">
            <div class="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
            <div>
              <p class="text-white font-medium">{{ currentDeviceSsid }}</p>
              <p class="text-gray-400 text-sm">{{ getStepLabel(currentStep) }}</p>
            </div>
          </div>
        </div>

        <!-- Results list -->
        <div class="space-y-2">
          <div
            v-for="result in results"
            :key="result.apSsid"
            class="flex items-center justify-between p-3 rounded-lg"
            :class="result.success ? 'bg-green-900/20' : 'bg-red-900/20'"
          >
            <div class="flex items-center gap-3">
              <span v-if="result.success" class="text-green-400 text-xl">✓</span>
              <span v-else class="text-red-400 text-xl">✗</span>
              <div>
                <p class="text-white">{{ result.apSsid }}</p>
                <p v-if="result.success" class="text-gray-400 text-sm">
                  → {{ result.assignedName }}
                </p>
                <p v-else class="text-red-400 text-sm">{{ result.error }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Step 4: Complete -->
    <div v-if="step === 'complete' && hasElectronAPI" class="space-y-6">
      <div class="bg-gray-800 rounded-lg p-6 text-center">
        <div class="text-6xl mb-4">
          {{ failedCount === 0 ? '✓' : '⚠' }}
        </div>
        <h2 class="text-2xl font-bold text-white mb-2">Provisioning Complete</h2>
        <p class="text-gray-400 mb-6">
          {{ completedCount }} of {{ selectedAPs.length }} devices provisioned successfully
        </p>

        <div class="flex justify-center gap-4">
          <button
            @click="handleReset"
            class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            Provision More Devices
          </button>
        </div>
      </div>

      <!-- Final results -->
      <div class="bg-gray-800 rounded-lg p-6">
        <h3 class="text-lg font-semibold text-white mb-4">Results Summary</h3>
        <div class="space-y-2">
          <div
            v-for="result in results"
            :key="result.apSsid"
            class="flex items-center justify-between p-3 rounded-lg"
            :class="result.success ? 'bg-green-900/20' : 'bg-red-900/20'"
          >
            <div class="flex items-center gap-3">
              <span v-if="result.success" class="text-green-400">✓</span>
              <span v-else class="text-red-400">✗</span>
              <div>
                <p class="text-white">{{ result.apSsid }}</p>
                <p v-if="result.success" class="text-gray-400 text-sm">
                  Configured as {{ result.assignedName }} on universe {{ result.assignedUniverse }}
                </p>
                <p v-else class="text-red-400 text-sm">{{ result.error }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
