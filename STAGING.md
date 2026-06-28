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
└──────────────┘                └──────────────┘
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
