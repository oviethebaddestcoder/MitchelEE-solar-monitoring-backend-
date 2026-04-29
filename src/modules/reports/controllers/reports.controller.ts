import { Request, Response, NextFunction } from 'express';
import { reportsService } from '../services/reports.service.js';

class ReportsController {
  async createReport(req: Request, res: Response, next: NextFunction) {
    try {
      const report = await reportsService.createReport({
        assignmentId: req.body.assignmentId,
        engineerId:   req.user!.userId,  // FIX: was req.user!.id — middleware sets userId not id
        report:       req.body.description,
        findings:     req.body.findings ?? null,
        images:       req.body.images ?? [],
      });

      res.status(201).json({ success: true, data: report });
    } catch (error) {
      next(error);
    }
  }

  async getReportsByAssignment(req: Request, res: Response, next: NextFunction) {
    try {
      const reports = await reportsService.getReportsByAssignment(req.params.assignmentId);
      res.json({ success: true, data: reports });
    } catch (error) {
      next(error);
    }
  }

  async getReportsBySite(req: Request, res: Response, next: NextFunction) {
    try {
      const reports = await reportsService.getReportsBySite(req.params.siteId);
      res.json({ success: true, data: reports });
    } catch (error) {
      next(error);
    }
  }
}

export const reportsController = new ReportsController();