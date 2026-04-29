/**
 * Database Seeding Script
 * Creates sample data for development
 */

import { supabaseAdmin } from '../src/config/supabase.js';
import { logger } from '../src/utils/logger.js';

async function seed() {
  try {
    logger.info('Seeding database...');
    
    // Add seed data logic here
    logger.info('✅ Database seeded successfully');
    
  } catch (error) {
    logger.error('Seeding failed:', error);
    process.exit(1);
  }
}

seed();
