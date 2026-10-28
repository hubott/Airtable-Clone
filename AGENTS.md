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
- `base.deleteBase` / `table.deleteTable` authorize and lock the resource, lock child tables/columns/rows, and delete dependent cells, rows, columns and tables in a transaction. `DeleteResourceButton.tsx` uses browser confirmation explaining permanent data removal, preserves resources on failure, removes deleted query caches, and navigates to the surviving parent. No cascade migration or production test deletion is required.
- `base.renameBase` and `table.renameTable` validate names and apply owner filters directly in atomic updates. `ResourceNameEditor.tsx` offers Save/Enter and Cancel/Escape with pending/error feedback. It updates name fields in list and detail caches while preserving IDs, table membership and existing metadata. Rename controls appear in lists and resource headings.
- Dashboard and base pages use `CreateResourceForm.tsx` for validated creation, pending/error feedback and navigation to the result. `base.getBase` distinguishes empty owned bases from inaccessible ones. `table.createTable` locks the owned base and atomically creates a Name/TEXT column and one blank row. Base/table names are trimmed and limited to 1–100 characters.
- Routes: `/dashboard`, `/dashboard/base/[baseId]`, `/dashboard/table/[tableId]`. Shared client UI lives in `src/app/_components/`.
- Optional real PostgreSQL search/sorting/filtering tests use only explicitly supplied `SORT_TEST_DATABASE_URL`, create/drop a unique temporary schema, and include a 100,000-row synthetic timing check. They are skipped by default.
- The table page fetches ordered columns with `getTableWithColumns` and cursor-paginated rows with `getRows`. Rows expose `cellsByColumnId`. Pagination uses `(order, id)` value boundaries scoped to the owned table, so deleting a cursor row does not break infinite scrolling.
- Type conversion previews scan stored cells in batches, showing invalid counts and up to five examples. `column.changeType` exclusively locks the owned column, checks the expected source type, revalidates and converts batches within one transaction. Invalid data blocks conversion; it is never discarded. Cell saves take a shared column lock before reading the type. Confirmed conversions refresh the row query from the beginning; no schema migration is required. Numeric conversion can lose formatting and uses floating-point precision.
- `column.moveColumn` locks the owned table and its columns, validates column membership, swaps neighboring positions and normalizes order values in one transaction. Header arrows disable boundary moves; confirmed results update metadata without rewriting row/cell data. Metadata callbacks must only replace the fields they own (e.g. rename updates name) to avoid stale responses overwriting order/type.
- `column.deleteColumn` locks an owned column and deletes its dependent cells before the column in a transaction. Header trash buttons open explicit confirmation; successful deletion removes metadata and cached cell values. Cell saves/row operations are coordinated with deletion; deleting the final column is allowed and preserves rows.
- `column.renameColumn` applies ownership checks in an atomic `updateManyAndReturn` write, with the same trimmed 1–100 character name validation as creation. `ColumnHeader.tsx` supports click-to-rename, Enter/Save, Escape/Cancel and error feedback; only confirmed names update the metadata cache.
- `column.createColumn` validates ownership and locks the table before allocating the next column order. Names are trimmed and limited to 1–100 characters; types are TEXT/NUMBER. `AddColumnForm.tsx` updates the metadata cache after success. Existing rows are not rewritten; cells remain absent until edited.
- `row.createRows` creates 1–1,000 rows per request with `createManyAndReturn`, under the owned table lock. It reserves a contiguous range before the first row, rejects integer underflow and returns rows in order. The toolbar count defaults to one; cached insertion preserves existing pagination boundaries.
- Single and bulk row creation share `reserveRowOrder` in the row router for ownership, table locking and integer-boundary checks. Row creation locks the owned table and allocates `first.order - 1` so new rows appear at the top, with empty cells created lazily by cell upserts. Row deletion locks the owned row and explicitly deletes its cells in the same transaction. Row controls wait for server confirmation before updating cached pages.
- Columns default to 240px and can be resized from 160–640px with pointer capture or Left/Right keys on the header resize handle; Home resets to 240px. Widths persist in browser localStorage per table/column ID. Stored widths are validated before restoration; unavailable storage falls back to in-memory resizing. Columns render with their selected widths in a horizontally scrollable table, with an 88px sticky row-control gutter. Header and body widths must remain synchronized. Keyboard focus adjusts horizontal scrolling to keep the target cell visible beyond the sticky gutter.
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
- Shift-click and Shift+arrows select rectangular ranges across virtualized rows. Selected ranges support Ctrl/Cmd+C and Ctrl/Cmd+V through native clipboard events; native editor clipboard behavior is preserved. `src/utils/cell-range.ts` parses rectangular TSV with quoted tabs/newlines, preserves blanks and rejects malformed/oversized ranges. Paste starts at the focused cell, loads existing destination rows as needed and is limited to 1,000 cells/1 MB. `cell.updateCells` checks table ownership and all row/column membership, locks table/columns/rows, validates every value and writes atomically. Bulk paste validates and displays optimistic values before saving, reconciles with confirmed server values and rolls back only affected cells on failure; affected sorted/filtered/searched views reset from the beginning. Extra rows/columns are never created implicitly.
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
2. Row creation/deletion and stable ordering are implemented. Arrow and Tab keyboard navigation are implemented, including virtualized rows and loading the next page. Single-cell copy/paste is implemented. The next phase is column management; multi-cell range selection and paste are implemented in Phase 5.
3. Column creation, renaming and confirmed deletion are implemented. Safe Text/Number type changes are implemented with previews and atomic conversion. Column reordering is implemented through accessible left/right header controls. Core column management is complete; additional types remain future work.
4. Base and table creation from the UI is implemented on `feat/base-table-management`. Base and table renaming are implemented. Confirmed deletion is implemented. Core Phase 4 base/table management is complete.
5. Phase 5 started on `feat/phase-5-sorting`: single-column server-side Text/Number sorting supports ascending/descending order, blanks last and stable value-based cursors. Sorting is local to the view; sort-value edits and sorted insertions refresh from the beginning. Sorted reads use repeatable-read transactions to keep page boundaries and hydrated cells consistent. Single-column filtering is implemented: case-insensitive literal Text matching, finite Number comparisons, and empty/not-empty checks. Filters combine with sorting, carry their context in cursors, and authorize the column within the owned table. Editing a filtered value or creating rows refreshes the view; deletion/conversion clears affected filters. Cache resets target exactly one infinite view so obsolete views are not refetched. Table-wide search is implemented with case-insensitive literal Text substrings and exact finite Number values. Search is submitted explicitly, trimmed and limited to 200 characters; blank input clears it. Search combines with sorting/filtering and carries its term in cursors. Searched views refresh after any cell edit and column deletion/conversion. Column resizing is implemented with pointer and keyboard controls and synchronized header/body widths. Shift-click/Shift-arrow range selection and atomic multi-cell TSV copy/paste are implemented. Real PostgreSQL verification on 100,000 rows and a 1,000-cell paste passed, including actual bulk-write rollback. Results are in `airtable-clone/VALIDATION.md`. On 28 October 2026 the project owner reported that all Phase 5 browser checks passed; no numeric rendering timings were supplied. Phase 5 validation is complete based on that report.
6. Portfolio polish is active: dashboard/base pages use shared responsive `ResourceCard.tsx` cards, clear empty states and wrapping controls. Creation forms fit narrow screens, and table heading actions wrap. Search/sort/filter controls use consistent panels, stack on narrow screens and constrain long column names; shared focus outlines cover links and form fields. The root README now serves as the portfolio overview with architecture, tradeoffs, setup, measured performance and explicit limits; the application README covers app features and commands. Deployment configuration and screenshot capture are documented in `airtable-clone/DEPLOYMENT.md`. The unused `/test` debug page is removed, and static product metadata plus `opengraph-image.tsx` provide a branded link preview without account data. The owner reports deployment on Vercel with Neon PostgreSQL; the public demo at `https://airtable-clone-roan-iota.vercel.app/` is linked from both READMEs with a Google sign-in note. Continue with remaining UI/accessibility polish, authenticated production verification and real product screenshots. Recheck changed UI in a browser.

Stay within the phase requested by the user. Explain what changed, why, what was verified and any practical limitations.

## SonarQube Quality Assurance

This project uses SonarQube Cloud.

- Consult SonarQube MCP findings when investigating
  code quality, maintainability or security issues.
- Review relevant findings before substantial refactoring.
- Avoid unnecessary code duplication, particularly in
  tRPC routers, React components and database logic.
- Maintain the project's quality gate requirements,
  including a maximum of 3% duplicated new code.
- Do not weaken quality gates or suppress findings
  without explicit approval.
- After changes, run tests, ESLint and TypeScript checks.
- When a new SonarQube analysis is available, verify
  its quality gate status.
