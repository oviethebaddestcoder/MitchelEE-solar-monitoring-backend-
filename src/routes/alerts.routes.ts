import { Router } from 'express';
import { authenticate } from '@/middlewares/auth.middleware.js';
import { requireAdmin } from '@/middlewares/role.middleware.js';
import { alertsController } from '@/modules/alerts/controllers/alerts.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', alertsController.getAlerts);
router.get('/critical', alertsController.getCriticalAlerts);
router.patch('/:id/acknowledge', requireAdmin, alertsController.acknowledgeAlert);

export default router;