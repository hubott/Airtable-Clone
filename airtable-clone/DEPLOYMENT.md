# Deployment and portfolio presentation

The project owner reports that the app is deployed on Vercel with Neon PostgreSQL.

**[Live demo](https://airtable-clone-roan-iota.vercel.app/)** — Google sign-in required.

This guide documents release configuration and screenshot capture. Updating these instructions does not publish the app or modify its database.

## Project configuration

Use the existing Vercel project if it is already linked to this repository. The application root is `airtable-clone`, relative to the Git repository root, not the enclosing local `Airtable` workspace.

| Setting | Value |
| --- | --- |
| Framework | Next.js |
| Root Directory | `airtable-clone` |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | Next.js default (`.next`) |

Vercel applies settings relative to the selected app directory. See [Vercel build configuration](https://vercel.com/docs/builds/configure-a-build).

`npm ci` runs the existing Prisma client-generation postinstall hook. The build command does not run migrations or seed data. Keep migration decisions separate from application builds; `npm run db:generate` is misleadingly named and runs `prisma migrate dev`, so it is not a deployment command. Coordinate any required migration for the intended database before releasing code that depends on it.

## Environment and Google sign-in

Configure these server-side variables for the intended Vercel environment:

| Variable | Purpose |
| --- | --- |
| `NEXTAUTH_SECRET` | Stable, private session/auth secret; required by this app in production |
| `GOOGLE_CLIENT_ID` | OAuth client ID used by the Google provider |
| `GOOGLE_CLIENT_SECRET` | Matching OAuth client secret |
| `DATABASE_URL` | PostgreSQL connection URL for this deployment |
| `AUTH_URL` | Intended stable HTTPS application origin |

Use separate development/preview database credentials. Do not copy the local `AUTH_URL=http://localhost:3000` into production, and remove conflicting legacy `NEXTAUTH_URL` values. Keep all secrets in the hosting environment rather than the repository. Do not set `SKIP_ENV_VALIDATION` for the release build.

Register `https://YOUR_DEPLOYMENT_HOST/api/auth/callback/google` in the Google OAuth client's authorized redirect URIs. Replace the example host with the actual deployment host. Keep the localhost callback for development. If the OAuth consent app is in testing, intended reviewers must be allowed test users.

Auth.js can infer the host on supported platforms; a stable explicit `AUTH_URL` makes the intended callback origin clear for this project. Preview OAuth needs a compatible callback configuration; a working production callback alone does not establish preview sign-in. See [Auth.js deployment guidance](https://authjs.dev/getting-started/deployment).

## Release verification

Before publishing, run from `airtable-clone/`:

```sh
npm run check
npm test
npm run build
```

A fresh build downloads the configured Google font. Verify in production mode locally with `npm run start` and follow the Phase 5 checklist in [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md). Existing results are in [VALIDATION.md](./VALIDATION.md).

After an authorized deployment, verify Google sign-in/out, protected-route redirects, base/table navigation, edit persistence after reload and a 2×3 range paste. Verify failure rollback and resizing persistence using disposable demo records. Confirm `/test` returns 404 and `/opengraph-image` returns the branded PNG. The preview image contains only static product copy, with no account or workspace data.

The public demo URL is linked from both READMEs with a Google sign-in note. Update those links if the public origin changes. Record deployment verification separately from the existing local build and PostgreSQL results.

## Screenshot capture

Use a signed-in development session with fictitious records. Capture the actual interface; the Open Graph graphic is a branding asset, not a product screenshot. Hide account names/emails, OAuth screens, browser extensions and unrelated tabs before capturing.

Create `docs/screenshots/` in the Git repository when captures are ready:

| File | View | Suggested viewport |
| --- | --- | --- |
| `workspace-desktop.png` | Dashboard with two or three sample bases | 1440 × 900 |
| `table-desktop.png` | Three-column table with a 2×3 selected range | 1440 × 900 |
| `table-search.png` | Search, filter and sort applied to sample records | 1440 × 900 |
| `workspace-mobile.png` | Stacked workspace cards | 390 × 844 |
| `table-mobile.png` | Stacked controls and horizontally scrollable grid | 390 × 844 |

For example, use a “Product launch” base with Task, Estimate and Owner columns and fictional task/owner names. Wait until saves finish and capture at 100% browser zoom. Keep images readable without including the browser chrome. Add only completed captures to a Screenshots section in the root README using relative paths and descriptive alt text. No screenshot placeholders are linked today.
