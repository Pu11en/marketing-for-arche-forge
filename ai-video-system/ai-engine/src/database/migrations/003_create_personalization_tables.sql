-- Personalization Service Tables Migration
-- This migration creates tables for the personalization service

-- User behavior events table
CREATE TABLE IF NOT EXISTS user_behavior_events (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    session_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for user behavior events
CREATE INDEX IF NOT EXISTS idx_user_behavior_events_user_id ON user_behavior_events(user_id);
CREATE INDEX IF NOT EXISTS idx_user_behavior_events_timestamp ON user_behavior_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_user_behavior_events_type ON user_behavior_events(event_type);

-- ML models table
CREATE TABLE IF NOT EXISTS ml_models (
    id SERIAL PRIMARY KEY,
    model_type VARCHAR(100) NOT NULL UNIQUE,
    model_data JSONB,
    algorithm VARCHAR(100),
    parameters JSONB,
    accuracy FLOAT,
    last_trained TIMESTAMP WITH TIME ZONE,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User segments table
CREATE TABLE IF NOT EXISTS user_segments (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL UNIQUE,
    segment_type VARCHAR(100) NOT NULL,
    segment_data JSONB,
    confidence FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for user segments
CREATE INDEX IF NOT EXISTS idx_user_segments_user_id ON user_segments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_segments_type ON user_segments(segment_type);

-- Recommendations table
CREATE TABLE IF NOT EXISTS recommendations (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    recommendation_type VARCHAR(100) NOT NULL,
    suggestion VARCHAR(255) NOT NULL,
    reason TEXT,
    confidence FLOAT,
    source VARCHAR(100),
    context VARCHAR(100),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

-- Create index for recommendations
CREATE INDEX IF NOT EXISTS idx_recommendations_user_id ON recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_type ON recommendations(recommendation_type);
CREATE INDEX IF NOT EXISTS idx_recommendations_context ON recommendations(context);

-- Recommendation interactions table
CREATE TABLE IF NOT EXISTS recommendation_interactions (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    recommendation_id INTEGER REFERENCES recommendations(id),
    action VARCHAR(50) NOT NULL,
    metadata JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for recommendation interactions
CREATE INDEX IF NOT EXISTS idx_recommendation_interactions_user_id ON recommendation_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_interactions_recommendation_id ON recommendation_interactions(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_interactions_action ON recommendation_interactions(action);

-- A/B tests table
CREATE TABLE IF NOT EXISTS ab_tests (
    id SERIAL PRIMARY KEY,
    test_name VARCHAR(255) NOT NULL,
    description TEXT,
    context VARCHAR(100),
    type VARCHAR(100),
    goal VARCHAR(100),
    variations JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    traffic_percentage INTEGER DEFAULT 100,
    winning_group VARCHAR(100),
    confidence FLOAT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for A/B tests
CREATE INDEX IF NOT EXISTS idx_ab_tests_status ON ab_tests(status);
CREATE INDEX IF NOT EXISTS idx_ab_tests_context ON ab_tests(context);

-- User A/B test assignments table
CREATE TABLE IF NOT EXISTS user_ab_tests (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    test_id INTEGER REFERENCES ab_tests(id),
    test_group VARCHAR(100) NOT NULL,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, test_id)
);

-- Create index for user A/B tests
CREATE INDEX IF NOT EXISTS idx_user_ab_tests_user_id ON user_ab_tests(user_id);
CREATE INDEX IF NOT EXISTS idx_user_ab_tests_test_id ON user_ab_tests(test_id);

-- A/B test results table
CREATE TABLE IF NOT EXISTS ab_test_results (
    id SERIAL PRIMARY KEY,
    test_id INTEGER REFERENCES ab_tests(id),
    test_group VARCHAR(100) NOT NULL,
    impression_count INTEGER DEFAULT 0,
    click_count INTEGER DEFAULT 0,
    convert_count INTEGER DEFAULT 0,
    revenue DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(test_id, test_group)
);

-- Create index for A/B test results
CREATE INDEX IF NOT EXISTS idx_ab_test_results_test_id ON ab_test_results(test_id);

-- User feedback table
CREATE TABLE IF NOT EXISTS user_feedback (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    feedback_type VARCHAR(100) NOT NULL,
    feedback_data JSONB,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    sentiment VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for user feedback
CREATE INDEX IF NOT EXISTS idx_user_feedback_user_id ON user_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_type ON user_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_user_feedback_rating ON user_feedback(rating);

-- Video generation tracking table
CREATE TABLE IF NOT EXISTS video_generation_tracking (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    generation_params JSONB,
    result_url VARCHAR(500),
    processing_time INTEGER,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for video generation tracking
CREATE INDEX IF NOT EXISTS idx_video_generation_tracking_user_id ON video_generation_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_video_generation_tracking_success ON video_generation_tracking(success);

-- Content embeddings table (for similarity matching)
CREATE TABLE IF NOT EXISTS content_embeddings (
    id SERIAL PRIMARY KEY,
    content_type VARCHAR(100) NOT NULL,
    content_url VARCHAR(500),
    embedding VECTOR(1536),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for content embeddings
CREATE INDEX IF NOT EXISTS idx_content_embeddings_type ON content_embeddings(content_type);

-- Search metadata table
CREATE TABLE IF NOT EXISTS search_metadata (
    id SERIAL PRIMARY KEY,
    content_type VARCHAR(100) NOT NULL,
    base_metadata JSONB,
    tags TEXT[],
    embeddings JSONB,
    searchable_text TEXT,
    categories TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for search metadata
CREATE INDEX IF NOT EXISTS idx_search_metadata_type ON search_metadata(content_type);
CREATE INDEX IF NOT EXISTS idx_search_metadata_tags ON search_metadata USING GIN(tags);

-- Quality assessments table
CREATE TABLE IF NOT EXISTS quality_assessments (
    id SERIAL PRIMARY KEY,
    content_type VARCHAR(100) NOT NULL,
    analysis_result JSONB,
    assessment JSONB,
    strictness VARCHAR(50) DEFAULT 'standard',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for quality assessments
CREATE INDEX IF NOT EXISTS idx_quality_assessments_type ON quality_assessments(content_type);

-- Analysis exports table
CREATE TABLE IF NOT EXISTS analysis_exports (
    id SERIAL PRIMARY KEY,
    job_id VARCHAR(255),
    format VARCHAR(50) NOT NULL,
    size INTEGER,
    options JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for analysis exports
CREATE INDEX IF NOT EXISTS idx_analysis_exports_job_id ON analysis_exports(job_id);

-- Content embeddings table (for similarity matching)
CREATE TABLE IF NOT EXISTS content_embeddings (
    id SERIAL PRIMARY KEY,
    content_type VARCHAR(100) NOT NULL,
    content_url VARCHAR(500),
    embedding VECTOR(1536),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for content embeddings
CREATE INDEX IF NOT EXISTS idx_content_embeddings_type ON content_embeddings(content_type);

-- Search metadata table
CREATE TABLE IF NOT EXISTS search_metadata (
    id SERIAL PRIMARY KEY,
    content_type VARCHAR(100) NOT NULL,
    base_metadata JSONB,
    tags TEXT[],
    embeddings JSONB,
    searchable_text TEXT,
    categories TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for search metadata
CREATE INDEX IF NOT EXISTS idx_search_metadata_type ON search_metadata(content_type);
CREATE INDEX IF NOT EXISTS idx_search_metadata_tags ON search_metadata USING GIN(tags);

-- Quality assessments table
CREATE TABLE IF NOT EXISTS quality_assessments (
    id SERIAL PRIMARY KEY,
    content_type VARCHAR(100) NOT NULL,
    analysis_result JSONB,
    assessment JSONB,
    strictness VARCHAR(50) DEFAULT 'standard',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for quality assessments
CREATE INDEX IF NOT EXISTS idx_quality_assessments_type ON quality_assessments(content_type);

-- Analysis exports table
CREATE TABLE IF NOT EXISTS analysis_exports (
    id SERIAL PRIMARY KEY,
    job_id VARCHAR(255),
    format VARCHAR(50) NOT NULL,
    size INTEGER,
    options JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for analysis exports
CREATE INDEX IF NOT EXISTS idx_analysis_exports_job_id ON analysis_exports(job_id);

-- Insert default A/B test for recommendation ranking
INSERT INTO ab_tests (test_name, description, context, type, goal, variations, status)
VALUES (
    'Recommendation Ranking Algorithm',
    'Test different ranking algorithms for personalized recommendations',
    'video_creation',
    'ranking',
    'improve_click_through_rate',
    '[
        {
            "group": "control",
            "name": "Current Algorithm",
            "parameters": {
                "confidence_factor": 1.0
            }
        },
        {
            "group": "variant_a",
            "name": "Boosted Confidence",
            "parameters": {
                "confidence_factor": 1.2
            }
        },
        {
            "group": "variant_b",
            "name": "Diversity Focus",
            "parameters": {
                "max_per_type": 2
            }
        }
    ]'::jsonb,
    'active'
) ON CONFLICT (test_name) DO NOTHING;

-- Insert default A/B test for recommendation diversity
INSERT INTO ab_tests (test_name, description, context, type, goal, variations, status)
VALUES (
    'Recommendation Diversity',
    'Test the impact of recommendation diversity on user engagement',
    'content_discovery',
    'diversity',
    'improve_user_satisfaction',
    '[
        {
            "group": "control",
            "name": "Standard Diversity",
            "parameters": {
                "max_per_type": 5
            }
        },
        {
            "group": "variant_a",
            "name": "High Diversity",
            "parameters": {
                "max_per_type": 2
            }
        },
        {
            "group": "variant_b",
            "name": "Low Diversity",
            "parameters": {
                "max_per_type": 8
            }
        }
    ]'::jsonb,
    'active'
) ON CONFLICT (test_name) DO NOTHING;

-- Insert default A/B test for recommendation novelty
INSERT INTO ab_tests (test_name, description, context, type, goal, variations, status)
VALUES (
    'Recommendation Novelty',
    'Test the impact of novel recommendations on user engagement',
    'feature_discovery',
    'novelty',
    'improve_feature_discovery',
    '[
        {
            "group": "control",
            "name": "Standard Novelty",
            "parameters": {
                "novelty_boost": 0.0
            }
        },
        {
            "group": "variant_a",
            "name": "High Novelty",
            "parameters": {
                "novelty_boost": 0.3
            }
        },
        {
            "group": "variant_b",
            "name": "Balanced Novelty",
            "parameters": {
                "novelty_boost": 0.15
            }
        }
    ]'::jsonb,
    'active'
) ON CONFLICT (test_name) DO NOTHING;