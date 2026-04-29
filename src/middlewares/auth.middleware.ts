import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '@/config/env.js';
import { UnauthorizedError, ForbiddenError } from '@/utils/errorHandler.js';
import { supabaseAdmin } from '@/config/supabase.js';

// Extend Express Request type
declare module 'express' {
  interface Request {
    user?: {
      userId: string;
      email: string;
      role: string;
    };
  }
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.substring(7);
    
    const decoded = jwt.verify(token, env.JWT_SECRET) as {
      userId: string;
      email: string;
      role?: string;
    };

    let userRole = decoded.role;
    if (!userRole) {
      console.log('⚠️ Role missing from token, fetching from database for user:', decoded.userId);
      
      const { data: profile, error } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', decoded.userId)
        .single();
      
      if (error || !profile) {
        console.error('❌ Failed to fetch role from database:', error);
        throw new UnauthorizedError('User profile not found');
      }
      
      userRole = profile.role;
      console.log('✅ Role fetched from database:', userRole);
    }

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      // FIX: normalize to lowercase so "ADMIN" === "admin" everywhere
      role: (userRole || 'user').toLowerCase(),
    };
    
    console.log('🔐 Authenticated user:', req.user);
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new UnauthorizedError('Invalid token'));
    }
    if (error instanceof jwt.TokenExpiredError) {
      return next(new UnauthorizedError('Token expired'));
    }
    next(error);
  }
};

export const authorize = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    console.log('🔍 Authorizing - User:', req.user);
    console.log('🔍 Required roles:', allowedRoles);
    
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    // FIX: normalize both sides so casing never matters
    const userRole = req.user.role.toLowerCase();
    const allowed = allowedRoles.map(r => r.toLowerCase());

    if (!allowed.includes(userRole)) {
      console.error(`❌ Role "${req.user.role}" not in allowed roles:`, allowedRoles);
      return next(new ForbiddenError('Insufficient permissions'));
    }

    console.log('✅ Authorization passed for role:', req.user.role);
    next();
  };
};