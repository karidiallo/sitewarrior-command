# SiteWarrior Command Center — clean repository

Practical static-app snapshot based on SiteWarrior v8, reorganized for **GitHub Pages + Supabase**. This repository is the **private operations app**, not the public sitewarrior.eu marketing website.

## Quick start
1. Keep your **existing Supabase project and users**; deleting an old GitHub repo does not delete Supabase data.
2. Create a new GitHub repository and upload **the contents** of this folder (not the enclosing folder).
3. In **Settings → Pages**, choose **Deploy from a branch**, branch **main**, folder **/(root)**. **Do not also create a custom Pages Actions workflow.** The built-in `pages build and deployment` workflow is enough.
4. In Supabase **Authentication → URL Configuration**, add the new GitHub Pages URL (Site URL and allowed redirect URL).
5. Open the site, sign in using Kari or Adi, and run the two-user checks in [docs/TEST-CHECKLIST.md](docs/TEST-CHECKLIST.md) **before entering real client data**.

Full steps and troubleshooting: **[docs/DEPLOY.md](docs/DEPLOY.md)**.

## What lives where

```text
index.html                    Single static entry point
assets/css/                  Design, dashboard, workflows, background
assets/js/core.js            Existing original application logic
assets/js/modules.js         Operational modules
assets/js/sales.js           Sales detail workflows
assets/js/cloud.js           Supabase authentication-backed record persistence
assets/js/workflow.js        Tasks/project workflow
assets/js/operations.js      Delivery Forge, outreach, archive, review, analytics
assets/js/config.js          Public Supabase URL + publishable key only
assets/images/               SiteWarrior background image
supabase/                    Setup and additive migration SQL (read docs first)
docs/                        Deployment and acceptance tests
scripts/                     Static integrity checker
```

## Important boundaries
- **Do not run** `supabase/001_initial.sql` against an existing database to try to 'reset' it; see [docs/DEPLOY.md](docs/DEPLOY.md).
- `config.js` contains a **public** Supabase publishable key, **never** a secret/service-role key.
- The current interface contains legacy functionality adapted across successive versions. Static syntax/integrity checks do **not** establish that all flows are production-ready. Authenticated tests with **both** operator accounts and real Supabase records are still required.
- No automatic full-database backup system is included. Export and backup your production project independently.
- There is **no custom GitHub Actions workflow**, to avoid the dual-deployment/queue issue you encountered.

## Local run
```bash
python3 -m http.server 8080
# open http://localhost:8080
python3 scripts/check_repo.py
```

> If this new repository is public, the frontend code is public too. Data access is protected by Supabase Auth and Row-Level Security; ensure RLS is enabled. Avoid storing sensitive credentials or personal secrets inside source files.
