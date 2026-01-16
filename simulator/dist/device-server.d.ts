import { SimulatedDevice } from './simulated-device.js';
export declare class DeviceServer {
    private app;
    private server;
    private device;
    private isRebooting;
    constructor(device: SimulatedDevice);
    private setupMiddleware;
    private setupRoutes;
    private triggerReboot;
    start(): Promise<void>;
    stop(): Promise<void>;
    getDevice(): SimulatedDevice;
}
