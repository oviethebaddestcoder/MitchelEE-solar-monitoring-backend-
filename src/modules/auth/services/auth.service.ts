import jwt, { SignOptions } from 'jsonwebtoken';
import { supabase, supabaseAdmin } from '@/config/supabase.js';
import { env } from '@/config/env.js';
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
  InternalServerError,
} from '@/utils/errorHandler.js';
import { emailService } from './email.service.js';
import {
  AuthResponse,
  LoginRequest,
  InviteEngineerRequest,
  CompleteRegistrationRequest,
  InvitationResponse,
} from '../types/auth.types.js';

interface InvitationPayload {
  type:           'invitation';
  email:          string;
  fullName:       string;
   phone?:    string | null;
  role:           'engineer';
  invitedBy:      string;
  invitedByEmail: string;
}

class AuthService {

  // ── Invite engineer ──────────────────────────────────────────────────────────

  async inviteEngineer(
    data:         InviteEngineerRequest,
    adminUserId:  string,
    adminEmail:   string,
  ): Promise<InvitationResponse> {

    const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
    if (existingUser.users.some(u => u.email === data.email)) {
      throw new ConflictError('User with this email already exists');
    }

    const { data: existingInvite } = await supabaseAdmin
      .from('invitations')
      .select('id')
      .eq('email', data.email)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingInvite) {
      throw new ConflictError('Pending invitation already exists for this email');
    }

    // Remove old cancelled/expired invitations so the unique constraint doesn't block
    await supabaseAdmin
      .from('invitations')
      .delete()
      .eq('email', data.email)
      .in('status', ['cancelled', 'expired']);

    const { data: adminProfile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', adminUserId)
      .maybeSingle();

    const adminName = adminProfile?.full_name ?? 'An administrator';

    const invitationToken = jwt.sign(
      {
        type:           'invitation',
        email:          data.email,
        fullName:       data.fullName,
        phone:          data.phone,
        role:           data.role,
        invitedBy:      adminUserId,
        invitedByEmail: adminEmail,
      } satisfies InvitationPayload,
      env.JWT_SECRET,
      { expiresIn: '24h' },
    );

    const { error: inviteError } = await supabaseAdmin
      .from('invitations')
      .insert({
        email:      data.email,
        full_name:  data.fullName,
        phone:      data.phone,
        role:       data.role,
        invited_by: adminUserId,
      token_hash:  invitationToken, // Store the token hash for validation later
        status:     'pending',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
      });

    if (inviteError) {
      throw new InternalServerError(`Failed to create invitation: ${inviteError.message}`);
    }

    const inviteLink = `${env.FRONTEND_URL}/complete-registration?token=${invitationToken}`;

    try {
      await emailService.sendInvitationEmail({
        to:        data.email,
        fullName:  data.fullName,
        inviteLink,
        invitedBy: adminName,
        expiresIn: '24 hours',
      });
    } catch {
      await supabaseAdmin
        .from('invitations')
        .update({ status: 'cancelled' })
        .eq('email', data.email);

      throw new InternalServerError('Failed to send invitation email. Please try again.');
    }

    console.log('✅ Invitation created and email sent to:', data.email);

    return {
      success: true,
      message: 'Invitation sent successfully',
      data: {
        email:     data.email,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    };
  }

  // ── Complete registration ─────────────────────────────────────────────────────

  async completeRegistration(data: CompleteRegistrationRequest): Promise<AuthResponse> {
    let payload: InvitationPayload;

    try {
      payload = jwt.verify(data.token, env.JWT_SECRET) as InvitationPayload;
      if (payload.type !== 'invitation') throw new Error();
    } catch {
      throw new UnauthorizedError('Invalid or expired invitation token');
    }

    const { data: invitation, error: inviteError } = await supabaseAdmin
      .from('invitations')
      .select('id, expires_at')
      .eq('email', payload.email)
      .eq('status', 'pending')
      .single();

    if (inviteError || !invitation) {
      throw new NotFoundError('Invitation not found or already used');
    }

    if (new Date(invitation.expires_at) < new Date()) {
      await supabaseAdmin
        .from('invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id);

      throw new UnauthorizedError('Invitation has expired. Please request a new invitation.');
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email:         payload.email,
      password:      data.password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      throw new InternalServerError(`Failed to create user: ${authError?.message ?? 'Unknown error'}`);
    }

    const roleForDb    = payload.role.toUpperCase() as 'ENGINEER';  // DB check constraint
    const roleForToken = payload.role.toLowerCase();                // JWT / middleware

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id:         authData.user.id,
        full_name:  payload.fullName,
        phone:      payload.phone ?? null,
        role:       roleForDb,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (profileError) {
      console.error('❌ Profile creation error:', profileError);
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      throw new InternalServerError(`Failed to create profile: ${profileError.message}`);
    }

    await supabaseAdmin
      .from('invitations')
      .update({ status: 'accepted' })
      .eq('id', invitation.id);

    try {
      await emailService.sendInvitationAcceptedNotification(
        payload.invitedByEmail,
        payload.fullName,
      );
    } catch (err) {
      console.log('Failed to send admin notification (non-critical):', err);
    }

    console.log('✅ Registration completed for:', payload.email);

    const token        = this.generateToken(authData.user.id, payload.email, roleForToken);
    const refreshToken = this.generateRefreshToken(authData.user.id);

    return {
      success: true,
      message: 'Registration completed successfully',
      data: {
        user: {
          id:       authData.user.id,
          email:    payload.email,
          fullName: payload.fullName,
          role:     roleForToken,
        },
        token,
        refreshToken,
      },
    };
  }

  // ── Login ────────────────────────────────────────────────────────────────────

  async login(data: LoginRequest): Promise<AuthResponse> {
    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email:    data.email,
      password: data.password,
    });

    if (error || !authData.user) {
      console.error('❌ Login failed:', error);
      throw new UnauthorizedError('Invalid credentials');
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !profile) {
      console.error('❌ Profile fetch failed:', profileError);
      throw new UnauthorizedError('Profile not found');
    }

    const role         = profile.role.toLowerCase();
    const token        = this.generateToken(authData.user.id, data.email, role);
    const refreshToken = this.generateRefreshToken(authData.user.id);

    return {
      success: true,
      data: {
        user: {
          id:       authData.user.id,
          email:    data.email,
          fullName: profile.full_name,
          role,
        },
        token,
        refreshToken,
      },
    };
  }

  // ── Validate invitation token ─────────────────────────────────────────────────

  async validateInvitationToken(token: string): Promise<{
    valid:      boolean;
    email?:     string;
    fullName?:  string;
    expiresAt?: string;
  }> {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as InvitationPayload;
      if (payload.type !== 'invitation') return { valid: false };

      const { data: invitation } = await supabaseAdmin
        .from('invitations')
        .select('expires_at')
        .eq('email', payload.email)
        .eq('status', 'pending')
        .maybeSingle();

      if (!invitation || new Date(invitation.expires_at) < new Date()) {
        return { valid: false };
      }

      return {
        valid:     true,
        email:     payload.email,
        fullName:  payload.fullName,
        expiresAt: invitation.expires_at,
      };
    } catch {
      return { valid: false };
    }
  }

  // ── Token helpers ─────────────────────────────────────────────────────────────

  private generateToken(userId: string, email: string, role: string): string {
    const options: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'] };
    return jwt.sign({ userId, email, role }, env.JWT_SECRET, options);
  }

  private generateRefreshToken(userId: string): string {
    const options: SignOptions = { expiresIn: env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'] };
    return jwt.sign({ userId }, env.JWT_SECRET, options);
  }
}

export const authService = new AuthService();