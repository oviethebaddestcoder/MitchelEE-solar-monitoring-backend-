import { Resend } from 'resend';
import { env } from '@/config/env.js';
import { logger } from './logger.js';

const resend = new Resend(env.RESEND_API_KEY);

class Notifier {
  private readonly from: string;

  constructor() {
    this.from = `${env.RESEND_FROM_NAME} <${env.RESEND_FROM_EMAIL}>`;
    logger.info('✅ Email transporter configured successfully');
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    const { error } = await resend.emails.send({
      from: this.from,
      to:   [to],
      subject,
      html,
    });

    if (error) {
      logger.error(`❌ Failed to send email to ${to}:`, error);
      throw new Error(error.message);
    }

    logger.info(`✅ Email sent to ${to}: ${subject}`);
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
      } catch {
        logger.error(`Failed to send critical alert to ${email}`);
      }
    }
  }
}

export const notifier = new Notifier();