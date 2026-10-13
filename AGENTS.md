# Airtable Clone — agent instructions

## Project and scope

This is a portfolio application and a learning project for a University of Melbourne Computer Science graduate. Explain important decisions and tradeoffs clearly. Work incrementally, preserve working behavior, and discuss the reasoning before large structural changes. Inspect current files before proposing changes; this document is guidance, not a substitute for the source code.

The application lives in `airtable-clone/` relative to this file. Run npm, Prisma, formatting and verification commands there. Do not implement future roadmap features incidentally.

## Architecture

- Next.js App Router, React, strict TypeScript and Tailwind CSS. The lockfile currently resolves Next.js 15.5.9, React 19.2.3, TypeScript 5.9.3 and Tailwind 4.1.18.
- tRPC 11.8.0: `src/server/api/root.ts` registers routers in `src/server/api/routers/`. `src/server/api/trpc.ts` defines context, session protection, Zod validation errors and timing middleware.
- `src/trpc/react.tsx` exposes typed React hooks and `RouterInputs`/`RouterOutputs`; `query-client.ts` configures TanStack Query and SuperJSON. Use these existing typed clients.
- PostgreSQL and Prisma 6.19.1. `prisma/schema.prisma` is authoritative; the generated client is in `generated/prisma/`, and `src/server/db.ts` manages its singleton. Do not hand-edit generated files.
- NextAuth 5.0.0-beta.25 uses Google OAuth, database sessions and the Prisma adapter. Auth configuration is in `src/server/auth/`; session users carry an `id`.
- Ownership follows User → Base (`ownerId`) → Table → Row/Column. Cell relates to both Row and Column and has the unique key `(rowId, columnId)`.
- Columns support only TEXT and NUMBER. Cells contain nullable `textValue` and `numberValue`; reset the inactive field when saving. Empty text and blank numeric input clear the value; preserve nonempty text whitespace.
- `LoadingSpinner.tsx` provides a centered viewport loading state and a compact inline variant, with accessible status text and reduced-motion support. Dashboard routes use `loading.tsx` for transitions and the same spinner for query loading; additional row fetching uses the inline variant.
- `/` is the application login page, with direct Google sign-in and a dashboard link for signed-in users. Root layout renders `AppHeader` with dashboard navigation and sign-out on every page. `src/app/dashboard/layout.tsx` redirects signed-out visitors to `/`; protected tRPC procedures and ownership checks remain mandatory. NextAuth sign-in/error pages point to `/`. Auth buttons show pending/failure states and use full-page redirects after sign-in/out.
- Routes: `/dashboard`, `/dashboard/base/[baseId]`, `/dashboard/table/[tableId]`. Shared client UI lives in `src/app/_components/`.
- The table page fetches ordered columns with `getTableWithColumns` and cursor-paginated rows with `getRows`. Rows expose `cellsByColumnId`. Pagination uses `(order, id)` value boundaries scoped to the owned table, so deleting a cursor row does not break infinite scrolling.
- Type conversion previews scan stored cells in batches, showing invalid counts and up to five examples. `column.changeType` exclusively locks the owned column, checks the expected source type, revalidates and converts batches within one transaction. Invalid data blocks conversion; it is never discarded. Cell saves take a shared column lock before reading the type. Confirmed conversions refresh the row query from the beginning; no schema migration is required. Numeric conversion can lose formatting and uses floating-point precision.
- `column.moveColumn` locks the owned table and its columns, validates column membership, swaps neighboring positions and normalizes order values in one transaction. Header arrows disable boundary moves; confirmed results update metadata without rewriting row/cell data. Metadata callbacks must only replace the fields they own (e.g. rename updates name) to avoid stale responses overwriting order/type.
- `column.deleteColumn` locks an owned column and deletes its dependent cells before the column in a transaction. Header trash buttons open explicit confirmation; successful deletion removes metadata and cached cell values. Cell saves/row operations are coordinated with deletion; deleting the final column is allowed and preserves rows.
- `column.renameColumn` applies ownership checks in an atomic `updateManyAndReturn` write, with the same trimmed 1–100 character name validation as creation. `ColumnHeader.tsx` supports click-to-rename, Enter/Save, Escape/Cancel and error feedback; only confirmed names update the metadata cache.
- `column.createColumn` validates ownership and locks the table before allocating the next column order. Names are trimmed and limited to 1–100 characters; types are TEXT/NUMBER. `AddColumnForm.tsx` updates the metadata cache after success. Existing rows are not rewritten; cells remain absent until edited.
- Row creation locks the owned table and allocates `first.order - 1` so new rows appear at the top, with empty cells created lazily by cell upserts. Row deletion locks the owned row and explicitly deletes its cells in the same transaction. Row controls wait for server confirmation before updating cached pages.
- Columns render at 240px each in a horizontally scrollable table, with an 88px sticky row-control gutter. Header and body widths must remain synchronized. Keyboard focus adjusts horizontal scrolling to keep the target cell visible beyond the sticky gutter.
- TanStack Virtual renders 36px rows. The current grid fetches 200 rows per page and overscans 12. Measure performance before changing these settings; keep stable row IDs as React and virtualizer keys. Memoize `getItemKey` and keep `useFlushSync: false` for React 19 compatibility.
- `EditableCell.tsx` owns edit drafts and is memoized. The table page owns async saves and optimistic updates so writes and errors survive individual cells unmounting. `src/utils/cell-cache.ts` updates only the affected cell; rollback must not restore an entire stale page snapshot.
- `src/utils/cell-value.ts` shares numeric parsing between frontend and backend. Client validation improves feedback; server validation remains mandatory.

## Coding and security conventions

- Reuse existing dependencies and patterns; avoid unnecessary abstractions or dependencies. Use `~/` imports for application modules, inferred tRPC types, and type-only imports where appropriate.
- Use strict TypeScript; avoid `any` and non-null assertions for ordinary application data. Follow the existing Prettier and ESLint configuration.
- Authentication is not authorization. Every resource query/write must verify ownership through the database relationships. Return NOT_FOUND for missing or inaccessible resources without revealing other users' data.
- Never trust a client-supplied table ID, owner ID or column type to authorize a cell mutation. Resolve the owned row and require the column to belong to its table before writing.
- Keep related checks/writes in a transaction. Future changes to ownership, column types or deletion must also account for concurrency with cell updates.
- Reject invalid and nonfinite numbers. Decimal and scientific notation are supported; hex, comma-separated values, NaN and Infinity are rejected.
- Keep drafts local to cells to limit rerenders. Preserve references for unchanged cached rows/pages. Prevent overlapping saves to the same cell and keep errors visible after virtualization unmounts a cell.
- Provide loading, empty, validation and failure feedback and accessible keyboard controls. Click focuses/selects; double-click or Enter edits; Enter saves; Escape or clicking away cancels an unsaved draft. Arrows navigate selected cells; Tab/Shift+Tab wrap between rows, and save before moving when editing. Input arrow keys retain normal caret behavior. Page-level navigation scrolls/focuses virtualized rows and fetches the next page when needed.
- Selected cells support Ctrl/Cmd+C and Ctrl/Cmd+V through native clipboard events. Pasting saves one value through the existing cell mutation; invalid numbers and multi-cell clipboard ranges are rejected. Native clipboard behavior is preserved inside the editor. `src/utils/cell-clipboard.ts` accepts a single spreadsheet cell with one terminating newline.
- Never print secrets or commit local env files. Do not bypass authentication to make local development easier. Do not migrate or seed a deployed database as part of local setup.

## Verification and local development

Read `airtable-clone/LOCAL_DEVELOPMENT.md` for environment setup. `.env.example` must match `src/env.js` and the actual auth provider. Dependencies use npm and `package-lock.json`.

From the application directory:

- `npm ci` installs dependencies and generates Prisma's client.
- `npm run dev` starts Next.js with hot reload at http://localhost:3000.
- `npm run typecheck` checks TypeScript.
- `npm test` runs focused Node tests with the existing tsx dependency. Backend tests use a mocked Prisma client; they do not prove live PostgreSQL behavior.
- `npm run lint` runs ESLint across maintained source, tests, scripts and config, with zero warnings allowed. Generated Prisma files, `next-env.d.ts` and `.next/` are excluded. Linting does not require application environment variables. `npm run lint:fix` applies automatic fixes; `npm run check` runs lint and TypeScript.
- Run ESLint directly on changed files and Prettier on edited files as appropriate. `git diff --check` catches whitespace errors.
- Run checks appropriate to the changes and report failures/limitations. Add meaningful tests for security, data integrity, cache rollback and complex interactions; avoid tests that merely mirror trivial implementation details.
- `npm run db:generate` currently runs `prisma migrate dev`, despite its name. Use `npx prisma generate` for client generation alone. Only run migrations against an explicitly configured development database.
- The existing seed script inserts 100,000 rows into the first table. Do not run it automatically or against a deployed database.

## Development priorities

1. Complete editable TEXT/NUMBER cells: safe saves, validation, clearing values, optimistic updates, rollback, keyboard interaction and responsive rendering. Verify in a real authenticated browser with a development database.
2. Row creation/deletion and stable ordering are implemented. Arrow and Tab keyboard navigation are implemented, including virtualized rows and loading the next page. Single-cell copy/paste is implemented. The next phase is column management; multi-cell range selection and paste remain in the advanced spreadsheet phase.
3. Column creation, renaming and confirmed deletion are implemented. Safe Text/Number type changes are implemented with previews and atomic conversion. Column reordering is implemented through accessible left/right header controls. Core column management is complete; additional types remain future work.
4. Base/table creation, rename/delete and navigation improvements.
5. Sorting, filtering, search, resizing, range selection and copy/paste; validate large-dataset performance.
6. Portfolio polish: consistent UI, responsive design, useful tests, deployment, screenshots and a professional README.

Stay within the phase requested by the user. Explain what changed, why, what was verified and any practical limitations.
