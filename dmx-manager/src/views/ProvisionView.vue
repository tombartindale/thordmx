<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useProvisioning, type WifiNetwork } from '@/composables/useProvisioning'
import { useSerialProvisioning } from '@/composables/useSerialProvisioning'

const isDev = import.meta.env.DEV

// Provisioning mode: 'wifi' or 'serial'
const provisioningMode = ref<'wifi' | 'serial'>('wifi')

// WiFi provisioning
const {
  isScanning,
  isProvisioning: isWifiProvisioning,
  networks,
  selectedAPs,
  currentStep,
  currentDeviceIndex,
  currentDeviceSsid,
  results: wifiResults,
  error: wifiError,
  config: wifiConfig,
  hasElectronAPI,
  progress,
  completedCount: wifiCompletedCount,
  failedCount: wifiFailedCount,
  knownNetworks,
  isLoadingPassword,
  initialize: initializeWifi,
  scanNetworks,
  toggleAPSelection,
  selectAllAPs,
  deselectAllAPs,
  startProvisioning,
  reset: resetWifi,
  selectKnownNetwork
} = useProvisioning()

// Serial provisioning
const {
  isWatching,
  devices: serialDevices,
  results: serialResults,
  error: serialError,
  config: serialConfig,
  currentProvisioningDevice,
  completedCount: serialCompletedCount,
  failedCount: serialFailedCount,
  initialize: initializeSerial,
  startAutoProvisioning,
  stopAutoProvisioning,
  reset: resetSerial
} = useSerialProvisioning()

const apPattern = ref('THOR-BRIDGE-*')
const step = ref<'scan' | 'configure' | 'provision' | 'complete'>('scan')
const credentialsLoaded = ref(false)

// Sync config between wifi and serial
watch(() => wifiConfig.targetSsid, (val) => { serialConfig.targetSsid = val })
watch(() => wifiConfig.targetPassword, (val) => { serialConfig.targetPassword = val })
watch(() => wifiConfig.deviceNameTemplate, (val) => { serialConfig.deviceNameTemplate = val })
watch(() => wifiConfig.startingNumber, (val) => { serialConfig.startingNumber = val })
watch(() => wifiConfig.sacnUniverse, (val) => { serialConfig.sacnUniverse = val })

onMounted(async () => {
  if (hasElectronAPI.value) {
    const success = await initializeWifi()
    // Check if credentials were loaded (SSID will be set if they were)
    credentialsLoaded.value = success && !!wifiConfig.targetSsid

    // Also sync to serial config
    if (wifiConfig.targetSsid) {
      serialConfig.targetSsid = wifiConfig.targetSsid
      serialConfig.targetPassword = wifiConfig.targetPassword
    }

    // Initialize serial service
    await initializeSerial()
  }
})

async function handleScan() {
  await scanNetworks(apPattern.value)
}

async function handleNetworkSelect(event: Event) {
  const ssid = (event.target as HTMLSelectElement).value
  if (ssid) {
    await selectKnownNetwork(ssid)
  }
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
  resetWifi()
  step.value = 'scan'
}

// Serial provisioning functions
async function handleStartSerialWatching() {
  await startAutoProvisioning()
}

async function handleStopSerialWatching() {
  await stopAutoProvisioning()
}

function handleResetSerial() {
  resetSerial()
}

// Computed values based on mode
const error = computed(() => provisioningMode.value === 'wifi' ? wifiError.value : serialError.value)
const isProvisioning = computed(() => provisioningMode.value === 'wifi' ? isWifiProvisioning.value : isWatching.value)

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

    <!-- Mode toggle -->
    <div v-if="hasElectronAPI" class="flex gap-2 mb-6">
      <button
        @click="provisioningMode = 'wifi'"
        :class="[
          'px-4 py-2 rounded-lg transition-colors',
          provisioningMode === 'wifi'
            ? 'bg-primary-600 text-white'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
        ]"
      >
        WiFi Provisioning
      </button>
      <button
        @click="provisioningMode = 'serial'"
        :class="[
          'px-4 py-2 rounded-lg transition-colors',
          provisioningMode === 'serial'
            ? 'bg-primary-600 text-white'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
        ]"
      >
        USB Serial Provisioning
      </button>
    </div>

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

    <!-- WiFi Provisioning Mode -->
    <template v-if="provisioningMode === 'wifi'">

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
            class="px-6 py-2 bg-primary-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
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
          class="px-6 py-2 bg-primary-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
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

        <!-- Known networks dropdown (shown when auto-detection failed but we have known networks) -->
        <div v-if="knownNetworks.length > 0 && !wifiConfig.targetPassword" class="mb-4">
          <label class="block text-gray-300 text-sm mb-2">Select from known networks</label>
          <div class="flex gap-2">
            <select
              @change="handleNetworkSelect"
              :value="wifiConfig.targetSsid"
              :disabled="isLoadingPassword"
              class="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
            >
              <option value="">-- Select a network --</option>
              <option v-for="ssid in knownNetworks" :key="ssid" :value="ssid">{{ ssid }}</option>
            </select>
            <div v-if="isLoadingPassword" class="flex items-center px-3">
              <div class="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
            </div>
          </div>
          <p class="text-gray-500 text-xs mt-1">
            Selecting a network will prompt for your system password to retrieve the WiFi password from keychain.
          </p>
        </div>

        <div class="grid grid-cols-2 gap-6">
          <div>
            <label class="block text-gray-300 text-sm mb-2">Target Network SSID</label>
            <input
              v-model="wifiConfig.targetSsid"
              type="text"
              placeholder="Your WiFi network name"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label class="block text-gray-300 text-sm mb-2">Target Network Password</label>
            <input
              v-model="wifiConfig.targetPassword"
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
              v-model="wifiConfig.deviceNameTemplate"
              type="text"
              placeholder="DMX-Stage-{n}"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
            <p class="text-gray-500 text-xs mt-1">Use {n} for sequential numbering</p>
          </div>
          <div>
            <label class="block text-gray-300 text-sm mb-2">Starting Number</label>
            <input
              v-model.number="wifiConfig.startingNumber"
              type="number"
              min="1"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label class="block text-gray-300 text-sm mb-2">sACN Universe</label>
            <input
              v-model.number="wifiConfig.sacnUniverse"
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
            <span class="text-white">→ {{ wifiConfig.deviceNameTemplate.replace('{n}', String(wifiConfig.startingNumber + index)) }} (Universe {{ wifiConfig.sacnUniverse }})</span>
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
          :disabled="!wifiConfig.targetSsid || !wifiConfig.targetPassword"
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
            v-for="result in wifiResults"
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
          {{ wifiFailedCount === 0 ? '✓' : '⚠' }}
        </div>
        <h2 class="text-2xl font-bold text-white mb-2">Provisioning Complete</h2>
        <p class="text-gray-400 mb-6">
          {{ wifiCompletedCount }} of {{ selectedAPs.length }} devices provisioned successfully
        </p>

        <div class="flex justify-center gap-4">
          <button
            @click="handleReset"
            class="px-6 py-2 bg-primary-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
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
            v-for="result in wifiResults"
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

    </template>

    <!-- Serial Provisioning Mode -->
    <template v-if="provisioningMode === 'serial'">
      <div class="space-y-6">
        <!-- Serial Configuration -->
        <div class="bg-gray-800 rounded-lg p-6">
          <h2 class="text-lg font-semibold text-white mb-4">USB Serial Provisioning</h2>
          <p class="text-gray-400 mb-4">
            Connect devices via USB and they will be automatically provisioned with the settings below.
            Devices appear as <code class="bg-gray-700 px-1 rounded">/dev/tty.usbmodem*</code> on macOS.
          </p>

          <!-- Known networks dropdown for serial mode too -->
          <div v-if="knownNetworks.length > 0 && !serialConfig.targetPassword" class="mb-4">
            <label class="block text-gray-300 text-sm mb-2">Select from known networks</label>
            <div class="flex gap-2">
              <select
                @change="handleNetworkSelect"
                :value="serialConfig.targetSsid"
                :disabled="isLoadingPassword || isWatching"
                class="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
              >
                <option value="">-- Select a network --</option>
                <option v-for="ssid in knownNetworks" :key="ssid" :value="ssid">{{ ssid }}</option>
              </select>
              <div v-if="isLoadingPassword" class="flex items-center px-3">
                <div class="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
              </div>
            </div>
            <p class="text-gray-500 text-xs mt-1">
              Selecting a network will prompt for your system password to retrieve the WiFi password.
            </p>
          </div>

          <!-- WiFi Configuration -->
          <div class="grid grid-cols-2 gap-6 mb-6">
            <div>
              <label class="block text-gray-300 text-sm mb-2">Target Network SSID</label>
              <input
                v-model="serialConfig.targetSsid"
                type="text"
                placeholder="Your WiFi network name"
                :disabled="isWatching"
                class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label class="block text-gray-300 text-sm mb-2">Target Network Password</label>
              <input
                v-model="serialConfig.targetPassword"
                type="password"
                placeholder="WiFi password"
                :disabled="isWatching"
                class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <!-- Device Configuration -->
          <div class="grid grid-cols-3 gap-6 mb-6">
            <div>
              <label class="block text-gray-300 text-sm mb-2">Device Name Template</label>
              <input
                v-model="serialConfig.deviceNameTemplate"
                type="text"
                placeholder="DMX-Device-{n}"
                :disabled="isWatching"
                class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <p class="text-gray-500 text-xs mt-1">Use {n} for sequential numbering</p>
            </div>
            <div>
              <label class="block text-gray-300 text-sm mb-2">Starting Number</label>
              <input
                v-model.number="serialConfig.startingNumber"
                type="number"
                min="1"
                :disabled="isWatching"
                class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label class="block text-gray-300 text-sm mb-2">sACN Universe</label>
              <input
                v-model.number="serialConfig.sacnUniverse"
                type="number"
                min="1"
                max="63999"
                :disabled="isWatching"
                class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <!-- Start/Stop Button -->
          <div class="flex gap-4">
            <button
              v-if="!isWatching"
              @click="handleStartSerialWatching"
              :disabled="!serialConfig.targetSsid || !serialConfig.targetPassword"
              class="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              Start Auto-Provisioning
            </button>
            <button
              v-else
              @click="handleStopSerialWatching"
              class="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            >
              Stop Auto-Provisioning
            </button>
            <button
              v-if="serialResults.length > 0"
              @click="handleResetSerial"
              class="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
            >
              Clear Results
            </button>
          </div>
        </div>

        <!-- Status -->
        <div v-if="isWatching" class="bg-blue-900/30 border border-blue-600 rounded-lg p-4">
          <div class="flex items-center gap-3">
            <div class="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
            <p class="text-blue-200">
              Watching for USB devices... Plug in a device to provision it automatically.
            </p>
          </div>
        </div>

        <!-- Current provisioning -->
        <div v-if="currentProvisioningDevice" class="bg-gray-800 rounded-lg p-4">
          <div class="flex items-center gap-3">
            <div class="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
            <div>
              <p class="text-white font-medium">Provisioning device...</p>
              <p class="text-gray-400 text-sm">{{ currentProvisioningDevice }}</p>
            </div>
          </div>
        </div>

        <!-- Connected Devices -->
        <div v-if="serialDevices.length > 0" class="bg-gray-800 rounded-lg p-6">
          <h3 class="text-lg font-semibold text-white mb-4">Connected USB Devices</h3>
          <div class="space-y-2">
            <div
              v-for="device in serialDevices"
              :key="device.path"
              class="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg"
            >
              <div>
                <p class="text-white font-mono">{{ device.path }}</p>
                <p v-if="device.manufacturer" class="text-gray-400 text-sm">{{ device.manufacturer }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Results -->
        <div v-if="serialResults.length > 0" class="bg-gray-800 rounded-lg p-6">
          <h3 class="text-lg font-semibold text-white mb-4">
            Provisioning Results
            <span class="text-sm font-normal text-gray-400 ml-2">
              ({{ serialCompletedCount }} success, {{ serialFailedCount }} failed)
            </span>
          </h3>
          <div class="space-y-2">
            <div
              v-for="(result, index) in serialResults"
              :key="index"
              class="flex items-center justify-between p-3 rounded-lg"
              :class="result.success ? 'bg-green-900/20' : 'bg-red-900/20'"
            >
              <div class="flex items-center gap-3">
                <span v-if="result.success" class="text-green-400 text-xl">✓</span>
                <span v-else class="text-red-400 text-xl">✗</span>
                <div>
                  <p class="text-white font-mono text-sm">{{ result.path }}</p>
                  <p v-if="result.success" class="text-gray-400 text-sm">
                    Configured as {{ result.deviceName }}
                    <span v-if="result.macAddress" class="text-gray-500">({{ result.macAddress }})</span>
                  </p>
                  <p v-else class="text-red-400 text-sm">{{ result.error }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

  </div>
</template>
