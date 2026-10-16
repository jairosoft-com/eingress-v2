# Ticket 211793 - split names into First / Last: database checklist

Run this **once per database** (every laptop that has its own eIngress database, and the server).
It changes users and registration requests from one `full_name` column to `first_name` + `last_name`.
Until you finish it, do **not** start the new backend against that database.

Commands are Windows `cmd`. Use the database name from `backend\.env` (`DATABASE_URL=...@localhost:5432/<name>`);
`eingresssystem` below is the usual one. On the server, run everything on the server itself.

## 0. Before you start
- [ ] Repo is on the branch / commit that contains the work: `git fetch` then `git switch Ticket-211793-User-First-Last-Name`
      (or `git pull` on `main` once the PR is merged). No `npm install` needed.
- [ ] You know the Postgres password for the `postgres` user.

## 1. Back up
- [ ] `pg_dump -U postgres -h localhost -Fc eingresssystem -f before_211793.dump`
      Keep this file until everything below works.

## 2. Preview (writes nothing)
- [ ] `cd backend`
- [ ] `node scripts\migrate-split-user-names.mjs`
      Expect: "N unsplit record(s) found -> X split, Y need review", then a list of the Y names.

## 3. Split the names
- [ ] `node scripts\migrate-split-user-names.mjs --apply`
      Two-word names are split automatically. Everything else is listed as "needs review" and keeps its name untouched.

## 4. Fix the ones that need review
Pick **one**:
- [ ] **In the app** (only on the earlier build that still shows the "Needs review" badge): User Management -> edit the
      person -> fill First Name and Last Name -> Save.
- [ ] **With SQL:** ask for `211793-fix-review-names.sql` (it is not in git), then
      `psql -U postgres -h localhost -d eingresssystem -f 211793-fix-review-names.sql`
      It only matches the known employees; on any other database it updates 0 rows and is harmless.
- [ ] **Registration requests** (Enrollment Requests) with 3+ word names cannot be edited in the app. Either reject them or run
      `UPDATE enrollment_requests SET first_name = '<First>', last_name = '<Last>' WHERE request_code = 'REQ-000x';`

Then repeat step 3. It must print **`total still needing review in users: 0`** and the same for `enrollment_requests`.

## 5. Drop the old column
- [ ] `node scripts\migrate-split-user-names.mjs --drop-full-name`   (preview, writes nothing)
- [ ] `node scripts\migrate-split-user-names.mjs --drop-full-name --apply`
      It refuses to run while anyone still needs review - fix them and retry.

## 6. Start the new code
- [ ] Restart the backend (and rebuild/restart the frontend if you serve a build).
- [ ] Open User Management: names show as before; Add/Edit shows First Name and Last Name.
- [ ] Open the registration form: First Name and Last Name fields.

## If something goes wrong
- **"column full_name does not exist"** in the backend log: the new database is running with the old code. Update the code
  (step 0) and restart.
- **"null value in column full_name"** when adding a user: the database was not dropped yet but the new code is running.
  Finish steps 3-5.
- **The drop step lists names:** those people still need First/Last (step 4).
- **Undo everything:** stop the backend, then
  `pg_restore -U postgres -h localhost -d eingresssystem --clean --if-exists before_211793.dump`
  and switch back to the previous code.

Order matters: finish step 5 **before** step 6. The old code reads `full_name`; the new code does not write it.
