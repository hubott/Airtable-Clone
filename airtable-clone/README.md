# Airtable Clone

An Airtable-style application for organizing projects in editable spreadsheet tables. Built as a full-stack portfolio project with Next.js, React, TypeScript, tRPC, Prisma, PostgreSQL and Tailwind CSS.

## Current features

- Google sign-in with NextAuth and protected dashboard routes.
- An application login page, dashboard navigation and sign-out from every page.
- Create, rename and delete bases and tables, with usable starter tables and validated names.
- Bases and tables scoped to the signed-in owner.
- Editable TEXT and NUMBER cells with validation, optimistic saves and rollback.
- Column creation, renaming, deletion and safe Text/Number conversions with previews, and column reordering.
- Bulk creation of 1–1,000 rows per request and confirmed deletion with transactional cell cleanup.
- Resizable columns with pointer and keyboard controls, horizontal scrolling and pinned row controls. Column widths persist on reload in the same browser.
- Server-side table search across Text and Number cells, combined with filtering and sorting.
- Server-side single-column Text/Number filtering with text matching, numeric comparisons and empty checks, combined with sorting.
- Server-side single-column Text/Number sorting in either direction, with blanks last and stable pagination.
- Virtualized rows and cursor pagination that survives row deletion.
- Arrow/Tab keyboard navigation, Shift-click/Shift-arrow range selection and multi-cell spreadsheet copy/paste. Paste up to 1,000 cells with immediate optimistic display, atomic saves and rollback into existing rows/columns.

## Local development

See [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md) for database and Google OAuth setup.

```sh
npm ci
# Configure .env using .env.example and the local development guide.
npm run dev
```

Open http://localhost:3000, choose **Continue with Google**, and access your dashboard after signing in. Signed-in users can also choose **Go to dashboard** from the home page. The header provides **Dashboard** and **Sign out** throughout the app. Signing out returns to the login page.

## Checks

```sh
npm run check
npm test
```

ESLint checks maintained code with zero warnings allowed. Most backend tests use mocked database access. Optional PostgreSQL view tests exercise real search, sorting, filtering, pagination and a 100,000-row synthetic dataset; see the local development guide. Real Google sign-in and editing flows need authenticated browser verification.

Project architecture, coding conventions and development priorities are in [AGENTS.md](../AGENTS.md). Core base/table management is complete. Phase 5 includes sorting, filtering and table search. Column resizing is implemented. Range selection and multi-cell copy/paste are implemented. Real PostgreSQL checks on 100,000 rows and atomic bulk paste have passed; see [validation results](./VALIDATION.md). Next planned work: authenticated browser validation, rendering performance and portfolio polish.
