import { Router } from 'express';
import { sitesController } from '../modules/sites/controllers/sites.controller.js';
import { authenticate } from '@/middlewares/auth.middleware.js';

const router = Router();


router.get('/public/overview', sitesController.getPublicOverview);

// Protected routes (require authentication)
router.get('/', authenticate, sitesController.getAllSites);
router.get('/:id', authenticate, sitesController.getSiteById);
router.get('/:id/metrics', authenticate, sitesController.getSiteMetrics);
router.get('/:id/inverters', authenticate, sitesController.getSiteInverters);

export default router;