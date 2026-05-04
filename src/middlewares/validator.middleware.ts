// middlewares/validator.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { ValidationError } from '@/utils/errorHandler.js';

export function validateRequest(schema: AnyZodObject) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      // Check if schema expects body/query/params wrapper or just body fields
      const schemaShape = schema.shape || {};
      const hasBodyWrapper = 'body' in schemaShape;
      
      if (hasBodyWrapper) {
        // Schema includes body/query/params structure
        await schema.parseAsync({
          body: req.body,
          query: req.query,
          params: req.params,
        });
      } else {
        // Schema is just body fields - validate directly
        await schema.parseAsync(req.body);
      }
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const messages = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
        next(new ValidationError(messages.join(', ')));
      } else {
        next(error);
      }
    }
  };
}