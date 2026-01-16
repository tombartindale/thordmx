import { SimulatedDevice } from './simulated-device.js';
export declare class MdnsAdvertiser {
    private bonjour;
    private services;
    constructor();
    advertise(device: SimulatedDevice): void;
    unpublish(deviceId: string): void;
    unpublishAll(): void;
    destroy(): void;
    getAdvertisedCount(): number;
}
