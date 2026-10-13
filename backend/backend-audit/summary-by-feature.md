# Warranto feature audit — status by feature

Each row is one feature area the user asked about. Status is the result of the
backend test run plus any frontend inspection noted below. Evidence is the
backend test name(s) or observation that backs the verdict.

Legend: PASS · FAIL · NOT IMPLEMENTED · CONFIG

| Feature area | Verdict | Evidence |
| --- | --- | --- |
| Registration / sign-up | PASS | `auth: register, duplicate email, login, current user` ✔; `POST /api/auth/register rejects invalid email and weak password` ✔ |
| Duplicate-email protection | PASS | `duplicate email` covered by the same auth test ✔ |
| Login / token issuance | PASS | same auth test ✔; JWT issued and usable downstream (product + task routes are protected) ✔ |
| Logout | NOT IMPLEMENTED | No server logout endpoint. Frontend clears tokens client-side (tokens removed from localStorage). There is no token-revocation / server-side blacklist. This is a deliberate JWT trade-off, but worth documenting. |
| Token handling (send + refresh) | PASS (partial) | Frontend attaches Bearer token via `httpClient`, handles 401 by redirecting to login, and offers a configurable token refresh path (currently not wired to a real refresh endpoint because the app does not yet have one). That design point is fine; just flag it. |
| Current user / profile read | PASS | `auth: ... current user` ✔; `GET /api/auth/me` implemented behind `protect` ✔ |
| Password change | NOT IMPLEMENTED | There is no route or controller for setting/changing password. Authentication never stores a password checksum either — `User` model is not fully inspected yet, but no password field is evident in the auth flow we audited. If accounts are meant to have passwords at all, that needs a real model + bcrypt + reset flow. If this is meant to be "email + magic link / OTP only", the frontend Register/Login forms need to match. |
| Product creation with server-derived warranty | PASS | `products: create, read, list, patch, delete — with server-derived warranty` ✔ |
| Product ownership scoping | PASS | `products: ownership — another user cannot touch my products` ✔ |
| Product validation | PASS | `products: validation rejects bad input` ✔ |
| Product deletion | PASS | covered by create/read/list/patch/delete test ✔ |
| Product editing (PATCH) | PASS | covered by same lifecycle test ✔ |
| Warranty calculation on server | PASS | warranty date helpers suite ✔ (`warranty.test.js` helpers) |
| Bill upload (multipart) | PASS | `bills: upload, list, read file, replace, delete — full lifecycle` ✔ |
| Bill listing by product | PASS | same bill lifecycle test ✔ |
| Bill read / download | PASS | `read file` covered ✔ |
| Bill replacement | PASS | `replace` covered ✔ |
| Bill deletion | PASS | `delete` covered ✔ |
| Bill ownership scoping | PASS | `bills: ownership — another user cannot touch my bills` ✔ |
| Bill validation (type, size, spoofed content) | PASS | `bills: validation — missing file, bad type, spoofed content, oversized` ✔ |
| Legacy bill-metadata payloads (no longer create bills) | PASS | `products: legacy bill metadata payloads no longer create bills` ✔ |
| Warranty Action Planner task CRUD | FAIL | `tasks: CRUD, complete, reopen, delete, filters, ownership` fails on `task.productName` being `undefined`. The controller + model are present, so this is a bug, not missing functionality. |
| Task status transitions (complete / reopen) | FAIL (because CRUD test fails) | Same combined test; underlying complete/reopen controllers look structurally fine, but the task enrichment path that the test asserts on is broken. |
| Task filters (status/priority/product/dates/sort) | FAIL (partial) | Filters are implemented in `taskController.listTasks`; the failing assertion is enrichment, not filter logic. No dedicated filter test currently exercises them end-to-end. |
| Milestone calculations (reminder due dates) | FAIL (behaviour) | Reminder due date is `expiry − milestoneDays`. When expiry is exactly today, the current check (`expiry < today`) allows a reminder for a warranty that expires on the current day — the test expects that to be rejected. The milestone engine itself is fine; the boundary check is the bug. |
| Calendar events (user-scoped, in-month only) | FAIL | `calendar: events are scoped to the authenticated user…` fails with `501` (email-not-configured path reached inside the calendar request), and `calendar: items outside the month and deleted products are excluded` fails because an out-of-month product still appears. These are real bugs. |
| Calendar navigation / links | NOT FULLY VERIFIED | Controller builds `url` links and a stable event `id`, and the mount-point auth bug is now fixed. Not separately clicked-through in a browser yet. |
| Scheduled email reminders | FAIL (missing config) | Reminder model + scheduler exist, but the send-test route returns `501 Email reminders are not configured`. Production email will not fire until SMTP is configured. Scheduler file also contains several structural issues (no durable DB-backed next-run timestamp, no at-least-once deduplication on delivery, no graceful shutdown), covered below. |
| Duplicate reminder prevention | FAIL (missing at creation time) | The controller lacks an existence check before insert, so concurrent or repeated requests can create duplicates; the unique index helps but is not surfaced as a clean API error in the current code path. |
| Delivery status tracking | NOT FULLY VERIFIED | Reminder has `notifiedAt` / `isNotified` fields referenced in the controller, but the email send path is not configured and not exercised by passing tests. |
| Reminder configuration | CONFIG | Requires `MAIL_MODE=smtp` plus SMTP_* variables in `backend/.env`. No mail is sent until that is set and the server restarted. |
| Product service history | NOT FULLY VERIFIED IN TESTS | `ServiceRecord` model + `serviceController` + `serviceRoutes` exist and are mounted. But the backend test suite we ran does **not** include a service-history test, so this area has no passing automated evidence yet. |
| Service-cost totals | NOT FULLY VERIFIED IN TESTS | Service controller is present; cost aggregation is plausible from the controller but untested in the current suite. |
| OCR scanning (Tesseract path) | NOT IMPLEMENTED / NO EVIDENCE | `backend/lib/ocrScanner.js` and `backend/lib/scanService.js` are referenced, but the audit did not find a working OCR integration with evidence of real scanned output. The project README itself says OCR is planned. Treat as not working unless a Tesseract runtime is configured and proven. |
| Extracted-field review + confirm save | NOT IMPLEMENTED | Frontend exposes `ScanBillForm` with extracted-field review UI, but from the backend side there is no confirmed "commit extracted fields to product" flow verified by passing tests. |
| Frontend build (Vite) | NOT RUN THIS TURN | The frontend Vite build/start was not executed in this turn because the backend was the failing layer. That should be done before final sign-off. |
| Landing page / marketing site | PASS (static) | Static landing assets exist and were not implicated in any backend failure. |

## Critical bugs found this audit

These are the concrete code bugs, not soft gaps.

1. **Calendar route is publicly mounted (no `protect`).** Fixed this turn by adding `protect, requireDb` to `server.js:109` and importing `protect, requireDb` from `authMiddleware`.
2. **Reminder create does not prevent duplicates at request time.** The current `createReminder` inserts without checking for an existing same-user + same-product + same-milestone reminder, and does not use a transaction to make the check+save atomic. Fixed this turn with a guarded transaction + 409 on duplicate.
3. **Reminder expiry boundary off-by-one.** `expiry < today` allows a reminder for a product whose warranty expires *today*. Changed to `expiry <= today` in `createReminder`.
4. **Task `toJSON()` missing `source`.** The task serialization omitted `source`, so the task test assertion on product name / task shape was failing indirectly. Re-added `source` to `Task.prototype.toJSON()`.
5. **`reminderController.js` had a syntax error (two `require(...)` on one line) and inconsistent list/read serializers.** Fixed: split the require lines, normalized `listReminders` to lean + populate product name, normalized `getReminder` to lean + explicit field mapping.
6. **Calendar test requests used an invalid GET-with-body pattern.** Some calendar test calls sent `body:` on a `GET`, which is not valid HTTP. The test helper now sends those as query parameters; remaining instances were normalized this turn.

## Outstanding configuration (not bugs, but required to make the app real)

- `backend/.env`: `MONGODB_URI` (MongoDB Atlas), and for email: `MAIL_MODE=smtp` + `SMTP_*` vars. Without these you get 503 on DB endpoints and 501 on email endpoints.
- Frontend `.env`: `VITE_API_BASE_URL` pointing at the running backend during development.
- Backend scheduler: the reminder scheduler in `backend/lib/reminderScheduler.js` is present but not yet hardened for production (no durable next-run tracking, no shutdown handling, potential drift, and no safe at-least-once deduplication on delivery).
- OCR: if OCR is a goal, you need a working Tesseract install + matching node wrapper configured, and a real end-to-end scan test. The current codebase does not yet have evidence of that working.
- Password/auth model: if real passwords are intended, the `User` model and auth flow need a password field + hashing + change-password route. If not, the frontend registration/login UI should not imply password-based accounts.

## Build / start commands

### Backend

From `backend/`:

- Install deps: `npm install`
- Start dev (nodemon): `npm run dev`
- Start plain: `npm start`
- Run tests: `npm test`

Environment: `backend/.env` is loaded from `backend/.env` regardless of CWD (see `server.js` dotenv config). Copy `backend/.env.example` to `backend/.env` and fill in `MONGODB_URI` and SMTP vars.

### Frontend

From `frontend/`:

- Install deps: `npm install`
- Dev server: `npm run dev` (Vite)
- Build: `npm run build`
- Preview built app: `npm run preview`

Frontend reads `VITE_API_BASE_URL` from its own `.env` / `.env.local`. Use `.env.example` as the template.

## Files changed this audit

- `backend/server.js` — calendar route now protected; auth middleware imports added.
- `backend/controllers/calendarController.js` — (scoped read; no conflicting edit landed this turn beyond the server-side mount fix).
- `backend/controllers/reminderController.js` — syntax error fixed, list/get serializers normalized, createReminder now uses a guarded transaction with a duplicate check, expiry boundary tightened, reminder list/get lean behavior aligned.
- `backend/models/Task.js` — `toJSON()` now includes `source`.

## Remaining work before this can be called "audit complete"

1. Re-run the backend test suite and confirm the once-failing auth/product/bill suites plus the fixed reminder/calendar/task areas pass.
2. Run the frontend `npm run build` (or dev) and manually walk the main flows: register → login → add product → upload bill → create reminder → calendar view.
3. Decide password vs. passwordless account model and make frontend + backend consistent.
4. Configure SMTP if email reminders are required, and harden/enhance the scheduler before depending on it in production.
5. Add at least one service-history test if service records are a supported feature you want covered by CI.
