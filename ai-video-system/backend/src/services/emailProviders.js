const logger = require('../utils/logger');
const { query } = require('../database/connection');
const { cache } = require('./redis');

// Base Email Provider Class
class BaseEmailProvider {
  constructor(config) {
    this.config = config;
    this.name = this.constructor.name;
  }

  async sendEmail(emailData) {
    throw new Error('sendEmail method must be implemented by subclass');
  }

  async validateConfig() {
    throw new Error('validateConfig method must be implemented by subclass');
  }

  async getDeliveryStatus(messageId) {
    throw new Error('getDeliveryStatus method must be implemented by subclass');
  }

  async parseWebhook(req) {
    throw new Error('parseWebhook method must be implemented by subclass');
  }
}

// SendGrid Provider
class SendGridProvider extends BaseEmailProvider {
  constructor(config) {
    super(config);
    this.sgMail = require('@sendgrid/mail');
    this.sgMail.setApiKey(config.api_key);
  }

  async validateConfig() {
    try {
      if (!this.config.api_key) {
        throw new Error('SendGrid API key is required');
      }
      return true;
    } catch (error) {
      logger.error('SendGrid config validation failed:', error);
      return false;
    }
  }

  async sendEmail(emailData) {
    try {
      const { to, from, subject, html, text, attachments, metadata } = emailData;
      
      const msg = {
        to: Array.isArray(to) ? to : [to],
        from: from || this.config.from_email,
        subject,
        html,
        text,
        attachments,
        customArgs: metadata || {}
      };

      const result = await this.sgMail.send(msg);
      
      return {
        success: true,
        messageId: result[0]?.headers?.['x-message-id'] || result[0]?.id,
        provider: 'sendgrid',
        response: result
      };
    } catch (error) {
      logger.error('SendGrid email send failed:', error);
      return {
        success: false,
        error: error.message,
        provider: 'sendgrid'
      };
    }
  }

  async getDeliveryStatus(messageId) {
    // Implementation would query SendGrid API for message status
    // This is a placeholder for the actual implementation
    return {
      messageId,
      status: 'delivered',
      provider: 'sendgrid'
    };
  }

  async parseWebhook(req) {
    const events = req.body || [];
    const parsedEvents = [];

    for (const event of events) {
      parsedEvents.push({
        messageId: event.sg_message_id,
        email: event.email,
        event: event.event, // delivered, open, click, bounce, etc.
        timestamp: new Date(event.timestamp * 1000),
        metadata: event,
        provider: 'sendgrid'
      });
    }

    return parsedEvents;
  }
}

// AWS SES Provider
class SESProvider extends BaseEmailProvider {
  constructor(config) {
    super(config);
    this.AWS = require('aws-sdk');
    this.ses = new this.AWS.SES({
      accessKeyId: config.access_key_id,
      secretAccessKey: config.secret_access_key,
      region: config.region || 'us-east-1'
    });
  }

  async validateConfig() {
    try {
      if (!this.config.access_key_id || !this.config.secret_access_key) {
        throw new Error('AWS SES credentials are required');
      }
      return true;
    } catch (error) {
      logger.error('AWS SES config validation failed:', error);
      return false;
    }
  }

  async sendEmail(emailData) {
    try {
      const { to, from, subject, html, text, attachments, metadata } = emailData;
      
      const params = {
        Source: from || this.config.from_email,
        Destination: {
          ToAddresses: Array.isArray(to) ? to : [to]
        },
        Message: {
          Subject: { Data: subject },
          Body: {
            Html: html ? { Data: html } : undefined,
            Text: text ? { Data: text } : undefined
          }
        }
      };

      // Add attachments if present
      if (attachments && attachments.length > 0) {
        // SES attachment handling would require raw email format
        // This is a simplified implementation
      }

      const result = await this.ses.sendEmail(params).promise();
      
      return {
        success: true,
        messageId: result.MessageId,
        provider: 'ses',
        response: result
      };
    } catch (error) {
      logger.error('AWS SES email send failed:', error);
      return {
        success: false,
        error: error.message,
        provider: 'ses'
      };
    }
  }

  async getDeliveryStatus(messageId) {
    try {
      const params = {
        MessageId: messageId
      };
      
      const result = await this.ses.getSendStatistics(params).promise();
      
      return {
        messageId,
        status: 'delivered',
        provider: 'ses',
        statistics: result
      };
    } catch (error) {
      logger.error('AWS SES status check failed:', error);
      return {
        messageId,
        status: 'unknown',
        provider: 'ses',
        error: error.message
      };
    }
  }

  async parseWebhook(req) {
    // SES webhooks come through SNS, which requires special parsing
    // This is a placeholder for the actual implementation
    const events = [];
    
    if (req.body.Type === 'Notification') {
      const message = JSON.parse(req.body.Message);
      events.push({
        messageId: message.mail?.messageId,
        email: message.mail?.destination?.[0],
        event: message.notificationType,
        timestamp: new Date(),
        metadata: message,
        provider: 'ses'
      });
    }

    return events;
  }
}

// Mailgun Provider
class MailgunProvider extends BaseEmailProvider {
  constructor(config) {
    super(config);
    this.mailgun = require('mailgun-js')({
      apiKey: config.api_key,
      domain: config.domain
    });
  }

  async validateConfig() {
    try {
      if (!this.config.api_key || !this.config.domain) {
        throw new Error('Mailgun API key and domain are required');
      }
      return true;
    } catch (error) {
      logger.error('Mailgun config validation failed:', error);
      return false;
    }
  }

  async sendEmail(emailData) {
    try {
      const { to, from, subject, html, text, attachments, metadata } = emailData;
      
      const data = {
        to: Array.isArray(to) ? to.join(',') : to,
        from: from || this.config.from_email,
        subject,
        html,
        text,
        'h:X-Mailgun-Variables': JSON.stringify(metadata || {})
      };

      // Add attachments if present
      if (attachments && attachments.length > 0) {
        data.attachment = attachments;
      }

      const result = await this.mailgun.messages().send(data);
      
      return {
        success: true,
        messageId: result.id,
        provider: 'mailgun',
        response: result
      };
    } catch (error) {
      logger.error('Mailgun email send failed:', error);
      return {
        success: false,
        error: error.message,
        provider: 'mailgun'
      };
    }
  }

  async getDeliveryStatus(messageId) {
    try {
      const result = await this.mailgun.events().get({
        'message-id': messageId
      });
      
      const events = result.body.items;
      if (events.length > 0) {
        return {
          messageId,
          status: events[0].event,
          provider: 'mailgun',
          events: events
        };
      }
      
      return {
        messageId,
        status: 'unknown',
        provider: 'mailgun'
      };
    } catch (error) {
      logger.error('Mailgun status check failed:', error);
      return {
        messageId,
        status: 'unknown',
        provider: 'mailgun',
        error: error.message
      };
    }
  }

  async parseWebhook(req) {
    const events = req.body || [];
    const parsedEvents = [];

    for (const event of events) {
      parsedEvents.push({
        messageId: event['message-id'],
        email: event.recipient,
        event: event.event, // delivered, opened, clicked, bounced, etc.
        timestamp: new Date(event.timestamp * 1000),
        metadata: event,
        provider: 'mailgun'
      });
    }

    return parsedEvents;
  }
}

// Email Provider Factory
class EmailProviderFactory {
  static async createProvider(providerName) {
    try {
      // Get provider configuration from database
      const cacheKey = `email_provider:${providerName}`;
      let providerConfig = await cache.get(cacheKey);

      if (!providerConfig) {
        const result = await query(
          'SELECT * FROM email_providers WHERE name = $1 AND is_active = TRUE',
          [providerName]
        );

        if (result.rows.length === 0) {
          throw new Error(`Email provider ${providerName} not found or inactive`);
        }

        providerConfig = result.rows[0];
        await cache.set(cacheKey, providerConfig, 3600); // Cache for 1 hour
      }

      // Decrypt API key if present
      if (providerConfig.api_key_encrypted) {
        providerConfig.config.api_key = await this.decryptApiKey(providerConfig.api_key_encrypted);
      }

      // Create provider instance based on type
      switch (providerName) {
        case 'sendgrid':
          return new SendGridProvider(providerConfig.config);
        case 'ses':
          return new SESProvider(providerConfig.config);
        case 'mailgun':
          return new MailgunProvider(providerConfig.config);
        default:
          throw new Error(`Unsupported email provider: ${providerName}`);
      }
    } catch (error) {
      logger.error(`Failed to create email provider ${providerName}:`, error);
      throw error;
    }
  }

  static async decryptApiKey(encryptedKey) {
    // Implementation would use proper encryption/decryption
    // This is a placeholder for the actual implementation
    const crypto = require('crypto');
    const algorithm = 'aes-256-cbc';
    const key = process.env.EMAIL_ENCRYPTION_KEY || 'default-key-change-in-production';
    const iv = crypto.createHash('sha256').update(key).digest().slice(0, 16);
    
    try {
      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      let decrypted = decipher.update(encryptedKey, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      logger.error('Failed to decrypt API key:', error);
      throw new Error('Failed to decrypt API key');
    }
  }

  static async getActiveProviders() {
    try {
      const cacheKey = 'active_email_providers';
      let providers = await cache.get(cacheKey);

      if (!providers) {
        const result = await query(
          'SELECT name FROM email_providers WHERE is_active = TRUE ORDER BY priority ASC'
        );

        providers = result.rows.map(row => row.name);
        await cache.set(cacheKey, providers, 3600); // Cache for 1 hour
      }

      return providers;
    } catch (error) {
      logger.error('Failed to get active email providers:', error);
      return ['sendgrid']; // Fallback to default
    }
  }

  static async getProviderWithFailover() {
    const activeProviders = await this.getActiveProviders();
    
    for (const providerName of activeProviders) {
      try {
        const provider = await this.createProvider(providerName);
        const isValid = await provider.validateConfig();
        
        if (isValid) {
          return provider;
        }
      } catch (error) {
        logger.warn(`Provider ${providerName} failed validation:`, error);
        continue;
      }
    }
    
    throw new Error('No valid email providers available');
  }
}

module.exports = {
  BaseEmailProvider,
  SendGridProvider,
  SESProvider,
  MailgunProvider,
  EmailProviderFactory
};