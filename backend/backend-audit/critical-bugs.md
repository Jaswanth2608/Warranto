# Warranto — critical bugs found during this audit

These are the concrete implementation bugs fixed or identified this audit. Soft
gaps / config gaps are in `summary-by-feature.md`.

## 1. Calendar endpoint mounted without authentication

**File:** `backend/server.js:109`  
**Symptom:** `GET /api/calendar/events` returned data for any caller and the
controller crashed when trying to read `req.user`.  
**Fix:** Route now goes through `protect` + `requireDb`, and `server.js` imports
`protect, requireDb` from `authMiddleware`.

## 2. Reminder create did not prevent duplicates at request time

**File:** `backend/controllers/reminderController.js` :: `createReminder`  
**Symptom:** Repeated or concurrent calls could create duplicate same-user +
same-product + same-milestone reminders even though the schema has a unique
compound index. The API never surfaced a clean "already exists" error.  
**Fix:** Wrapped the check + insert in a Mongoose session/transaction. If an
existing reminder is found, return 409 `A reminder for this product and
milestone already exists.` and abort the transaction.

## 3. Reminder expiry boundary off-by-one

**File:** `backend/controllers/reminderController.js` :: `createReminder`  
**Symptom:** `if (expiry < today)` allowed creating a reminder for a product
whose warranty expires *today*. The expected behaviour for the test was to
reject that case.  
**Fix:** Changed to `if (expiry <= today)`.

## 4. Task serialization missing `source`

**File:** `backend/models/Task.js` :: `toJSON()`  
**Symptom:** Task responses omitted `source`, and the task test assertion on
task shape / product name was failing because the task enrichment path relied
on a complete task representation.  
**Fix:** `toJSON()` now returns `source` (default `'custom'`) in addition to the
existing fields.

## 5. Reminder controller had a syntax error and inconsistent read serializers

**File:** `backend/controllers/reminderController.js`  
**Symptom:** Two `require(...)` statements were concatenated on one line, so the
module failed to load. Also `listReminders` and `getReminder` did not agree on
how they serialized product info.  
**Fix:**
- Split the require lines.
- `listReminders` now uses `.lean()` and explicitly attaches `productName`/`productSerialNumber`.
- `getReminder` now uses `.lean()` + explicit field mapping instead of relying on
  Mongoose document getters.

## 6. Calendar tests used an invalid GET-with-body request pattern

**File:** `backend/tests/api.db.test.js`  
**Symptom:** Some calendar test calls passed `body:` on a `GET`, which is not
valid HTTP and confused the test helper / server behaviour.  
**Fix:** Those calls now pass year/month as query parameters instead of a body.
Remaining calendar GET-with-body instances were normalized in the same pass.

## Still to verify (not fixed this turn)

- Frontend Vite build / dev start was not executed this turn; it should be run
  and the main flows walked before final sign-off.
- Service-history and service-cost-total flows have controllers/routes/models but
  no passing backend tests in the current suite.
- OCR integration has no evidence of a working Tesseract runtime in this project;
  treat as not implemented until proven.
- Password-based account model is not present in the part of the app we audited;
  if passwords are intended, the `User` model + change-password route are missing.
