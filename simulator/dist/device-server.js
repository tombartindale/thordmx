import express from 'express';
import cors from 'cors';
import multer from 'multer';
const upload = multer({ storage: multer.memoryStorage() });
export class DeviceServer {
    app;
    server = null;
    device;
    isRebooting = false;
    constructor(device) {
        this.device = device;
        this.app = express();
        this.setupMiddleware();
        this.setupRoutes();
    }
    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        // Fault injection middleware
        this.app.use(async (req, res, next) => {
            // Check for simulated network timeout
            if (this.device.isNetworkTimeout()) {
                // Don't respond at all - simulate timeout
                return;
            }
            // Check for simulated reboot state
            if (this.isRebooting) {
                return; // Don't respond during reboot
            }
            // Check for packet drop
            if (this.device.shouldDropRequest()) {
                return; // Silently drop the request
            }
            // Apply response delay
            const delay = this.device.getResponseDelay();
            if (delay > 0) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            // Check for random reboot
            if (this.device.shouldRandomReboot()) {
                this.triggerReboot('watchdog');
                return;
            }
            next();
        });
    }
    setupRoutes() {
        // GET /api/status
        this.app.get('/api/status', (req, res) => {
            res.json(this.device.getStatus());
        });
        // GET /api/config
        this.app.get('/api/config', (req, res) => {
            res.json(this.device.getConfig());
        });
        // POST /api/config
        this.app.post('/api/config', (req, res) => {
            const update = req.body;
            const result = this.device.updateConfig(update);
            if (!result.success) {
                return res.status(400).json({
                    success: false,
                    error: result.error,
                });
            }
            res.json({
                success: true,
                message: result.message,
                reboot_required: result.rebootRequired,
            });
        });
        // POST /api/reboot
        this.app.post('/api/reboot', (req, res) => {
            res.json({
                success: true,
                message: 'Rebooting in 1 second.',
            });
            // Trigger reboot after response is sent
            setTimeout(() => this.triggerReboot('software'), 100);
        });
        // POST /api/identify
        this.app.post('/api/identify', (req, res) => {
            const duration = req.body?.duration ?? 5;
            const result = this.device.identify(duration);
            res.json({
                success: true,
                message: 'Identifying device',
                duration_seconds: result.duration,
            });
        });
        // GET /api/firmware
        this.app.get('/api/firmware', (req, res) => {
            res.json(this.device.getFirmwareInfo());
        });
        // POST /api/firmware (upload)
        this.app.post('/api/firmware', upload.single('firmware'), async (req, res) => {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'No firmware file provided',
                });
            }
            try {
                const result = await this.device.uploadFirmware();
                res.json({
                    success: true,
                    message: 'Firmware uploaded successfully. Rebooting...',
                    new_version: 'uploaded',
                    previous_version: result.previousVersion,
                    rebooting: true,
                });
            }
            catch (error) {
                res.status(500).json({
                    success: false,
                    error: 'Firmware upload failed',
                });
            }
        });
        // POST /api/firmware/rollback
        this.app.post('/api/firmware/rollback', async (req, res) => {
            const result = await this.device.rollbackFirmware();
            if (!result.success) {
                return res.status(400).json({
                    success: false,
                    error: result.error,
                });
            }
            const info = this.device.getFirmwareInfo();
            res.json({
                success: true,
                message: 'Rolling back to previous firmware',
                current_version: info.current_version,
                rebooting: true,
            });
        });
        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({
                success: false,
                error: 'Endpoint not found',
            });
        });
    }
    async triggerReboot(reason) {
        this.isRebooting = true;
        await this.device.reboot(reason);
        this.isRebooting = false;
    }
    start() {
        return new Promise((resolve, reject) => {
            const port = this.device.getPort();
            this.server = this.app.listen(port, () => {
                resolve();
            });
            this.server.on('error', reject);
        });
    }
    stop() {
        return new Promise((resolve, reject) => {
            if (this.server) {
                this.server.close((err) => {
                    if (err)
                        reject(err);
                    else
                        resolve();
                });
                this.server = null;
            }
            else {
                resolve();
            }
        });
    }
    getDevice() {
        return this.device;
    }
}
