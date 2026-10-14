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

## Pending browser checks

Authenticated browser validation has not been completed. No browser-control tool is available in this session. Follow the Phase 5 checklist in [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md), then record browser/version, development dataset size, results and observed rendering timings here.

- [ ] Google sign-in/out and protected navigation
- [ ] 2×3 and 1×3 copy/paste geometry and reload persistence
- [ ] Virtualized selection/paste across a page boundary
- [ ] Optimistic display, failure rollback and pending controls
- [ ] Numeric validation, blanks and native editor clipboard behavior
- [ ] Persistent widths, reordered columns and horizontal keyboard navigation
- [ ] Paste under sorting/filtering/search
- [ ] Large-table scrolling and input-to-display timings
