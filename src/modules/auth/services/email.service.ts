
import { Resend } from 'resend';
import { env } from '@/config/env.js';

const resend = new Resend(env.RESEND_API_KEY);

interface SendInvitationEmailParams {
  to: string;
  fullName: string;
  inviteLink: string;
  invitedBy: string;
  expiresIn: string;
}

export class EmailService {
  private readonly fromEmail: string;

  constructor() {
    this.fromEmail = `${env.RESEND_FROM_NAME} <${env.RESEND_FROM_EMAIL}>`;
  }

  async sendInvitationEmail(params: SendInvitationEmailParams): Promise<void> {
    const { to, fullName, inviteLink, invitedBy, expiresIn } = params;

    const { data, error } = await resend.emails.send({
      from: this.fromEmail,
      to: [to],
      subject: `You've been invited to join ${env.RESEND_FROM_NAME}`,
      html: this.getInvitationTemplate({
        fullName,
        inviteLink,
        invitedBy,
        expiresIn,
      }),
      // Add tags for analytics
      tags: [
        { name: 'email_type', value: 'invitation' },
        { name: 'recipient_role', value: 'engineer' },
      ],
    });

    if (error) {
      console.error('❌ Failed to send invitation email:', error);
      throw new Error(`Failed to send email: ${error.message}`);
    }

    console.log('✅ Invitation email sent:', data?.id);
  }

  private getInvitationTemplate(params: {
    fullName: string;
    inviteLink: string;
    invitedBy: string;
    expiresIn: string;
  }): string {
    const { fullName, inviteLink, invitedBy, expiresIn } = params;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Invited!</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f4f4f5;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 40px 30px;
      text-align: center;
    }
    .header h1 {
      color: #ffffff;
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .content {
      padding: 40px 30px;
    }
    .greeting {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 20px;
      color: #1f2937;
    }
    .message {
      color: #4b5563;
      margin-bottom: 30px;
      font-size: 16px;
    }
    .button-container {
      text-align: center;
      margin: 30px 0;
    }
    .button {
      display: inline-block;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #ffffff !important;
      text-decoration: none;
      padding: 16px 32px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 16px;
      transition: transform 0.2s;
    }
    .button:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px -10px rgba(102, 126, 234, 0.5);
    }
    .info-box {
      background-color: #f9fafb;
      border-left: 4px solid #667eea;
      padding: 20px;
      margin: 30px 0;
      border-radius: 0 6px 6px 0;
    }
    .info-box h3 {
      margin: 0 0 10px 0;
      color: #374151;
      font-size: 16px;
    }
    .info-box p {
      margin: 0;
      color: #6b7280;
      font-size: 14px;
    }
    .footer {
      background-color: #f9fafb;
      padding: 30px;
      text-align: center;
      border-top: 1px solid #e5e7eb;
    }
    .footer p {
      margin: 0;
      color: #9ca3af;
      font-size: 14px;
    }
    .link-fallback {
      word-break: break-all;
      color: #667eea;
      font-size: 14px;
      margin-top: 20px;
    }
    .expires {
      color: #ef4444;
      font-weight: 600;
      font-size: 14px;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚀 You're Invited!</h1>
    </div>
    
    <div class="content">
      <div class="greeting">Hello ${fullName},</div>
      
      <div class="message">
        <strong>${invitedBy}</strong> has invited you to join <strong>${env.RESEND_FROM_NAME}</strong> as an engineer. 
        Click the button below to complete your registration and set up your account.
      </div>
      
      <div class="button-container">
        <a href="${inviteLink}" class="button">Complete Registration</a>
      </div>
      
      <div class="info-box">
        <h3>🔒 What happens next?</h3>
        <p>You'll be asked to create a secure password for your account. Once completed, you'll have immediate access to the platform.</p>
      </div>
      
      <p class="expires">⏰ This invitation expires in ${expiresIn}</p>
      
      <div class="link-fallback">
        <p style="color: #6b7280; font-size: 12px; margin-bottom: 5px;">
          If the button doesn't work, copy and paste this link:
        </p>
        <a href="${inviteLink}" style="color: #667eea;">${inviteLink}</a>
      </div>
    </div>
    
    <div class="footer">
      <p>If you didn't expect this invitation, you can safely ignore this email.</p>
      <p style="margin-top: 10px; font-size: 12px;">${env.RESEND_FROM_NAME} © ${new Date().getFullYear()}</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  // Optional: Send notification to admin when invitation is accepted
  async sendInvitationAcceptedNotification(adminEmail: string, engineerName: string): Promise<void> {
    const { error } = await resend.emails.send({
      from: this.fromEmail,
      to: [adminEmail],
      subject: 'Invitation Accepted',
      html: `
        <p>Hello,</p>
        <p><strong>${engineerName}</strong> has accepted your invitation and completed their registration.</p>
        <p>They can now access the platform.</p>
      `,
      tags: [{ name: 'email_type', value: 'notification' }],
    });

    if (error) {
      console.error('❌ Failed to send notification:', error);
    }
  }
}

export const emailService = new EmailService();