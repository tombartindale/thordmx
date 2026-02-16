import express, { Request, Response, NextFunction, Express } from 'express';
import cors from 'cors';
import multer from 'multer';
import { SimulatedDevice } from './simulated-device.js';
import type { ConfigUpdate } from './types.js';
import http from 'http';

const upload = multer({ storage: multer.memoryStorage() });

export class DeviceServer {
  private app: Express;
  private server: http.Server | null = null;
  private device: SimulatedDevice;
  private isRebooting = false;

  constructor(device: SimulatedDevice) {
    this.device = device;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());

    // Fault injection middleware
    this.app.use(async (req: Request, res: Response, next: NextFunction) => {
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

  private setupRoutes(): void {
    // GET /api/status
    this.app.get('/api/status', (req: Request, res: Response) => {
      res.json(this.device.getStatus());
    });

    // GET /api/config
    this.app.get('/api/config', (req: Request, res: Response) => {
      res.json(this.device.getConfig());
    });

    // POST /api/config
    this.app.post('/api/config', (req: Request, res: Response) => {
      const update: ConfigUpdate = req.body;
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
    this.app.post('/api/reboot', (req: Request, res: Response) => {
      res.json({
        success: true,
        message: 'Rebooting in 1 second.',
      });

      // Trigger reboot after response is sent
      setTimeout(() => this.triggerReboot('software'), 100);
    });

    // POST /api/identify
    this.app.post('/api/identify', (req: Request, res: Response) => {
      const duration = req.body?.duration ?? 5;
      const result = this.device.identify(duration);

      res.json({
        success: true,
        message: 'Identifying device',
        duration_seconds: result.duration,
      });
    });

    // GET /api/firmware
    this.app.get('/api/firmware', (req: Request, res: Response) => {
      res.json(this.device.getFirmwareInfo());
    });

    // POST /api/firmware (upload)
    this.app.post('/api/firmware', upload.single('firmware'), async (req: Request, res: Response) => {
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
      } catch (error) {
        res.status(500).json({
          success: false,
          error: 'Firmware upload failed',
        });
      }
    });

    // POST /api/firmware/rollback
    this.app.post('/api/firmware/rollback', async (req: Request, res: Response) => {
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

    // GET /api/dmx
    this.app.get('/api/dmx', (req: Request, res: Response) => {
      const start = Math.max(1, Math.min(512, parseInt(req.query.start as string, 10) || 1));
      let count = Math.max(1, Math.min(512, parseInt(req.query.count as string, 10) || 512));
      if (start + count - 1 > 512) count = 513 - start;

      res.json({
        start,
        count,
        channels: this.device.getDmxData(start, count),
      });
    });

    // POST /api/dmx
    this.app.post('/api/dmx', (req: Request, res: Response) => {
      let channelsSet = 0;

      if (req.body.channels && typeof req.body.channels === 'object' && !Array.isArray(req.body.channels)) {
        channelsSet = this.device.setDmxChannels(req.body.channels);
      } else if (req.body.values && Array.isArray(req.body.values)) {
        const start = req.body.start ?? 1;
        channelsSet = this.device.setDmxValues(start, req.body.values);
      }

      if (channelsSet === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid channels provided. Use {"channels":{"1":255}} or {"start":1,"values":[255,128]}',
        });
      }

      res.json({
        success: true,
        channels_set: channelsSet,
      });
    });

    // 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
      });
    });
  }

  private async triggerReboot(reason: 'software' | 'watchdog'): Promise<void> {
    this.isRebooting = true;

    await this.device.reboot(reason);

    this.isRebooting = false;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const port = this.device.getPort();
      this.server = this.app.listen(port, () => {
        resolve();
      });
      this.server.on('error', reject);
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
        this.server = null;
      } else {
        resolve();
      }
    });
  }

  getDevice(): SimulatedDevice {
    return this.device;
  }
}
