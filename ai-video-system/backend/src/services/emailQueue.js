const logger = require('../utils/logger');
const { query } = require('../database/connection');
const { queue } = require('./redis');
const emailService = require('./email');

// Email Queue Processor
class EmailQueueProcessor {
  constructor() {
    this.isProcessing = false;
    this.processingInterval = null;
    this.batchSize = 10;
    this.pollInterval = 5000; // 5 seconds
  }

  // Start the queue processor
  start() {
    if (this.isProcessing) {
      logger.warn('Email queue processor is already running');
      return;
    }

    this.isProcessing = true;
    logger.info('Starting email queue processor');

    // Process immediate emails
    this.processImmediateEmails();

    // Process scheduled emails
    this.processScheduledEmails();

    // Set up interval for continuous processing
    this.processingInterval = setInterval(() => {
      this.processImmediateEmails();
      this.processScheduledEmails();
    }, this.pollInterval);
  }

  // Stop the queue processor
  stop() {
    if (!this.isProcessing) {
      logger.warn('Email queue processor is not running');
      return;
    }

    this.isProcessing = false;
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    logger.info('Email queue processor stopped');
  }

  // Process immediate emails from Redis queue
  async processImmediateEmails() {
    try {
      const emails = [];

      // Get batch of emails from queue
      for (let i = 0; i < this.batchSize; i++) {
        const emailData = await queue.getNext('emails');
        if (emailData) {
          emails.push(emailData);
        } else {
          break;
        }
      }

      if (emails.length === 0) {
        return;
      }

      logger.info(`Processing ${emails.length} immediate emails`);

      // Process each email
      for (const emailData of emails) {
        try {
          await emailService.processEmailFromQueue(emailData);
        } catch (error) {
          logger.error('Failed to process email from queue:', error);
        }
      }
    } catch (error) {
      logger.error('Error processing immediate emails:', error);
    }
  }

  // Process scheduled emails from database
  async processScheduledEmails() {
    try {
      const result = await query(`
        UPDATE email_queue 
        SET status = 'processing', last_attempt_at = CURRENT_TIMESTAMP
        WHERE id IN (
          SELECT id FROM email_queue 
          WHERE status = 'pending' 
          AND (scheduled_at IS NULL OR scheduled_at <= CURRENT_TIMESTAMP)
          ORDER BY priority ASC, created_at ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *
      `, [this.batchSize]);

      if (result.rows.length === 0) {
        return;
      }

      logger.info(`Processing ${result.rows.length} scheduled emails`);

      // Process each scheduled email
      for (const emailQueueItem of result.rows) {
        try {
          await this.processScheduledEmail(emailQueueItem);
        } catch (error) {
          logger.error('Failed to process scheduled email:', error);
        }
      }
    } catch (error) {
      logger.error('Error processing scheduled emails:', error);
    }
  }

  // Process individual scheduled email
  async processScheduledEmail(emailQueueItem) {
    try {
      const {
        id,
        user_id,
        campaign_id,
        template_id,
        provider_id,
        to_email,
        from_email,
        subject,
        content_html,
        content_text,
        variables,
        attempts,
        max_attempts
      } = emailQueueItem;

      // Prepare email data
      const emailData = {
        to: to_email.split(',').map(email => email.trim()),
        from: from_email,
        subject,
        html: content_html,
        text: content_text,
        metadata: {
          templateId: template_id,
          campaignId: campaign_id,
          userId: user_id,
          variables: variables
        }
      };

      // Process the email
      const result = await emailService.processEmailFromQueue({
        emailLogId: id,
        emailData,
        attempts,
        maxAttempts: max_attempts || 3
      });

      if (result.success) {
        // Mark as sent
        await query(`
          UPDATE email_queue 
          SET status = 'sent', sent_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [id]);
      } else {
        // Handle retry logic
        await this.handleScheduledEmailRetry(id, attempts, max_attempts || 3, result.error);
      }
    } catch (error) {
      logger.error('Error processing scheduled email item:', error);
      await this.handleScheduledEmailRetry(emailQueueItem.id, emailQueueItem.attempts, emailQueueItem.max_attempts || 3, error.message);
    }
  }

  // Handle retry logic for scheduled emails
  async handleScheduledEmailRetry(emailQueueId, attempts, maxAttempts, errorMessage) {
    try {
      if (attempts < maxAttempts - 1) {
        const retryDelay = Math.pow(2, attempts) * 60000; // Exponential backoff
        const nextRetryAt = new Date(Date.now() + retryDelay);

        await query(`
          UPDATE email_queue 
          SET status = 'pending', attempts = $1, next_retry_at = $2, error_message = $3
          WHERE id = $4
        `, [attempts + 1, nextRetryAt, errorMessage, emailQueueId]);

        logger.info(`Scheduled email ${emailQueueId} scheduled for retry ${attempts + 2}/${maxAttempts} at ${nextRetryAt}`);
      } else {
        // Mark as failed
        await query(`
          UPDATE email_queue 
          SET status = 'failed', error_message = $1
          WHERE id = $2
        `, [errorMessage, emailQueueId]);

        logger.error(`Scheduled email ${emailQueueId} failed after ${maxAttempts} attempts`);
      }
    } catch (error) {
      logger.error('Error handling scheduled email retry:', error);
    }
  }

  // Add email to queue
  async addEmailToQueue(emailOptions) {
    try {
      const {
        userId,
        campaignId,
        templateId,
        providerId,
        toEmail,
        fromEmail,
        subject,
        contentHtml,
        contentText,
        variables = {},
        priority = 5,
        scheduledAt = null,
        maxAttempts = 3
      } = emailOptions;

      const result = await query(`
        INSERT INTO email_queue (
          user_id, campaign_id, template_id, provider_id, priority,
          to_email, from_email, subject, content_html, content_text,
          variables, scheduled_at, max_attempts, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')
        RETURNING *
      `, [
        userId, campaignId, templateId, providerId, priority,
        toEmail, fromEmail, subject, contentHtml, contentText,
        JSON.stringify(variables), scheduledAt, maxAttempts
      ]);

      logger.info(`Email added to queue: ${subject} to ${toEmail}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to add email to queue:', error);
      throw error;
    }
  }

  // Add batch emails to queue
  async addBatchEmailsToQueue(emailList) {
    try {
      const results = [];

      for (const emailOptions of emailList) {
        try {
          const result = await this.addEmailToQueue(emailOptions);
          results.push({ success: true, emailId: result.id, to: emailOptions.toEmail });
        } catch (error) {
          results.push({ success: false, error: error.message, to: emailOptions.toEmail });
        }
      }

      return results;
    } catch (error) {
      logger.error('Failed to add batch emails to queue:', error);
      throw error;
    }
  }

  // Get queue statistics
  async getQueueStats() {
    try {
      const result = await query(`
        SELECT 
          status,
          COUNT(*) as count,
          MIN(created_at) as oldest_created_at,
          MAX(created_at) as newest_created_at
        FROM email_queue
        GROUP BY status
        ORDER BY status
      `);

      const stats = {};
      for (const row of result.rows) {
        stats[row.status] = {
          count: parseInt(row.count),
          oldestCreatedAt: row.oldest_created_at,
          newestCreatedAt: row.newest_created_at
        };
      }

      // Get Redis queue size
      const redisQueueSize = await queue.getSize('emails');

      return {
        database: stats,
        redis: {
          immediateQueueSize: redisQueueSize
        }
      };
    } catch (error) {
      logger.error('Failed to get queue stats:', error);
      throw error;
    }
  }

  // Get queue items with pagination
  async getQueueItems(filters = {}) {
    try {
      const {
        status,
        priority,
        page = 1,
        limit = 20
      } = filters;

      let queryStr = 'SELECT * FROM email_queue WHERE 1=1';
      let queryParams = [];
      let paramIndex = 1;

      if (status) {
        queryStr += ` AND status = $${paramIndex++}`;
        queryParams.push(status);
      }

      if (priority) {
        queryStr += ` AND priority = $${paramIndex++}`;
        queryParams.push(priority);
      }

      queryStr += ' ORDER BY priority ASC, created_at DESC';

      // Add pagination
      const offset = (page - 1) * limit;
      queryStr += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      queryParams.push(limit, offset);

      const result = await query(queryStr, queryParams);

      // Get total count
      let countQueryStr = 'SELECT COUNT(*) as total FROM email_queue WHERE 1=1';
      let countParams = [];
      let countParamIndex = 1;

      if (status) {
        countQueryStr += ` AND status = $${countParamIndex++}`;
        countParams.push(status);
      }

      if (priority) {
        countQueryStr += ` AND priority = $${countParamIndex++}`;
        countParams.push(priority);
      }

      const countResult = await query(countQueryStr, countParams);
      const total = parseInt(countResult.rows[0].total);

      return {
        items: result.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      logger.error('Failed to get queue items:', error);
      throw error;
    }
  }

  // Cancel queued email
  async cancelQueuedEmail(emailQueueId) {
    try {
      const result = await query(`
        UPDATE email_queue 
        SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status IN ('pending', 'processing')
        RETURNING *
      `, [emailQueueId]);

      if (result.rows.length === 0) {
        throw new Error('Email not found or cannot be cancelled');
      }

      logger.info(`Cancelled queued email: ${emailQueueId}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to cancel queued email:', error);
      throw error;
    }
  }

  // Retry failed email
  async retryFailedEmail(emailQueueId) {
    try {
      const result = await query(`
        UPDATE email_queue 
        SET status = 'pending', attempts = 0, next_retry_at = NULL, 
            error_message = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'failed'
        RETURNING *
      `, [emailQueueId]);

      if (result.rows.length === 0) {
        throw new Error('Failed email not found');
      }

      logger.info(`Retrying failed email: ${emailQueueId}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Failed to retry failed email:', error);
      throw error;
    }
  }

  // Clean up old processed emails
  async cleanupOldProcessedEmails(daysOld = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await query(`
        DELETE FROM email_queue 
        WHERE status IN ('sent', 'failed', 'cancelled') 
        AND updated_at < $1
        RETURNING id
      `, [cutoffDate]);

      logger.info(`Cleaned up ${result.rows.length} old processed emails`);
      return result.rows.length;
    } catch (error) {
      logger.error('Failed to cleanup old processed emails:', error);
      throw error;
    }
  }
}

// Create singleton instance
const emailQueueProcessor = new EmailQueueProcessor();

module.exports = emailQueueProcessor;