---
ticket_schema: 1
ticket_id: "IDE-01"
execution_mode: AFK
blocked_by: []
---

# 01 — IDE edits in checkpoints, IDE search in plan mode

## Artifact Graph
- Artifact ID: `ticket:pi-code-ide-tools:01`
- Role: `ticket`
- Parent: [ide-tool-compatibility.md](../../specs/ide-tool-compatibility.md)

## Parent Spec
[ide-tool-compatibility.md](../../specs/ide-tool-compatibility.md), Goal 1–2 and Verification.

## What to Build
`extensions/internal/ide-edits.ts`: join pi-agent-ide's text-editor protocol on the event bus and
report the local files of each mutation plan and file deletion before the write.
`extensions/git-checkpoint.ts` takes their baselines. `extensions/plan-mode/index.ts` allows
`search` and `diff`.

## Acceptance Criteria
- [ ] An IDE mutation plan's file is restored by `/rewind`, core loaded after pi-code.
- [ ] A file removed by IDE delete is restored by `/rewind`, core loaded before pi-code.
- [ ] File URLs are read, remote resources skipped, a failing listener never blocks the edit.
- [ ] Without pi-agent-ide nothing registers.
- [ ] Plan mode keeps `search` and `diff` and blocks `replace`.
- [ ] CI is green.

## Frontier
Ready.

## Gates
As the spec: one PR into `fix/todo-reminder` with green CI, merged by the agent; no spend;
4 hours per attempt, at most 2 attempts; installation only after the lot `dbh-vague5`.

## Step-by-Step Implementation Plan
1. `ide-edits.ts` and its use in `git-checkpoint.ts`.
2. Plan-mode tool list and README line.
3. Tests; CI.

## Testing Plan
- `tests/git-checkpoint-ide.test.ts` with a fake event bus playing the text-editor core.
- One case in `tests/plan-mode.test.ts`.

## Out of Scope
- `claude-rules` and `context-imports`, directories, SSH.
