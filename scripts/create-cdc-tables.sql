-- CDC Change Log Table
-- Captures all INSERT/UPDATE/DELETE operations on tracked tables

CREATE TABLE IF NOT EXISTS change_log (
    seq BIGSERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    row_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient polling
CREATE INDEX IF NOT EXISTS idx_change_log_seq ON change_log(seq);
CREATE INDEX IF NOT EXISTS idx_change_log_table ON change_log(table_name);
CREATE INDEX IF NOT EXISTS idx_change_log_created ON change_log(created_at);

-- Auto-cleanup: delete change_log entries older than 7 days
-- Run periodically or via pg_cron
-- DELETE FROM change_log WHERE created_at < NOW() - INTERVAL '7 days';

-----------------------------------------------------------
-- Trigger function for agents table
-----------------------------------------------------------
CREATE OR REPLACE FUNCTION agents_cdc_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO change_log (table_name, row_id, operation, new_data)
        VALUES ('agents', NEW.id, 'INSERT', to_jsonb(NEW));
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO change_log (table_name, row_id, operation, old_data, new_data)
        VALUES ('agents', NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO change_log (table_name, row_id, operation, old_data)
        VALUES ('agents', OLD.id, 'DELETE', to_jsonb(OLD));
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agents_after_change ON agents;
CREATE TRIGGER agents_after_change
AFTER INSERT OR UPDATE OR DELETE ON agents
FOR EACH ROW EXECUTE FUNCTION agents_cdc_trigger();

-----------------------------------------------------------
-- Trigger function for tasks table
-----------------------------------------------------------
CREATE OR REPLACE FUNCTION tasks_cdc_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO change_log (table_name, row_id, operation, new_data)
        VALUES ('tasks', NEW.id, 'INSERT', to_jsonb(NEW));
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO change_log (table_name, row_id, operation, old_data, new_data)
        VALUES ('tasks', NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO change_log (table_name, row_id, operation, old_data)
        VALUES ('tasks', OLD.id, 'DELETE', to_jsonb(OLD));
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tasks_after_change ON tasks;
CREATE TRIGGER tasks_after_change
AFTER INSERT OR UPDATE OR DELETE ON tasks
FOR EACH ROW EXECUTE FUNCTION tasks_cdc_trigger();

-----------------------------------------------------------
-- Trigger function for notifications table
-----------------------------------------------------------
CREATE OR REPLACE FUNCTION notifications_cdc_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO change_log (table_name, row_id, operation, new_data)
        VALUES ('notifications', NEW.id, 'INSERT', to_jsonb(NEW));
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO change_log (table_name, row_id, operation, old_data, new_data)
        VALUES ('notifications', NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO change_log (table_name, row_id, operation, old_data)
        VALUES ('notifications', OLD.id, 'DELETE', to_jsonb(OLD));
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notifications_after_change ON notifications;
CREATE TRIGGER notifications_after_change
AFTER INSERT OR UPDATE OR DELETE ON notifications
FOR EACH ROW EXECUTE FUNCTION notifications_cdc_trigger();

-----------------------------------------------------------
-- Trigger function for messages table
-----------------------------------------------------------
CREATE OR REPLACE FUNCTION messages_cdc_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO change_log (table_name, row_id, operation, new_data)
        VALUES ('messages', NEW.id, 'INSERT', to_jsonb(NEW));
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO change_log (table_name, row_id, operation, old_data, new_data)
        VALUES ('messages', NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO change_log (table_name, row_id, operation, old_data)
        VALUES ('messages', OLD.id, 'DELETE', to_jsonb(OLD));
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS messages_after_change ON messages;
CREATE TRIGGER messages_after_change
AFTER INSERT OR UPDATE OR DELETE ON messages
FOR EACH ROW EXECUTE FUNCTION messages_cdc_trigger();

-----------------------------------------------------------
-- Trigger function for workflows table
-----------------------------------------------------------
CREATE OR REPLACE FUNCTION workflows_cdc_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO change_log (table_name, row_id, operation, new_data)
        VALUES ('workflows', NEW.id, 'INSERT', to_jsonb(NEW));
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO change_log (table_name, row_id, operation, old_data, new_data)
        VALUES ('workflows', NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO change_log (table_name, row_id, operation, old_data)
        VALUES ('workflows', OLD.id, 'DELETE', to_jsonb(OLD));
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS workflows_after_change ON workflows;
CREATE TRIGGER workflows_after_change
AFTER INSERT OR UPDATE OR DELETE ON workflows
FOR EACH ROW EXECUTE FUNCTION workflows_cdc_trigger();
