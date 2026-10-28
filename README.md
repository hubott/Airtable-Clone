# Airtable Clone

A full-stack spreadsheet application for organizing records in private workspaces. Create bases and tables, edit Text and Number cells, and search, filter and sort data across a virtualized grid.

Built as a portfolio and learning project with Next.js, React, TypeScript, tRPC, Prisma and PostgreSQL. The work focuses on responsive editing, database authorization, reliable pagination and safe concurrent writes.

**[Live demo](https://airtable-clone-roan-iota.vercel.app/)** — Google sign-in required. Hosted on Vercel with Neon PostgreSQL.

[Deployment and screenshots](./airtable-clone/DEPLOYMENT.md) · [Local setup](./airtable-clone/LOCAL_DEVELOPMENT.md) · [Application commands](./airtable-clone/README.md) · [Validation results](./airtable-clone/VALIDATION.md)

## What you can do

- **Manage workspaces:** sign in with Google and create, rename or delete your own bases and tables. New tables start with a Name column and one blank row.
- **Edit like a spreadsheet:** use Arrow/Tab navigation, select ranges with Shift-click or Shift+arrows, and copy/paste rectangular data. Cell edits and bulk paste display optimistically, with reconciliation and rollback if saving fails.
- **Organize columns:** create, rename, reorder, resize and delete columns. Text/Number conversions preview invalid values and convert atomically without discarding data. Widths persist in the same browser.
- **Find records:** combine table-wide search with a single-column filter and sort. Queries run on the server and include rows that have not been loaded into the browser.
- **Work with larger tables:** virtualized rendering and 200-row cursor pages limit the amount of data rendered at once. Create up to 1,000 rows per request and paste up to 1,000 cells into existing destinations.

## Architecture

| Layer | Implementation |
| --- | --- |
| Interface | Next.js App Router, React, strict TypeScript and Tailwind CSS |
| API and client cache | tRPC, TanStack Query and SuperJSON |
| Grid rendering | TanStack Virtual with stable row IDs and fixed-height rows |
| Persistence | PostgreSQL with Prisma |
| Authentication | NextAuth, Google OAuth and database sessions |
| Verification | Node test runner with tsx; optional real PostgreSQL integration suite |

The ownership hierarchy is `User → Base → Table → Row/Column`. Each cell belongs to a row and a column, with a unique `(rowId, columnId)` key. Authorization follows those relationships in database queries; signing in alone does not grant access to a resource.

The table page owns asynchronous saves and cache updates so pending writes survive individual cells leaving the virtualized viewport. Cells keep editing drafts locally. Shared parsing validates numbers on both client and server, and updates only change affected cache entries.

### Decisions and tradeoffs

- **Optimistic display, atomic persistence.** A valid paste appears before the server responds. The server verifies destination ownership and membership, locks the relevant records, validates all values and commits the range in one transaction. Failure restores affected cells without replacing unrelated cached data. Conflicting edits remain disabled while bulk paste saves.
- **Value-based pagination.** Cursors carry ordering boundaries rather than depending on the continued existence of the cursor row. Sorted reads use repeatable-read transactions, stable tie breakers and blanks-last ordering. Changes to search/filter/sort reject incompatible cursors.
- **Refresh when the view changes.** An edit affecting sort order or filter/search membership refreshes that view after saving. This favors consistent ordering over keeping the viewport at the edited row.
- **Explicit conversions.** Invalid values block a column type conversion. Converting formatted text to a number can lose leading zeros, and numeric values use floating-point precision.

## Run locally

Run commands from the application directory:

```sh
cd airtable-clone
npm ci
cp .env.example .env
```

Configure a dedicated development PostgreSQL database and Google OAuth credentials using the [local development guide](./airtable-clone/LOCAL_DEVELOPMENT.md). Keep credentials in the ignored `.env` file. For a fresh development database, the guide covers migrations and creating your first base/table through the UI.

```sh
npm run dev
```

Open http://localhost:3000 and choose **Continue with Google**. The dashboard shows your bases; each base contains tables. No shared demo account is required.

For production-mode local testing, run `npm run build` followed by `npm run start`. The configured Google font requires network access during a fresh build.

## Verification and performance

```sh
cd airtable-clone
npm run check
npm test
```

`check` runs ESLint with zero warnings and TypeScript. Most backend tests mock database access. The optional PostgreSQL suite uses an explicitly supplied local test database and a unique temporary schema; it checks real pagination, ownership, bulk writes and rollback after an injected database failure. See the [test setup and browser checklist](./airtable-clone/LOCAL_DEVELOPMENT.md).

The recorded PostgreSQL run passed all 16 checks with 100,000 synthetic rows and 200,000 cells:

| Operation | Local measurement |
| --- | ---: |
| First sorted page, 200 rows | 141.2 ms |
| Next sorted page, 200 rows | 134.8 ms |
| Two searched/filtered/sorted pages | 296.2 ms total |
| Atomic 1,000-cell paste | 727.4 ms |

These are single-run local measurements, not production latency or browser rendering benchmarks. Paste timing includes tRPC middleware and sequential upserts. The project owner reported the Phase 5 browser checklist passed on 28 October 2026; numerical rendering timings were not supplied. See [VALIDATION.md](./airtable-clone/VALIDATION.md) for provenance and practical limits.

## Current scope

Columns support Text and Number. A view supports one sort and one filter alongside table-wide search. Search/filter/sort settings reset on reload; column widths persist locally in the browser. Range paste targets existing rows and columns and is limited to 1,000 cells/1 MB. Changes from another browser require refreshing the view.

This is a portfolio implementation rather than a complete Airtable replacement. Real-time collaboration, formulas, additional column types and persisted named views are outside the current scope. Portfolio polish is in progress; deployment instructions and a branded link-preview image are available; the live demo is hosted on Vercel with Neon PostgreSQL, and product screenshots remain to be added.

## Project map

```text
airtable-clone/
  src/app/                  Pages and shared interface components
  src/server/api/           Protected routers and database query logic
  src/server/auth/          Google sign-in and session configuration
  src/utils/                Validation, navigation, clipboard and cache helpers
  prisma/                   Database schema and migrations
  tests/                    Unit, router and optional PostgreSQL tests
  LOCAL_DEVELOPMENT.md       Environment setup and manual verification
  VALIDATION.md              Recorded checks and performance results
```

Contributor conventions and the development roadmap are in [AGENTS.md](./AGENTS.md).
