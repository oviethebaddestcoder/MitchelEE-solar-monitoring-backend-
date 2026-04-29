import { Router } from 'express';
import { validateRequest } from '@/middlewares/validator.middleware.js';
import { authenticate, authorize } from '@/middlewares/auth.middleware.js';
import { authController } from '@/modules/auth/controllers/auth.controller.js';
import { 
  loginSchema, 
  inviteEngineerSchema, 
  completeRegistrationSchema 
} from '@/modules/auth/validators/auth.validators.js';

const router = Router();

// Public routes
router.post('/login', validateRequest(loginSchema), authController.login);
router.post('/refresh', authController.refreshToken);

// Invitation flow (public - no auth required)
router.get('/invitation/validate', authController.validateInvitation);
router.post(
  '/invitation/complete', 
  validateRequest(completeRegistrationSchema), 
  authController.completeRegistration
);

// Protected routes
router.get('/profile', authenticate, authController.getProfile);

// Admin only routes
router.post(
  '/admin/invite-engineer',
  authenticate,
  authorize(['admin']),
  validateRequest(inviteEngineerSchema),
  authController.inviteEngineer
);

router.get(
  '/admin/invitations',
  authenticate,
  authorize(['admin']),
  authController.getPendingInvitations
);

router.post(
  '/admin/invitations/:invitationId/cancel',
  authenticate,
  authorize(['admin']),
  authController.cancelInvitation
);

router.post(
  '/admin/invitations/:invitationId/resend',
  authenticate,
  authorize(['admin']),
  authController.resendInvitation
);

export default router;