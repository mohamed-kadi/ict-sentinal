# Repository Guide

## Top-Level Layout
- `web/`: frontend application, data proxy routes, and frontend-only scripts.
- `backend/`: Spring Boot API, migrations, and backend tests.
- `docs/`: architecture, technical, repository, and user-facing documentation.
- `ops/`: deployment and infrastructure home for future team use.

## Ownership Boundaries

### Frontend engineers
- Put UI and route-shell work in `web/src/app/` and `web/src/components/`.
- Put query orchestration in `web/src/hooks/`.
- Put shared frontend helpers and DTOs in `web/src/lib/`.
- Put workspace state in `web/src/state/`.
- Put local utilities, smoke scripts, and fixtures in `web/scripts/`.

### Backend engineers
- Put analysis endpoints and DTOs in `backend/src/main/java/.../analysis/api/`.
- Put analysis logic in `backend/src/main/java/.../analysis/service/`.
- Put trade journaling endpoints in `backend/src/main/java/.../trading/api/`.
- Put persistence entities and repositories in `backend/src/main/java/.../trading/domain/` and `repository/`.
- Put schema changes in `backend/src/main/resources/db/migration/`.

### DevOps and platform engineers
- Keep deployment, infrastructure, and release automation at the repo root under `ops/`.
- Keep service-level environment contracts documented in `README.md`, `web/README.md`, and `backend/README.md`.
- Avoid mixing deployment assets into `web/` or `backend/` unless they are service-local runtime files.

## Placement Rules
- Keep the repo root lean: only shared docs, repo config, and top-level app folders belong there.
- Keep `web/public/` for shipped browser assets only.
- Keep fixtures used by scripts or tests out of `web/public/`; place them next to the script or test that uses them.
- Keep ignored local state out of source folders. The root `.gitignore` owns editor, build, database, and frontend generated files.
- If a utility is frontend-only, place it in `web/scripts/`. If a utility spans multiple services, place it under a future root `scripts/` directory.

## Reserved Paths
- `ops/`: infrastructure-as-code, deployment manifests, container assets, CI/CD templates.
- `docs/`: shared contributor and operator documentation.

## Current Local-Only Areas
- `web/.env.local`
- `web/.tools/`
- `backend/data/`
- `backend/target/`
- `.github/java-upgrade/`

These are intentionally excluded from version control or reserved for local tooling.
