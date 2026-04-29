import { Router } from 'express';

import { authenticate } from '@/middlewares/auth.middleware.js';
import { requireEngineer } from '@/middlewares/role.middleware.js';
import { reportsController } from '@/modules/reports/controllers/reports.controller.js';

const router = Router();

router.use(authenticate);

router.post('/', requireEngineer, reportsController.createReport);
router.get('/assignment/:assignmentId', reportsController.getReportsByAssignment);
router.get('/site/:siteId', reportsController.getReportsBySite);

export default router;