# Airtable Clone

An Airtable-style application for organizing projects in editable spreadsheet tables. Built as a full-stack portfolio project with Next.js, React, TypeScript, tRPC, Prisma, PostgreSQL and Tailwind CSS.

## Current features

- Google sign-in with NextAuth and protected dashboard routes.
- An application login page, dashboard navigation and sign-out from every page.
- Create bases and tables from the dashboard, with usable starter tables and validated names.
- Bases and tables scoped to the signed-in owner.
- Editable TEXT and NUMBER cells with validation, optimistic saves and rollback.
- Column creation, renaming, deletion and safe Text/Number conversions with previews, and column reordering.
- Row creation and confirmed deletion with transactional cell cleanup.
- Horizontal scrolling with readable column widths and pinned row controls.
- Virtualized rows and cursor pagination that survives row deletion.
- Arrow/Tab keyboard navigation and single-cell copy/paste.

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

ESLint checks maintained code with zero warnings allowed. Backend tests use mocked database access; real Google sign-in and database persistence need authenticated browser verification.

Project architecture, coding conventions and development priorities are in [AGENTS.md](../AGENTS.md). Next planned work: base/table renaming and deletion.
