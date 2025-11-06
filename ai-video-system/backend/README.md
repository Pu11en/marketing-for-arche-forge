# AI Video Creation System - Backend API

This is the backend API for the AI Video Creation System, built with Node.js, Express.js, and PostgreSQL.

## Features

- **Authentication & Authorization**: JWT-based authentication with refresh tokens and role-based access control
- **Project Management**: CRUD operations for video projects with versioning and collaboration
- **Asset Management**: File upload, storage, and management for various media types
- **Render Job Management**: Queue-based video rendering with progress tracking
- **Template System**: Reusable video templates with categories and usage tracking
- **Analytics**: User activity tracking and system metrics
- **Subscription Management**: Stripe integration for tiered subscriptions
- **Real-time Features**: WebSocket-based collaboration and progress updates
- **API Documentation**: Swagger/OpenAPI documentation

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: PostgreSQL with connection pooling
- **Cache**: Redis for sessions and caching
- **Authentication**: JWT with bcrypt for password hashing
- **File Storage**: Local storage (configurable for S3)
- **Real-time**: Socket.IO for WebSocket connections
- **Documentation**: Swagger/OpenAPI
- **Validation**: Express-validator
- **Logging**: Winston

## Installation

1. Clone the repository
```bash
git clone <repository-url>
cd ai-video-system/backend
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Set up the database
```bash
# Create PostgreSQL database
createdb aivideosystem

# Run migrations
npm run db:migrate

# Seed the database (optional)
npm run db:seed
```

5. Start the server
```bash
# Development
npm run dev

# Production
npm start
```

## Environment Variables

See `.env.example` for all available environment variables. Key variables include:

- `NODE_ENV`: Environment (development/production)
- `PORT`: Server port (default: 3001)
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `JWT_SECRET`: Secret for JWT tokens
- `STRIPE_SECRET_KEY`: Stripe API key for payments
- `FRONTEND_URL`: Frontend application URL

## API Documentation

Once the server is running, you can access the API documentation at:

- Swagger UI: `http://localhost:3001/api-docs`
- OpenAPI JSON: `http://localhost:3001/api-docs.json`

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Refresh JWT token
- `POST /api/auth/verify-email` - Verify email address
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile
- `PUT /api/users/preferences` - Update user preferences
- `GET /api/users/stats` - Get user statistics
- `GET /api/users/activity` - Get user activity log
- `DELETE /api/users/account` - Delete user account

### Projects
- `GET /api/projects` - List user projects
- `POST /api/projects` - Create new project
- `GET /api/projects/:id` - Get project details
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project
- `POST /api/projects/:id/duplicate` - Duplicate project
- `GET /api/projects/:id/assets` - Get project assets
- `GET /api/projects/:id/renders` - Get project render jobs

### Assets
- `POST /api/assets/upload/:projectId` - Upload assets to project
- `GET /api/assets` - List user assets
- `GET /api/assets/:id` - Get asset details
- `PUT /api/assets/:id` - Update asset metadata
- `DELETE /api/assets/:id` - Delete asset
- `POST /api/assets/:id/move` - Move asset to another project

### Render Jobs
- `POST /api/render/:projectId` - Create render job
- `GET /api/render/` - List user render jobs
- `GET /api/render/:id` - Get render job details
- `POST /api/render/:id/cancel` - Cancel render job
- `POST /api/render/:id/retry` - Retry failed render job
- `GET /api/render/:id/progress` - Get render job progress
- `GET /api/render/queue/status` - Get render queue status

### Templates
- `GET /api/templates` - List templates
- `GET /api/templates/:id` - Get template details
- `POST /api/templates` - Create template
- `PUT /api/templates/:id` - Update template
- `DELETE /api/templates/:id` - Delete template
- `POST /api/templates/:id/use` - Use template
- `GET /api/templates/categories/list` - Get template categories
- `GET /api/templates/popular/list` - Get popular templates
- `GET /api/templates/user/:userId` - Get user's templates

### Analytics
- `POST /api/analytics/track` - Track analytics event
- `GET /api/analytics/overview` - Get user analytics overview
- `GET /api/analytics/projects` - Get project analytics
- `GET /api/analytics/usage` - Get usage statistics
- `GET /api/analytics/system` - Get system analytics (admin only)
- `GET /api/analytics/performance` - Get performance metrics (admin only)
- `GET /api/analytics/export` - Export analytics data

### Subscriptions
- `GET /api/subscriptions/plans` - Get subscription plans
- `GET /api/subscriptions/current` - Get current subscription
- `POST /api/subscriptions/create` - Create/update subscription
- `POST /api/subscriptions/cancel` - Cancel subscription
- `POST /api/subscriptions/reactivate` - Reactivate subscription
- `POST /api/subscriptions/add-credits` - Add credits
- `GET /api/subscriptions/payment-methods` - Get payment methods
- `POST /api/subscriptions/webhook` - Stripe webhook handler

## WebSocket Events

### Collaboration
- `join-project` - Join project collaboration
- `leave-project` - Leave project collaboration
- `cursor-move` - Update cursor position
- `selection-change` - Update selection
- `edit-operation` - Apply edit operation
- `typing-start` - Start typing indicator
- `typing-stop` - Stop typing indicator
- `get-project-state` - Get project state

### Progress Tracking
- `subscribe-render` - Subscribe to render job progress
- `unsubscribe-render` - Unsubscribe from render job progress
- `subscribe-project` - Subscribe to project progress
- `unsubscribe-project` - Unsubscribe from project progress
- `get-progress` - Get current progress

## Database Schema

The database uses PostgreSQL with the following main tables:

- `users` - User accounts and authentication
- `projects` - Video projects and settings
- `assets` - Media files and metadata
- `render_jobs` - Video rendering jobs
- `templates` - Reusable video templates
- `subscriptions` - User subscription information
- `analytics` - User activity and events
- `collaborations` - Project collaboration data
- `user_preferences` - User settings and preferences
- `usage_logs` - Resource usage tracking

See `database/init.sql` for the complete schema.

## Scripts

- `npm run dev` - Start development server with nodemon
- `npm start` - Start production server
- `npm run db:migrate` - Run database migrations
- `npm run db:seed` - Seed database with sample data
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues

## Security

- JWT tokens for authentication
- Password hashing with bcrypt
- Rate limiting on API endpoints
- CORS configuration
- Input validation and sanitization
- SQL injection prevention with parameterized queries
- Helmet.js for security headers

## Error Handling

The API uses a standardized error response format:

```json
{
  "status": "error",
  "message": "Error description",
  "error": {
    "code": "ERROR_CODE",
    "details": "Detailed error information",
    "field": "field_name"
  },
  "meta": {
    "timestamp": "2024-01-01T00:00:00Z",
    "requestId": "uuid"
  }
}
```

## Logging

The application uses Winston for logging with the following levels:

- `error` - Error messages
- `warn` - Warning messages
- `info` - Informational messages
- `http` - HTTP request logging
- `debug` - Debug messages (development only)

Logs are written to:
- Console (development)
- `logs/error.log` (error messages)
- `logs/combined.log` (all messages)

## Testing

Run tests with:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Deployment

### Environment Setup

1. Set `NODE_ENV=production`
2. Configure production database and Redis connections
3. Set up SSL certificates
4. Configure reverse proxy (nginx/Apache)
5. Set up process manager (PM2/systemd)

### Docker

```bash
# Build image
docker build -t ai-video-system-backend .

# Run container
docker run -p 3001:3001 --env-file .env ai-video-system-backend
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## License

This project is licensed under the MIT License.