import { Request, Response, NextFunction } from 'express';
import { alertsService } from '../services/alerts.service.js';

class AlertsController {
  async getAlerts(req: Request, res: Response, next: NextFunction) {
    try {
      const filters = {
        severity:     req.query.severity as string | undefined,
        acknowledged: req.query.acknowledged !== undefined
          ? req.query.acknowledged === 'true'
          : undefined,
      };
      const alerts = await alertsService.getAlerts(filters);
      res.json({ success: true, data: alerts });
    } catch (error) { next(error); }
  }

  async getCriticalAlerts(_req: Request, res: Response, next: NextFunction) {
    try {
      const alerts = await alertsService.getCriticalAlerts();
      res.json({ success: true, data: alerts });
    } catch (error) { next(error); }
  }

  async acknowledgeAlert(req: Request, res: Response, next: NextFunction) {
    try {
      // FIX: req.user.userId not req.user.id
      const alert = await alertsService.acknowledgeAlert(req.params.id, req.user!.userId);
      res.json({ success: true, data: alert });
    } catch (error) { next(error); }
  }

  async getAlertsBySite(req: Request, res: Response, next: NextFunction) {
    try {
      const alerts = await alertsService.getAlertsBySite(req.params.siteId);
      res.json({ success: true, data: alerts });
    } catch (error) { next(error); }
  }
}

export const alertsController = new AlertsController();