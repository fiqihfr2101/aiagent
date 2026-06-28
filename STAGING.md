# H.E.R.M.E.S. — Git Branching & Staging Workflow

## Git Workflow

### Branches
| Branch      | Environment | URL                                  |
|-------------|-------------|--------------------------------------|
| `main`      | Production  | https://orc.routex.web.id            |
| `staging`   | Staging     | https://staging-orc.routex.web.id    |

### Strategy
- `main` — Stable production code. Only merged after staging testing passes.
- `staging` — Integration/testing environment. All feature work is tested here before production promotion.

### Workflow

1. **Feature development** — create a feature branch from `main`:
   ```bash
   git checkout main
   git checkout -b feature/my-feature
   # ... work on feature ...
   git push -u origin feature/my-feature
   ```

2. **Test on staging** — merge feature branch into `staging`:
   ```bash
   git checkout staging
   git merge feature/my-feature
   git push origin staging
   bash scripts/deploy-to-staging.sh
   ```

3. **Promote to production** — after staging tests pass, merge into `main`:
   ```bash
   git checkout main
   git merge staging
   git push origin main
   bash scripts/promote-to-production.sh
   ```

### Deploy Commands

```bash
# Deploy to staging
git checkout staging
git merge feature-branch
git push origin staging
bash scripts/deploy-to-staging.sh

# Deploy to production
git checkout main
git merge staging
git push origin main
bash scripts/promote-to-production.sh
```

### Branch Protection (Recommended)
- **`main`**: Require PR reviews, require passing CI, no direct pushes.
- **`staging`**: Require passing CI, allow merges from feature branches.

### Notes
- The old `master` branch still exists on the remote as the GitHub default.
  Change the GitHub repo default branch to `main` via:
  **Settings → Branches → Default branch → Change to `main`**
  Then delete the remote `master` with:
  ```bash
  git push origin --delete master
  ```
