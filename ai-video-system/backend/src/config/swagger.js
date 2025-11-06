const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AI Video Creation System API',
      version: '1.0.0',
      description: 'Backend API for AI Video Creation System',
      contact: {
        name: 'API Support',
        email: 'support@aivideosystem.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: process.env.BASE_URL || 'http://localhost:3001',
        description: 'Development server'
      },
      {
        url: 'https://api.aivideosystem.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'User ID'
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email'
            },
            name: {
              type: 'string',
              description: 'User name'
            },
            avatar_url: {
              type: 'string',
              format: 'uri',
              description: 'Avatar URL'
            },
            subscription_tier: {
              type: 'string',
              enum: ['free', 'basic', 'pro', 'enterprise'],
              description: 'Subscription tier'
            },
            credits_remaining: {
              type: 'integer',
              description: 'Remaining credits'
            },
            is_verified: {
              type: 'boolean',
              description: 'Email verification status'
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Account creation date'
            }
          }
        },
        Project: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Project ID'
            },
            title: {
              type: 'string',
              description: 'Project title'
            },
            description: {
              type: 'string',
              description: 'Project description'
            },
            thumbnail_url: {
              type: 'string',
              format: 'uri',
              description: 'Thumbnail URL'
            },
            status: {
              type: 'string',
              enum: ['draft', 'processing', 'completed', 'failed', 'archived'],
              description: 'Project status'
            },
            settings: {
              type: 'object',
              description: 'Project settings'
            },
            metadata: {
              type: 'object',
              description: 'Project metadata'
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Project creation date'
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
              description: 'Project last update date'
            }
          }
        },
        Asset: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Asset ID'
            },
            type: {
              type: 'string',
              enum: ['video', 'image', 'audio', 'text', 'model', 'texture'],
              description: 'Asset type'
            },
            name: {
              type: 'string',
              description: 'Asset name'
            },
            url: {
              type: 'string',
              format: 'uri',
              description: 'Asset URL'
            },
            file_size: {
              type: 'integer',
              description: 'File size in bytes'
            },
            dimensions: {
              type: 'object',
              properties: {
                width: { type: 'integer' },
                height: { type: 'integer' }
              },
              description: 'Asset dimensions'
            },
            duration: {
              type: 'integer',
              description: 'Duration in seconds'
            },
            metadata: {
              type: 'object',
              description: 'Asset metadata'
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Asset creation date'
            }
          }
        },
        RenderJob: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Render job ID'
            },
            project_id: {
              type: 'string',
              format: 'uuid',
              description: 'Project ID'
            },
            status: {
              type: 'string',
              enum: ['queued', 'processing', 'completed', 'failed', 'cancelled'],
              description: 'Render job status'
            },
            progress: {
              type: 'integer',
              minimum: 0,
              maximum: 100,
              description: 'Progress percentage'
            },
            settings: {
              type: 'object',
              description: 'Render settings'
            },
            result_url: {
              type: 'string',
              format: 'uri',
              description: 'Result video URL'
            },
            error_message: {
              type: 'string',
              description: 'Error message if failed'
            },
            started_at: {
              type: 'string',
              format: 'date-time',
              description: 'Render start time'
            },
            completed_at: {
              type: 'string',
              format: 'date-time',
              description: 'Render completion time'
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Job creation time'
            }
          }
        },
        Template: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Template ID'
            },
            name: {
              type: 'string',
              description: 'Template name'
            },
            description: {
              type: 'string',
              description: 'Template description'
            },
            category: {
              type: 'string',
              description: 'Template category'
            },
            thumbnail_url: {
              type: 'string',
              format: 'uri',
              description: 'Thumbnail URL'
            },
            template_data: {
              type: 'object',
              description: 'Template data'
            },
            is_public: {
              type: 'boolean',
              description: 'Template visibility'
            },
            usage_count: {
              type: 'integer',
              description: 'Usage count'
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Template creation date'
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['error'],
              description: 'Error status'
            },
            message: {
              type: 'string',
              description: 'Error message'
            },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                details: { type: 'string' },
                field: { type: 'string' }
              }
            }
          }
        },
        Success: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['success'],
              description: 'Success status'
            },
            message: {
              type: 'string',
              description: 'Success message'
            },
            data: {
              type: 'object',
              description: 'Response data'
            },
            meta: {
              type: 'object',
              properties: {
                timestamp: { type: 'string', format: 'date-time' },
                requestId: { type: 'string' },
                pagination: {
                  type: 'object',
                  properties: {
                    page: { type: 'integer' },
                    limit: { type: 'integer' },
                    total: { type: 'integer' },
                    totalPages: { type: 'integer' }
                  }
                }
              }
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: [
    './routes/*.js'
  ]
};

const specs = swaggerJsdoc(options);

const swaggerUiOptions = {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'AI Video System API Documentation'
};

module.exports = {
  specs,
  swaggerUiOptions
};