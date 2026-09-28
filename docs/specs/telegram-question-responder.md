# Answer `pi-code.question` from Telegram

## Artifact Graph
- Artifact ID: `artifact:pi-code-telegram-question-spec`
- Role: spec
- Standalone: true
- Children: [01 Offer a typed remote question](../tickets/telegram-question-responder/01-offer-typed-remote-question.md)

## Type and evidence
Feature spec. `extensions/question.ts` currently calls `ctx.ui.custom()` in TUI mode for single-choice, checkbox multi-select, free text and an optional idle countdown. Its `ctx.ui.select()`/`input()` fallback is for non-TUI (RPC) mode and does not preserve checkbox multi-select. Pi's proposed remote-dialog request covers `select`, `confirm`, `input` and `editor`, not arbitrary `custom()` components. A live Telegram turn was observed in Thread E, but the `question` tool's options did not appear there. An earlier direct test was sent from Thread D; a later explicit E message appeared in E, although the cross-Thread agent-turn routing then failed. None of that proves remote question settlement.

The Telegram bridge and Pi host changes under `pi-telegram/docs/specs/telegram-remote-dialogs.md` remain separate: the host PR is closed pending contribution approval, and the bridge PR is draft. This question-specific contract uses Pi's existing public in-process `pi.events` bus; it does not require pretending that a custom TUI component is serializable.

## Goal
A paired owner can answer `pi-code.question` in the exact Telegram Thread assigned to the original Pi session. Support one choice, checkbox multi-select, optional free text for single-select, cancel and the existing timeout outcome. One remotely answerable question produces at most one non-silent attention message. When no remote responder is eligible, the current TUI overlay remains the normal path.

## Non-goals
- Remote rendering of arbitrary `ctx.ui.custom()` components, replacing Pi's TUI, or sending terminal keystrokes.
- Importing Telegram transport, bot tokens, or bridge internals into `pi-code`.
- Changing `pi-code`'s unrelated `typebox` dependency warning in this feature PR.
- Claiming sound on a device or a live answer without observed delivery and settlement.

## Question-owned contract
In TUI mode, before opening the custom overlay, `question` emits `pi-code:question:v1` over `pi.events` with `version: 1`, a unique `requestId`, current `sessionId`, `question`/optional `header`, an ordered array of option labels and descriptions (answer indices are 1-based), `multiSelect`, `allowFreeText`, and an `AbortSignal`. `claim()` must run synchronously during event emission and returns the sole `settle(outcome): boolean` handle; late or second claims fail. Valid outcomes are `{action:'answer', indices:number[]}`, `{action:'text', text:string}`, `{action:'cancel'}` and `{action:'pass'}`. After claiming, `touch(): boolean` reports user activity to reset a configured idle timeout. If nobody claims, the ordinary overlay opens immediately. A listener may claim only while it can identify the current connected session and an authorized exact target; it then sends asynchronously. A known delivery failure or decline releases the tool to its local overlay. An uncertain send is never replayed; any later Telegram reply to an abandoned request is inert.

Only the claimant can settle once with a typed outcome: selected indices, single-select free text, explicit cancellation, or a local fallback. `pi-code` validates indices, cardinality, free-text eligibility and the live session before converting the result to its existing `QuestionDetails`/tool text. A stale, duplicate, post-abort or replaced-session settlement cannot answer the question. Do not show a local overlay concurrently with a claimed remote request. The tool's signal and the configured question idle timeout bound the wait; activity resets that configured timer. A configured timeout uses the existing no-answer/timed-out semantics. Without one, a fixed five-minute remote ceiling releases the tool to its local overlay rather than inventing an idle-timeout setting.

While a responder owns the request, the tool emits a partial progress result explaining that it is waiting remotely and that delivery may still be pending. This is not transport confirmation or a user answer. A declined or expired remote wait emits a second progress result directing the operator to the local dialog and warning that the previous remote question is no longer answerable. Final `QuestionDetails`, timeout semantics and the event contract remain unchanged; an unclaimed request produces no remote-wait progress.

The event is a capability seam, not a transport protocol: `pi-code` owns the question/result semantics; a Telegram adapter owns pairing, target ownership, notification, reply decoding and no-replay behavior. The callback travels only within the Pi process and is never persisted or sent over Telegram.

## Alternatives considered
- Serializing generic custom TUI components would expose arbitrary terminal behavior without a typed answer contract; reject.
- Always using the existing RPC dialog fallback in TUI would regress local overlay behavior and treat multi-select as one choice; reject.
- Having `pi-code` call the Bot API would duplicate credentials, Thread authority and queue ownership; reject.
- Extending the generic Pi host dialog PR for this one tool adds an upstream dependency that an in-process question-owned offer does not need; keep the independent event seam.

## Implementation slices and ownership
1. In `ilovepixelart/pi-code`, add the opt-in question offer with one-claim/one-settlement semantics and tests. No Telegram package is required to load or use `question` locally.
2. In `llblab/pi-telegram`, consume this exact event using the bridge's existing target/session authority and pending-input fencing. Support multi-select and free-text answers without changing routine notification defaults. This is a separate bridge ticket, blocked on the validated producer contract and a healthy live target; it does not bypass the existing `select`/`confirm`/`input`/`editor` ticket or its host approval gate.

## Verification and open gates
Unit tests cover absent listener/local overlay, synchronous claim, valid and malformed responses, single/multi-select and free text, decline/failure, cancel, timeout, session replacement and duplicate settlement. Bridge tests cover paired owner, wrong user/Thread/profile, follower/leader routing, notification deduplication, and uncertain delivery without replay. Integration uses a real Pi extension event bus with both extensions; a disposable live Thread must show the question, allow one answer, resume the same Pi session and confirm the alert behavior. `npm run check` in `pi-code` and the bridge's mandatory checks remain required. Upstream review/CI/merge and an installed compatible pair are separate gates; this spec and a fork-only implementation are not a release.
