import type {
  TestScenario,
  SimulatedDeviceConfig,
  FaultInjection,
} from "./types.js";

/**
 * Pre-defined test scenarios for common testing situations
 */
export const scenarios: Record<string, TestScenario> = {
  // Basic scenarios
  "single-device": {
    name: "Single Device",
    description: "One healthy device for basic testing",
    deviceConfigs: [{ name: "THOR-BRIDGE-001", universe: 1 }],
  },

  "three-devices": {
    name: "Three Devices",
    description: "Three healthy devices on universe 1",
    deviceConfigs: [
      { name: "Stage-Left", universe: 1 },
      { name: "Stage-Right", universe: 1 },
      { name: "Stage-Center", universe: 1 },
    ],
  },

  "ten-devices": {
    name: "Ten Devices",
    description: "Ten devices for load testing on universe 1",
    deviceConfigs: Array.from({ length: 10 }, (_, i) => ({
      name: `DMX-Node-${String(i + 1).padStart(2, "0")}`,
      universe: 1,
    })),
  },

  // Fault scenarios
  "signal-loss": {
    name: "Signal Loss",
    description: "Devices that lose sACN signal",
    deviceConfigs: [
      { name: "Healthy-Device", universe: 1 },
      { name: "Signal-Lost-Device", universe: 1 },
    ],
    faultInjection: {
      sacnSignalLoss: true,
    },
  },

  "packet-drop": {
    name: "Packet Drop",
    description: "Devices with 30% packet drop rate",
    deviceConfigs: [
      { name: "Flaky-Device-1", universe: 1 },
      { name: "Flaky-Device-2", universe: 1 },
    ],
    faultInjection: {
      dropPacketRate: 0.3,
    },
  },

  "high-latency": {
    name: "High Latency",
    description: "Devices with 2 second response delay",
    deviceConfigs: [
      { name: "Slow-Device-1", universe: 1 },
      { name: "Slow-Device-2", universe: 1 },
    ],
    faultInjection: {
      responseDelay: 2000,
    },
  },

  "network-timeout": {
    name: "Network Timeout",
    description: "Devices that do not respond (simulates network failure)",
    deviceConfigs: [
      { name: "Offline-Device-1", universe: 1 },
      { name: "Offline-Device-2", universe: 1 },
    ],
    faultInjection: {
      networkTimeout: true,
    },
  },

  "packet-errors": {
    name: "Packet Errors",
    description: "Devices receiving corrupted sACN packets",
    deviceConfigs: [
      { name: "Error-Device-1", universe: 1 },
      { name: "Error-Device-2", universe: 1 },
    ],
    faultInjection: {
      sacnPacketErrors: 0.1, // 10% error rate
    },
  },

  unstable: {
    name: "Unstable",
    description: "Devices that randomly reboot",
    deviceConfigs: [
      { name: "Unstable-Device-1", universe: 1 },
      { name: "Unstable-Device-2", universe: 1 },
    ],
    faultInjection: {
      randomReboot: 0.05, // 5% chance per request
    },
  },

  "low-memory": {
    name: "Low Memory",
    description: "Devices experiencing heap exhaustion",
    deviceConfigs: [{ name: "Memory-Leak-Device", universe: 1 }],
    faultInjection: {
      heapExhaustion: true,
    },
  },

  // Mixed scenarios
  "mixed-health": {
    name: "Mixed Health",
    description: "Mix of healthy and unhealthy devices",
    deviceConfigs: [
      { name: "Healthy-1", universe: 1 },
      { name: "Healthy-2", universe: 1 },
      { name: "Signal-Lost", universe: 1 },
      { name: "Slow-Response", universe: 1 },
      { name: "Flaky-Network", universe: 1 },
    ],
  },

  "production-like": {
    name: "Production-Like",
    description: "Realistic production setup with 8 devices",
    deviceConfigs: [
      { name: "FOH-Main", universe: 1 },
      { name: "FOH-Backup", universe: 1 },
      { name: "Stage-Left", universe: 1 },
      { name: "Stage-Right", universe: 1 },
      { name: "Truss-Front", universe: 1 },
      { name: "Truss-Rear", universe: 1 },
      { name: "Floor-A", universe: 1 },
      { name: "Floor-B", universe: 1 },
    ],
  },
};

/**
 * Create a custom scenario with the specified number of devices
 */
export function createCustomScenario(
  deviceCount: number,
  options: {
    namePrefix?: string;
    universe?: number;
    faultInjection?: FaultInjection;
  } = {}
): TestScenario {
  const { namePrefix = "DMX-Device", universe = 1, faultInjection } = options;

  const deviceConfigs: SimulatedDeviceConfig[] = Array.from(
    { length: deviceCount },
    (_, i) => ({
      name: `${namePrefix}-${String(i + 1).padStart(2, "0")}`,
      universe,
    })
  );

  return {
    name: `Custom (${deviceCount} devices)`,
    description: `Custom scenario with ${deviceCount} devices`,
    deviceConfigs,
    faultInjection,
  };
}

/**
 * List all available scenarios
 */
export function listScenarios(): Array<{
  id: string;
  name: string;
  description: string;
  deviceCount: number;
}> {
  return Object.entries(scenarios).map(([id, scenario]) => ({
    id,
    name: scenario.name,
    description: scenario.description,
    deviceCount: scenario.deviceConfigs.length,
  }));
}
