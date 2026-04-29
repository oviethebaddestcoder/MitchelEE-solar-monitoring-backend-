import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '@/utils/errorHandler.js';

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'admin') {
    throw new ForbiddenError('Admin access required');
  }
  next();
}

export function requireEngineer(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== 'engineer' && req.user?.role !== 'admin') {
    throw new ForbiddenError('Engineer access required');
  }
  next();
}