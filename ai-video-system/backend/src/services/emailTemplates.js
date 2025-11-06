const logger = require('../utils/logger');
const { query, transaction } = require('../database/connection');
const { cache } = require('./redis');
const Handlebars = require('handlebars');

// Email Template Manager
class EmailTemplateManager {
  // Get template by name and language
  static async getTemplate(name, language = 'en', version = null) {
    try {
      const cacheKey = `email_template:${name}:${language}:${version || 'latest'}`;
      let template = await cache.get(cacheKey);

      if (!template) {
        let queryStr = `
          SELECT * FROM email_templates 
          WHERE name = $1 AND language = $2 AND is_active = TRUE
        `;
        let queryParams = [name, language];

        if (version) {
          queryStr += ' AND version = $3';
          queryParams.push(version);
        } else {
          queryStr += ' ORDER BY version DESC LIMIT 1';
        }

        const result = await query(queryStr, queryParams);

        if (result.rows.length === 0) {
          // Try to get English template as fallback
          if (language !== 'en') {
            return await this.getTemplate(name, 'en', version);
          }
          throw new Error(`Email template '${name}' not found`);
        }

        template = result.rows[0];
        await cache.set(cacheKey, template, 3600); // Cache for 1 hour
      }

      return template;
    } catch (error) {
      logger.error(`Failed to get email template ${name}:`, error);
      throw error;
    }
  }

  // Render template with variables
  static async renderTemplate(template, variables = {}) {
    try {
      // Add default variables
      const defaultVars = {
        app_name: process.env.APP_NAME || 'AI Video System',
        support_email: process.env.SUPPORT_EMAIL || 'support@aivideosystem.com',
        frontend_url: process.env.FRONTEND_URL || 'http://localhost:3000',
        current_year: new Date().getFullYear()
      };

      const mergedVars = { ...defaultVars, ...variables };

      // Compile and render HTML template
      const htmlTemplate = Handlebars.compile(template.html_template);
      const renderedHtml = htmlTemplate(mergedVars);

      // Compile and render text template if available
      let renderedText = null;
      if (template.text_template) {
        const textTemplate = Handlebars.compile(template.text_template);
        renderedText = textTemplate(mergedVars);
      }

      // Compile and render subject template
      const subjectTemplate = Handlebars.compile(template.subject_template);
      const renderedSubject = subjectTemplate(mergedVars);

      return {
        html: renderedHtml,
        text: renderedText,
        subject: renderedSubject
      };
    } catch (error) {
      logger.error('Failed to render email template:', error);
      throw new Error(`Template rendering failed: ${error.message}`);
    }
  }

  // Create new template
  static async createTemplate(templateData) {
    try {
      const {
        name,
        type,
        subject_template,
        html_template,
        text_template,
        language = 'en',
        variables = [],
        metadata = {},
        created_by
      } = templateData;

      // Get latest version for this template name
      const versionResult = await query(
        'SELECT MAX(version) as max_version FROM email_templates WHERE name = $1',
        [name]
      );

      const nextVersion = (versionResult.rows[0].max_version || 0) + 1;

      // Extract variables from templates if not provided
      let extractedVariables = variables;
      if (!extractedVariables || extractedVariables.length === 0) {
        extractedVariables = this.extractVariables(subject_template, html_template, text_template);
      }

      const result = await query(`
        INSERT INTO email_templates (
          name, type, subject_template, html_template, text_template,
          language, version, variables, metadata, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        name, type, subject_template, html_template, text_template,
        language, nextVersion, JSON.stringify(extractedVariables), 
        JSON.stringify(metadata), created_by
      ]);

      const newTemplate = result.rows[0];

      // Clear cache
      await this.clearTemplateCache(name, language);

      logger.info(`Email template created: ${name} v${nextVersion}`);
      return newTemplate;
    } catch (error) {
      logger.error('Failed to create email template:', error);
      throw error;
    }
  }

  // Update template
  static async updateTemplate(id, updates) {
    try {
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (key === 'variables' || key === 'metadata') {
          updateFields.push(`${key} = $${paramIndex++}`);
          updateValues.push(JSON.stringify(value));
        } else {
          updateFields.push(`${key} = $${paramIndex++}`);
          updateValues.push(value);
        }
      }

      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      updateValues.push(id);

      const result = await query(`
        UPDATE email_templates 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `, updateValues);

      if (result.rows.length === 0) {
        throw new Error('Template not found');
      }

      const updatedTemplate = result.rows[0];

      // Clear cache
      await this.clearTemplateCache(updatedTemplate.name, updatedTemplate.language);

      logger.info(`Email template updated: ${updatedTemplate.name}`);
      return updatedTemplate;
    } catch (error) {
      logger.error('Failed to update email template:', error);
      throw error;
    }
  }

  // Delete template (soft delete by setting is_active to false)
  static async deleteTemplate(id) {
    try {
      const result = await query(`
        UPDATE email_templates 
        SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `, [id]);

      if (result.rows.length === 0) {
        throw new Error('Template not found');
      }

      const deletedTemplate = result.rows[0];

      // Clear cache
      await this.clearTemplateCache(deletedTemplate.name, deletedTemplate.language);

      logger.info(`Email template deleted: ${deletedTemplate.name}`);
      return deletedTemplate;
    } catch (error) {
      logger.error('Failed to delete email template:', error);
      throw error;
    }
  }

  // List templates with filters
  static async listTemplates(filters = {}) {
    try {
      const {
        type,
        language,
        is_active,
        page = 1,
        limit = 20
      } = filters;

      let queryStr = 'SELECT * FROM email_templates WHERE 1=1';
      let queryParams = [];
      let paramIndex = 1;

      if (type) {
        queryStr += ` AND type = $${paramIndex++}`;
        queryParams.push(type);
      }

      if (language) {
        queryStr += ` AND language = $${paramIndex++}`;
        queryParams.push(language);
      }

      if (is_active !== undefined) {
        queryStr += ` AND is_active = $${paramIndex++}`;
        queryParams.push(is_active);
      }

      queryStr += ' ORDER BY name, version DESC';

      // Add pagination
      const offset = (page - 1) * limit;
      queryStr += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      queryParams.push(limit, offset);

      const result = await query(queryStr, queryParams);

      // Get total count
      let countQueryStr = 'SELECT COUNT(*) as total FROM email_templates WHERE 1=1';
      let countParams = [];
      let countParamIndex = 1;

      if (type) {
        countQueryStr += ` AND type = $${countParamIndex++}`;
        countParams.push(type);
      }

      if (language) {
        countQueryStr += ` AND language = $${countParamIndex++}`;
        countParams.push(language);
      }

      if (is_active !== undefined) {
        countQueryStr += ` AND is_active = $${countParamIndex++}`;
        countParams.push(is_active);
      }

      const countResult = await query(countQueryStr, countParams);
      const total = parseInt(countResult.rows[0].total);

      return {
        templates: result.rows,
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
      logger.error('Failed to list email templates:', error);
      throw error;
    }
  }

  // Extract variables from template content
  static extractVariables(subjectTemplate, htmlTemplate, textTemplate) {
    const allTemplates = [subjectTemplate, htmlTemplate];
    if (textTemplate) {
      allTemplates.push(textTemplate);
    }

    const variableRegex = /\{\{([^}]+)\}\}/g;
    const variables = new Set();

    for (const template of allTemplates) {
      if (template) {
        let match;
        while ((match = variableRegex.exec(template)) !== null) {
          const variable = match[1].trim();
          // Filter out helper functions and complex expressions
          if (!variable.includes(' ') && !variable.includes('(') && !variable.includes('#')) {
            variables.add(variable);
          }
        }
      }
    }

    return Array.from(variables);
  }

  // Clear template cache
  static async clearTemplateCache(name, language) {
    try {
      // Clear all versions of this template
      const pattern = `email_template:${name}:${language}:*`;
      // Note: Redis pattern matching would require additional implementation
      // For now, we'll clear a specific key
      await cache.del(`email_template:${name}:${language}:latest`);
    } catch (error) {
      logger.error('Failed to clear template cache:', error);
    }
  }

  // Validate template syntax
  static validateTemplate(template) {
    try {
      const { subject_template, html_template, text_template } = template;

      // Try to compile each template
      if (subject_template) {
        Handlebars.compile(subject_template);
      }

      if (html_template) {
        Handlebars.compile(html_template);
      }

      if (text_template) {
        Handlebars.compile(text_template);
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  // Preview template with sample data
  static async previewTemplate(name, variables = {}, language = 'en') {
    try {
      const template = await this.getTemplate(name, language);
      const rendered = await this.renderTemplate(template, variables);

      return {
        template: {
          name: template.name,
          type: template.type,
          language: template.language,
          version: template.version
        },
        rendered,
        variables: template.variables
      };
    } catch (error) {
      logger.error('Failed to preview email template:', error);
      throw error;
    }
  }

  // Register custom Handlebars helpers
  static registerHelpers() {
    // Date formatting helper
    Handlebars.registerHelper('formatDate', function(date, format = 'YYYY-MM-DD') {
      const moment = require('moment-timezone');
      return moment(date).format(format);
    });

    // Currency formatting helper
    Handlebars.registerHelper('formatCurrency', function(amount, currency = 'USD') {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency
      }).format(amount);
    });

    // Conditional helper
    Handlebars.registerHelper('ifEquals', function(arg1, arg2, options) {
      return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
    });

    // JSON stringify helper
    Handlebars.registerHelper('json', function(obj) {
      return JSON.stringify(obj);
    });

    // URL encoding helper
    Handlebars.registerHelper('encodeUrl', function(str) {
      return encodeURIComponent(str);
    });
  }
}

// Initialize helpers
EmailTemplateManager.registerHelpers();

module.exports = EmailTemplateManager;