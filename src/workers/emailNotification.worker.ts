import { Job } from 'bullmq';
import { supabaseAdmin } from '@/config/supabase.js';
import { logger } from '@/utils/logger.js';
import { notifier } from '@/utils/notifier.js';

interface EmailNotificationJob {
  siteId: string;
  siteName: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
}

export async function processEmailNotification(job: Job<EmailNotificationJob>): Promise<void> {
  const { siteId, siteName, message, severity } = job.data;

  try {
    logger.info(`📧 Processing email notification for site: ${siteName}`);

    // Get all admin users
    const { data: admins, error } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'ADMIN');

    if (error || !admins || admins.length === 0) {
      logger.warn('⚠️ No admin users found for notifications');
      return;
    }

    logger.info(`Found ${admins.length} admin users`);

    // Get admin emails from auth.users
    const adminIds = admins.map(a => a.id);
    const { data: authData } = await supabaseAdmin.auth.admin.listUsers();
    
    const adminEmails = authData.users
      .filter(u => adminIds.includes(u.id))
      .map(u => ({
        email: u.email,
        name: admins.find(a => a.id === u.id)?.full_name || 'Admin'
      }))
      .filter((admin): admin is { email: string; name: string } => !!admin.email);

    if (adminEmails.length === 0) {
      logger.warn('⚠️ No admin email addresses found');
      return;
    }

    // Prepare email content based on severity
    const emailSubject = severity === 'critical' 
      ? `🚨 CRITICAL ALERT: ${siteName}`
      : severity === 'warning'
      ? `⚠️ WARNING: ${siteName}`
      : `ℹ️ INFO: ${siteName}`;

    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #1f2937 0%, #111827 100%); padding: 30px; border-radius: 12px 12px 0 0;">
          <h1 style="color: ${severity === 'critical' ? '#ef4444' : severity === 'warning' ? '#f59e0b' : '#10b981'}; margin: 0; font-size: 28px;">
            ${severity === 'critical' ? '🚨' : severity === 'warning' ? '⚠️' : 'ℹ️'} Solar Alert
          </h1>
        </div>
        
        <div style="background: #ffffff; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <h2 style="color: #1f2937; margin-top: 0;">Site: ${siteName}</h2>
          
          <div style="background: ${severity === 'critical' ? '#fee2e2' : severity === 'warning' ? '#fef3c7' : '#d1fae5'}; 
                      border-left: 4px solid ${severity === 'critical' ? '#ef4444' : severity === 'warning' ? '#f59e0b' : '#10b981'}; 
                      padding: 15px; 
                      margin: 20px 0; 
                      border-radius: 4px;">
            <p style="margin: 0; color: #1f2937; font-size: 16px;">
              <strong>Alert:</strong> ${message}
            </p>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; margin: 20px 0;">
            <strong>Severity:</strong> <span style="color: ${severity === 'critical' ? '#ef4444' : severity === 'warning' ? '#f59e0b' : '#10b981'}; text-transform: uppercase;">${severity}</span><br>
            <strong>Time:</strong> ${new Date().toLocaleString()}<br>
            <strong>Site ID:</strong> ${siteId}
          </p>
          
          <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin" 
             style="display: inline-block; 
                    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); 
                    color: white; 
                    padding: 12px 24px; 
                    text-decoration: none; 
                    border-radius: 8px; 
                    font-weight: bold; 
                    margin-top: 20px;">
            View Dashboard →
          </a>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            This is an automated alert from your Solar Monitoring System.<br>
            Please do not reply to this email.
          </p>
        </div>
      </div>
    `;

    // Send email to all admins
    for (const admin of adminEmails) {
      try {
        await notifier.sendEmail(
          admin.email,
          emailSubject,
          emailBody
        );
        logger.info(`✅ Email sent to ${admin.name} (${admin.email})`);
      } catch (emailError) {
        logger.error(`❌ Failed to send email to ${admin.email}:`, emailError);
      }
    }

    logger.info(`✅ Email notifications sent to ${adminEmails.length} admins`);
  } catch (error) {
    logger.error('❌ Failed to send email notification:', error);
    throw error;
  }
}