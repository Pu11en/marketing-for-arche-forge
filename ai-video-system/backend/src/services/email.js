const logger = require('../utils/logger');
const { query, transaction } = require('../database/connection');
const { cache } = require('./redis');
const { queue } = require('./redis');
const { EmailProviderFactory } = require('./emailProviders');
const EmailTemplateManager = require('./emailTemplates');
const moment = require('moment-timezone');
const crypto = require('crypto');

// Email Service Class
class EmailService {
  constructor() {
    this.defaultFromEmail = process.env.DEFAULT_FROM_EMAIL || 'noreply@aivideosystem.com';
    this.defaultFromName = process.env.DEFAULT_FROM_NAME || 'AI Video System';
  }

  // Send email using template
  async sendEmail(options) {
    try {
      const {
        to,
        templateName,
        variables = {},
        language = 'en',
        from = null,
        attachments = [],
        priority = 5,
        scheduledAt = null,
        userId = null,
        metadata = {}
      } = options;

      // Get and render template
      const template = await EmailTemplateManager.getTemplate(templateName, language);
      const rendered = await EmailTemplateManager.renderTemplate(template, variables);

      // Prepare email data
      const emailData = {
        to: Array.isArray(to) ? to : [to],
        from: from || `${this.defaultFromName} <${this.defaultFromEmail}>`,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        attachments,
        metadata: {
          templateName,
          language,
          userId,
          ...metadata
        }
      };

      // Log to database
      const logResult = await query(`
        INSERT INTO email_logs (
          user_id, template_id, to_email, from_email, subject, 
          content_html, content_text, metadata, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
        RETURNING id
      `, [
        userId,
        template.id,
        emailData.to.join(','),
        emailData.from,
        emailData.subject,
        emailData.html,
        emailData.text,
        JSON.stringify(emailData.metadata)
      ]);

      const emailLogId = logResult.rows[0].id;

      // Add to queue for processing
      const queueData = {
        emailLogId,
        emailData,
        priority,
        scheduledAt,
        attempts: 0,
        maxAttempts: 3
      };

      if (scheduledAt) {
        await queue.add('scheduled_emails', queueData, { delay: scheduledAt - Date.now() });
      } else {
        await queue.add('emails', queueData);
      }

      logger.info(`Email queued for sending: ${templateName} to ${emailData.to.join(', ')}`);
      return { success: true, emailLogId };
    } catch (error) {
      logger.error('Failed to send email:', error);
      throw error;
    }
  }

  // Send email immediately (bypass queue)
  async sendEmailImmediate(options) {
    try {
      const {
        to,
        templateName,
        variables = {},
        language = 'en',
        from = null,
        attachments = [],
        userId = null,
        metadata = {}
      } = options;

      // Get and render template
      const template = await EmailTemplateManager.getTemplate(templateName, language);
      const rendered = await EmailTemplateManager.renderTemplate(template, variables);

      // Prepare email data
      const emailData = {
        to: Array.isArray(to) ? to : [to],
        from: from || `${this.defaultFromName} <${this.defaultFromEmail}>`,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        attachments,
        metadata: {
          templateName,
          language,
          userId,
          ...metadata
        }
      };

      // Get provider and send
      const provider = await EmailProviderFactory.getProviderWithFailover();
      const result = await provider.sendEmail(emailData);

      // Log to database
      await query(`
        INSERT INTO email_logs (
          user_id, template_id, provider, provider_message_id, to_email, from_email, 
          subject, content_html, content_text, status, sent_at, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, $11)
      `, [
        userId,
        template.id,
        provider.name,
        result.messageId,
        emailData.to.join(','),
        emailData.from,
        emailData.subject,
        emailData.html,
        emailData.text,
        result.success ? 'sent' : 'failed',
        JSON.stringify({ ...emailData.metadata, providerResult: result })
      ]);

      logger.info(`Email sent immediately: ${templateName} to ${emailData.to.join(', ')}`);
      return result;
    } catch (error) {
      logger.error('Failed to send email immediately:', error);
      throw error;
    }
  }

  // Process email from queue
  async processEmailFromQueue(queueData) {
    const { emailLogId, emailData, attempts, maxAttempts } = queueData;

    try {
      // Get provider and send
      const provider = await EmailProviderFactory.getProviderWithFailover();
      const result = await provider.sendEmail(emailData);

      if (result.success) {
        // Update log with success
        await query(`
          UPDATE email_logs 
          SET provider = $1, provider_message_id = $2, status = 'sent', sent_at = CURRENT_TIMESTAMP
          WHERE id = $3
        `, [provider.name, result.messageId, emailLogId]);

        logger.info(`Email sent successfully: ${emailData.subject} to ${emailData.to.join(', ')}`);
        return { success: true };
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      logger.error(`Email send attempt ${attempts + 1} failed:`, error);

      // Update log with error
      await query(`
        UPDATE email_logs 
        SET status = 'failed', error_message = $1
        WHERE id = $2
      `, [error.message, emailLogId]);

      // Retry logic
      if (attempts < maxAttempts - 1) {
        const retryDelay = Math.pow(2, attempts) * 60000; // Exponential backoff
        const nextRetryAt = new Date(Date.now() + retryDelay);

        await queue.add('emails', {
          ...queueData,
          attempts: attempts + 1,
          nextRetryAt
        }, { delay: retryDelay });

        logger.info(`Email scheduled for retry ${attempts + 2}/${maxAttempts} at ${nextRetryAt}`);
      } else {
        logger.error(`Email failed after ${maxAttempts} attempts: ${emailData.subject}`);
      }

      return { success: false, error: error.message };
    }
  }

  // Specific email type methods

  // Send verification email
  async sendVerificationEmail(user, verificationUrl) {
    return await this.sendEmail({
      to: user.email,
      templateName: 'verification',
      variables: {
        name: user.name,
        verification_url: verificationUrl
      },
      userId: user.id,
      metadata: { type: 'verification' }
    });
  }

  // Send password reset email
  async sendPasswordResetEmail(user, resetUrl) {
    return await this.sendEmail({
      to: user.email,
      templateName: 'password_reset',
      variables: {
        name: user.name,
        reset_url: resetUrl
      },
      userId: user.id,
      metadata: { type: 'password_reset' }
    });
  }

  // Send welcome email
  async sendWelcomeEmail(user) {
    return await this.sendEmail({
      to: user.email,
      templateName: 'welcome',
      variables: {
        name: user.name
      },
      userId: user.id,
      metadata: { type: 'welcome' }
    });
  }

  // Send video processing notification
  async sendVideoProcessingNotification(user, videoData) {
    return await this.sendEmail({
      to: user.email,
      templateName: 'video_processing_complete',
      variables: {
        name: user.name,
        video_title: videoData.title,
        video_url: videoData.url
      },
      userId: user.id,
      metadata: { type: 'video_notification', videoId: videoData.id }
    });
  }

  // Send subscription update email
  async sendSubscriptionUpdateEmail(user, subscriptionData) {
    return await this.sendEmail({
      to: user.email,
      templateName: 'subscription_updated',
      variables: {
        name: user.name,
        subscription_tier: subscriptionData.tier,
        next_billing_date: subscriptionData.nextBillingDate
      },
      userId: user.id,
      metadata: { type: 'subscription_update', tier: subscriptionData.tier }
    });
  }

  // Send marketing email
  async sendMarketingEmail(options) {
    const {
      recipients,
      campaignId,
      subject,
      content,
      variables = {},
      scheduledAt = null
    } = options;

    const results = [];

    for (const recipient of recipients) {
      try {
        const result = await this.sendEmail({
          to: recipient.email,
          templateName: 'marketing',
          variables: {
            ...variables,
            name: recipient.name || recipient.email.split('@')[0],
            unsubscribe_url: `${process.env.FRONTEND_URL}/unsubscribe?token=${recipient.unsubscribeToken}`
          },
          userId: recipient.userId,
          scheduledAt,
          metadata: {
            type: 'marketing',
            campaignId,
            recipientId: recipient.id
          }
        });

        results.push({ email: recipient.email, success: true, result });
      } catch (error) {
        results.push({ email: recipient.email, success: false, error: error.message });
      }
    }

    return results;
  }

  // Send batch emails
  async sendBatchEmails(emailList) {
    const results = [];

    for (const emailOptions of emailList) {
      try {
        const result = await this.sendEmail(emailOptions);
        results.push({ to: emailOptions.to, success: true, result });
      } catch (error) {
        results.push({ to: emailOptions.to, success: false, error: error.message });
      }
    }

    return results;
  }

  // Schedule email for later delivery
  async scheduleEmail(options) {
    const { scheduledAt, ...emailOptions } = options;

    if (!scheduledAt || new Date(scheduledAt) <= new Date()) {
      throw new Error('Scheduled time must be in the future');
    }

    return await this.sendEmail({
      ...emailOptions,
      scheduledAt: new Date(scheduledAt).getTime()
    });
  }

  // Get email status
  async getEmailStatus(emailLogId) {
    try {
      const result = await query(`
        SELECT * FROM email_logs WHERE id = $1
      `, [emailLogId]);

      if (result.rows.length === 0) {
        throw new Error('Email log not found');
      }

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to get email status:', error);
      throw error;
    }
  }

  // Handle webhook events from providers
  async handleWebhook(providerName, req) {
    try {
      const provider = await EmailProviderFactory.createProvider(providerName);
      const events = await provider.parseWebhook(req);

      for (const event of events) {
        await this.processWebhookEvent(event);
      }

      return { success: true, eventsProcessed: events.length };
    } catch (error) {
      logger.error('Failed to handle webhook:', error);
      throw error;
    }
  }

  // Process individual webhook event
  async processWebhookEvent(event) {
    try {
      const { messageId, email, eventType, timestamp, metadata, provider } = event;

      // Update email log based on event type
      let updateFields = {};
      let updateField = '';

      switch (eventType) {
        case 'delivered':
          updateField = 'delivered_at';
          updateFields.status = 'delivered';
          break;
        case 'open':
          updateField = 'opened_at';
          if (metadata.ip) updateFields.ip_address = metadata.ip;
          if (metadata.user_agent) updateFields.user_agent = metadata.user_agent;
          break;
        case 'click':
          updateField = 'clicked_at';
          break;
        case 'bounce':
          updateField = 'bounced_at';
          updateFields.status = 'bounced';
          updateFields.error_message = metadata.reason || 'Bounced';
          break;
        case 'complaint':
          updateField = 'complained_at';
          updateFields.status = 'complained';
          break;
        case 'unsubscribe':
          updateField = 'unsubscribed_at';
          updateFields.status = 'unsubscribed';
          await this.handleUnsubscribe(email, metadata);
          break;
        default:
          logger.warn(`Unknown webhook event type: ${eventType}`);
          return;
      }

      if (updateField) {
        updateFields[updateField] = timestamp;

        // Build dynamic update query
        const setClause = Object.keys(updateFields).map((key, index) => {
          return `${key} = $${index + 2}`;
        }).join(', ');

        const updateValues = Object.values(updateFields);

        await query(`
          UPDATE email_logs 
          SET ${setClause}
          WHERE provider_message_id = $1
        `, [messageId, ...updateValues]);
      }

      // Update analytics
      await this.updateAnalytics(provider, eventType, timestamp);

      logger.info(`Processed webhook event: ${eventType} for ${email}`);
    } catch (error) {
      logger.error('Failed to process webhook event:', error);
    }
  }

  // Handle unsubscribe
  async handleUnsubscribe(email, metadata) {
    try {
      const unsubscribeToken = crypto.randomBytes(32).toString('hex');

      await query(`
        INSERT INTO email_unsubscribes (email, token, reason, ip_address, user_agent)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (email) DO UPDATE SET
          unsubscribed_at = CURRENT_TIMESTAMP,
          reason = $3,
          ip_address = $4,
          user_agent = $5
      `, [
        email,
        unsubscribeToken,
        metadata.reason || 'Webhook unsubscribe',
        metadata.ip,
        metadata.user_agent
      ]);

      logger.info(`User unsubscribed: ${email}`);
    } catch (error) {
      logger.error('Failed to handle unsubscribe:', error);
    }
  }

  // Update email analytics
  async updateAnalytics(provider, eventType, timestamp) {
    try {
      const date = moment(timestamp).format('YYYY-MM-DD');
      const templateType = 'general'; // This would be determined from the email log

      // Check if analytics record exists for this date
      const existingResult = await query(`
        SELECT * FROM email_analytics 
        WHERE date = $1 AND provider = $2 AND template_type = $3
      `, [date, provider, templateType]);

      if (existingResult.rows.length > 0) {
        // Update existing record
        const analytics = existingResult.rows[0];
        let updateField = '';
        let incrementValue = 1;

        switch (eventType) {
          case 'delivered':
            updateField = 'total_delivered';
            break;
          case 'open':
            updateField = 'total_opened';
            break;
          case 'click':
            updateField = 'total_clicked';
            break;
          case 'bounce':
            updateField = 'total_bounced';
            break;
          case 'complaint':
            updateField = 'total_complained';
            break;
          case 'unsubscribe':
            updateField = 'total_unsubscribed';
            break;
          default:
            return;
        }

        await query(`
          UPDATE email_analytics 
          SET ${updateField} = ${updateField} + $1
          WHERE id = $2
        `, [incrementValue, analytics.id]);
      } else {
        // Create new analytics record
        await query(`
          INSERT INTO email_analytics (
            date, provider, template_type, total_sent, 
            total_delivered, total_opened, total_clicked, 
            total_bounced, total_complained, total_unsubscribed
          )
          VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, $9)
        `, [
          date,
          provider,
          templateType,
          eventType === 'delivered' ? 1 : 0,
          eventType === 'delivered' ? 1 : 0,
          eventType === 'open' ? 1 : 0,
          eventType === 'click' ? 1 : 0,
          eventType === 'bounce' ? 1 : 0,
          eventType === 'complaint' ? 1 : 0,
          eventType === 'unsubscribe' ? 1 : 0
        ]);
      }
    } catch (error) {
      logger.error('Failed to update email analytics:', error);
    }
  }

  // Get email analytics
  async getAnalytics(filters = {}) {
    try {
      const {
        startDate,
        endDate,
        provider,
        templateType,
        groupBy = 'date'
      } = filters;

      let queryStr = `
        SELECT 
          ${groupBy},
          provider,
          template_type,
          SUM(total_sent) as total_sent,
          SUM(total_delivered) as total_delivered,
          SUM(total_opened) as total_opened,
          SUM(total_clicked) as total_clicked,
          SUM(total_bounced) as total_bounced,
          SUM(total_complained) as total_complained,
          SUM(total_unsubscribed) as total_unsubscribed,
          CASE 
            WHEN SUM(total_sent) > 0 THEN 
              ROUND(SUM(total_delivered)::decimal / SUM(total_sent)::decimal, 4)
            ELSE 0 
          END as delivery_rate,
          CASE 
            WHEN SUM(total_delivered) > 0 THEN 
              ROUND(SUM(total_opened)::decimal / SUM(total_delivered)::decimal, 4)
            ELSE 0 
          END as open_rate,
          CASE 
            WHEN SUM(total_delivered) > 0 THEN 
              ROUND(SUM(total_clicked)::decimal / SUM(total_delivered)::decimal, 4)
            ELSE 0 
          END as click_rate
        FROM email_analytics
        WHERE 1=1
      `;

      let queryParams = [];
      let paramIndex = 1;

      if (startDate) {
        queryStr += ` AND date >= $${paramIndex++}`;
        queryParams.push(startDate);
      }

      if (endDate) {
        queryStr += ` AND date <= $${paramIndex++}`;
        queryParams.push(endDate);
      }

      if (provider) {
        queryStr += ` AND provider = $${paramIndex++}`;
        queryParams.push(provider);
      }

      if (templateType) {
        queryStr += ` AND template_type = $${paramIndex++}`;
        queryParams.push(templateType);
      }

      queryStr += ` GROUP BY ${groupBy}, provider, template_type ORDER BY ${groupBy} DESC`;

      const result = await query(queryStr, queryParams);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get email analytics:', error);
      throw error;
    }
  }

  // Check if user is unsubscribed
  async isUnsubscribed(email) {
    try {
      const result = await query(
        'SELECT id FROM email_unsubscribes WHERE email = $1',
        [email]
      );

      return result.rows.length > 0;
    } catch (error) {
      logger.error('Failed to check unsubscribe status:', error);
      return false;
    }
  }

  // Generate unsubscribe token
  async generateUnsubscribeToken(email) {
    try {
      const token = crypto.randomBytes(32).toString('hex');

      await query(`
        INSERT INTO email_unsubscribes (email, token)
        VALUES ($1, $2)
        ON CONFLICT (email) DO UPDATE SET
          token = $2,
          unsubscribed_at = CURRENT_TIMESTAMP
      `, [email, token]);

      return token;
    } catch (error) {
      logger.error('Failed to generate unsubscribe token:', error);
      throw error;
    }
  }
}

// Create singleton instance
const emailService = new EmailService();

module.exports = emailService;