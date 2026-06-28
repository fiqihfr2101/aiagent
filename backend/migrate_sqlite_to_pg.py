#!/usr/bin/env python3
"""Migrate data from SQLite to PostgreSQL."""

import sqlite3
import psycopg2
import json
import sys

# SQLite path
SQLITE_PATH = "hermes_agents.db"

# PostgreSQL connection
PG_DSN = "postgresql://temporal:temporal@localhost:5432/hermes"


def migrate_agents(sqlite_conn, pg_conn):
    """Migrate agents from SQLite to PostgreSQL."""
    print("Migrating agents...")
    
    sqlite_cursor = sqlite_conn.cursor()
    pg_cursor = pg_conn.cursor()
    
    sqlite_cursor.execute("SELECT * FROM agents")
    agents = sqlite_cursor.fetchall()
    
    for agent in agents:
        try:
            pg_cursor.execute("""
                INSERT INTO agents (id, name, role, model, status, task, color, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING
            """, agent)
            print(f"  Migrated agent: {agent[1]} ({agent[0]})")
        except Exception as e:
            print(f"  Error migrating agent {agent[0]}: {e}")
    
    pg_conn.commit()
    print(f"  Migrated {len(agents)} agents")


def migrate_tasks(sqlite_conn, pg_conn):
    """Migrate tasks from SQLite to PostgreSQL."""
    print("Migrating tasks...")
    
    sqlite_cursor = sqlite_conn.cursor()
    pg_cursor = pg_conn.cursor()
    
    sqlite_cursor.execute("SELECT * FROM tasks")
    tasks = sqlite_cursor.fetchall()
    
    for task in tasks:
        try:
            pg_cursor.execute("""
                INSERT INTO tasks (id, agent_id, title, priority, status, created_at, started_at, completed_at, result, tokens_used, workflow_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING
            """, task)
            print(f"  Migrated task: {task[2][:50]}... ({task[0]})")
        except Exception as e:
            print(f"  Error migrating task {task[0]}: {e}")
    
    pg_conn.commit()
    print(f"  Migrated {len(tasks)} tasks")


def migrate_task_logs(sqlite_conn, pg_conn):
    """Migrate task logs from SQLite to PostgreSQL."""
    print("Migrating task logs...")
    
    sqlite_cursor = sqlite_conn.cursor()
    pg_cursor = pg_conn.cursor()
    
    sqlite_cursor.execute("SELECT * FROM task_logs")
    logs = sqlite_cursor.fetchall()
    
    for log in logs:
        try:
            pg_cursor.execute("""
                INSERT INTO task_logs (id, task_id, agent_id, level, message, timestamp, request_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING
            """, log)
        except Exception as e:
            print(f"  Error migrating log {log[0]}: {e}")
    
    pg_conn.commit()
    print(f"  Migrated {len(logs)} task logs")


def migrate_notifications(sqlite_conn, pg_conn):
    """Migrate notifications from SQLite to PostgreSQL."""
    print("Migrating notifications...")
    
    sqlite_cursor = sqlite_conn.cursor()
    pg_cursor = pg_conn.cursor()
    
    sqlite_cursor.execute("SELECT * FROM notifications")
    notifications = sqlite_cursor.fetchall()
    
    for notification in notifications:
        try:
            pg_cursor.execute("""
                INSERT INTO notifications (id, type, title, description, read, data, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING
            """, notification)
        except Exception as e:
            print(f"  Error migrating notification {notification[0]}: {e}")
    
    pg_conn.commit()
    print(f"  Migrated {len(notifications)} notifications")


def main():
    """Main migration function."""
    print("Starting migration from SQLite to PostgreSQL...")
    print(f"SQLite: {SQLITE_PATH}")
    print(f"PostgreSQL: {PG_DSN}")
    print()
    
    # Connect to SQLite
    try:
        sqlite_conn = sqlite3.connect(SQLITE_PATH)
        print("Connected to SQLite")
    except Exception as e:
        print(f"Error connecting to SQLite: {e}")
        sys.exit(1)
    
    # Connect to PostgreSQL
    try:
        pg_conn = psycopg2.connect(PG_DSN)
        print("Connected to PostgreSQL")
    except Exception as e:
        print(f"Error connecting to PostgreSQL: {e}")
        sqlite_conn.close()
        sys.exit(1)
    
    # Run migrations
    try:
        migrate_agents(sqlite_conn, pg_conn)
        migrate_tasks(sqlite_conn, pg_conn)
        migrate_task_logs(sqlite_conn, pg_conn)
        migrate_notifications(sqlite_conn, pg_conn)
        print()
        print("Migration completed successfully!")
    except Exception as e:
        print(f"Error during migration: {e}")
        sys.exit(1)
    finally:
        sqlite_conn.close()
        pg_conn.close()


if __name__ == "__main__":
    main()
