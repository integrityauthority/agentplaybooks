# Multi-database migration (removed)

This directory used to hold the design, task list and walkthrough for making
AgentPlaybooks database-agnostic via Drizzle ORM, with Microsoft SQL Server as
the second dialect.

**That effort was removed from `main` on 2026-08-01.** It had reached a state
where only two functions queried through Drizzle while every other endpoint —
including all authorization guards — still used the Supabase Data API. Setting
`DB_DIALECT=mssql` therefore started the app in a split-brain state with no
error, which is worse than not supporting SQL Server at all.

Everything is preserved on the **`feature/mssql-foundation`** branch: the
Drizzle schemas for both dialects, the committed SQL Server migration, the
Compose stack, the init/migrate/smoke scripts, and the original planning
documents (`implementation_plan.md`, `task.md`, `walkthrough.md`, and
`../database-integration.md`).

If the work is ever resumed, note what the audit found before picking it back
up:

- The committed SQL Server migration had already drifted from the schema — its
  `transport_type` CHECK constraint rejects `openapi`.
- `playbook_runs` was missing from the SQL Server schema, and `canvas` lacked
  `run_id` / `version`, so runs and optimistic locking could not work.
- The PostgreSQL triggers for `updated_at` and version history were not ported.
- `src/lib/db/index.ts` cast the SQL Server schema to the PostgreSQL type, so
  drift surfaced as a runtime `undefined` rather than a compile error.
- There was no application-layer replacement for the RLS policies, and no
  Supabase-to-SQL-Server data migration path.
- Authentication was never addressed: GoTrue has no SQL Server equivalent, so
  an air-gapped deployment needs a full auth replacement — the unimplemented
  "Phase 6".

The realistic prerequisite is migrating the remaining Supabase Data API calls
first — the same work, but against PostgreSQL, where every step can be verified
against a running system.
