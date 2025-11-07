# Spec-Kit Mode: Usage Examples and Best Practices

## Introduction

This guide provides practical examples and best practices for using spec-kit mode effectively. Each example demonstrates real-world scenarios and how to apply spec-driven development principles.

## Basic Usage Examples

### Example 1: Simple Web Feature

**Scenario**: Adding a contact form to a website

```bash
# Start the workflow
/spec-kit "Add contact form to website with email notification"
```

**Expected Workflow Progression**:

#### Phase 1: Specify
The system will guide you to create a specification like:

```markdown
# Feature: Contact Form

## User Stories

### User Story 1
**As a** website visitor  
**I want to** submit a contact form  
**So that** I can communicate with the website owner

**Acceptance Criteria**:
- Form includes name, email, and message fields
- Form validates required fields
- Form shows success message after submission
- Form sends email notification to site owner
- Form handles submission errors gracefully

### User Story 2
**As a** website owner  
**I want to** receive email notifications  
**So that** I can respond to visitor inquiries

**Acceptance Criteria**:
- Email includes all form data
- Email is sent to configured recipient
- Email includes timestamp
- System logs all submissions

## Success Criteria

- Contact form submission rate > 85%
- Form completion time < 2 minutes
- Email delivery success rate > 95%
- Zero form submission errors in production

## Non-Functional Requirements

- Form must be responsive on mobile devices
- Form must be accessible (WCAG 2.1 AA)
- Form must be protected against spam
- Form must handle 100+ submissions per hour
```

#### Phase 2: Clarify
The system identifies ambiguities and asks clarifying questions:

```
Found 2 ambiguities that need clarification:

1. Email Configuration: What email service should be used? (SMTP, SendGrid, AWS SES?)
2. Spam Protection: What level of spam protection is required? (reCAPTCHA, honeypot, rate limiting?)

Please provide answers to these questions.
```

#### Phase 3: Plan
Technical plan is created:

```markdown
# Implementation Plan: Contact Form

## Architecture Overview
- Frontend: React form component with validation
- Backend: Node.js API endpoint for form processing
- Email Service: SendGrid for email delivery
- Database: MongoDB for submission logging
- Protection: Google reCAPTCHA v2

## Technical Decisions

### Frontend Framework
**Decision**: React with Formik for form management
**Rationale**: Existing codebase uses React, Formik provides robust validation
**Alternatives Considered**: Vanilla JS, React Hook Form

### Email Service
**Decision**: SendGrid
**Rationale**: Reliable delivery, good API, existing account available
**Alternatives Considered**: AWS SES, SMTP

## Data Model
```javascript
{
  _id: ObjectId,
  name: String,
  email: String,
  message: String,
  timestamp: Date,
  ip: String,
  userAgent: String,
  status: String // 'sent', 'failed'
}
```

## Implementation Tasks
1. Create React form component
2. Implement backend API endpoint
3. Integrate SendGrid email service
4. Add reCAPTCHA protection
5. Create submission logging
6. Add error handling
7. Write tests
8. Deploy to staging
```

#### Phase 4: Tasks
Detailed task breakdown:

```markdown
# Task Breakdown: Contact Form

## Phase 1: Frontend Development
- [ ] Create ContactForm component with fields
- [ ] Implement form validation with Formik
- [ ] Add reCAPTCHA integration
- [ ] Style form with responsive design
- [ ] Add loading states and error handling

## Phase 2: Backend Development
- [ ] Create /api/contact endpoint
- [ ] Implement input validation and sanitization
- [ ] Integrate SendGrid email service
- [ ] Add submission logging to MongoDB
- [ ] Implement rate limiting

## Phase 3: Testing
- [ ] Write unit tests for form validation
- [ ] Write integration tests for API endpoint
- [ ] Test email delivery functionality
- [ ] Perform accessibility testing

## Phase 4: Deployment
- [ ] Deploy to staging environment
- [ ] Perform end-to-end testing
- [ ] Deploy to production
- [ ] Monitor for issues

## MVP Tasks (Priority 1)
- Create ContactForm component
- Implement /api/contact endpoint
- Add SendGrid integration
- Basic testing
```

#### Phase 5: Analyze
Quality analysis identifies:

```markdown
# Analysis Report: Contact Form

## Critical Issues
None found

## Security Considerations
✅ Input validation implemented
✅ CSRF protection required
✅ Rate limiting planned
⚠️ Need to implement CSP headers

## Test Coverage
- Frontend: 85% coverage planned
- Backend: 90% coverage planned
- Integration: 100% coverage planned

## Recommendations
1. Add Content Security Policy headers
2. Implement additional logging for security monitoring
3. Consider adding email template system for future scalability
```

#### Phase 6: Implement
Implementation proceeds according to tasks, with validation at each step.

---

### Example 2: API Endpoint Development

**Scenario**: Creating a user authentication API

```bash
# Start the workflow
/spec-kit "Implement user authentication API with JWT tokens"
```

**Key Specification Points**:

```markdown
# Feature: User Authentication API

## User Stories

### User Story 1
**As a** user  
**I want to** register with email and password  
**So that** I can create an account

**Acceptance Criteria**:
- API accepts email and password
- Password must be at least 8 characters
- Email must be valid format
- Password is hashed before storage
- Returns JWT token on successful registration
- Returns appropriate error messages

### User Story 2
**As a** user  
**I want to** login with credentials  
**So that** I can access my account

**Acceptance Criteria**:
- API validates email and password
- Returns JWT token on successful login
- Token expires after 24 hours
- Returns appropriate error messages for invalid credentials

## Security Requirements
- Passwords must be hashed with bcrypt
- JWT tokens must be signed with strong secret
- API must be protected against brute force attacks
- Rate limiting must be implemented
```

**Technical Plan Highlights**:

```markdown
# Implementation Plan: User Authentication API

## Architecture
- Framework: Express.js with TypeScript
- Database: PostgreSQL with Prisma ORM
- Authentication: JWT with refresh tokens
- Security: bcrypt, helmet, rate limiting

## API Endpoints
```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
```

## Security Measures
- Password hashing with bcrypt (salt rounds: 12)
- JWT tokens with 15-minute access, 7-day refresh
- Rate limiting: 5 attempts per 15 minutes
- Account lockout after 10 failed attempts
```

---

### Example 3: Data Migration Script

**Scenario**: Migrating user data from legacy system

```bash
# Start the workflow
/spec-kit "Create data migration script for user data from legacy CRM"
```

**Specification Focus**:

```markdown
# Feature: User Data Migration

## User Stories

### User Story 1
**As a** system administrator  
**I want to** migrate user data from legacy CRM  
**So that** all existing users are available in new system

**Acceptance Criteria**:
- Migrate all user records (estimated 50,000)
- Preserve user relationships and groups
- Handle duplicate emails appropriately
- Generate migration report
- Support rollback capability
- Complete migration within 4-hour maintenance window

## Data Mapping
Legacy CRM → New System
- user_name → full_name
- email_address → email
- phone_number → phone
- company_name → company
- created_date → created_at

## Success Criteria
- 100% data integrity maintained
- Zero data loss during migration
- Migration completes within 4 hours
- Rollback successfully restores original state
```

---

## Advanced Usage Examples

### Example 4: Microservice Architecture

**Scenario**: Designing an order processing microservice

```bash
# Start the workflow
/spec-kit "Design order processing microservice with event-driven architecture"
```

**Complex Specification Elements**:

```markdown
# Feature: Order Processing Microservice

## System Architecture
- Service: Order Service (Node.js/TypeScript)
- Database: PostgreSQL for orders
- Message Queue: RabbitMQ for events
- Cache: Redis for session data
- Monitoring: Prometheus + Grafana

## User Stories

### User Story 1
**As a** customer  
**I want to** place an order  
**So that** I can purchase products

**Acceptance Criteria**:
- Order creation validates inventory
- Order reserves items for 15 minutes
- Payment processing integrates with Stripe
- Order status updates are published as events
- Customer receives email confirmation

### User Story 2
**As a** system  
**I want to** process order events  
**So that** other services can react to order changes

**Acceptance Criteria**:
- OrderCreated event published on order creation
- OrderPaid event published on payment success
- OrderShipped event published on shipping
- OrderCancelled event published on cancellation
- All events include order ID and timestamp

## Event Schema
```json
{
  "eventType": "OrderCreated",
  "orderId": "string",
  "customerId": "string",
  "items": [
    {
      "productId": "string",
      "quantity": "number",
      "price": "number"
    }
  ],
  "total": "number",
  "timestamp": "ISO8601"
}
```

## Performance Requirements
- Handle 1000 orders per minute
- Order creation response time < 200ms
- Event publishing latency < 50ms
- 99.9% uptime during business hours
```

---

### Example 5: Mobile App Feature

**Scenario**: Adding offline support to mobile app

```bash
# Start the workflow
/spec-kit "Add offline support to mobile app with data synchronization"
```

**Mobile-Specific Considerations**:

```markdown
# Feature: Offline Support for Mobile App

## User Stories

### User Story 1
**As a** mobile user  
**I want to** access app content offline  
**So that** I can use the app without internet connection

**Acceptance Criteria**:
- App caches essential data for offline access
- User can view cached content without internet
- App shows offline status indicator
- User can perform basic actions offline
- Changes sync when connection restored

### User Story 2
**As a** mobile user  
**I want to** sync my changes when online  
**So that** my offline actions are saved

**Acceptance Criteria**:
- Offline changes queue for synchronization
- Conflicts are resolved with user input
- Sync progress is visible to user
- Failed sync can be retried manually
- Large files sync over WiFi only

## Technical Requirements
- Local storage: SQLite for iOS/Android
- Sync algorithm: Operational Transformation
- Conflict resolution: Last-write-wins with user override
- Storage limits: 100MB cache, auto-cleanup old data
- Background sync: Every 30 minutes when on WiFi

## Platform Considerations
### iOS
- Use Core Data for local storage
- Implement Background App Refresh
- Handle app lifecycle events properly

### Android
- Use Room database for local storage
- Implement WorkManager for background sync
- Handle network connectivity changes
```

---

## Best Practices

### Specification Best Practices

#### 1. Focus on User Value
```markdown
# Good: User-focused
"As a customer, I want to save my shipping address so that I don't have to enter it each time"

# Bad: Implementation-focused
"As a system, I want to store shipping address in database so that data persists"
```

#### 2. Make Success Criteria Measurable
```markdown
# Good: Measurable
- Page load time < 2 seconds
- User registration conversion rate > 15%
- 99.9% uptime during business hours

# Bad: Vague
- Fast page loading
- Good conversion rate
- High availability
```

#### 3. Include Edge Cases
```markdown
# Good: Comprehensive
- Handle network failures gracefully
- Support concurrent users (1000+)
- Process large files (up to 100MB)
- Handle invalid input appropriately

# Bad: Incomplete
- Handle errors
- Support multiple users
- Process files
```

### Planning Best Practices

#### 1. Document Technical Decisions
```markdown
## Decision: Use PostgreSQL instead of MongoDB

**Context**: Need for ACID compliance and complex queries
**Decision**: PostgreSQL with Prisma ORM
**Rationale**: 
- Strong consistency required for financial data
- Complex reporting queries needed
- Team has PostgreSQL experience
- Better tooling for migrations

**Consequences**:
- Slower development for simple CRUD
- More rigid schema changes
- Better data integrity guarantees
- Superior query performance
```

#### 2. Include Security Considerations
```markdown
## Security Plan

### Authentication
- JWT tokens with 15-minute expiration
- Refresh tokens with 7-day expiration
- Rate limiting: 5 attempts per 15 minutes

### Data Protection
- All passwords hashed with bcrypt (12 rounds)
- PII encrypted at rest
- API calls over HTTPS only
- Input validation and sanitization

### Infrastructure Security
- VPC with private subnets
- Security groups limiting access
- Regular security updates
- Automated vulnerability scanning
```

#### 3. Plan for Testing
```markdown
## Testing Strategy

### Unit Tests
- Coverage target: 90%
- Focus on business logic
- Mock external dependencies

### Integration Tests
- API endpoint testing
- Database integration
- Third-party service integration

### End-to-End Tests
- Critical user journeys
- Cross-browser compatibility
- Mobile responsiveness

### Performance Tests
- Load testing: 1000 concurrent users
- Stress testing: 10x normal load
- Database query optimization
```

### Implementation Best Practices

#### 1. Follow Task Dependencies
```markdown
# Task Dependencies
1. Database schema design
2. Model implementation (depends on 1)
3. API endpoint implementation (depends on 2)
4. Frontend integration (depends on 3)
5. Testing (depends on 4)
```

#### 2. Implement Incrementally
```markdown
# MVP First
- Basic functionality
- Core user stories
- Essential features

# Phase 2 Enhancements
- Advanced features
- Performance optimizations
- Additional user stories

# Phase 3 Polish
- UI/UX improvements
- Edge case handling
- Advanced error handling
```

#### 3. Validate Continuously
```bash
# Run validation after each major task
/spec-kit validate

# Check status regularly
/spec-kit status

# Generate progress reports
/spec-kit report -Markdown
```

### Team Collaboration Best Practices

#### 1. Share Specifications
- Use specifications as communication tools
- Review specifications with stakeholders
- Keep specifications updated with decisions

#### 2. Review Plans Together
- Get technical review from senior developers
- Discuss architecture decisions as a team
- Document consensus and disagreements

#### 3. Track Progress Transparently
- Use status reports for stakeholder communication
- Share progress dashboards with team
- Document blockers and decisions

## Common Patterns and Anti-Patterns

### Patterns

#### 1. Progressive Elaboration
Start with high-level specification, add details in clarification phase.

#### 2. Vertical Slicing
Implement complete user stories end-to-end rather than horizontal layers.

#### 3. Test-Driven Development
Write tests before implementation, use them as specification.

### Anti-Patterns

#### 1. Big Design Up Front
Avoid over-detailed specifications that become obsolete.

#### 2. Implementation in Specification
Keep specifications focused on what, not how.

#### 3. Skipping Validation
Don't override quality gates without strong justification.

## Troubleshooting Common Issues

### Specification Issues
- **Too many ambiguities**: Focus on clearer requirements
- **Implementation details**: Refactor to user-focused language
- **Unmeasurable criteria**: Add specific metrics and targets

### Planning Issues
- **Constitution violations**: Review project constraints
- **Incomplete research**: Address all technical unknowns
- **Missing decisions**: Document rationale for choices

### Implementation Issues
- **Task dependencies**: Resolve circular dependencies
- **Test failures**: Fix failing tests before proceeding
- **Quality gate failures**: Address issues systematically

These examples and best practices provide a comprehensive guide for using spec-kit mode effectively across various development scenarios. Adapt them to your specific project needs and team workflows.