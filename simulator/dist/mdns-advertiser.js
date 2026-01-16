import { Bonjour } from 'bonjour-service';
export class MdnsAdvertiser {
    bonjour;
    services = new Map();
    constructor() {
        this.bonjour = new Bonjour();
    }
    advertise(device) {
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
    unpublish(deviceId) {
        const service = this.services.get(deviceId);
        if (service && service.stop) {
            service.stop();
            this.services.delete(deviceId);
        }
    }
    unpublishAll() {
        for (const service of this.services.values()) {
            if (service.stop) {
                service.stop();
            }
        }
        this.services.clear();
    }
    destroy() {
        this.unpublishAll();
        this.bonjour.destroy();
    }
    getAdvertisedCount() {
        return this.services.size;
    }
}
