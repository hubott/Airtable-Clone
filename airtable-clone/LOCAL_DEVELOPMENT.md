# Running the Airtable clone locally

Run these commands from `Airtable-Clone/airtable-clone/`.

## Install and configure

```sh
npm ci
cp .env.example .env
```

The `.env` file is gitignored. Fill in `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET` and `DATABASE_URL`. Keep `AUTH_URL=http://localhost:3000`.

For your existing Vercel deployment, open the project's **Settings → Environment Variables** and copy the needed values into `.env` locally. Do not paste credentials into chat. Use a dedicated development database or branch if available: editing local cells writes to whichever database `DATABASE_URL` points at.

Alternatively, if you have the Vercel CLI, link the existing project and download its Development variables:

```sh
npx vercel login
npx vercel link
npx vercel env pull .env --environment=development
```

See [Vercel's environment variable CLI documentation](https://vercel.com/docs/cli/env). Variables configured only for Production will not be included in a Development pull. Configure the required Development values in Vercel first, or copy them manually. Set `AUTH_URL` to the local origin after downloading and remove any deployed `NEXTAUTH_URL`. This workflow downloads configuration; it does not deploy the app.

Generate a fresh local auth secret with `openssl rand -base64 32` and put it in `NEXTAUTH_SECRET`. NextAuth also supports `AUTH_SECRET`, but this project's validation currently expects `NEXTAUTH_SECRET`.

In your Google Cloud OAuth client's authorized redirect URIs, add:

```text
http://localhost:3000/api/auth/callback/google
```

See [Auth.js Google provider documentation](https://authjs.dev/reference/core/providers/google). Keep the deployed redirect URI too. If the OAuth app is in testing mode, your Google account must be an allowed test user.

## Database

If using an existing development database with the current schema and data, no new migration is required for editable cells.

For a fresh local PostgreSQL database, start Docker Desktop, set a non-default database password in `.env`, and run:

```sh
bash start-database.sh
npm run db:migrate
```

The script creates a PostgreSQL container using the database name, password and port from `DATABASE_URL`. A Homebrew PostgreSQL installation is another option; create the matching database/user before running migrations.

A fresh database has no bases or tables. Sign in first to create your user, then create owned sample data using Prisma Studio (`npm run db:studio`) or a deliberate development-only fixture. The current UI can add rows to existing tables but cannot create tables yet. The existing seed script requires an existing table and adds 100,000 rows; it is not a fresh-database bootstrap and should not be run automatically.

## Start and use

```sh
npm run dev
```

Open http://localhost:3000, sign in, then visit http://localhost:3000/dashboard and open a base/table. Changes to source files refresh automatically. Restart the dev server after changing `.env`. Use port 3000 so the local auth URL and Google callback agree.

Cell controls:

- Click a cell to focus/select it.
- Double-click or press Enter to edit.
- Enter saves; Escape cancels.
- Moving focus away (including Tab) cancels an unsaved draft.
- Empty text or whitespace-only numeric input clears the cell. Invalid numbers stay in the editor with an error.
- Saving is optimistic. Failed writes restore that cell's previous value and show an error above the grid; edit again to retry.

Row controls:

- **+ Add row** inserts a blank row at the top and scrolls to it.
- The **×** beside a row number opens a deletion confirmation. Confirming removes the row and all its cells; Cancel preserves it.
- Row changes update the grid after the server confirms success. Failures keep the existing grid data and show an error.
- Finish pending cell saves before adding or deleting rows. Cell editing is disabled briefly during row operations.
- Pagination uses `(order, id)` boundaries, so deleting the last row of a fetched page does not break loading the next page.

## Verify

```sh
npm run typecheck
npm test
npm run lint
```

Tests use mocked database access. Verify persistence by editing TEXT and NUMBER cells, clearing values and reloading the page while signed in. Verify rollback by blocking `/api/trpc/cell.updateCell` in browser developer tools, editing and saving a cell, and checking that its previous value is restored. Also test editing different cells while a save is pending and scrolling during saves.

If env variables are not configured yet, `SKIP_ENV_VALIDATION=1 npm run lint` lets lint run without credentials. It does not enable Google sign-in or database access.
