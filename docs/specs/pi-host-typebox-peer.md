# Declare Pi-hosted TypeBox as a peer

## Artifact Graph
- Artifact ID: `artifact:pi-code-host-typebox-peer-spec`
- Role: spec
- Standalone: true
- Children: [01 Declare the host TypeBox peer](../tickets/pi-host-typebox-peer/01-declare-host-typebox-peer.md)

## Type and evidence
Bug-analysis spec. The Pi loader reports `Host-provided extension packages must be declared in peerDependencies with a "*" range, not dependencies: typebox` for the installed `pi-code` package. The source and installed `package.json` both put `typebox: ^1.3.6` in `dependencies`. The installed package tree contains TypeBox 1.3.25 at the Pi npm install root, whereas the preview host bundle contains 1.3.27. These observations establish a manifest mismatch and a potential duplicate-runtime-module hazard, not an observed failure of the Telegram question.

Pi's [package documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md) and the installed loader classify `typebox` as host-provided. The existing `tests/extension-contract.test.ts` checks a minimum `>=0.80.4` floor for every peer, so it would reject the required `"*"` peer without a targeted test correction. The `package-lock.json` root currently lists `typebox` as a runtime dependency and must be reconciled with the manifest.

## Goal and target behavior
When Pi loads the package, its manifest declares the host-provided `typebox` in `peerDependencies` with the exact `"*"` range and has no `typebox` entry in `dependencies` or bundled dependencies. Local development still resolves TypeBox through `devDependencies` for TypeScript and tests; the published runtime does not install that development copy. The lockfile root agrees with the manifest. The existing minimum version checks remain enforced for the Pi runtime peers; the new host-provided peer is tested for its special range, rather than weakening runtime floors. Pi no longer emits this specific manifest warning for an installed copy of the corrected candidate.

## Non-goals and invariants
- No change to TypeBox imports, tool schemas, Telegram routing, question semantics, Pi host binary, or unrelated package dependencies.
- Do not modify the currently active package or declare the warning gone until exact-head installation and fresh loader readback.
- Do not claim a fresh CI, live Telegram acceptance, or upstream approval based on manifest tests.

## Implementation slice and verification
One independent package-metadata slice: add a regression assertion for host-provided peer placement and keep runtime-version-floor checks restricted to the Pi runtime peers; update `package.json` and the lockfile with the repository's package manager. Run focused contract tests, typecheck and packaging inspection. The repository's required complete profile and exact integrated-head verification remain delivery gates. Inspect the packaged tarball and installed loader readback after authorized integration and local sync. A failed/unavailable full profile remains a gate, not a pass.
