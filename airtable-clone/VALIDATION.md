# Phase 5 validation

Run date: 14 October 2026 (Australia/Melbourne).

## Automated results

The optional PostgreSQL suite passed all 16 checks against an isolated temporary PostgreSQL 15 server on localhost. The application's database was not used. Each run created and dropped its own schema, including 100,000 synthetic rows and 200,000 synthetic cells.

| Measurement | Latest local run |
| --- | ---: |
| First sorted page (200 rows) | 141.2 ms |
| Next sorted page (200 rows) | 134.8 ms |
| Two filtered/sorted pages | 368.5 ms total |
| Two searched/filtered/sorted pages | 296.2 ms total |
| Atomic 1,000-cell paste | 727.4 ms |

Paste timing includes tRPC middleware and 1,000 sequential upserts. These are single-run local measurements, not production latency or browser rendering measurements. PostgreSQL checks verify range destination IDs, ownership/membership rejection, invalid-number rejection and actual rollback when a later write fails after an earlier successful upsert.

Reproduce using the dedicated local database command in [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md). Never substitute a deployed database URL.

## Production build

`npm run build` passed on 14 October 2026, including compilation, lint, TypeScript, static-page generation and build tracing. The table route reported 168 kB of first-load JavaScript. The initial sandboxed attempt could not resolve Google Fonts; the build passed when network access was available. This verifies build readiness, not deployed behavior or browser rendering performance.

For browser performance validation, run `npm run start` after a successful build and use the checklist below. Production mode avoids development-mode rendering overhead.

## Browser checks

On 28 October 2026, the project owner reported that all Phase 5 browser checks passed and authorized moving to the next development priority. The items below record that user-reported validation, rather than an automated browser run. Browser/version, dataset size and numeric rendering timings were not supplied. The checklist remains in [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md) for future regression checks.

- [x] Google sign-in/out and protected navigation
- [x] 2×3 and 1×3 copy/paste geometry and reload persistence
- [x] Virtualized selection/paste across a page boundary
- [x] Optimistic display, failure rollback and pending controls
- [x] Numeric validation, blanks and native editor clipboard behavior
- [x] Persistent widths, reordered columns and horizontal keyboard navigation
- [x] Paste under sorting/filtering/search
- [x] Large-table scrolling and input-to-display timings
