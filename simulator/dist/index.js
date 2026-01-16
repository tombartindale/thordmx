#!/usr/bin/env node
import { DmxReceiverSimulator } from './simulator.js';
import readline from 'readline';
const args = process.argv.slice(2);
function printHelp() {
    console.log(`
DMX Receiver Simulator
======================

Usage: npm run dev [options]

Options:
  --scenario <name>    Load a predefined scenario
  --devices <count>    Create custom scenario with N devices
  --port <number>      Starting port (default: 8080)
  --no-mdns            Disable mDNS advertisement
  --help               Show this help message

Predefined Scenarios:
  single-device        One healthy device
  three-devices        Three devices on different universes
  ten-devices          Ten devices for load testing
  signal-loss          Devices losing sACN signal
  packet-drop          30% packet drop rate
  high-latency         2 second response delay
  network-timeout      Devices that don't respond
  packet-errors        Corrupted sACN packets
  unstable             Random reboots
  low-memory           Heap exhaustion simulation
  mixed-health         Mix of healthy and faulty devices
  production-like      Realistic 8-device setup

Interactive Commands (once running):
  list                 List all devices
  scenarios            List available scenarios
  load <scenario>      Load a scenario
  fault <id> <type>    Inject fault (signal-loss, timeout, slow, drop, errors)
  clear <id>           Clear faults on device
  clear-all            Clear all faults
  signal-loss <id>     Simulate sACN signal loss
  restore <id>         Restore signal/network
  offline <id>         Take device offline
  add [name] [uni]     Add a new device
  remove <id>          Remove a device
  status <id>          Show device status
  help                 Show commands
  exit                 Stop simulator and exit

Examples:
  npm run dev -- --scenario three-devices
  npm run dev -- --devices 5 --port 9000
  npm run dev -- --scenario mixed-health --no-mdns
`);
}
async function main() {
    // Parse arguments
    let scenario;
    let deviceCount;
    let basePort = 8080;
    let enableMdns = true;
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--help':
            case '-h':
                printHelp();
                process.exit(0);
                break;
            case '--scenario':
            case '-s':
                scenario = args[++i];
                break;
            case '--devices':
            case '-d':
                deviceCount = parseInt(args[++i], 10);
                break;
            case '--port':
            case '-p':
                basePort = parseInt(args[++i], 10);
                break;
            case '--no-mdns':
                enableMdns = false;
                break;
        }
    }
    // Create simulator
    const simulator = new DmxReceiverSimulator({
        basePort,
        enableMdns,
        logLevel: 'info',
    });
    // Load initial scenario
    if (scenario) {
        try {
            await simulator.loadScenario(scenario);
        }
        catch (err) {
            console.error(`Error: ${err.message}`);
            process.exit(1);
        }
    }
    else if (deviceCount) {
        await simulator.loadCustomScenario(deviceCount);
    }
    else {
        // Default to three-devices
        await simulator.loadScenario('three-devices');
    }
    // Print device info
    console.log('\nSimulated Devices:');
    console.log('------------------');
    for (const device of simulator.getDevices()) {
        console.log(`  ${device.name}`);
        console.log(`    ID:       ${device.id}`);
        console.log(`    MAC:      ${device.mac}`);
        console.log(`    Port:     ${device.port}`);
        console.log(`    Universe: ${device.universe}`);
        console.log(`    URL:      http://localhost:${device.port}/api/status`);
        console.log('');
    }
    console.log('Type "help" for available commands.\n');
    // Start interactive CLI
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: 'simulator> ',
    });
    rl.prompt();
    rl.on('line', async (line) => {
        const [cmd, ...cmdArgs] = line.trim().split(/\s+/);
        try {
            switch (cmd) {
                case 'help':
                    console.log(`
Commands:
  list                  List all devices
  scenarios             List available scenarios
  load <scenario>       Load a scenario
  fault <id> <type>     Inject fault (signal-loss, timeout, slow, drop, errors)
  clear <id>            Clear faults on device
  clear-all             Clear all faults
  signal-loss <id>      Simulate sACN signal loss
  restore <id>          Restore signal/network
  offline <id>          Take device offline
  add [name] [universe] Add a new device
  remove <id>           Remove a device
  status <id>           Show device status
  exit                  Stop and exit
`);
                    break;
                case 'list':
                    console.log('\nDevices:');
                    for (const d of simulator.getDevices()) {
                        const faults = Object.keys(d.faults).length > 0 ? ` [FAULTS: ${Object.keys(d.faults).join(', ')}]` : '';
                        console.log(`  ${d.id.slice(0, 8)}  ${d.name.padEnd(20)} port:${d.port} uni:${d.universe} sacn:${d.isReceivingSacn ? 'yes' : 'no'}${faults}`);
                    }
                    console.log('');
                    break;
                case 'scenarios':
                    console.log('\nAvailable Scenarios:');
                    for (const s of simulator.listScenarios()) {
                        console.log(`  ${s.id.padEnd(20)} ${s.description} (${s.deviceCount} devices)`);
                    }
                    console.log('');
                    break;
                case 'load':
                    if (!cmdArgs[0]) {
                        console.log('Usage: load <scenario>');
                    }
                    else {
                        await simulator.loadScenario(cmdArgs[0]);
                        console.log(`\nLoaded ${cmdArgs[0]}. ${simulator.getDeviceCount()} devices running.`);
                    }
                    break;
                case 'fault': {
                    const [faultId, faultType] = cmdArgs;
                    if (!faultId || !faultType) {
                        console.log('Usage: fault <device-id> <type>');
                        console.log('Types: signal-loss, timeout, slow, drop, errors');
                        break;
                    }
                    const device = findDevice(simulator, faultId);
                    if (!device) {
                        console.log(`Device not found: ${faultId}`);
                        break;
                    }
                    const faults = {};
                    switch (faultType) {
                        case 'signal-loss':
                            faults.sacnSignalLoss = true;
                            break;
                        case 'timeout':
                            faults.networkTimeout = true;
                            break;
                        case 'slow':
                            faults.responseDelay = 2000;
                            break;
                        case 'drop':
                            faults.dropPacketRate = 0.3;
                            break;
                        case 'errors':
                            faults.sacnPacketErrors = 0.1;
                            break;
                        default:
                            console.log(`Unknown fault type: ${faultType}`);
                            break;
                    }
                    if (Object.keys(faults).length > 0) {
                        simulator.setDeviceFault(device.id, faults);
                    }
                    break;
                }
                case 'clear': {
                    const clearId = cmdArgs[0];
                    if (!clearId) {
                        console.log('Usage: clear <device-id>');
                        break;
                    }
                    const device = findDevice(simulator, clearId);
                    if (!device) {
                        console.log(`Device not found: ${clearId}`);
                        break;
                    }
                    simulator.clearDeviceFault(device.id);
                    break;
                }
                case 'clear-all':
                    simulator.clearGlobalFault();
                    break;
                case 'signal-loss': {
                    const slId = cmdArgs[0];
                    if (!slId) {
                        console.log('Usage: signal-loss <device-id>');
                        break;
                    }
                    const device = findDevice(simulator, slId);
                    if (!device) {
                        console.log(`Device not found: ${slId}`);
                        break;
                    }
                    simulator.simulateSignalLoss(device.id);
                    break;
                }
                case 'restore': {
                    const restoreId = cmdArgs[0];
                    if (!restoreId) {
                        console.log('Usage: restore <device-id>');
                        break;
                    }
                    const device = findDevice(simulator, restoreId);
                    if (!device) {
                        console.log(`Device not found: ${restoreId}`);
                        break;
                    }
                    simulator.restoreNetwork(device.id);
                    break;
                }
                case 'offline': {
                    const offlineId = cmdArgs[0];
                    if (!offlineId) {
                        console.log('Usage: offline <device-id>');
                        break;
                    }
                    const device = findDevice(simulator, offlineId);
                    if (!device) {
                        console.log(`Device not found: ${offlineId}`);
                        break;
                    }
                    simulator.simulateNetworkFailure(device.id);
                    break;
                }
                case 'add': {
                    const name = cmdArgs[0] || `DMX-Device-${Date.now() % 1000}`;
                    const universe = cmdArgs[1] ? parseInt(cmdArgs[1], 10) : simulator.getDeviceCount() + 1;
                    const id = await simulator.addDevice({ name, universe });
                    const newDevice = simulator.getDevices().find(d => d.id === id);
                    if (newDevice) {
                        console.log(`Added device: ${newDevice.name} on port ${newDevice.port}`);
                    }
                    break;
                }
                case 'remove': {
                    const removeId = cmdArgs[0];
                    if (!removeId) {
                        console.log('Usage: remove <device-id>');
                        break;
                    }
                    const device = findDevice(simulator, removeId);
                    if (!device) {
                        console.log(`Device not found: ${removeId}`);
                        break;
                    }
                    await simulator.removeDevice(device.id);
                    break;
                }
                case 'status': {
                    const statusId = cmdArgs[0];
                    if (!statusId) {
                        console.log('Usage: status <device-id>');
                        break;
                    }
                    const device = findDevice(simulator, statusId);
                    if (!device) {
                        console.log(`Device not found: ${statusId}`);
                        break;
                    }
                    const deviceInstance = simulator.getDevice(device.id);
                    if (deviceInstance) {
                        console.log(JSON.stringify(deviceInstance.getStatus(), null, 2));
                    }
                    break;
                }
                case 'exit':
                case 'quit':
                    await simulator.stop();
                    simulator.destroy();
                    console.log('Goodbye!');
                    process.exit(0);
                    break;
                case '':
                    break;
                default:
                    console.log(`Unknown command: ${cmd}. Type "help" for available commands.`);
            }
        }
        catch (err) {
            console.error(`Error: ${err.message}`);
        }
        rl.prompt();
    });
    rl.on('close', async () => {
        await simulator.stop();
        simulator.destroy();
        process.exit(0);
    });
    // Handle SIGINT
    process.on('SIGINT', async () => {
        console.log('\nShutting down...');
        await simulator.stop();
        simulator.destroy();
        process.exit(0);
    });
}
function findDevice(simulator, query) {
    const devices = simulator.getDevices();
    // Try exact ID match first
    let device = devices.find(d => d.id === query);
    if (device)
        return device;
    // Try partial ID match
    device = devices.find(d => d.id.startsWith(query));
    if (device)
        return device;
    // Try name match (case insensitive)
    device = devices.find(d => d.name.toLowerCase().includes(query.toLowerCase()));
    return device;
}
main().catch(console.error);
