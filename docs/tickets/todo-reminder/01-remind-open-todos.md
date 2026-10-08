---
ticket_schema: 1
ticket_id: "TODO-01"
execution_mode: AFK
blocked_by: []
---

# 01 — Remind the model of open todos

## Artifact Graph
- Artifact ID: `ticket:pi-code-todo-reminder:01`
- Role: `ticket`
- Parent: [todo-staleness-reminder.md](../../specs/todo-staleness-reminder.md)

## Parent Spec
[todo-staleness-reminder.md](../../specs/todo-staleness-reminder.md), Goal 1–2 and Verification.

## What to Build
In `extensions/todo.ts`: a hidden custom message with the open todos on `before_agent_start`,
and a hidden custom message entry on `turn_end` after 20 tool calls without a `todo` call,
once per stale stretch. Nothing when the list is empty or completed.

## Acceptance Criteria
- [ ] `before_agent_start` returns the reminder only while there are open todos.
- [ ] `turn_end` adds the reminder after 20 non-todo tool calls, once; a `todo` call resets it.
- [ ] The reminder lists the open items and the in-progress one and says how to close the list.
- [ ] `npm run check` passes; CI is green.

## Frontier
Ready.

## Gates
As the spec: one PR into `feat/telegram-question-responder` with green CI, merged by the agent;
no spend; 4 hours per attempt, at most 2 attempts; installation only after the benchmark lots.

## Step-by-Step Implementation Plan
1. Failing tests in `tests/todo-reminder.test.ts`.
2. Reminder text, counter, the two handlers.
3. `npm run check`.

## Testing Plan
- Vitest with the fake `pi` used by `tests/todo-more.test.ts`.

## Out of Scope
- Overlay, tool actions, replay.
