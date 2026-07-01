-- =============================================================================
-- PostgreSQL Streaming Replication Setup
-- Creates replication user and configures access for replica-db
-- Run this on the primary (prod-db) after initial database setup
-- =============================================================================

-- Create replication user
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'replicator') THEN
        CREATE USER replicator WITH REPLICATION ENCRYPTED PASSWORD 'replicator_password';
        RAISE NOTICE 'User replicator created';
    ELSE
        RAISE NOTICE 'User replicator already exists';
    END IF;
END $$;

-- Grant read access to hermes database
\c hermes

-- Grant connect and usage
GRANT CONNECT ON DATABASE hermes TO replicator;
GRANT USAGE ON SCHEMA public TO replicator;

-- Grant SELECT on all existing tables
GRANT SELECT ON ALL TABLES IN SCHEMA public TO replicator;

-- Grant SELECT on all future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO replicator;

-- Grant usage on sequences (needed for some ORM queries)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO replicator;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO replicator;

DO $$
BEGIN
    RAISE NOTICE 'Replication user setup complete';
END $$;
