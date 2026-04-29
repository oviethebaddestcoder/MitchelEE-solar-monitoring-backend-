import { env } from '@/config/env.js';
import { logger } from '@/utils/logger.js';


interface LoginResponse {
  back?: {
    success?: boolean;
    userId?: string;
    msg?: string;
  };
  result?: number;
  msg?: string;
  user?: {
    id: string;
  };
}

class GrowattAuth {
  private cookies: string = '';
  private userId: string | null = null;
  private tokenExpiry: number = 0;

  async login(): Promise<boolean> {
    if (this.userId && Date.now() < this.tokenExpiry) {
      logger.debug('Using cached Growatt authentication');
      return true;
    }

    try {
      logger.info('🔐 Attempting Growatt login...');
      
      // Try different server endpoints
      const servers = [
        'https://server.growatt.com',
        'https://openapi.growatt.com',
        'https://server-api.growatt.com',
      ];

      for (const server of servers) {
        logger.info(`Trying server: ${server}`);
        
        // Method 1: Standard POST with form data
        const response = await fetch(`${server}/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          body: new URLSearchParams({
            account: env.GROWATT_USERNAME,
            password: env.GROWATT_PASSWORD,
            validateCode: '',
          }).toString(),
        });

        const setCookie = response.headers.get('set-cookie');
        if (setCookie) {
          this.cookies = setCookie.split(';')[0];
        }

        const responseText = await response.text();
        logger.info(`Response status: ${response.status}`);
        logger.debug(`Response: ${responseText.substring(0, 200)}`);

        let data: LoginResponse;
        try {
          data = JSON.parse(responseText);
        } catch (e) {
          logger.warn('Failed to parse JSON response, trying next server...');
          continue;
        }

        // Check various response formats
        if (
          data.result === 1 || 
          data.back?.success === true ||
          (data.back && data.back.userId)
        ) {
          this.userId = data.back?.userId || data.user?.id || 'authenticated';
          this.tokenExpiry = Date.now() + 23 * 60 * 60 * 1000; // 23 hours
          
          logger.info(`✅ Growatt login successful! Server: ${server}`);
          logger.info(`User ID: ${this.userId}`);
          
          env.GROWATT_BASE_URL = server; // Save working server
          return true;
        }

        if (data.msg) {
          logger.error(`Login failed: ${data.msg}`);
        }
      }

      throw new Error('All login attempts failed');
    } catch (error) {
      logger.error('Growatt authentication failed:', error);
      throw error;
    }
  }

  getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      ...(this.cookies && { 'Cookie': this.cookies }),
    };
  }

  getUserId(): string | null {
    return this.userId;
  }

  clearAuth() {
    this.userId = null;
    this.cookies = '';
    this.tokenExpiry = 0;
  }
}

export const growattAuth = new GrowattAuth();