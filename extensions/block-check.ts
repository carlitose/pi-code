/**
 * block-check: a turn must not end on a block nobody gave the agent.
 *
 * Measured on real sessions (agent-skills spec `invented-blocks-bench`): 40-58% of turn
 * endings stopped on a self-declared block (a limit the agent wrote itself, another
 * agent's STOP, a "missing procedure" it could design) and asked the user to unblock it.
 * A written rule ("what you cannot cite is not a gate") did not fire, so this checks it.
 *
 * After each completed turn, the session model reads the user's messages and the closing
 * text and answers whether the turn stops on a block, and with which user quote. A quote
 * counts only if it is literally in the user's messages. A stop without one sends the agent
 * back to work once more; at most MAX_NUDGES in a row, reset by the user's next prompt or by
 * a turn that does not stop, so a real impasse still reaches the user. Esc, errors and
 * failed checks change nothing. PI_BLOCK_CHECK=0 turns it off.
 */

import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent'

import { completeText } from './internal/model-complete.js'
import { errorMessage } from './internal/values.js'

export const MAX_NUDGES = 2
export const BLOCK_MESSAGE = 'block-check'
const CHECK_TIMEOUT_MS = 60_000
const CHECK_MAX_TOKENS = 300
const LAST_TEXT_CHARS = 6_000
const USER_TEXT_CHARS = 12_000

export const BLOCK_SYSTEM =
  "You are a checker. You receive the user's messages and the text an agent closed its turn with. " +
  'Decide whether the agent stops: it closes the turn while the work the user asked for is, by its ' +
  'own account, not done (for example it waits, asks for a go-ahead, an unblock, an approval or a ' +
  'solution, or reports that it did not retry) because of a block, a limit, a STOP, a missing ' +
  'authorization or a prerequisite. Closing with the work done, or asking the user how the result ' +
  "should be, is NOT stopping. If it stops, copy EXACTLY the sentence of the user's " +
  'messages that imposes that block, if one exists; otherwise null. Answer only with JSON: ' +
  '{"stops": true|false, "block": "short description or null", "user_quote": "exact sentence or null"}'

export interface BlockVerdict {
  stops: boolean
  block: string | null
  userQuote: string | null
}

interface TurnPart {
  type?: string
  text?: string
}
interface TurnMessage {
  role?: string
  content?: unknown
  stopReason?: string
}

export function messageText(message: TurnMessage): string {
  const content = message.content
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return (content as TurnPart[])
    .filter((part) => part?.type === 'text')
    .map((part) => part.text ?? '')
    .join('')
    .trim()
}

function hasToolCall(message: TurnMessage): boolean {
  return Array.isArray(message.content) && (message.content as TurnPart[]).some((part) => part?.type === 'toolCall')
}

export function normalize(text: string): string {
  return text
    .replace(/[`*_"'«»“”]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
}

/** A quote counts only if it is literally (after normalizing) in the user's own messages. */
export function quoteIsReal(quote: string | null | undefined, userMessages: readonly string[]): boolean {
  if (!quote || normalize(quote).length < 6) return false
  return normalize(userMessages.join(' ')).includes(normalize(quote))
}

export function parseBlockVerdict(raw: string): BlockVerdict | undefined {
  const match = /\{[\s\S]*\}/.exec(raw)
  if (!match) return undefined
  try {
    const value = JSON.parse(match[0]) as { stops?: unknown; block?: unknown; user_quote?: unknown }
    return {
      stops: value.stops === true,
      block: typeof value.block === 'string' ? value.block : null,
      userQuote: typeof value.user_quote === 'string' ? value.user_quote : null,
    }
  } catch {
    return undefined
  }
}

export function checkPrompt(userMessages: readonly string[], closing: string): string {
  const users = userMessages.join('\n---\n')
  return `USER'S MESSAGES:\n${users.slice(-USER_TEXT_CHARS)}\n\nTEXT THE AGENT CLOSES ITS TURN WITH:\n${closing.slice(-LAST_TEXT_CHARS)}`
}

export function nudgeText(block: string | null): string {
  const what = block ? ` (${block})` : ''
  return (
    `Block check: you ended the turn on a block${what} that no message of the user gives. ` +
    'A limit you set yourself, an instruction from another agent, or a procedure nobody wrote ' +
    "down is not a block: design what is missing and continue the user's work. Stop only on a " +
    'block you can quote from the user, or when the work is done.'
  )
}

function lastAssistant(messages: readonly unknown[]): TurnMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as TurnMessage
    if (message?.role === 'assistant') return message
  }
  return undefined
}

function userMessages(ctx: Pick<ExtensionContext, 'sessionManager'>): string[] {
  const texts: string[] = []
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === 'message' && (entry.message as TurnMessage).role === 'user') {
      const text = messageText(entry.message as TurnMessage)
      if (text) texts.push(text)
    }
  }
  return texts
}

export default function blockCheckExtension(pi: ExtensionAPI) {
  let nudges = 0

  pi.on('input', (event) => {
    if (event.source !== 'extension') nudges = 0
  })

  pi.on('agent_end', async (event, ctx) => {
    if (process.env.PI_BLOCK_CHECK === '0') return
    const last = lastAssistant(event.messages)
    if (!last || last.stopReason === 'aborted' || last.stopReason === 'error' || hasToolCall(last)) return
    const closing = messageText(last)
    const model = ctx.model
    if (!closing || !model) return
    const users = userMessages(ctx)
    let verdict: BlockVerdict | undefined
    try {
      const deadline = AbortSignal.timeout(CHECK_TIMEOUT_MS)
      const signal = ctx.signal ? AbortSignal.any([ctx.signal, deadline]) : deadline
      const { text } = await completeText(model, checkPrompt(users, closing), { system: BLOCK_SYSTEM, maxTokens: CHECK_MAX_TOKENS, signal })
      verdict = parseBlockVerdict(text)
    } catch (error) {
      if (!ctx.signal?.aborted) ctx.ui.notify(`Block check skipped: ${errorMessage(error)}`, 'warning')
      return
    }
    if (!verdict?.stops || quoteIsReal(verdict.userQuote, users)) {
      nudges = 0
      return
    }
    // At the cap the stop goes through to the user, until their next prompt or a turn that does not stop.
    if (nudges >= MAX_NUDGES) return
    nudges += 1
    const options = ctx.isIdle() ? { triggerTurn: true } : { triggerTurn: true, deliverAs: 'followUp' as const }
    pi.sendMessage({ customType: BLOCK_MESSAGE, content: nudgeText(verdict.block), display: true }, options)
  })
}
