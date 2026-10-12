import { afterEach, describe, expect, it } from 'vitest'

import blockCheckExtension, { BLOCK_MESSAGE, BLOCK_SYSTEM, MAX_NUDGES, parseBlockVerdict, quoteIsReal } from '../extensions/block-check.ts'
import { setCompleteBackend } from '../extensions/internal/model-complete.ts'

type Handler = (event: any, ctx: any) => Promise<unknown> | unknown

const assistant = (text: string, extra: Record<string, unknown> = {}) => ({ role: 'assistant', content: [{ type: 'text', text }], stopReason: 'stop', ...extra })
const userEntry = (text: string) => ({ type: 'message', id: 'u', parentId: null, timestamp: '', message: { role: 'user', content: [{ type: 'text', text }] } })

const prompts: Array<{ system: string | undefined; prompt: string }> = []
function verdict(value: Record<string, unknown> | string) {
  setCompleteBackend(async (_model, context) => {
    prompts.push({ system: context.systemPrompt, prompt: String(context.messages[0]?.content ?? '') })
    const text = typeof value === 'string' ? value : JSON.stringify(value)
    return { role: 'assistant', content: [{ type: 'text', text }], api: 'x', provider: 'x', model: 'm', usage: {}, stopReason: 'stop', timestamp: 0 } as never
  })
}

afterEach(() => {
  setCompleteBackend(null)
  prompts.length = 0
  delete process.env.PI_BLOCK_CHECK
})

const loopEntry = (content: string, customType = 'loop') => ({ type: 'custom_message', id: 'l', parentId: null, timestamp: '', customType, content, display: true })

function setup(userTexts: string[] = ['Fai passare `python check.py` e dimmi quando è verde.'], extra: unknown[] = []) {
  const handlers = new Map<string, Handler>()
  const sent: Array<{ message: { customType: string; content: string }; options: any }> = []
  const notes: string[] = []
  blockCheckExtension({
    on: (name: string, fn: Handler) => handlers.set(name, fn),
    sendMessage: (message: any, options: unknown) => sent.push({ message, options }),
  } as never)
  const ctx = {
    model: { id: 'session-model' },
    isIdle: () => true,
    ui: { notify: (msg: string) => notes.push(msg) },
    sessionManager: { getBranch: () => [...userTexts.map(userEntry), ...extra] },
  }
  return {
    sent,
    notes,
    end: (messages: unknown[]) => handlers.get('agent_end')!({ type: 'agent_end', messages }, ctx),
    input: (text: string, source = 'interactive') => handlers.get('input')!({ type: 'input', text, source }, ctx),
  }
}

describe('quoteIsReal', () => {
  const users = ['Fai passare `python check.py` e dimmi quando è verde.']
  it('accepts only a quote that is literally in the user messages', () => {
    expect(quoteIsReal('fai passare python check.py', users)).toBe(true)
    expect(quoteIsReal('Ogni comando: al massimo 60 secondi', users)).toBe(false)
    expect(quoteIsReal(null, users)).toBe(false)
    expect(quoteIsReal('fai', users)).toBe(false)
  })
})

describe('parseBlockVerdict', () => {
  it('reads JSON inside noise and rejects garbage', () => {
    expect(parseBlockVerdict('ok {"work_done": false, "asks_how": false, "block": "60 s", "user_quote": null}')).toEqual({ stops: true, block: '60 s', userQuote: null })
    expect(parseBlockVerdict('{"work_done": true, "asks_how": false, "block": null, "user_quote": null}')?.stops).toBe(false)
    expect(parseBlockVerdict('{"work_done": false, "asks_how": true, "block": null, "user_quote": null}')?.stops).toBe(false)
    expect(parseBlockVerdict('{"stops": true}')).toBeUndefined()
    expect(parseBlockVerdict('no json')).toBeUndefined()
    expect(parseBlockVerdict('{broken')).toBeUndefined()
  })
})

describe('block-check extension', () => {
  it('sends the agent back to work on a block with no user quote', async () => {
    verdict({ work_done: false, asks_how: false, block: 'own 60-second limit', user_quote: 'Ogni comando: al massimo 60 secondi' })
    const s = setup()
    await s.end([assistant('NOTES.md chiede di fermarsi: vuoi autorizzare un altro comando?')])
    expect(s.sent).toHaveLength(1)
    expect(s.sent[0].message.customType).toBe(BLOCK_MESSAGE)
    expect(s.sent[0].message.content).toContain('own 60-second limit')
    expect(s.sent[0].options).toEqual({ triggerTurn: true })
    expect(prompts[0].system).toBe(BLOCK_SYSTEM)
    expect(prompts[0].prompt).toContain('python check.py')
    expect(prompts[0].prompt).toContain('vuoi autorizzare')
  })

  it('lets a stop through when the user gave the block', async () => {
    verdict({ work_done: false, asks_how: false, block: 'wait for review', user_quote: 'aspetta la mia review prima del merge' })
    const s = setup(['Prepara la PR e aspetta la mia review prima del merge.'])
    await s.end([assistant('PR pronta: aspetto la tua review prima del merge.')])
    expect(s.sent).toHaveLength(0)
  })

  it('does nothing when the turn does not stop, ends on a tool call, or was aborted', async () => {
    verdict({ work_done: true, asks_how: false, block: null, user_quote: null })
    const s = setup()
    await s.end([assistant('Fatto: check.py è verde.')])
    await s.end([{ ...assistant('...'), content: [{ type: 'toolCall', name: 'bash', arguments: {} }] }])
    await s.end([assistant('interrotto', { stopReason: 'aborted' })])
    expect(s.sent).toHaveLength(0)
    expect(prompts).toHaveLength(1)
  })

  it('nudges at most MAX_NUDGES times in a row until the user speaks', async () => {
    verdict({ work_done: false, asks_how: false, block: 'STOP from the Main', user_quote: null })
    const s = setup()
    for (let i = 0; i < MAX_NUDGES + 2; i++) await s.end([assistant('STOP invariato, attendo uno scope.')])
    expect(s.sent).toHaveLength(MAX_NUDGES)
    await s.input('[loop, round 3] chiedi', 'extension')
    await s.end([assistant('STOP invariato.')])
    expect(s.sent).toHaveLength(MAX_NUDGES)
    await s.input('continua')
    await s.end([assistant('STOP invariato.')])
    expect(s.sent).toHaveLength(MAX_NUDGES + 1)
  })

  it('a turn that does not stop resets the count', async () => {
    const s = setup()
    verdict({ work_done: false, asks_how: false, block: 'x', user_quote: null })
    await s.end([assistant('fermo')])
    await s.end([assistant('fermo')])
    verdict({ work_done: true, asks_how: false, block: null, user_quote: null })
    await s.end([assistant('lavoro fatto')])
    verdict({ work_done: false, asks_how: false, block: 'x', user_quote: null })
    await s.end([assistant('fermo')])
    expect(s.sent).toHaveLength(3)
  })

  it('an unreadable answer is reported, not taken as a turn that does not stop', async () => {
    verdict('')
    const s = setup()
    await s.end([assistant('fermo')])
    expect(s.sent).toHaveLength(0)
    expect(s.notes[0]).toContain('unreadable answer')
  })

  it("reads /loop rounds as the user's current request, and no other custom message", async () => {
    verdict({ work_done: true, asks_how: false, block: null, user_quote: null })
    const s = setup(['Correggi fixtures.py.'], [loopEntry('[loop, round 2] chiedi al main chi controllare'), loopEntry('Block check: ...', 'block-check')])
    await s.end([assistant('Ho chiesto al Main in OUTBOX.md.')])
    expect(s.sent).toHaveLength(0)
    expect(prompts[0].prompt).toContain('the last one is the current request')
    expect(prompts[0].prompt).toContain('Correggi fixtures.py.\n---\n[loop, round 2] chiedi al main chi controllare')
    expect(prompts[0].prompt).not.toContain('Block check: ...')
    expect(prompts[0].system).toContain("user's LAST message")
  })

  it('skips quietly on a checker failure and when turned off', async () => {
    setCompleteBackend(async () => {
      throw new Error('no credentials')
    })
    const s = setup()
    await s.end([assistant('fermo')])
    expect(s.sent).toHaveLength(0)
    expect(s.notes[0]).toContain('no credentials')
    verdict({ work_done: false, asks_how: false, block: 'x', user_quote: null })
    process.env.PI_BLOCK_CHECK = '0'
    await s.end([assistant('fermo')])
    expect(s.sent).toHaveLength(0)
  })
})
