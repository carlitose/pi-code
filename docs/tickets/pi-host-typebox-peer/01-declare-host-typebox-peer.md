---
ticket_schema: 1
ticket_id: "01"
execution_mode: AFK
blocked_by: []
---

# Declare host-provided TypeBox as a peer

## Artifact Graph
- Artifact ID: `artifact:pi-code-host-typebox-peer-01`
- Role: ticket
- Parent: [pi-host-typebox-peer.md](../../specs/pi-host-typebox-peer.md)

## Parent Spec
[Declare Pi-hosted TypeBox as a peer](../../specs/pi-host-typebox-peer.md).

## What to Build
Correct pi-code package metadata so the Pi-hosted `typebox` import is a `"*"` peer instead of a runtime dependency, reconcile the lockfile and preserve the version floors for the other Pi peers. This independent metadata fix removes a manifest warning; it does not implement or validate Telegram question settlement.

## Acceptance Criteria
- [ ] Root manifest and lockfile put `typebox` in peer dependencies as `"*"`, not runtime or bundled dependencies; other runtime dependency and Pi peer floors are preserved.
- [ ] A contract regression rejects reintroducing `typebox` into runtime dependencies or changing its peer range; existing Pi runtime peer-floor test continues to cover the actual host API minimum.
- [ ] Focused contract tests, typecheck and packed-artifact inspection establish consistency; the repository-required full check and exact-head provider CI are reported with their true outcome.
- [ ] After separate authorized integration and local sync, a fresh Pi loader readback no longer shows this exact warning; before that observation, no live resolution is claimed.

## Frontier
Ready for a test-first package metadata fix. Fresh fork-main target and checkout/tree identity must be checked before implementation; CI, integration and active runtime loader readback remain downstream gates.

## Step-by-Step Implementation Plan
1. Reproduce the loader's manifest warning via a focused failing contract assertion.
2. Move TypeBox to a wildcard peer, reconcile the lockfile, narrow the unrelated version-floor assertion to Pi runtime peers.
3. Run admitted focused checks and package inspection; review the frozen change and hand off open full-profile/provider/runtime gates.

## Testing Plan
Unit contract test, package/lockfile inspection and typecheck are local. The full repository profile, exact-head CI, and warning disappearance on the actual installed head are separate mandatory checks; no new live Telegram question is required for this metadata-only ticket.

## Out of Scope
- TypeBox API migration, host binary update, question tool changes, Telegram bridge changes and bypassing upstream approvals.
