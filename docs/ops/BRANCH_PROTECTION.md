# Branch Protection & Tag Strategy

## GitHub Branch Protection Settings

### Main Branch Protection

Navigate to: **Settings > Branches > Add rule**

**Branch name pattern:** `main`

**Recommended settings:**

- [x] **Require a pull request before merging**
  - [x] Require approvals: 1
  - [x] Dismiss stale PR approvals when new commits are pushed
  - [ ] Require review from Code Owners (optional)

- [x] **Require status checks to pass before merging**
  - [x] Require branches to be up to date before merging
  - Status checks:
    - `ci / lint`
    - `ci / security-check`

- [x] **Require conversation resolution before merging**

- [x] **Do not allow bypassing the above settings**

- [ ] **Require signed commits** (optional, recommended for high-security)

- [x] **Do not allow deletions**

- [x] **Block force pushes**

### Develop Branch Protection (Optional)

If using a develop branch:

**Branch name pattern:** `develop`

- [x] Require pull request
- [x] Require status checks
- [ ] Allow force pushes (for rebasing)
- [x] Block deletions

## Tag Strategy

### Baseline Tags (Read-Only)

Format: `main<major>.<minor>`

Examples:
- `main1.0` - First production baseline
- `main1.1` - Second major release
- `main2.0` - Architecture change

**Rules:**
- Never modify after creation
- Create with annotated tags
- Include release notes in tag message

### Patch Tags

Format: `main<major>.<minor>.<patch>`

Examples:
- `main1.0.1` - First patch to main1.0
- `main1.0.2` - Second patch
- `main1.0.10` - Tenth patch

**Rules:**
- Patches to existing baseline
- Increment for each release
- Can be created from hotfix branches

### Semantic Version Tags (Alternative)

Format: `v<major>.<minor>.<patch>`

Examples:
- `v1.0.0` - Initial release
- `v1.0.1` - Patch
- `v1.1.0` - Minor feature
- `v2.0.0` - Breaking change

### Creating Tags

```bash
# Create annotated tag (preferred)
git tag -a main1.0.1 -m "Release main1.0.1

Changes:
- Fixed OCR tax calculation
- Updated Traefik routing
- Added drift detection scripts"

# Push tag
git push origin main1.0.1

# List tags
git tag -l 'main*' --sort=-version:refname
```

### Tag Protection (GitHub)

Navigate to: **Settings > Tags > Add rule**

**Tag name pattern:** `main*`

- [x] Restrict who can create matching tags
  - Roles: Maintain, Admin

**Tag name pattern:** `v*`

- [x] Restrict who can create matching tags
  - Roles: Maintain, Admin

## Release Workflow

### Standard Release

```bash
# 1. Ensure on main and up to date
git checkout main
git pull origin main

# 2. Run checks
make drift-check
./scripts/validate_routes.sh

# 3. Create release tarball
make release TAG=main1.0.2

# 4. Commit any changes
git add .
git commit -m "Release main1.0.2"

# 5. Create tag
git tag -a main1.0.2 -m "Release main1.0.2"

# 6. Push
git push origin main
git push origin main1.0.2
```

### Hotfix Release

```bash
# 1. Create hotfix branch from tag
git checkout -b hotfix/main1.0.2 main1.0.1

# 2. Make fixes
# ... edit files ...

# 3. Commit
git commit -m "Fix critical bug in X"

# 4. Create tag
git tag -a main1.0.2 -m "Hotfix: Fix critical bug in X"

# 5. Merge to main
git checkout main
git merge hotfix/main1.0.2

# 6. Push
git push origin main
git push origin main1.0.2

# 7. Cleanup
git branch -d hotfix/main1.0.2
```

## Recommended Workflow

```
main1.0 (baseline, frozen)
    |
    +-- main1.0.1 (patch)
    |
    +-- main1.0.2 (patch)
    |
main1.1 (new baseline)
    |
    +-- main1.1.1 (patch)
```

## GitHub Actions Integration

The CI workflow will:
1. Run on all pushes to `main`
2. Run on all tag pushes matching `main*` or `v*`
3. Create release artifacts for tags
4. Upload to GitHub Releases (optional)

See `.github/workflows/ci.yml` and `.github/workflows/release.yml`

## Emergency Procedures

### Rollback a Bad Release

```bash
# Identify previous good tag
git tag -l 'main*' --sort=-version:refname

# Checkout previous tag
git checkout main1.0.1

# Create new release from that point
git checkout -b hotfix/rollback main1.0.1
# ... fix any issues ...
git tag -a main1.0.3 -m "Rollback to main1.0.1 + fixes"
```

### Delete a Tag (Admin Only)

```bash
# Local
git tag -d main1.0.2

# Remote
git push origin :refs/tags/main1.0.2
```

**Warning:** Only delete tags that haven't been deployed to production.
