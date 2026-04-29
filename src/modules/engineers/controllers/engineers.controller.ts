import { Request, Response, NextFunction } from 'express';
import { engineersService } from '../services/engineers.service.js';

class EngineersController {
  async getAllEngineers(_req: Request, res: Response, next: NextFunction) {
    try {
      const engineers = await engineersService.getAllEngineers();
      res.json({ success: true, data: engineers });
    } catch (error) {
      next(error);
    }
  }

  async assignEngineer(req: Request, res: Response, next: NextFunction) {
    try {
      const { engineerId, siteId, alertId } = req.body;
      const assignment = await engineersService.assignEngineer(engineerId, siteId, alertId);
      res.status(201).json({ success: true, data: assignment });
    } catch (error) {
      next(error);
    }
  }

  async getMyAssignments(req: Request, res: Response, next: NextFunction) {
    try {
      // FIX: was req.user!.id — auth middleware sets userId not id
      const assignments = await engineersService.getMyAssignments(req.user!.userId);
      res.json({ success: true, data: assignments });
    } catch (error) {
      next(error);
    }
  }

  async getAllAssignments(_req: Request, res: Response, next: NextFunction) {
    try {
      const assignments = await engineersService.getAllAssignments();
      res.json({ success: true, data: assignments });
    } catch (error) {
      next(error);
    }
  }

  async updateAssignmentStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { status } = req.body;
      // FIX: was req.params.id — should be req.params.assignmentId to match route param
      const assignment = await engineersService.updateAssignmentStatus(
        req.params.assignmentId ?? req.params.id,
        status
      );
      res.json({ success: true, data: assignment });
    } catch (error) {
      next(error);
    }
  }
}

export const engineersController = new EngineersController();