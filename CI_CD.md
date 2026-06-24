# CI/CD Pipeline Documentation

## Overview

H.E.R.M.E.S. AI Agent Orchestrator uses GitHub Actions for continuous integration and deployment. The pipeline runs on every push and pull request to `main`/`master` branches.

## Pipeline Architecture

```
Push/PR → Lint → Test → Build → Deploy
              ↓
         Bundle Size
              ↓
           Notify
```

## Jobs

### 1. Lint & Type Check
- **Backend**: flake8, mypy
- **Frontend**: ESLint, TypeScript (`tsc --noEmit`)
- Runs on every push/PR

### 2. Tests & Coverage
- **Backend**: pytest with coverage (80% minimum threshold)
- **Frontend**: jest with coverage
- Depends on: `lint`

### 3. Docker Build
- Builds backend and frontend Docker images
- Pushes to GitHub Container Registry (ghcr.io)
- Only on push to main/master
- Depends on: `test`

### 4. Bundle Size Check
- Builds Next.js frontend
- Reports static asset sizes
- Fails if bundle exceeds 5MB
- Depends on: `lint`

### 5. Deployment
- **Staging**: Auto-deploys on push to master
- **Production**: Manual approval required via GitHub Environments
- Depends on: `build`

### 6. Pipeline Status
- Summary report posted to GitHub Step Summary
- Runs regardless of other job outcomes

## Environment Variables

### CI Environment
| Variable | Description | Default |
|----------|-------------|---------|
| `PYTHON_VERSION` | Python version for backend | `3.10` |
| `NODE_VERSION` | Node.js version for frontend | `18` |
| `REGISTRY` | Container registry | `ghcr.io` |

### Test Environment
| Variable | Description | Required |
|----------|-------------|----------|
| `PYTHONPATH` | Python module path | `.` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379/0` |
| `JWT_SECRET` | JWT secret for testing | `test-secret-key-for-ci` |
| `CI` | CI environment flag | `true` |

### GitHub Secrets (Optional)
| Secret | Description | Required For |
|--------|-------------|--------------|
| `GITHUB_TOKEN` | Auto-provided by GitHub | Container registry push |

## Quality Gates

| Gate | Threshold | Action |
|------|-----------|--------|
| Backend Coverage | 80% minimum | `--cov-fail-under=80` |
| Lint Errors (Critical) | 0 | `flake8 --select=E9,F63,F7,F82` |
| Bundle Size | 5MB maximum | Fails build if exceeded |
| TypeScript Errors | 0 | `tsc --noEmit` |
| ESLint Errors | 0 | `npm run lint` |

## Local Development

### Run Linting Locally

```bash
# Backend
cd backend
pip install flake8 mypy
flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics
mypy . --ignore-missing-imports --no-strict-optional

# Frontend
cd frontend
npm ci
npm run lint
npx tsc --noEmit
```

### Run Tests Locally

```bash
# Backend
cd backend
pip install pytest pytest-cov pytest-asyncio
pip install -r requirements.txt
python -m pytest tests/ --cov=. --cov-report=term-missing -v

# Frontend
cd frontend
npm ci
npx jest --coverage
```

### Build Docker Images Locally

```bash
# Backend
docker build -t hermes-backend ./backend

# Frontend
docker build -t hermes-frontend ./frontend
```

## Docker Images

### Backend Image
- Base: `python:3.10-slim`
- Port: `8000`
- Entry: `python main.py`

### Frontend Image
- Base: `node:20-alpine` (multi-stage)
- Port: `3000`
- Entry: `npm start`

## Deployment

### Staging
- Automatic on push to `master`
- Uses GitHub Environments (`staging`)
- Configure deployment commands in workflow

### Production
- Manual trigger required
- Uses GitHub Environments (`production`)
- Requires approval from designated reviewers
- Configure in: Settings → Environments → production

### Custom Deployment
To add custom deployment commands, edit `.github/workflows/ci.yml`:

```yaml
deploy-staging:
  steps:
    - name: Deploy to Staging
      run: |
        # Add your deployment commands
        docker compose -f docker-compose.staging.yml up -d
```

## Troubleshooting

### Pipeline Fails on Lint
- Run `flake8` locally to see errors
- Fix critical errors (E9, F63, F7, F82) first
- Style warnings (exit-zero) won't fail the build

### Coverage Below 80%
- Run `pytest --cov=. --cov-report=term-missing` locally
- Add tests for uncovered code paths
- Check `htmlcov/index.html` for detailed report

### Bundle Size Exceeded
- Run `npm run build` locally
- Check `.next/static/` directory size
- Consider code splitting or lazy loading

### Docker Build Fails
- Check Dockerfile syntax
- Verify all dependencies in requirements.txt/package.json
- Test locally with `docker build .`

## File Structure

```
.github/
  workflows/
    ci.yml          # Main CI/CD workflow
CI_CD.md            # This documentation
backend/
  Dockerfile        # Backend container
  requirements.txt  # Python dependencies
frontend/
  Dockerfile        # Frontend container
  package.json      # Node.js dependencies
docker-compose.yml  # Local development
```

## References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Build Push Action](https://github.com/docker/build-push-action)
- [GitHub Environments](https://docs.github.com/en/actions/deployment/targeting-different-environments)
