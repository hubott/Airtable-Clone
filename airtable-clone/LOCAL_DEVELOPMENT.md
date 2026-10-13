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

A fresh database has no bases or tables. Sign in to create your user, then choose **+ New base** on the dashboard. Enter a name and create it; the app opens the new base. Choose **+ New table** there to create your first table. It opens with a Text column named **Name** and one blank row, ready to edit. Both creation forms support Cancel, show pending/errors, and preserve drafts after failure. The existing seed script requires an existing table and adds 100,000 rows; it is not a fresh-database bootstrap and should not be run automatically.

## Start and use

```sh
npm run dev
```

Open http://localhost:3000 and choose **Continue with Google**. Successful sign-in takes you to your dashboard, where you can open a base/table. If already signed in, the home page shows **Go to dashboard**. The shared navigation bar includes **Dashboard** and **Sign out** on every page. Signing out returns you to the login page; visiting any dashboard route while signed out redirects there too. Changes to source files refresh automatically. Restart the dev server after changing `.env`. Use port 3000 so the local auth URL and Google callback agree.

Cell controls:

- Click a cell to focus/select it.
- Double-click or press Enter to edit.
- Enter saves; Escape cancels.
- Clicking away cancels an unsaved draft.
- Arrow keys move between selected cells. Tab/Shift+Tab move forward/backward and wrap across rows. At table boundaries, Tab on a selected cell follows normal browser navigation.
- While editing, Tab/Shift+Tab save before moving. Invalid values stay in the editor; failed saves restore the old value and keep focus on the original cell. Arrow keys move the text cursor normally.
- Navigation scrolls offscreen rows into view and fetches the next page when needed. After editing the first/last cell with Tab, press Tab again to resume normal browser focus navigation if there is no adjacent cell.
- Empty text or whitespace-only numeric input clears the cell. Invalid numbers stay in the editor with an error.
- Select a cell and use Ctrl/Cmd+C to copy its value, or Ctrl/Cmd+V to paste and save one value immediately. Pasting invalid numeric input or a multi-cell spreadsheet range shows an error and preserves the old value. Empty text clears the cell.
- Copy/paste inside the editor retains normal text selection behavior; press Enter or Tab to save afterward.
- Saving is optimistic. Failed writes restore that cell's previous value and show an error above the grid; edit again to retry.

Use **← Back to dashboard** from a base and **← Back to base** from a table to navigate upward.

Base/table renaming:

- Choose **Rename** beside a base or table in its list, or beside the resource heading. Names must contain 1–100 characters after trimming.
- **Save** or Enter persists the name; **Cancel** or Escape discards the draft. Failed saves preserve the draft and show an error.
- Names update in both list and detail views; resource URLs and table contents remain unchanged.

Row controls:

- **+ Add row** inserts a blank row at the top and scrolls to it.
- The **trash icon** beside a row number opens a deletion confirmation. Confirming removes the row and all its cells; Cancel preserves it.
- Row changes update the grid after the server confirms success. Failures keep the existing grid data and show an error.
- Finish pending cell saves before adding or deleting rows. Cell editing is disabled briefly during row operations.
- Pagination uses `(order, id)` boundaries, so deleting the last row of a fetched page does not break loading the next page.

The grid supports horizontal scrolling with 240px-wide columns, keeping the row-number/delete gutter pinned. Arrow/Tab navigation scrolls the selected column into view. Rows remain virtualized for vertical scrolling.

Column controls:

- **+ Add column** opens a form for a name (1–100 characters) and Text/Numbers only input type.
- **Create column** appends the column to the right. Existing rows start with empty values, and cells are created when edited.
- Failed creation preserves the form and shows an error. **Cancel** closes the form without creating a column.
- Click a column name (with its pencil icon) to rename it. Enter or **Save** persists the name; Escape or **Cancel** discards the draft. Failed saves keep the editor open and preserve the existing header name.
- The trash icon in a column header opens confirmation to delete that column and all its values. Cancel preserves it; failed deletion leaves the grid intact. Other columns and rows are preserved, including when deleting the last column.
- Click a header’s **Text** or **Numbers only** badge to preview a type change. Invalid values block confirmation and show examples; correct them and choose **Refresh preview**. Confirmation converts all stored values together, preserves blanks and refreshes rows from the top. Conversion to numbers loses text formatting such as leading zeros and uses floating-point precision. Cancel leaves data unchanged.
- Use the **← / →** buttons in column headers to move columns one position left/right. Boundary moves are disabled. Names, types and values move together; failures preserve the current order and show an error. Keyboard navigation follows the new column order.
- No schema migration is required for column creation or renaming.

## Verify

```sh
npm run typecheck
npm test
npm run lint
```

Verify authentication manually: sign in from `/`, open a table and sign out from its header. Confirm you return to `/` and visiting `/dashboard` while signed out redirects to login. Sign-in failures should show an error on the login page, and auth buttons should prevent repeated clicks while pending. Automated tests use mocked database access. Verify persistence by editing TEXT and NUMBER cells, clearing values and reloading the page while signed in. Verify rollback by blocking `/api/trpc/cell.updateCell` in browser developer tools, editing and saving a cell, and checking that its previous value is restored. Also test editing different cells while a save is pending and scrolling during saves.

Lint uses the ESLint CLI directly, checks all maintained code, and requires zero warnings. It runs without application credentials. Generated Prisma files, `next-env.d.ts` and `.next/` are excluded. Use `npm run lint:fix` for automatic fixes or `npm run check` for lint and TypeScript together.
