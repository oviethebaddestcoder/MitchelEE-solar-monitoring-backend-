import jwt from 'jsonwebtoken';
import { supabase, supabaseAdmin } from '@/config/supabase.js';
import { env } from '@/config/env.js';
import { 
  ConflictError, 
  UnauthorizedError, 
  NotFoundError,
  InternalServerError 
} from '@/utils/errorHandler.js';
import { emailService } from './email.service.js';
import { 
  AuthResponse, 
  LoginRequest, 
  InviteEngineerRequest,
  CompleteRegistrationRequest,
  InvitationResponse 
} from '../types/auth.types.js';

interface InvitationPayload {
  type: 'invitation';
  email: string;
  fullName: string;
  phone?: string;
  role: 'engineer';
  invitedBy: string;
  invitedByEmail: string;
}

class AuthService {
 
async inviteEngineer(
  data: InviteEngineerRequest,
  adminUserId: string,
  adminEmail: string
): Promise<InvitationResponse> {
  const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
  const userExists = existingUser.users.some((u) => u.email === data.email);
 
  if (userExists) {
    throw new ConflictError('User with this email already exists');
  }
 
  // Check for an existing PENDING invitation
  const { data: existingInvite } = await supabaseAdmin
    .from('invitations')
    .select('*')
    .eq('email', data.email)
    .eq('status', 'pending')
    .single();
 
  if (existingInvite) {
    throw new ConflictError('Pending invitation already exists for this email');
  }
 
  // FIX: Delete any old cancelled/expired invitations for this email
  // so the unique constraint on email doesn't block a fresh invite
  await supabaseAdmin
    .from('invitations')
    .delete()
    .eq('email', data.email)
    .in('status', ['cancelled', 'expired']);
 
  const { data: adminProfile } = await supabaseAdmin
    .from('profiles')
    .select('full_name')
    .eq('id', adminUserId)
    .single() as any;
 
  const adminName = adminProfile?.full_name || 'An administrator';
 
  const invitationToken = jwt.sign(
    {
      type: 'invitation',
      email: data.email,
      fullName: data.fullName,
      phone: data.phone,
      role: data.role,
      invitedBy: adminUserId,
      invitedByEmail: adminEmail,
    } as InvitationPayload,
    env.JWT_SECRET,
    { expiresIn: '24h' }
  );
 
  const { error: inviteError } = await supabaseAdmin
    .from('invitations')
    .insert({
      email: data.email,
      full_name: data.fullName,
      phone: data.phone,
      role: data.role,
      invited_by: adminUserId,
      token_hash: invitationToken.slice(-20),
      status: 'pending',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    });
 
  if (inviteError) {
    throw new Error(`Failed to create invitation: ${inviteError.message}`);
  }
 
  const inviteLink = `${env.FRONTEND_URL}/complete-registration?token=${invitationToken}`;
 
  try {
    await emailService.sendInvitationEmail({
      to: data.email,
      fullName: data.fullName,
      inviteLink,
      invitedBy: adminName,
      expiresIn: '24 hours',
    });
  } catch (error) {
    await supabaseAdmin
      .from('invitations')
      .update({ status: 'cancelled' } as any)
      .eq('email', data.email);
 
    throw new InternalServerError('Failed to send invitation email. Please try again.');
  }
 
  console.log('✅ Invitation created and email sent to:', data.email);
 
  return {
    success: true,
    message: 'Invitation sent successfully',
    data: {
      email: data.email,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
  };
}
  
// Replace completeRegistration in auth.service.ts with this:

async completeRegistration(data: CompleteRegistrationRequest): Promise<AuthResponse> {
  let payload: InvitationPayload;
  try {
    payload = jwt.verify(data.token, env.JWT_SECRET) as InvitationPayload;

    if (payload.type !== 'invitation') {
      throw new UnauthorizedError('Invalid invitation token');
    }
  } catch (error) {
    throw new UnauthorizedError('Invalid or expired invitation token');
  }

  const { data: invitation, error: inviteError } = await supabaseAdmin
    .from('invitations')
    .select('*')
    .eq('email', payload.email)
    .eq('status', 'pending')
    .single();

  if (inviteError || !invitation) {
    throw new NotFoundError('Invitation not found or already used');
  }

  if (new Date(invitation.expires_at) < new Date()) {
    await supabaseAdmin
      .from('invitations')
      .update({ status: 'expired' } as any)
      .eq('id', invitation.id);

    throw new UnauthorizedError('Invitation has expired. Please request a new invitation.');
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: payload.email,
    password: data.password,
    email_confirm: true,
  });

  if (authError || !authData.user) {
    throw new Error(`Failed to create user: ${authError?.message || 'Unknown error'}`);
  }

  console.log('✅ Created auth user from invitation:', authData.user.id);

  // FIX: DB check constraint requires UPPERCASE role ('ENGINEER', 'ADMIN')
  // JWT token uses lowercase (auth middleware normalizes to lowercase on read)
  const roleForDb    = payload.role.toUpperCase();  // 'engineer' → 'ENGINEER'
  const roleForToken = payload.role.toLowerCase();  // 'engineer' → 'engineer'

  const { data: profileData, error: profileError } = await supabaseAdmin
    .from('profiles')
    .insert({
      id: authData.user.id,
      full_name: payload.fullName,
      phone: payload.phone || null,
      role: roleForDb,                              // satisfies profiles_role_check
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (profileError) {
    console.error('❌ Profile creation error:', profileError);
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    throw new Error(`Failed to create profile: ${profileError.message}`);
  }

  await supabaseAdmin
    .from('invitations')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      user_id: authData.user.id,
    } as any)
    .eq('id', invitation.id);

  try {
    await emailService.sendInvitationAcceptedNotification(
      payload.invitedByEmail,
      payload.fullName
    );
  } catch (error) {
    console.log('Failed to send admin notification (non-critical):', error);
  }

  console.log('✅ Registration completed for:', payload.email);

  const token = this.generateToken(authData.user.id, payload.email, roleForToken);
  const refreshToken = this.generateRefreshToken(authData.user.id);

  return {
    success: true,
    message: 'Registration completed successfully',
    data: {
      user: {
        id: authData.user.id,
        email: payload.email,
        fullName: payload.fullName,
        role: roleForToken,
      },
      token,
      refreshToken,
    },
  };
}
  async login(data: LoginRequest): Promise<AuthResponse> {
    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error || !authData.user) {
      console.error('❌ Login failed:', error);
      throw new UnauthorizedError('Invalid credentials');
    }

    console.log('✅ Auth successful for user:', authData.user.id);

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !profile) {
      console.error('❌ Profile fetch failed:', profileError);
      throw new UnauthorizedError('Profile not found');
    }

    console.log('✅ Profile found:', { id: profile.id, role: profile.role });

    // FIX: normalize role to lowercase before embedding in token
    const token = this.generateToken(authData.user.id, data.email, profile.role.toLowerCase());
    const refreshToken = this.generateRefreshToken(authData.user.id);

    return {
      success: true,
      data: {
        user: {
          id: authData.user.id,
          email: data.email,
          fullName: profile.full_name,
          role: profile.role.toLowerCase(),
        },
        token,
        refreshToken,
      },
    };
  }

  async validateInvitationToken(token: string): Promise<{
    valid: boolean;
    email?: string;
    fullName?: string;
    expiresAt?: string;
  }> {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as InvitationPayload;
      
      if (payload.type !== 'invitation') {
        return { valid: false };
      }

      const { data: invitation } = await supabaseAdmin
        .from('invitations')
        .select('*')
        .eq('email', payload.email)
        .eq('status', 'pending')
        .single();

      if (!invitation || new Date(invitation.expires_at) < new Date()) {
        return { valid: false };
      }

      return {
        valid: true,
        email: payload.email,
        fullName: payload.fullName,
        expiresAt: invitation.expires_at,
      };
    } catch {
      return { valid: false };
    }
  }

  private generateToken(userId: string, email: string, role: string): string {
    return jwt.sign({ userId, email, role }, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN,
    });
  }

  private generateRefreshToken(userId: string): string {
    return jwt.sign({ userId }, env.JWT_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    });
  }
}

export const authService = new AuthService();