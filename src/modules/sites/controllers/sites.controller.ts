import { Request, Response, NextFunction } from 'express';
import { sitesService } from '../services/sites.service.js';

class SitesController {
  async getAllSites(_req: Request, res: Response, next: NextFunction) {
    try {
      const sites = await sitesService.getAllSites();
      res.json({
        success: true,
        data: sites,
      });
    } catch (error) {
      next(error);
    }
  }

  async getSiteById(req: Request, res: Response, next: NextFunction) {
    try {
      const site = await sitesService.getSiteById(req.params.id);
      res.json({
        success: true,
        data: site,
      });
    } catch (error) {
      next(error);
    }
  }

  async getSiteMetrics(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const metrics = await sitesService.getSiteMetrics(req.params.id, limit);
      res.json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      next(error);
    }
  }

  async getSiteInverters(req: Request, res: Response, next: NextFunction) {
    try {
      const inverters = await sitesService.getSiteInverters(req.params.id);
      res.json({
        success: true,
        data: inverters,
      });
    } catch (error) {
      next(error);
    }
  }

  async getPublicOverview(_req: Request, res: Response, next: NextFunction) {
    try {
      const overview = await sitesService.getPublicOverview();
      res.json({
        success: true,
        data: overview,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const sitesController = new SitesController();