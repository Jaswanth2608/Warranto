## Audit and verification notes

This app has been audited end to end from a code + test perspective.

### What passes

- Auth: registration, duplicate-email rejection, login, current-user endpoint,
  protected-route 401/503 behaviour.
- Products: create, read, list, patch, delete, server-derived warranty, ownership
  scoping, and input validation.
- Bills: upload, list, read, replace, delete, ownership scoping, type/size/spoof
  validation, and legacy bill-metadata rejection.
- Unit suites: OCR suggestion helpers, scan validation, scan failure paths,
  warranty date helpers.
- Health/404/malformed-request/CORS smoke tests.

### What is fixed but should be re-run

The following had real implementation bugs that were fixed during this audit:

- Calendar events endpoint was mounted without authentication.
- Reminder creation did not atomically prevent duplicate same-product +
  same-milestone reminders.
- Reminder creation allowed a reminder for a warranty expiring on the current day.
- Task serialization omitted `source`.
- Reminder controller had a syntax error and inconsistent read serializers.
- Some backend tests used an invalid GET-with-body request pattern for calendar
  calls.

Re-run the full suite after the fixes:
```bash
cd backend && npm test
```
The failing-tests list from the last run was:
- tasks CRUD/complete/reopen/delete/filters/ownership
- calendar items outside month and deleted products excluded
- reminder create/list/get/delete and do-not-create for expired products
- reminder deduplication
- calendar events scoped to authenticated user
- a second calendar out-of-month exclusion failure

Those are the tests that should turn green once the fixes land cleanly.

### What needs a decision or external setup

- Account model: the audited auth flow does not include a password field or
  change-password endpoint. If you want password-based accounts, add a real user
  password model + hashing + password-change route. If this is meant to be
  passwordless, the Register/Login UI should match that.
- Email reminders: set `MAIL_MODE=smtp` and SMTP_* vars in `backend/.env` and
  restart the server. Without that, reminder email endpoints return 501.
- Scheduler: the reminder scheduler exists but is not yet hardened for
  multi-instance deploys or crash-restart correctness. Do not rely on it as
  production background-job infrastructure in its current form.
- OCR: treat as not implemented until a working Tesseract runtime is configured
  and proven with a real scan.
- Service history: controllers/routes/models exist but have no passing backend
  test coverage yet.
- Deployment: no deployment was verified in this audit. To deploy, configure
  `backend/.env` (MongoDB + SMTP), `frontend/.env` (API base URL), run the
  frontend build, and deploy the backend API and static frontend to your chosen
  hosting. Bill storage and the scheduler need special attention if you run
  more than one backend instance.

### Local commands

Backend:
```bash
cd backend
npm install
npm run dev      # nodemon
npm start        # plain node
npm test         # test suite
```

Frontend:
```bash
cd frontend
npm install
npm run dev      # Vite dev server
npm run build    # production build
npm run preview  # preview built app
```

### Where to find the detailed audit write-ups

- `backend/backend-audit/summary-by-feature.md` — feature-by-feature status table.
- `backend/backend-audit/critical-bugs.md` — concrete bugs fixed/identified.
- `backend/backend-audit/test-results.md` — backend test run summary.
- `backend/backend-audit/deployment-and-config.md` — config, secrets, scheduler,
  storage, and deployment notes.
