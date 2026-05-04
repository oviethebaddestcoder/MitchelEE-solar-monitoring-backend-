import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '@/config/supabase.js';
import { authService } from '../services/auth.service.js';



class AuthController {
  async inviteEngineer(req: Request, res: Response, next: NextFunction) {
    try {
      // FIX: req.user uses userId not id (matches auth middleware shape)
      const adminUserId = req.user!.userId;
      const adminEmail = req.user!.email;
      
      const result = await authService.inviteEngineer(req.body, adminUserId, adminEmail);
      res.status(201).json(result);
      return;
    } catch (error) {
      next(error);
      return;
    }
  }

  async completeRegistration(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.completeRegistration(req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  async validateInvitation(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.query as { token: string };
      const result = await authService.validateInvitationToken(token);
      
      if (!result.valid) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired invitation',
        });
      }

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.login(req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async refreshToken(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({
        success: true,
        message: 'Token refreshed',
      });
    } catch (error) {
      next(error);
    }
  }

  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      // FIX: req.user uses userId not id
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', req.user!.userId)
        .single();

      res.json({
        success: true,
        data: profile,
      });
    } catch (error) {
      next(error);
    }
  }

  async getPendingInvitations(req: Request, res: Response, next: NextFunction) {
    try {
      const { data: invitations, error } = await supabaseAdmin
        .from('invitations')
        .select(`
          *,
          invited_by_profile:profiles!invited_by(full_name)
        `)
        // FIX: removed "email" from the profiles join — email is in Supabase Auth,
        // not in the profiles table. Selecting it caused "column profiles_1.email does not exist"
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;

      res.json({
        success: true,
        data: invitations,
      });
    } catch (error) {
      next(error);
    }
  }

  async cancelInvitation(req: Request, res: Response, next: NextFunction) {
    try {
      const { invitationId } = req.params;
      
      const { error } = await supabaseAdmin
        .from('invitations')
        .update({ status: 'cancelled' })
        .eq('id', invitationId)
        .eq('status', 'pending');

      if (error) throw error;

      res.json({
        success: true,
        message: 'Invitation cancelled',
      });
    } catch (error) {
      next(error);
    }
  }

  async resendInvitation(req: Request, res: Response, next: NextFunction) {
    try {
      const { invitationId } = req.params;
      // FIX: req.user uses userId not id
      const adminUserId = req.user!.userId;
      const adminEmail = req.user!.email;

    const { data: invitation, error } = await supabaseAdmin
  .from('invitations')   // types flow from database.types.ts automatically
  .select('*')
  .eq('id', invitationId)
  .eq('invited_by', adminUserId)
  .single();

      if (error || !invitation) {
        return res.status(404).json({
          success: false,
          message: 'Invitation not found',
        });
      }

      if (invitation.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Can only resend pending invitations',
        });
      }

      const result = await authService.inviteEngineer(
        {
          email: invitation.email,
          fullName: invitation.full_name,
          phone: invitation.phone,
          role: 'engineer',
        },
        adminUserId,
        adminEmail
      );

      await supabaseAdmin
        .from('invitations')
        .update({ status: 'cancelled' })
        .eq('id', invitationId);

      res.json({
        success: true,
        message: 'Invitation resent successfully',
        data: result.data,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();