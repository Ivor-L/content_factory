# Documentation & Configuration Refactor Spec

## Why
The current project documentation is scattered, and crucial configuration (Credit System API URL) is hardcoded. To improve maintainability and onboarding, we need to centralize documentation and externalize configuration.

## What Changes
- **Create `docs/` directory**: Central location for detailed documentation.
- **New `docs/CREDIT_SYSTEM.md`**: Detailed guide on the external Credit System API and internal integration logic.
- **New `docs/DATABASE.md`**: Documentation of the Prisma schema and Supabase specific tables.
- **Refactor API Configuration**: Update `app/api/integration/credits/route.ts` to use `process.env.POINTS_API_BASE` instead of a hardcoded string.
- **Update `ENV_CONFIG.md`**: Add the new `POINTS_API_BASE` environment variable.
- **Update `README.md`**: Add references to the new documentation files.

## Impact
- **Affected Specs**: None.
- **Affected Code**: `app/api/integration/credits/route.ts`.
- **New Files**: `docs/CREDIT_SYSTEM.md`, `docs/DATABASE.md`.

## ADDED Requirements
### Requirement: Centralized Documentation
The system SHALL provide a `docs/` folder containing detailed system documentation.

### Requirement: Externalized API Configuration
The system SHALL use the `POINTS_API_BASE` environment variable for the Credit System API URL, falling back to a default value if not provided.

## MODIFIED Requirements
### Requirement: Project README
The `README.md` SHALL link to the detailed documentation in `docs/`.
