# XianCardGame Next.js Frontend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Expo frontend with a production-ready Next.js game client that preserves the real FastAPI contract and fixes unreadable animation, hidden top-card information, inconsistent typography, and overlap defects.

**Architecture:** Use Next.js App Router for the Vercel shell, Zustand for client session state, and a typed API boundary for FastAPI. The backend remains the sole rule authority; event playback is a separate presentation queue with persistent history.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Zustand, Vitest, Playwright, FastAPI, Render Docker.

---

### Task 1: Replace the Expo shell

**Files:**
- Replace: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/app/**`, `frontend/components/**`, `frontend/public/**`
- Create: `frontend/.env.example`, `frontend/vercel.json`

**Steps:**
1. Copy the approved Next.js reference scaffold without build artifacts.
2. Remove Expo-only configuration and dependencies.
3. Enable strict TypeScript build errors and add lint/test scripts.
4. Run `npm install` and `npm run typecheck`; expect no errors.

### Task 2: Port the typed API and state boundary

**Files:**
- Create: `frontend/types/*.ts`, `frontend/lib/api/*.ts`, `frontend/lib/game-store.ts`
- Test: `frontend/tests/api-normalization.test.ts`, `frontend/tests/game-store.test.ts`

**Steps:**
1. Port the frozen contract types and write normalization tests.
2. Change environment names to `NEXT_PUBLIC_*` and default to localhost.
3. Preserve revision conflict recovery and event ordering.
4. Run unit tests; expect all tests to pass.

### Task 3: Connect setup and both advanced AI algorithms

**Files:**
- Modify: `frontend/components/screens/BattleSetupScreen.tsx`, `frontend/components/screens/AILabScreen.tsx`, `frontend/components/GameApp.tsx`

**Steps:**
1. Load `/agents` and expose Rule, Random, ISMCTS, and available MCCFR models.
2. Ensure ISMCTS simulation values and MCCFR model ids form correct `POST /games` payloads.
3. Disable unavailable MCCFR models with a clear explanation instead of silently falling back.
4. Test request generation for ISMCTS and MCCFR.

### Task 4: Implement the authoritative battle flow

**Files:**
- Modify: `frontend/components/screens/BattleScreen.tsx`, `frontend/components/game/GameCard.tsx`, `frontend/components/game/modals/*.tsx`
- Create: `frontend/components/game/EventStage.tsx`, `frontend/components/game/BattleLog.tsx`

**Steps:**
1. Render players, hand, counters, piles and action state from `GameView`.
2. Bind every button to a backend-provided action id.
3. Implement target, counter/escape, reorder and reinsert decisions.
4. Keep decision modals open until explicit confirmation.
5. Add accessible disabled/loading/error states.

### Task 5: Fix pace, typography, overlap, and effects

**Files:**
- Modify: `frontend/app/globals.css`, battle components and modal primitives.
- Test: `frontend/tests/event-presentation.test.ts`

**Steps:**
1. Set readable event durations and user-selectable playback speed.
2. Add persistent history and pause/skip controls.
3. Normalize Chinese typography and remove excessive tracking.
4. Add semantic jade/gold/lightning effects with reduced-motion fallbacks.
5. Inspect 390x844, 430x932, 768x1024, and 1440x900 screenshots.

### Task 6: Deployment and full verification

**Files:**
- Modify: `README.md`, `docs/API_CONTRACT.md`, `docker-compose.yml`
- Create/Modify: `frontend/vercel.json`, `backend/render.yaml`, root `render.yaml` if needed.

**Steps:**
1. Document Vercel root directory and `NEXT_PUBLIC_API_BASE_URL`.
2. Confirm Render Docker build/start/health configuration and CORS settings.
3. Run frontend typecheck, unit tests, lint, production build, backend pytest and API E2E.
4. Run a browser smoke flow for normal play and each special action.
5. Review `git diff --check`, secrets scan and changed-file scope.
6. Sync the validated commits to the original checkout, push `master`, and report the commit hash.
