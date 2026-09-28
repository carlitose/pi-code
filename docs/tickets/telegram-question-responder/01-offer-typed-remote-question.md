---
ticket_schema: 1
ticket_id: "01"
execution_mode: AFK
blocked_by: []
---

# Offer typed `pi-code.question` requests to remote responders

## Artifact Graph
- Artifact ID: `artifact:pi-code-telegram-question-01`
- Role: ticket
- Parent: [telegram-question-responder.md](../../specs/telegram-question-responder.md)

## Parent Spec
[Answer `pi-code.question` from Telegram](../../specs/telegram-question-responder.md), question-owned contract and producer slice.

## What to Build
In `extensions/question.ts` and its focused tests, let the question tool offer its complete typed question over Pi's public `pi.events` bus before opening the TUI overlay. Use a versioned channel and one synchronous claim/one settlement. This producer knows no Telegram tokens, targets or Bot API. Keep the existing TUI overlay and non-TUI dialog behavior when no responder claims.

## Acceptance Criteria
- [ ] In TUI mode without an eligible synchronous claimant, the existing single-/multi-select, free-text, idle countdown and cancel overlay behavior is unchanged; RPC/print behavior does not regress.
- [ ] A claimed request carries a unique ID, current session identity, indexed options, header, multi-select/free-text capability and cancellation bound; only its claimant can settle once, and no local overlay runs concurrently.
- [ ] Valid single choice, multiple choices, allowed free text, cancel and timeout map to the existing `QuestionDetails`/tool results. Out-of-range, duplicate, late, post-abort or replaced-session settlements never manufacture an answer.
- [ ] Decline or a confirmed delivery failure falls back to the ordinary local overlay; an uncertain send is not replayed by this tool. A bounded wait cannot strand the Pi session.
- [ ] Focused tests and the repository's required `npm run check` pass on the exact candidate. The separate bridge, live Telegram and upstream review remain explicit gates.

## Frontier
Ready for local implementation against upstream `ilovepixelart/pi-code` main at the observed base, subject to a fresh remote-head check. Provider merge and live answer are not implied by this producer handoff. The `typebox` dependency warning is an unrelated change.

## Step-by-Step Implementation Plan
1. Add tests for absent listener, synchronous claim, result validation, fallback, cancellation, session change and timeout before editing behavior.
2. Add the small versioned in-process offer/settlement seam to `question`; keep its current overlay and RPC fallback paths intact.
3. Run focused tests, typecheck and required check; review the frozen candidate and hand off exact upstream gates.

## Testing Plan
Unit and integration tests with the actual Pi event bus and stubbed question context. No network/model call is required for producer checks. Bridge contract and disposable live Thread tests belong to its consumer ticket.

## Out of Scope
- Telegram transport or credentials, generic `custom()` rendering, changing the Pi host remote-dialog PR, and changing `pi-code`'s unrelated `typebox` dependency declaration.
