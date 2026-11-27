# Contributing

## Before your first push

```bash
npm ci                 # exact versions from package-lock.json
npm run hooks:install  # runs the checks below before every push (optional but recommended)
```

## Checks that CI runs

| Command | What it does |
|---|---|
| `npm run lint` | ESLint. Errors fail CI, warnings are listed in the job summary. |
| `npm run contracts` | Codebase contracts: every `/api/...` the pages call exists, every `onclick` names a real function, every element id a script uses exists, no function declared twice, `.env.example` matches the code, SQL table names exist, CDN scripts are pinned, no key or password is printed, and the route table matches `tests/contracts/routes.snapshot.txt`. |
| `npm run check` | Both of the above. This is what the pre-push hook runs. |
| `npm run smoke` | Boots both servers against your local MySQL, hits the public endpoints and the admin login, stops them. Needs MySQL running. |
| `npm run smoke:full` | Same plus one feedback submission. Only run this where `backend/config/emailConfig.json` has no real credentials, or a real email will be sent. |
| `node tests/smoke.js --archive` | What CI runs: `smoke:full` plus the Visitor Data Archive step, which seeds its own records, archives and deletes them and checks the zip. Only against a throwaway database, with blank email settings. |
| `npm run routes:update` | Rewrites the route snapshot after you add, rename or remove a route. Commit it in the same change. |

CI also boots the servers on Ubuntu and Windows with a fresh MySQL 8.4, scans new commits for secrets, and checks the
pull request title and files.

## Branches, commits, pull requests

- Branch from `main`: `type/short-description`, e.g. `feat/archive-export`, `fix/tree-refresh`.
- One feature folder per pull request where possible. Big mechanical changes get the `big-change` label.
- PR title is a Conventional Commit and becomes the commit on `main` (squash merge):
  `type(scope): description`. Types: feat, fix, docs, chore, refactor, test, ci, build, perf, style.
  Scopes are the feature folders plus core, ci, docs, deps, db, tests, scripts, legacy, admin.
- Never commit: visitor photos, logs, `backend/.env`, certificates, the analysis cache, `node_modules`.
  The `.gitignore` blocks new ones and CI refuses them.
- If you change a route, update `tests/contracts/routes.snapshot.txt` (`npm run routes:update`) and cover the route in
  `tests/smoke.js` in the same PR.
- Fill in the pull request template. The reviewer checks the Test Specification line against the FYP test spec.

## Changing the database

`database/schema.sql` is frozen (fresh installs only). Every change is a migration:

```bash
npm run db:new -- add_hardware_samples    # creates database/migrations/001_add_hardware_samples.sql
npm run db:migrate                         # applies pending migrations to your local database
npm run db:snapshot                        # regenerates database/schema.snapshot.sql (needs MYSQL_ROOT_PASSWORD)
```

Commit the migration and the snapshot together. After `git pull`, run `npm run db:migrate`.
Details and rules: `database/migrations/README.md`.

## Who owns what

See the Team modules table in `README.md` and `CODEOWNERS`. Edit shared files additively and tell the owner.
