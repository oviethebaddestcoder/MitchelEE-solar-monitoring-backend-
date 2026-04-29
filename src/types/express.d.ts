import { Database } from './database.types.js';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: Database['public']['Tables']['profiles']['Row']['role'];
      };
    }
  }
}

export {};