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
| 2. Request context and takeover | COMPLETE_LOCAL |
| 3. FTP/FTPS browser intake | COMPLETE_LOCAL |
| 4. Permissions, policy, lifecycle | COMPLETE_LOCAL |
| 5. Context menus and reviewed batches | COMPLETE_LOCAL |
| 6. Media discovery and panel | IN_PROGRESS |
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

## Phase 2 checkpoint A

- Added bounded request-context staging with POST bytes, ordered headers, redirects,
  structured cookies, frames/private identity, response metadata, and explicit
  unknown/withheld fields.
- Added pause → durable prepare → cancel/erase → committed-review coordination.
- Ambiguous correlation and every pre-release failure retain or resume browser
  ownership; post-release response loss persists a recovery receipt.
- TypeScript passed; 22/22 extension tests passed across seven files.
- The v2 takeover gate remains disabled until committed-review consumption and
  actual browser/native validation are ready.

## Phase 2 local completion

- Added header byte caps, proxy-mode capture, and native context-query fulfillment.
- Desktop handoff tests prove committed review follows protected-context claim and
  durable review persistence.
- Final local receipt: TypeScript passed; 22/22 extension tests passed; Kotlin
  browser-context/native suites passed.
- Runtime activation remains gated behind Phase 4 consent and Phase 9 actual-browser
  validation.

## Phase 3 local completion

- Added explicit `ftp://` and `ftps://` context-menu intake. Embedded credentials
  are removed before handoff; their presence is recorded only as a withheld-field
  signal so the desktop review must collect them securely.
- Port 990 is classified as implicit FTPS; other FTPS URLs use explicit FTPS.
  SFTP is not accepted.
- FTP intake uses the same durable prepare/release/committed-review protocol as
  HTTP capture and cannot start a transfer from the extension.
- Final local receipt: TypeScript passed; 23/23 tests passed; Chrome and Firefox
  production builds passed. Extension checkpoint:
  `68939bd7df2c9c2ad223bb9cc1c095d69cc57bc5`.
- The runtime feature remains off until Phase 4 consent/policy controls and Phase 9
  installed-browser/native/desktop FTP and FTPS validation are complete.

## Phase 4 local completion

- Added paired desktop policy v2.1 with `STANDARD` default and explicit `FULL`
  consent for automatic takeover, advanced inspection, private windows, and
  protected request context.
- Replaced install-time all-host/cookies/webRequest/tabs/notifications authority
  with per-site and FULL optional grants, dynamic content registration, onboarding,
  revocation synchronization, existing-content teardown, and open-tab replay.
- Added per-tab session bypass, immediate force/bypass key state, private-access
  checks, extension/MIME policy, full-address exclusions, shelf suppression, and
  explicit recent-download recapture.
- Added bounded MV3 request snapshots and session restoration; protected POST bodies
  that exceed the snapshot budget fail open instead of risking context loss.
- Final local receipt: TypeScript passed; 31/31 tests; Chrome/Firefox production
  builds; protocol v2.1 lock. Checkpoints: `ffa38bd4ea8d17ac70ecba2dcc636eb0dd2558fd`,
  `0dc01ad4bb1ab0ba4900fef702144a92780e242b`.
- Actual permission prompts, private windows, worker suspension, restart, shelf, and
  revocation scenarios remain Phase 9 installed-browser gates.

## Phase 5 local completion

- Added current page/frame, selected, all-link, editable-context, and
  native-configured custom actions alongside link/image/audio/video capture.
- Cross-frame collection covers anchors, images/srcset, media/source, frames,
  scripts, selected/plain/input text, with URL validation, dedupe, and bounded
  5,000/1,000/100-candidate plus 220 KiB chunk limits.
- Selected and all-link candidates stay in `storage.session` for filter/select
  confirmation before transport. Desktop receives only the chosen set, encrypts
  URLs behind opaque refs, and opens its normal multi-download routing/start UI.
- No task is created before both review stages. Empty/no-link failures use an
  in-page alert or action badge without requiring notification permission.
- Final local receipt: TypeScript; 33/33 tests; Chrome/Firefox production builds;
  protocol v2.2 lock. Checkpoints: `f99d00ff5f2b4f51d0f97f73765784ace8c12e6f`,
  `eefa6d2ed41dbc534df48e733ede8a2a5de30602`.
- Actual cross-origin frames, selection geometry, maximum batches, menus, and review
  dialogs remain Phase 9 installed-browser gates.

## Resume instructions

1. Verify both repositories' branches and worktree states.
2. Read the desktop canonical progress and capability ledgers.
3. Verify this repository's protocol lock before editing protocol consumers.
4. Resume the first unchecked item in the active phase.
5. Do not promote capability rows from extension-only tests; browser/native/desktop
   workflows require their phase-specific E2E receipts.
