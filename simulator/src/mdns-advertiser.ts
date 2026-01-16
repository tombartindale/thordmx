import bonjourService, { Bonjour, Service } from 'bonjour-service';
import { SimulatedDevice } from './simulated-device.js';

export class MdnsAdvertiser {
  private bonjour: InstanceType<typeof Bonjour>;
  private services: Map<string, Service> = new Map();

  constructor() {
    this.bonjour = new Bonjour();
  }

  advertise(device: SimulatedDevice): void {
    const info = device.getMdnsInfo();

    // Unpublish existing service if any
    this.unpublish(device.id);

    const service = this.bonjour.publish({
      name: info.name,
      type: info.type,
      port: info.port,
      txt: info.txt,
    });

    this.services.set(device.id, service);
  }

  unpublish(deviceId: string): void {
    const service = this.services.get(deviceId);
    if (service && service.stop) {
      service.stop();
      this.services.delete(deviceId);
    }
  }

  unpublishAll(): void {
    for (const service of this.services.values()) {
      if (service.stop) {
        service.stop();
      }
    }
    this.services.clear();
  }

  destroy(): void {
    this.unpublishAll();
    this.bonjour.destroy();
  }

  getAdvertisedCount(): number {
    return this.services.size;
  }
}
