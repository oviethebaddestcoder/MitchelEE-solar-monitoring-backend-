import nodemailer from 'nodemailer';
import { env } from '@/config/env.js';
import { logger } from './logger.js';

class Notifier {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    this.setupTransporter();
  }

  private setupTransporter() {
    // Check if email credentials are configured
    if (!env.SMTP_HOST || !env.SMTP_USER) {
      logger.warn('⚠️ SMTP not configured. Email notifications will not be sent.');
      logger.warn('⚠️ Please set SMTP_HOST, SMTP_USER in .env file');
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT || 587,
        secure: env.SMTP_SECURE || false,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      });

      logger.info('✅ Email transporter configured successfully');
    } catch (error) {
      logger.error('❌ Failed to setup email transporter:', error);
    }
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    if (!this.transporter) {
      logger.warn(`⚠️ Email not sent (SMTP not configured): ${subject}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: env.SMTP_FROM || env.SMTP_USER,
        to,
        subject,
        html,
      });

      logger.info(`✅ Email sent to ${to}: ${subject}`);
    } catch (error) {
      logger.error(`❌ Failed to send email to ${to}:`, error);
      throw error;
    }
  }

  async sendCriticalAlert(emails: string[], message: string): Promise<void> {
    const subject = '🚨 CRITICAL: Solar System Alert';
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #ef4444;">Critical Alert</h2>
        <p>${message}</p>
        <p style="color: #6b7280; font-size: 14px;">
          Time: ${new Date().toLocaleString()}
        </p>
      </div>
    `;

    for (const email of emails) {
      try {
        await this.sendEmail(email, subject, html);
      } catch (error) {
        logger.error(`Failed to send critical alert to ${email}`);
      }
    }
  }
}

export const notifier = new Notifier();