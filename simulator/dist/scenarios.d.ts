import type { TestScenario, FaultInjection } from './types.js';
/**
 * Pre-defined test scenarios for common testing situations
 */
export declare const scenarios: Record<string, TestScenario>;
/**
 * Create a custom scenario with the specified number of devices
 */
export declare function createCustomScenario(deviceCount: number, options?: {
    namePrefix?: string;
    universe?: number;
    faultInjection?: FaultInjection;
}): TestScenario;
/**
 * List all available scenarios
 */
export declare function listScenarios(): Array<{
    id: string;
    name: string;
    description: string;
    deviceCount: number;
}>;
