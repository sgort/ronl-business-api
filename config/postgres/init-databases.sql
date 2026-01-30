-- PostgreSQL initialization script
-- Creates databases for Keycloak, Operaton, and audit logs

-- Create Keycloak database
CREATE DATABASE keycloak;
CREATE USER keycloak WITH PASSWORD 'keycloak';
GRANT ALL PRIVILEGES ON DATABASE keycloak TO keycloak;

-- Connect to Keycloak database and grant schema permissions
\c keycloak;
GRANT ALL ON SCHEMA public TO keycloak;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO keycloak;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO keycloak;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO keycloak;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO keycloak;

-- Switch back to postgres database
\c postgres;

-- Create audit logs database
CREATE DATABASE audit_logs;
CREATE USER audit_user WITH PASSWORD 'audit_password';
GRANT ALL PRIVILEGES ON DATABASE audit_logs TO audit_user;

-- Connect to audit_logs database and create schema
\c audit_logs;

-- Grant schema permissions to audit_user
GRANT ALL ON SCHEMA public TO audit_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO audit_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO audit_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO audit_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO audit_user;

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    tenant_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    result VARCHAR(50) NOT NULL,
    error_message TEXT,
    request_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_request_id ON audit_logs(request_id);

-- Tenants table (for multi-tenancy management)
CREATE TABLE IF NOT EXISTS tenants (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    municipality_code VARCHAR(10),
    enabled BOOLEAN NOT NULL DEFAULT true,
    config JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create sample tenants
INSERT INTO tenants (tenant_id, name, municipality_code, enabled, config) VALUES
    ('utrecht', 'Gemeente Utrecht', 'GM0344', true, '{"maxProcessInstances": 1000}'::jsonb),
    ('amsterdam', 'Gemeente Amsterdam', 'GM0363', true, '{"maxProcessInstances": 5000}'::jsonb),
    ('rotterdam', 'Gemeente Rotterdam', 'GM0599', true, '{"maxProcessInstances": 3000}'::jsonb),
    ('denhaag', 'Gemeente Den Haag', 'GM0518', true, '{"maxProcessInstances": 2000}'::jsonb)
ON CONFLICT (tenant_id) DO NOTHING;

-- Grant final permissions to audit_user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO audit_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO audit_user;

-- Print success message
\echo 'Databases and tables created successfully!'