# H.E.R.M.E.S. Staging Environment

> A complete staging environment that mirrors production with isolated data and separate ports.

---

## Quick Start

```bash
# One-time setup
bash scripts/setup-staging.sh

# Deploy code changes to staging
bash scripts/deploy-to-staging.sh

# Promote staging to production (with backup & rollback)
bash scripts/promote-to-production.sh
```

---

## Port Assignments

| Service      | Production | Staging |
|:-------------|:-----------|:--------|
| Backend API  | `localhost:8000` | `localhost:8001` |
| Frontend     | `localhost:3000` | `localhost:3001` |
| Redis        | `localhost:6379` | `localhost:6380` |
| Temporal     | `localhost:7233` | `localhost:7234` |
| Temporal UI  | `localhost:8080` | `localhost:8081` |
| PostgreSQL   | `localhost:5432` | `localhost:5433` |
| Replica DB   | `localhost:5434` | N/A              |

## Architecture

```
Production                      Staging
┌──────────────┐                ┌──────────────┐
│  Frontend    │ :3000          │  Frontend    │ :3001
│  Backend     │ :8000          │  Backend     │ :8001
│  Worker      │                │  Worker      │
│  Redis       │ :6379          │  Redis       │ :6380
│  Temporal    │ :7233          │  Temporal    │ :7234
│  Temporal UI │ :8080          │  Temporal UI │ :8081
│  PostgreSQL  │ :5432 (hermes) │  PostgreSQL  │ :5433 (hermes_staging)
│  Replica DB  │ :5434 (read-only) │             │
└──────────────┘                └──────────────┘

Replica DB mirrors prod-db via PostgreSQL streaming replication.
Writes go to primary (5432), reads can be served from replica (5434).
```

Each environment uses its own Docker network, volumes, and database. They can run simultaneously without conflicts.

---

## Files

| File | Purpose |
|:-----|:--------|
| `docker-compose.staging.yml` | Staging Docker Compose configuration |
| `.env.staging` | Staging environment variables (secrets) |
| `scripts/setup-staging.sh` | First-time staging setup (DB, migrations, seeds) |
| `scripts/deploy-to-staging.sh` | Build and deploy code to staging with health checks |
| `scripts/promote-to-production.sh` | Backup production → stop → redeploy → verify |
| `scripts/setup-replication.sh` | Configure streaming replication (primary → replica) |
| `scripts/verify-replication.sh` | Verify replication health and data sync |
| `scripts/promote-replica.sh` | Promote replica to primary (failover) |
| `scripts/create-replication-user.sql` | SQL to create replication user |

---

## Deploy Workflow

### Day-to-Day: Deploy to Staging

```bash
# Make code changes, then:
bash scripts/deploy-to-staging.sh
```

This will:
1. Build fresh Docker images from current source
2. Stop any running staging containers
3. Start the staging environment
4. Run health checks on all services
5. Report status

### Promote to Production

```bash
bash scripts/promote-to-production.sh
```

This will:
1. Verify staging is healthy
2. Dump the production database to `scripts/backups/`
3. Stop production containers
4. Rebuild and restart production from current code
5. Run health checks
6. Report success or failure with rollback instructions

---

## Manual Commands

```bash
# Start staging
docker compose -f docker-compose.staging.yml up -d

# Stop staging
docker compose -f docker-compose.staging.yml down

# View staging logs
docker compose -f docker-compose.staging.yml logs -f [service]

# Shell into staging backend
docker compose -f docker-compose.staging.yml exec backend bash

# Check staging DB
docker compose -f docker-compose.staging.yml exec temporal-db-staging \
    psql -U temporal -d hermes_staging

# Restart a single staging service
docker compose -f docker-compose.staging.yml restart backend
```

---

## Rollback Procedure

If production breaks after a promote:

```bash
# 1. Stop broken production
docker compose -f docker-compose.yml down

# 2. Restore database from backup
docker compose -f docker-compose.yml up -d temporal-db
docker compose -f docker-compose.yml exec -T temporal-db \
    psql -U temporal -d hermes < scripts/backups/<TIMESTAMP>/hermes_production.sql

# 3. Restart production
docker compose -f docker-compose.yml up -d
```

Or if staging is still running, restart it as a fallback:

```bash
docker compose -f docker-compose.staging.yml up -d
```

---

## Streaming Replication (Read-Only Replica)

### Overview

The production environment includes a **read-only PostgreSQL replica** (`replica-db`) that mirrors the production database (`prod-db`) using **real-time streaming replication**.

```
┌─────────────────┐    WAL Stream    ┌─────────────────┐
│    prod-db      │ ───────────────→ │    replica-db    │
│  (Primary)      │                  │  (Read-Only)     │
│  :5432          │                  │  :5434           │
│  Read + Write   │                  │  Read Only       │
└─────────────────┘                  └─────────────────┘
```

### Quick Start

```bash
# First-time setup (run after docker-compose up)
bash scripts/setup-replication.sh

# Verify replication is working
bash scripts/verify-replication.sh
```

### How It Works

1. **Primary** (`prod-db`) runs with `wal_level=replica` and accepts WAL sender connections
2. A replication user `replicator` is created with `REPLICATION` privilege
3. A physical replication slot `replication_slot` ensures WAL segments are retained
4. **Replica** (`replica-db`) runs `pg_basebackup` on startup to clone the primary, then enters standby mode and streams WAL changes in real-time

### Using the Replica

**Read queries** (load balance reads to replica):
```bash
# Direct access
docker exec replica-db psql -U replicator -d hermes -c "SELECT * FROM agents;"

# Connection string for applications
postgresql://replicator:replicator_password@localhost:5434/hermes
```

**Verify read-only:**
```bash
# This will fail — replica rejects writes
docker exec replica-db psql -U replicator -d hermes -c "INSERT INTO agents VALUES (...);"
```

### Failover (Promote Replica)

If the primary fails, you can promote the replica to accept writes:

```bash
bash scripts/promote-replica.sh
```

After promotion:
- The replica becomes writable
- Streaming replication stops
- Update application connection strings to the new primary
- Rebuild the old primary as a new replica

### Monitoring Commands

```bash
# Check replication status from primary
docker exec prod-db psql -U temporal -d hermes -c "SELECT * FROM pg_stat_replication;"

# Check replication lag
docker exec prod-db psql -U temporal -d hermes -c "
SELECT client_addr, state, sent_lsn, write_lsn, flush_lsn, replay_lsn,
       pg_wal_lsn_diff(sent_lsn, replay_lsn) AS lag_bytes
FROM pg_stat_replication;"

# Check WAL receiver on replica
docker exec replica-db psql -U replicator -d hermes -c "SELECT * FROM pg_stat_wal_receiver;"

# Check replication slot
docker exec prod-db psql -U temporal -d hermes -c "SELECT * FROM pg_replication_slots;"
```

### Troubleshooting

**Replica not connecting:**
```bash
# Check replica logs
docker logs replica-db
# Ensure replication user exists on primary
docker exec prod-db psql -U temporal -d hermes -c "SELECT rolname FROM pg_roles WHERE rolreplication;"
```

**Replication lag growing:**
```bash
# Check WAL senders on primary
docker exec prod-db psql -U temporal -d hermes -c "SELECT * FROM pg_stat_replication;"
# Check network between containers
docker exec replica-db ping prod-db
```

**Replica won't start after primary restart:**
```bash
# You may need to rebuild the replica
docker compose down replica-db
docker volume rm $(docker volume ls -q | grep replica)
bash scripts/setup-replication.sh
```

---

## Setup Checklist

- [ ] Docker Desktop is running
- [ ] `.env.staging` exists with valid API keys (copy from `.env`)
- [ ] Run `bash scripts/setup-staging.sh`
- [ ] Verify `http://localhost:3001` loads the staging frontend
- [ ] Verify `http://localhost:8001/health` returns OK
- [ ] Verify staging Temporal UI at `http://localhost:8081`
- [ ] Test a deploy cycle with `bash scripts/deploy-to-staging.sh`

---

## Troubleshooting

**Port already in use:**
```bash
# Find what's using the port
netstat -ano | findstr :8001
# Kill the process or change the port in docker-compose.staging.yml
```

**Staging DB connection refused:**
```bash
# Check if postgres is running
docker compose -f docker-compose.staging.yml ps temporal-db-staging
# Check logs
docker compose -f docker-compose.staging.yml logs temporal-db-staging
```

**Temporal not becoming healthy:**
```bash
# Temporal takes up to 60s to start. Check logs:
docker compose -f docker-compose.staging.yml logs temporal-staging
# Ensure the DB is ready first
```

**Containers keep restarting:**
```bash
# Check logs for the crashing service
docker compose -f docker-compose.staging.yml logs --tail=50 backend
```
