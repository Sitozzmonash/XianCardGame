# Vercel Services + Neon session persistence

## Goal

Deploy the Next.js frontend and FastAPI backend as two Vercel Services from
one repository.  Route browser requests for `/api/v1/*` to FastAPI on the
same origin, and persist active game sessions in Neon PostgreSQL so a Vercel
Function cold start or a different function instance does not lose a game.

## Boundaries

- `DATABASE_URL` is a Vercel encrypted environment variable.  It is never
  committed and the repository only contains blank templates.
- The FastAPI route contract remains `/api/v1/*`; the frontend uses the
  relative `/api/v1` base path in production.
- Keep local development usable without PostgreSQL: absent `DATABASE_URL`
  retains the existing in-memory `SessionStore` behavior.
- Store a JSON-safe game/session snapshot, not Python pickles.  This avoids
  putting executable serialized data in the database and does not duplicate
  MCCFR model payloads per game.
- Use an optimistic revision check when saving an action so two serverless
  instances cannot silently overwrite each other.

## Work items

1. Add root `vercel.json` with `frontend` and `backend` Services, FastAPI
   entrypoint `app.main:app`, and same-origin `/api/v1/*` routing.
2. Add blank `backend/.env.example`; change the frontend example to the
   production relative API base; remove superseded Render blueprints.
3. Add JSON snapshot/restore support to `GameSession`, a lazy psycopg-backed
   PostgreSQL repository, and a `SessionStore` adapter that selects it only
   when `DATABASE_URL` is set.
4. Persist after creation and actions, with database TTL cleanup and a
   revision conflict mapped to the existing stale-revision API error.
5. Add unit tests for snapshot restoration and persistent-store semantics,
   then run backend tests, frontend checks/build, and push the verified commit.

## Deployment hand-off

Set `DATABASE_URL` and the listed non-secret settings in the Vercel project
for the backend Service.  The database table is created automatically by the
first backend request; no manual migration or SQL console action is needed.
