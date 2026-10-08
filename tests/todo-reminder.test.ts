import { describe, expect, it } from 'vitest'

import todoExtension, { STALE_TOOL_CALLS, TODO_REMINDER } from '../extensions/todo.ts'

type Handler = (event: unknown, ctx: unknown) => Promise<unknown>
type Execute = (id: string, params: Record<string, unknown>) => Promise<unknown>
type Reminder = { customType: string; content: string; display: boolean }

/** A fake pi that keeps every handler, so the reminder hooks can be fired directly. */
const setup = () => {
  const handlers = new Map<string, Handler>()
  let execute: Execute | undefined
  todoExtension({
    on: (name: string, fn: Handler) => handlers.set(name, fn),
    registerCommand: () => {},
    registerTool: (tool: { name: string; execute: Execute }) => {
      if (tool.name === 'todo') execute = tool.execute
    },
  } as never)
  const fire = (name: string, event: unknown = {}) => (handlers.get(name) as Handler)(event, {})
  const toolEnd = (toolName: string) => fire('tool_execution_end', { toolName, isError: false })
  const todo = async (params: Record<string, unknown>) => {
    await (execute as Execute)('c', params)
    await toolEnd('todo')
  }
  const others = async (count: number) => {
    for (let i = 0; i < count; i++) await toolEnd('bash')
  }
  const turnEnd = async (proposed: unknown[] = []) => ((await fire('turn_end', { entries: proposed, continue: false })) as { entries?: Array<Reminder & { type: string }> } | undefined)?.entries ?? []
  const start = async () => ((await fire('before_agent_start', { prompt: 'go' })) as { message?: Reminder } | undefined)?.message
  return { todo, others, turnEnd, start }
}

describe('todo reminder', () => {
  it('reminds the model of open todos at each new prompt, and of nothing else', async () => {
    const h = setup()
    expect(await h.start()).toBeUndefined()
    await h.todo({ action: 'add', text: 'write tests' })
    await h.todo({ action: 'add', text: 'ship it' })
    await h.todo({ action: 'start', id: 1 })
    const message = await h.start()
    expect(message).toMatchObject({ customType: TODO_REMINDER, display: false })
    expect(message?.content).toContain('[>] #1: write tests')
    expect(message?.content).toContain('[ ] #2: ship it')
    expect(message?.content).toContain('clear')
    await h.todo({ action: 'complete', id: 1 })
    await h.todo({ action: 'complete', id: 2 })
    expect(await h.start()).toBeUndefined() // all done
  })

  it('reminds once after a stale stretch, and a todo call restarts the count', async () => {
    const h = setup()
    await h.todo({ action: 'add', text: 'migrate' })
    await h.others(STALE_TOOL_CALLS - 1)
    expect(await h.turnEnd()).toEqual([])
    await h.others(1)
    const [entry] = await h.turnEnd()
    expect(entry).toMatchObject({ type: 'custom_message', customType: TODO_REMINDER, display: false })
    expect(entry.content).toContain('#1: migrate')
    await h.others(5)
    expect(await h.turnEnd()).toEqual([]) // not twice in one stale stretch
    await h.todo({ action: 'list' })
    await h.others(STALE_TOOL_CALLS - 1)
    expect(await h.turnEnd()).toEqual([])
    await h.others(1)
    expect(await h.turnEnd()).toHaveLength(1)
  })

  it('keeps the entries another extension proposed at the same turn end', async () => {
    const h = setup()
    await h.todo({ action: 'add', text: 'a' })
    await h.others(STALE_TOOL_CALLS)
    const other = { type: 'custom', customType: 'peer', data: 1 }
    const entries = await h.turnEnd([other])
    expect(entries[0]).toBe(other)
    expect(entries[1]).toMatchObject({ customType: TODO_REMINDER })
  })

  it('stays silent on a stale stretch when nothing is open', async () => {
    const h = setup()
    await h.others(STALE_TOOL_CALLS * 2)
    expect(await h.turnEnd()).toEqual([])
    await h.todo({ action: 'add', text: 'x' })
    await h.todo({ action: 'complete', id: 1 })
    await h.others(STALE_TOOL_CALLS)
    expect(await h.turnEnd()).toEqual([])
  })
})
