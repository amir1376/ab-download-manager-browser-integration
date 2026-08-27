# Browser Integration Parity v2 — Extension Progress

Last updated: 2026-08-27

## Coordination

- Branch: `codex/browser-parity-v2`
- Starting commit: `ae476f5de5ef695531d20d1d74eedd92181f8ef1`
- Canonical desktop worktree:
  `C:\Users\Admin\Documents\GitHub\ABDL Manager\ab-download-manager-browser-parity`
- Canonical progress ledger:
  `docs/browser-parity/IMPLEMENTATION_PROGRESS.md`
- Canonical capability ledger:
  `docs/browser-parity/CAPABILITY_LEDGER.csv`

The desktop repository owns Protocol v2 schemas. This repository vendors exact
schema copies and generated TypeScript types whose hashes are locked by
`PROTOCOL_LOCK.json`.

## Phase states

| Phase | Extension state |
|---|---|
| 0. Contracts, fixtures, flags | COMPLETE |
| 1. Secure transport and compatibility | COMPLETE_LOCAL |
| 2. Request context and takeover | IN_PROGRESS |
| 3. FTP/FTPS browser intake | NOT_STARTED |
| 4. Permissions, policy, lifecycle | NOT_STARTED |
| 5. Context menus and reviewed batches | NOT_STARTED |
| 6. Media discovery and panel | NOT_STARTED |
| 7. Media selection and renewal | NOT_STARTED |
| 8. UX, migration, localization, accessibility | NOT_STARTED |
| 9. Packaging and browser E2E | NOT_STARTED |

## Phase 0 checklist

- [x] Create isolated implementation branch.
- [x] Vendor canonical Protocol v2 schemas.
- [x] Add and validate the checked-in TypeScript contract surface.
- [x] Add frozen capture/media fixtures and desktop-owned state-machine baseline.
- [x] Add disabled-by-default phase feature flags.
- [x] Add schema, lock, and fixture validation to tests.
- [x] Update this file with exact validation results and checkpoint commit.

## Validation receipts

- Protocol lock: passed; schema SHA-256
  `35469f0ca41ae5971e237362cd059824c067cb96b628cfd8b2804cdb5bbe3fde`.
- TypeScript: passed.
- Vitest: 10/10 passed across three files.
- No runtime phase flag is enabled.
- Contract checkpoints: desktop `e05130d134afc7b7e6fa27c65c30b5d9df4455eb`;
  extension `cf6bb9fe319db8e69b53ed4c1ffa5c23d2527caa`.

## Phase 1 checkpoint A

- Native messaging now establishes the persistent port during boot and retries
  disconnects with bounded 1/2/5/10/30-second backoff.
- `helloV2` is validated strictly and its pairing key remains memory-scoped.
- Secure HTTP fallback uses `127.0.0.1` and the native-derived key; legacy
  extension configuration remains a one-release fallback.
- TypeScript passed; extension tests passed 11/11.
- Remaining: transport failure/restart tests, native events/context query,
  prepared-capture calls, and final compatibility gates.

## Phase 1 checkpoint B

- Added native and authenticated-HTTP clients for prepare, browser-release,
  reconcile/list, and abort operations.
- Persistent transport now validates and answers native-initiated requests on the
  correlated native ID; unsupported or failing actions return bounded error shapes.
- Feature-off policy/context requests fail closed and return no page data.
- TypeScript passed; extension tests passed 15/15 across four files.

## Phase 1 local completion

- Added correlated desktop-originated native requests and bounded replies.
- Added v2 frame-limit, reconnect, compatibility, and native-request tests.
- Removed direct Lodash usage; Firefox lint is 0 errors/5 warnings/1 notice and no
  longer reports the dangerous `Function` constructor.
- Final local receipt: TypeScript passed; 17/17 tests passed; Chrome/Firefox builds
  passed.
- Phase 2 owns full request-context production and two-phase browser takeover.

## Resume instructions

1. Verify both repositories' branches and worktree states.
2. Read the desktop canonical progress and capability ledgers.
3. Verify this repository's protocol lock before editing protocol consumers.
4. Resume the first unchecked item in the active phase.
5. Do not promote capability rows from extension-only tests; browser/native/desktop
   workflows require their phase-specific E2E receipts.
