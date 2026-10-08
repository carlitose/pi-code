# Keep the model aware of its own todo list

## Artifact Graph
- Artifact ID: `artifact:pi-code-todo-reminder-spec`
- Role: spec
- Standalone: true
- Children: [01 Remind the model of open todos](../tickets/todo-reminder/01-remind-open-todos.md)

## Type and evidence
Bug analysis. The user reported that agents leave their todo list behind ("lasciata a marcire").
Every Pi session of the last 21 days on the user's host was scanned (2026-10-08):

- 23 sessions used the `todo` tool; 10 ended with open items (`pending` or `in_progress`).
- In all 10, the agent kept working after its last `todo` call: 8 to 643 more tool calls.
- In 3 of them, 1 to 5 compactions came after that last call. In 8, the user sent more prompts.

`extensions/todo.ts` keeps the list in tool-result `details`, replays it on `session_start`,
`session_tree` and `session_compact`, and draws it in the TUI overlay. The model sees the list
only inside its own past tool results. After a compaction the summary replaces those results.
After a long stretch of other work, nothing brings the list back into view. The overlay is for
the human, not for the model.

## Goal
While the list has open items, the model is reminded of them:

1. **At each new prompt.** On `before_agent_start`, the extension adds one hidden custom message
   to that run. The message holds the open items, the one `in_progress`, and how many are done.
   It also tells the model to update the list: complete finished items, delete obsolete ones, or
   `clear` it when the work changed.
2. **When the list goes stale.** After `STALE_TOOL_CALLS` (20) tool calls with no `todo` call,
   the extension adds the same reminder once at the next `turn_end` as a hidden custom message
   entry. The count restarts at every `todo` call, so the reminder comes back only after another
   20 calls without one.

No reminder is sent when the list is empty or fully completed. The reminder is short. It does
not ask a question, and it does not start a new turn by itself.

## Non-goals
- Changing the tool, its actions, the overlay, or how the list is replayed.
- Forcing the model to finish items or blocking the end of a run.
- Persisting the counter: after a restart it starts from zero.

## Failure modes
- **Nagging:** a list the user abandoned on purpose gets one reminder per prompt plus one every 20
  calls. The text tells the model to `clear` it, so one `todo` call ends the reminders.
- **Prompt cache:** the reminder is appended at the end of the context and never edits earlier
  messages, so the cached prefix stays valid.
- **Stale context:** handlers read only the in-memory list, never `ctx` after disposal.

## Verification
- Unit tests with the existing fake `pi`:
  - `before_agent_start` returns the message only with open items, and its text lists them;
  - `turn_end` adds the entry after 20 non-todo tool calls, not before, and not twice;
  - a `todo` call resets the count;
  - no reminder is sent for an empty or completed list.
- `npm run check` (biome, typecheck, knip, vitest).

## Gates
Answer of the user, 2026-10-08 ("si"):
- **Attempt:** one PR on `carlitose/pi-code`, based on the installed commit `6f163fd` (branch
  `feat/telegram-question-responder`), with green CI.
- **Budget:** no spend; local tests and CI only. **Time:** 4 hours. **Maximum attempts:** 2.
- **Approvals:** the agent merges the PR into `feat/telegram-question-responder` on green CI. The
  pin in `pi-personal-config` and `update:personal` happen only after the running benchmark lots
  (`dbh-vague`) end. No npm publication and no upstream PR.
- **Exact version:** the fork commit merged by this PR.
- **Existing blocks searched:** benchmark lots must not see an update mid-lot (memory
  `dbh-chain12-gates`, `gates-explicit-at-spec-time`).
