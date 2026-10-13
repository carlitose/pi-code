# /rewind and plan mode with pi-agent-ide's tools

## Artifact Graph
- Artifact ID: `artifact:pi-code-ide-tool-compatibility-spec`
- Role: spec
- Standalone: true
- Children: [01 IDE edits in checkpoints, IDE search in plan mode](../tickets/ide-tools/01-ide-edits-checkpoint-and-plan.md)

## Type and evidence
Bug analysis. The user installed `pi-agent-ide` 0.8.1 and asked whether it conflicts with other
extensions (2026-10-13). A real Pi 1.2.0 started with the user's packages lists 48 tools with no
duplicate name. The package replaces pi's file tools: `read` and `write` are its own, `edit` is
hidden, and edits go through `replace`, `insert`, `delete`, `move` and `copy`. Their `path` can be
a Read result, an anchor or a symbol rather than a file name.

- `extensions/git-checkpoint.ts` takes a file's baseline on `tool_call` only for `edit` and
  `write`, and reads the file from `input.path`. Changes made with the IDE tools never enter a
  checkpoint, so `/rewind` cannot undo them.
- `extensions/plan-mode/index.ts` allows `read`, `bash`, `grep`, `find`, `ls`, `question` and
  `plan_mode_complete`. With the IDE package the model loses its search (`search`) and compare
  (`diff`) tools in plan mode.

## Goal
1. **Checkpoints.** Every file the IDE tools are about to change or delete gets its baseline
   before the write. pi-agent-ide resolves each call to one plan before the first write and
   calls registered guards over pi's event bus (its `docs/user-hooks.md`: "Protect files from
   edits", "Protect whole objects from deletion"). pi-code joins that protocol without depending
   on the package. The guard always accepts: a baseline that cannot be taken never blocks an edit.
   The core checks the plugin's API version for equality, so pi-code uses the version the core's
   readiness event announces, and the last known one (32, pi-agent-ide 0.8.1) when the core loaded
   first.
2. **Plan mode.** `search` and `diff` join the read-only tools. The IDE's editing tools stay
   blocked because they are not on the list.

## Non-goals
- Path rules and nested CLAUDE.md loading for IDE edits (`claude-rules`, `context-imports`).
- Whole directory deletion or moves in checkpoints: a checkpoint tracks files.
- Remote (SSH) resources.

## Failure modes
- **Version drift:** if pi-agent-ide loaded first with an API version other than 32, the guard is
  not registered and IDE edits stay outside checkpoints, as today. Order in the user's settings
  loads pi-code first, so the readiness event carries the version.
- **Slow edits:** the baseline is one shadow-repo commit per new file, as for `edit` today.

## Verification
- Vitest: a mutation plan and a file deletion, with the core loaded before and after pi-code,
  are restored by `/rewind`; file URLs are read, remote resources skipped, a failing listener
  does not block; without pi-agent-ide nothing registers.
- Vitest: plan mode keeps `search` and `diff`, blocks `replace`.
- CI (`pr-check`, Ubuntu and Windows, Node 22 and 24).

## Gates
Answer of the user, 2026-10-13 ("fai tutte e 3 le correzioni"):
- **Attempt:** one PR on `carlitose/pi-code` into `fix/todo-reminder` (the installed branch), with
  green CI.
- **Budget:** no spend; CI only, since the checkout has no `node_modules` and a local install
  would load the user's machine. **Time:** 4 hours. **Maximum attempts:** 2.
- **Approvals:** the agent merges on green CI. The pin in `pi-personal-config` and
  `update:personal` happen only after the running lot `dbh-vague5` ends. No npm publication and
  no upstream PR.
- **Existing blocks searched:** a lot must not see an update mid-run (memory
  `dbh-chain12-gates`, `dont-block-the-computer`).
