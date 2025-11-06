-- Email system database migration
-- This migration creates tables for email templates, tracking, and analytics

-- Email Templates Table
CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL UNIQUE,
    type VARCHAR(100) NOT NULL, -- 'verification', 'password_reset', 'welcome', 'notification', 'marketing', etc.
    subject_template TEXT NOT NULL,
    html_template TEXT NOT NULL,
    text_template TEXT,
    language VARCHAR(10) DEFAULT 'en',
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    variables JSONB DEFAULT '[]', -- Array of variable names used in template
    metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Email Campaigns Table (for marketing emails)
CREATE TABLE IF NOT EXISTS email_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    content_html TEXT NOT NULL,
    content_text TEXT,
    template_id UUID REFERENCES email_templates(id),
    target_audience JSONB DEFAULT '{}', -- {subscription_tiers: ['basic', 'pro'], custom_filters: {...}}
    scheduled_at TIMESTAMP,
    sent_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'scheduled', 'sending', 'completed', 'cancelled'
    total_recipients INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    opened_count INTEGER DEFAULT 0,
    clicked_count INTEGER DEFAULT 0,
    unsubscribed_count INTEGER DEFAULT 0,
    bounced_count INTEGER DEFAULT 0,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Email Logs Table (for tracking all sent emails)
CREATE TABLE IF NOT EXISTS email_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    campaign_id UUID REFERENCES email_campaigns(id) ON DELETE SET NULL,
    template_id UUID REFERENCES email_templates(id),
    provider VARCHAR(50) NOT NULL, -- 'sendgrid', 'ses', 'mailgun'
    provider_message_id VARCHAR(255),
    to_email VARCHAR(255) NOT NULL,
    from_email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    content_html TEXT,
    content_text TEXT,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'bounced', 'complained', 'unsubscribed'
    error_message TEXT,
    sent_at TIMESTAMP,
    delivered_at TIMESTAMP,
    opened_at TIMESTAMP,
    clicked_at TIMESTAMP,
    bounced_at TIMESTAMP,
    complained_at TIMESTAMP,
    unsubscribed_at TIMESTAMP,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Email Unsubscribes Table
CREATE TABLE IF NOT EXISTS email_unsubscribes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    token VARCHAR(255) UNIQUE NOT NULL,
    reason VARCHAR(255),
    campaign_id UUID REFERENCES email_campaigns(id) ON DELETE SET NULL,
    unsubscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT
);

-- Email Provider Configurations Table
CREATE TABLE IF NOT EXISTS email_providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL UNIQUE, -- 'sendgrid', 'ses', 'mailgun'
    display_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 1, -- Lower number = higher priority
    daily_limit INTEGER,
    hourly_limit INTEGER,
    config JSONB DEFAULT '{}', -- Provider-specific configuration
    api_key_encrypted TEXT,
    webhook_secret VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Email Queue Table (for batch processing)
CREATE TABLE IF NOT EXISTS email_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    campaign_id UUID REFERENCES email_campaigns(id) ON DELETE SET NULL,
    template_id UUID REFERENCES email_templates(id),
    provider_id UUID REFERENCES email_providers(id),
    priority INTEGER DEFAULT 5, -- 1-10, lower = higher priority
    to_email VARCHAR(255) NOT NULL,
    from_email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    content_html TEXT,
    content_text TEXT,
    variables JSONB DEFAULT '{}',
    scheduled_at TIMESTAMP,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    last_attempt_at TIMESTAMP,
    next_retry_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'sent', 'failed', 'cancelled'
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Email Analytics Table (for aggregated statistics)
CREATE TABLE IF NOT EXISTS email_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    provider VARCHAR(50) NOT NULL,
    template_type VARCHAR(100),
    total_sent INTEGER DEFAULT 0,
    total_delivered INTEGER DEFAULT 0,
    total_opened INTEGER DEFAULT 0,
    total_clicked INTEGER DEFAULT 0,
    total_bounced INTEGER DEFAULT 0,
    total_complained INTEGER DEFAULT 0,
    total_unsubscribed INTEGER DEFAULT 0,
    delivery_rate DECIMAL(5,4) DEFAULT 0,
    open_rate DECIMAL(5,4) DEFAULT 0,
    click_rate DECIMAL(5,4) DEFAULT 0,
    bounce_rate DECIMAL(5,4) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(date, provider, template_type)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_email_templates_type ON email_templates(type);
CREATE INDEX IF NOT EXISTS idx_email_templates_language ON email_templates(language);
CREATE INDEX IF NOT EXISTS idx_email_templates_is_active ON email_templates(is_active);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_scheduled_at ON email_campaigns(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_created_by ON email_campaigns(created_by);

CREATE INDEX IF NOT EXISTS idx_email_logs_user_id ON email_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_campaign_id ON email_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_provider ON email_logs(provider);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON email_logs(sent_at);
CREATE INDEX IF NOT EXISTS idx_email_logs_to_email ON email_logs(to_email);

CREATE INDEX IF NOT EXISTS idx_email_unsubscribes_user_id ON email_unsubscribes(user_id);
CREATE INDEX IF NOT EXISTS idx_email_unsubscribes_email ON email_unsubscribes(email);
CREATE INDEX IF NOT EXISTS idx_email_unsubscribes_token ON email_unsubscribes(token);

CREATE INDEX IF NOT EXISTS idx_email_providers_is_active ON email_providers(is_active);
CREATE INDEX IF NOT EXISTS idx_email_providers_priority ON email_providers(priority);

CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
CREATE INDEX IF NOT EXISTS idx_email_queue_priority ON email_queue(priority);
CREATE INDEX IF NOT EXISTS idx_email_queue_scheduled_at ON email_queue(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_email_queue_next_retry_at ON email_queue(next_retry_at);
CREATE INDEX IF NOT EXISTS idx_email_queue_provider_id ON email_queue(provider_id);

CREATE INDEX IF NOT EXISTS idx_email_analytics_date ON email_analytics(date);
CREATE INDEX IF NOT EXISTS idx_email_analytics_provider ON email_analytics(provider);
CREATE INDEX IF NOT EXISTS idx_email_analytics_template_type ON email_analytics(template_type);

-- Insert default email providers
INSERT INTO email_providers (name, display_name, priority, config) VALUES
('sendgrid', 'SendGrid', 1, '{"api_url": "https://api.sendgrid.com/v3/mail/send"}'),
('ses', 'Amazon SES', 2, '{"region": "us-east-1"}'),
('mailgun', 'Mailgun', 3, '{"api_url": "https://api.mailgun.net/v3"}')
ON CONFLICT (name) DO NOTHING;

-- Insert default email templates
INSERT INTO email_templates (name, type, subject_template, html_template, text_template, variables) VALUES
('verification', 'verification', 'Verify Your Email Address', 
'<p>Click <a href="{{verification_url}}">here</a> to verify your email address.</p>',
'Visit {{verification_url}} to verify your email address.',
'["verification_url", "name"]'),

('password_reset', 'password_reset', 'Reset Your Password',
'<p>Click <a href="{{reset_url}}">here</a> to reset your password.</p>',
'Visit {{reset_url}} to reset your password.',
'["reset_url", "name"]'),

('welcome', 'welcome', 'Welcome to AI Video System!',
'<p>Welcome {{name}}! Thank you for joining AI Video System.</p>',
'Welcome {{name}}! Thank you for joining AI Video System.',
'["name"]'),

('video_processing_complete', 'notification', 'Your Video is Ready',
'<p>Hi {{name}}, your video "{{video_title}}" is ready for download.</p>',
'Hi {{name}}, your video "{{video_title}}" is ready for download.',
'["name", "video_title", "video_url"]'),

('subscription_updated', 'billing', 'Subscription Updated',
'<p>Your subscription has been updated to {{subscription_tier}}.</p>',
'Your subscription has been updated to {{subscription_tier}}.',
'["name", "subscription_tier", "next_billing_date"]')
ON CONFLICT (name) DO NOTHING;