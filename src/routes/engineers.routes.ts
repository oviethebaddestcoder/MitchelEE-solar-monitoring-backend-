import { Router } from 'express';

import { authenticate } from '@/middlewares/auth.middleware.js';
import { requireAdmin, requireEngineer } from '@/middlewares/role.middleware.js';
import { engineersController } from '@/modules/engineers/controllers/engineers.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', requireAdmin, engineersController.getAllEngineers);
router.post('/assign', requireAdmin, engineersController.assignEngineer);
router.get('/my-assignments', requireEngineer, engineersController.getMyAssignments);
router.patch('/assignments/:id/status', requireEngineer, engineersController.updateAssignmentStatus);

export default router;