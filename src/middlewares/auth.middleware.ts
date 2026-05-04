import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '@/config/env.js';
import { UnauthorizedError, ForbiddenError } from '@/utils/errorHandler.js';
import { logger } from '@/utils/logger.js';
import { supabaseAdmin } from '@/config/supabase.js'

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
  void res;
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
      logger.warn('Role missing from token, fetching from database for user: %s', decoded.userId);
      
  const { data: profile, error } = await supabaseAdmin
  .from('profiles')
  .select('role')
  .eq('id', decoded.userId)
  .single();
      
      if (error || !profile) {
        logger.error('Failed to fetch role from database: %o', error);
        throw new UnauthorizedError('User profile not found');
      }
      
      userRole = profile.role;
      logger.info('Role fetched from database: %s', userRole);
    }

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      // FIX: normalize to lowercase so "ADMIN" === "admin" everywhere
      role: (userRole || 'user').toLowerCase(),
    };
    
    logger.info('Authenticated user: %o', req.user);
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
    void res;
    logger.debug('Authorizing - User: %o', req.user);
    logger.debug('Required roles: %o', allowedRoles);
    
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    // FIX: normalize both sides so casing never matters
    const userRole = req.user.role.toLowerCase();
    const allowed = allowedRoles.map(r => r.toLowerCase());

    if (!allowed.includes(userRole)) {
      logger.warn('Role "%s" not in allowed roles: %o', req.user.role, allowedRoles);
      return next(new ForbiddenError('Insufficient permissions'));
    }

    logger.info('Authorization passed for role: %s', req.user.role);
    next();
  };
};