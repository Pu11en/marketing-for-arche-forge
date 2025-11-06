const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { catchAsync, ValidationError, NotFoundError, ForbiddenError } = require('../middleware/errorHandler');
const { createRateLimit } = require('../middleware/auth');
const { cache } = require('../services/redis');
const logger = require('../utils/logger');
const emailService = require('../services/email');
const EmailTemplateManager = require('../services/emailTemplates');
const emailQueueProcessor = require('../services/emailQueue');
const { EmailProviderFactory } = require('../services/emailProviders');

const router = express.Router();

// Rate limiting for email operations
const emailRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // limit each user to 100 emails per hour
  message: 'Too many emails sent, please try again later.'
});

// Rate limiting for template operations
const templateRateLimit = createRateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // limit each user to 20 template operations per hour
  message: 'Too many template operations, please try again later.'
});

// Send email endpoint
router.post('/send', emailRateLimit, [
  body('to').isArray({ min: 1 }).withMessage('Recipients array is required'),
  body('to.*').isEmail().withMessage('Valid email addresses are required'),
  body('templateName').notEmpty().withMessage('Template name is required'),
  body('variables').optional().isObject().withMessage('Variables must be an object'),
  body('language').optional().isString().withMessage('Language must be a string'),
  body('scheduledAt').optional().isISO8601().withMessage('Scheduled date must be valid ISO 8601')
], catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const {
    to,
    templateName,
    variables = {},
    language = 'en',
    scheduledAt = null,
    attachments = []
  } = req.body;

  // Check if any recipients are unsubscribed
  const unsubscribedEmails = [];
  for (const email of to) {
    const isUnsubscribed = await emailService.isUnsubscribed(email);
    if (isUnsubscribed) {
      unsubscribedEmails.push(email);
    }
  }

  if (unsubscribedEmails.length > 0) {
    throw new ValidationError(`The following emails are unsubscribed: ${unsubscribedEmails.join(', ')}`);
  }

  // Send email
  const result = await emailService.sendEmail({
    to,
    templateName,
    variables,
    language,
    attachments,
    scheduledAt: scheduledAt ? new Date(scheduledAt).getTime() : null,
    userId: req.user.id
  });

  res.json({
    status: 'success',
    message: 'Email sent successfully',
    data: {
      emailLogId: result.emailLogId,
      recipients: to,
      templateName,
      scheduledAt
    }
  });
}));

// Send immediate email endpoint
router.post('/send-immediate', emailRateLimit, [
  body('to').isArray({ min: 1 }).withMessage('Recipients array is required'),
  body('to.*').isEmail().withMessage('Valid email addresses are required'),
  body('templateName').notEmpty().withMessage('Template name is required'),
  body('variables').optional().isObject().withMessage('Variables must be an object'),
  body('language').optional().isString().withMessage('Language must be a string')
], catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const {
    to,
    templateName,
    variables = {},
    language = 'en'
  } = req.body;

  // Check if any recipients are unsubscribed
  const unsubscribedEmails = [];
  for (const email of to) {
    const isUnsubscribed = await emailService.isUnsubscribed(email);
    if (isUnsubscribed) {
      unsubscribedEmails.push(email);
    }
  }

  if (unsubscribedEmails.length > 0) {
    throw new ValidationError(`The following emails are unsubscribed: ${unsubscribedEmails.join(', ')}`);
  }

  // Send email immediately
  const result = await emailService.sendEmailImmediate({
    to,
    templateName,
    variables,
    language,
    userId: req.user.id
  });

  res.json({
    status: 'success',
    message: 'Email sent immediately',
    data: {
      success: result.success,
      messageId: result.messageId,
      provider: result.provider,
      recipients: to,
      templateName
    }
  });
}));

// Get email status
router.get('/status/:emailLogId', catchAsync(async (req, res) => {
  const { emailLogId } = req.params;

  const emailStatus = await emailService.getEmailStatus(emailLogId);

  res.json({
    status: 'success',
    data: {
      email: emailStatus
    }
  });
}));

// Get email analytics
router.get('/analytics', [
  query('startDate').optional().isISO8601().withMessage('Start date must be valid ISO 8601'),
  query('endDate').optional().isISO8601().withMessage('End date must be valid ISO 8601'),
  query('provider').optional().isString().withMessage('Provider must be a string'),
  query('templateType').optional().isString().withMessage('Template type must be a string'),
  query('groupBy').optional().isIn(['date', 'provider', 'template_type']).withMessage('Invalid groupBy parameter')
], catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const {
    startDate,
    endDate,
    provider,
    templateType,
    groupBy = 'date'
  } = req.query;

  const analytics = await emailService.getAnalytics({
    startDate,
    endDate,
    provider,
    templateType,
    groupBy
  });

  res.json({
    status: 'success',
    data: {
      analytics
    }
  });
}));

// Template management endpoints

// List templates
router.get('/templates', [
  query('type').optional().isString().withMessage('Type must be a string'),
  query('language').optional().isString().withMessage('Language must be a string'),
  query('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
], catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const {
    type,
    language,
    isActive,
    page = 1,
    limit = 20
  } = req.query;

  const templates = await EmailTemplateManager.listTemplates({
    type,
    language,
    is_active: isActive !== undefined ? isActive === 'true' : undefined,
    page: parseInt(page),
    limit: parseInt(limit)
  });

  res.json({
    status: 'success',
    data: templates
  });
}));

// Get template by name
router.get('/templates/:name', [
  query('language').optional().isString().withMessage('Language must be a string'),
  query('version').optional().isInt({ min: 1 }).withMessage('Version must be a positive integer')
], catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { name } = req.params;
  const { language = 'en', version } = req.query;

  const template = await EmailTemplateManager.getTemplate(
    name,
    language,
    version ? parseInt(version) : null
  );

  res.json({
    status: 'success',
    data: {
      template
    }
  });
}));

// Create template
router.post('/templates', templateRateLimit, [
  body('name').notEmpty().withMessage('Template name is required'),
  body('type').notEmpty().withMessage('Template type is required'),
  body('subject_template').notEmpty().withMessage('Subject template is required'),
  body('html_template').notEmpty().withMessage('HTML template is required'),
  body('text_template').optional().isString().withMessage('Text template must be a string'),
  body('language').optional().isString().withMessage('Language must be a string'),
  body('variables').optional().isArray().withMessage('Variables must be an array'),
  body('metadata').optional().isObject().withMessage('Metadata must be an object')
], catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const templateData = {
    ...req.body,
    created_by: req.user.id
  };

  // Validate template syntax
  const validation = EmailTemplateManager.validateTemplate(templateData);
  if (!validation.valid) {
    throw new ValidationError(`Template validation failed: ${validation.error}`);
  }

  const template = await EmailTemplateManager.createTemplate(templateData);

  res.status(201).json({
    status: 'success',
    message: 'Template created successfully',
    data: {
      template
    }
  });
}));

// Update template
router.put('/templates/:id', templateRateLimit, [
  body('subject_template').optional().isString().withMessage('Subject template must be a string'),
  body('html_template').optional().isString().withMessage('HTML template must be a string'),
  body('text_template').optional().isString().withMessage('Text template must be a string'),
  body('variables').optional().isArray().withMessage('Variables must be an array'),
  body('metadata').optional().isObject().withMessage('Metadata must be an object')
], catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { id } = req.params;

  // Get current template for validation
  const currentTemplate = await EmailTemplateManager.getTemplateById(id);
  if (!currentTemplate) {
    throw new NotFoundError('Template');
  }

  // Validate updated template syntax
  const updatedTemplate = { ...currentTemplate, ...req.body };
  const validation = EmailTemplateManager.validateTemplate(updatedTemplate);
  if (!validation.valid) {
    throw new ValidationError(`Template validation failed: ${validation.error}`);
  }

  const template = await EmailTemplateManager.updateTemplate(id, req.body);

  res.json({
    status: 'success',
    message: 'Template updated successfully',
    data: {
      template
    }
  });
}));

// Delete template
router.delete('/templates/:id', templateRateLimit, catchAsync(async (req, res) => {
  const { id } = req.params;

  const template = await EmailTemplateManager.deleteTemplate(id);

  res.json({
    status: 'success',
    message: 'Template deleted successfully',
    data: {
      template
    }
  });
}));

// Preview template
router.post('/templates/:name/preview', [
  body('variables').optional().isObject().withMessage('Variables must be an object'),
  body('language').optional().isString().withMessage('Language must be a string')
], catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { name } = req.params;
  const { variables = {}, language = 'en' } = req.body;

  const preview = await EmailTemplateManager.previewTemplate(name, variables, language);

  res.json({
    status: 'success',
    data: {
      preview
    }
  });
}));

// Queue management endpoints

// Get queue statistics
router.get('/queue/stats', catchAsync(async (req, res) => {
  const stats = await emailQueueProcessor.getQueueStats();

  res.json({
    status: 'success',
    data: {
      stats
    }
  });
}));

// Get queue items
router.get('/queue/items', [
  query('status').optional().isString().withMessage('Status must be a string'),
  query('priority').optional().isInt({ min: 1, max: 10 }).withMessage('Priority must be between 1 and 10'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
], catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const {
    status,
    priority,
    page = 1,
    limit = 20
  } = req.query;

  const queueItems = await emailQueueProcessor.getQueueItems({
    status,
    priority: priority ? parseInt(priority) : undefined,
    page: parseInt(page),
    limit: parseInt(limit)
  });

  res.json({
    status: 'success',
    data: queueItems
  });
}));

// Cancel queued email
router.post('/queue/:emailQueueId/cancel', catchAsync(async (req, res) => {
  const { emailQueueId } = req.params;

  const queuedEmail = await emailQueueProcessor.cancelQueuedEmail(emailQueueId);

  res.json({
    status: 'success',
    message: 'Queued email cancelled successfully',
    data: {
      queuedEmail
    }
  });
}));

// Retry failed email
router.post('/queue/:emailQueueId/retry', catchAsync(async (req, res) => {
  const { emailQueueId } = req.params;

  const queuedEmail = await emailQueueProcessor.retryFailedEmail(emailQueueId);

  res.json({
    status: 'success',
    message: 'Failed email queued for retry',
    data: {
      queuedEmail
    }
  });
}));

// Provider management endpoints

// Get active providers
router.get('/providers', catchAsync(async (req, res) => {
  const providers = await EmailProviderFactory.getActiveProviders();

  res.json({
    status: 'success',
    data: {
      providers
    }
  });
}));

// Webhook endpoints for providers

// SendGrid webhook
router.post('/webhooks/sendgrid', express.raw({ type: 'application/json' }), catchAsync(async (req, res) => {
  const result = await emailService.handleWebhook('sendgrid', req);

  res.json({ received: true, ...result });
}));

// AWS SES webhook
router.post('/webhooks/ses', express.json(), catchAsync(async (req, res) => {
  const result = await emailService.handleWebhook('ses', req);

  res.json({ received: true, ...result });
}));

// Mailgun webhook
router.post('/webhooks/mailgun', express.json(), catchAsync(async (req, res) => {
  const result = await emailService.handleWebhook('mailgun', req);

  res.json({ received: true, ...result });
}));

// Unsubscribe endpoint
router.post('/unsubscribe', [
  body('token').notEmpty().withMessage('Unsubscribe token is required')
], catchAsync(async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', errors.array());
  }

  const { token } = req.body;

  // Find unsubscribe record
  const result = await query(`
    SELECT * FROM email_unsubscribes WHERE token = $1
  `, [token]);

  if (result.rows.length === 0) {
    throw new NotFoundError('Unsubscribe token');
  }

  const unsubscribeRecord = result.rows[0];

  // Update unsubscribe record with additional info
  await query(`
    UPDATE email_unsubscribes 
    SET ip_address = $1, user_agent = $2
    WHERE id = $3
  `, [req.ip, req.get('User-Agent'), unsubscribeRecord.id]);

  res.json({
    status: 'success',
    message: 'Successfully unsubscribed',
    data: {
      email: unsubscribeRecord.email
    }
  });
}));

// Get unsubscribe status
router.get('/unsubscribe/status/:email', catchAsync(async (req, res) => {
  const { email } = req.params;

  const isUnsubscribed = await emailService.isUnsubscribed(email);

  res.json({
    status: 'success',
    data: {
      email,
      isUnsubscribed
    }
  });
}));

module.exports = router;