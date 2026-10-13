# Backend test results (this audit run)

Run command used:
```bash
cd backend && npm test
```

Summary line from the runner:
- tests: 79
- suites: 5
- pass: 73
- fail: 6
- cancelled: 0
- skipped: 0
- todo: 0
- duration: ~11.9s

The last run in this session still had 6 failures at the point the session was
interrupted. Those failures were:

1. `tasks: CRUD, complete, reopen, delete, filters, ownership`
2. `calendar: items outside the month and deleted products are excluded`
3. `reminder: create, list, get, delete, and do-not-create for expired products`
4. `reminder: deduplication — do not create duplicate reminders for same product + milestone`
5. `calendar: events are scoped to the authenticated user and only include in-month items`
6. `calendar: items outside the month and deleted products are excluded` (second calendar failure in the same run)

These map to the bugs fixed this audit:

- Calendar auth-mount bug → affects calendar scoping test and the email-error
  path reached during that request.
- Reminder duplicate + expiry-boundary bugs → affect the two reminder tests.
- Task `source` serialization + task enrichment path → affects the tasks test.

What was **not** missing functionality, just broken:
- Auth, products, bills, bill-ownership, bill-validation, and the "legacy bill
  metadata no longer creates bills" tests all passed.
- The unit-style suites (`ocrScanner`, `scanService.validate`,
  `scanService failure paths`, `ocrScanner failure paths`, `warranty date
  helpers`) passed.
- A number of standalone HTTP smoke tests also passed (health, 404, malformed
  JSON, register validation, auth 401/503 behaviour, product 401/400 ordering,
  bill 401/400 ordering, CORS).

What I did **not** re-run in this turn:
- A final clean full-suite run after all the fixes above. That re-run is the
  next verification step.

How to reproduce:
```bash
cd backend && npm test
```

If any of the six listed tests still fail after the fixes in this audit, the
remaining failure is a real bug to keep fixing, not a test artifact.

Reminder: this project uses `node --test` with an in-memory/test MongoDB setup
per run. The audit did not add new tests; it only fixed implementation so
existing tests can pass.
