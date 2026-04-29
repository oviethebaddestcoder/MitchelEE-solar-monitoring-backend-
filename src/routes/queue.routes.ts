import { Router } from 'express';
import { queueManager } from '@/queue/QueueManager.js';
import { authenticate } from '@/middlewares/auth.middleware.js';
import { requireAdmin } from '@/middlewares/role.middleware.js';
import { Request, Response, NextFunction } from 'express';

const router = Router();

// All routes require admin authentication
router.use(authenticate);
router.use(requireAdmin);

/**
 * GET /api/v1/queue/metrics
 * Get metrics for all queues
 */
router.get('/metrics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const metrics = await queueManager.getAllMetrics();

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/queue/:name/metrics
 * Get metrics for specific queue
 */
router.get('/:name/metrics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.params;
    const metrics = await queueManager.getQueueMetrics(name);

    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    next(error);
  }
});

export default router;