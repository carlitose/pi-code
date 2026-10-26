import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

import gitCheckpoint from '../extensions/git-checkpoint.ts'
import { KNOWN_TEXT_EDITOR_API_VERSION, onIdeEdits, TEXT_EDITOR_READY_EVENT, TEXT_EDITOR_REGISTER_EVENT } from '../extensions/internal/ide-edits.ts'

type Handler = (event: any, ctx: any) => Promise<unknown>

const hoisted = vi.hoisted(() => ({ home: '' }))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return { ...actual, homedir: () => hoisted.home }
})

const userEntry = { type: 'message', id: 'user0001', parentId: null, message: { role: 'user', content: 'rename the loader' } }
const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** pi's event bus, and pi-agent-ide's text-editor core on it: it accepts a plugin of its own
 * API version and keeps the guards the plugin adds. */
function bus() {
  const listeners = new Map<string, Array<(data: unknown) => void>>()
  const events = {
    on(channel: string, handler: (data: unknown) => void) {
      listeners.set(channel, [...(listeners.get(channel) ?? []), handler])
      return () =>
        listeners.set(
          channel,
          (listeners.get(channel) ?? []).filter((h) => h !== handler),
        )
    },
    emit(channel: string, data: unknown) {
      for (const handler of listeners.get(channel) ?? []) handler(data)
    },
  }
  const guards: { edit: any[]; remove: any[]; versions: number[] } = { edit: [], remove: [], versions: [] }
  const startCore = (apiVersion: number) => {
    events.on(TEXT_EDITOR_REGISTER_EVENT, (request: any) => {
      guards.versions.push(request.plugin.apiVersion)
      if (request.plugin.apiVersion !== apiVersion) return
      request.plugin.setup({ addMutationGuard: (g: any) => guards.edit.push(g), addDeleteGuard: (g: any) => guards.remove.push(g) })
      request.accept(Promise.resolve())
    })
    events.emit(TEXT_EDITOR_READY_EVENT, { protocol: 'pi-agent-text-editor', apiVersion })
  }
  return { events, guards, startCore }
}

function setup(events: ReturnType<typeof bus>['events']) {
  const handlers = new Map<string, Handler[]>()
  const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>()
  const appended: Array<{ customType: string; data: any }> = []
  const repo = mkdtempSync(join(tmpdir(), 'gcide-repo-'))
  const sessionFile = join(repo, 'session-test.jsonl')
  hoisted.home = mkdtempSync(join(tmpdir(), 'gcide-home-'))
  process.env.PI_CODING_AGENT_DIR = join(hoisted.home, '.pi', 'agent')
  tempDirs.push(repo, hoisted.home)
  execFileSync('git', ['init', '-qb', 'main'], { cwd: repo, stdio: ['pipe', 'pipe', 'pipe'] })

  gitCheckpoint({
    events,
    on: (name: string, fn: Handler) => handlers.set(name, [...(handlers.get(name) ?? []), fn]),
    registerCommand: (name: string, opts: any) => commands.set(name, opts),
    appendEntry: (customType: string, data: any) => appended.push({ customType, data }),
    exec: async (cmd: string, args: string[], options?: { cwd?: string }) => {
      try {
        return { stdout: execFileSync(cmd, args, { cwd: options?.cwd ?? repo, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }), stderr: '', code: 0, killed: false }
      } catch (err: any) {
        return { stdout: err.stdout ?? '', stderr: err.stderr ?? String(err), code: err.status ?? 1, killed: false }
      }
    },
  } as any)

  const ctx = (entries: any[], branch: any[], answers: string[]) => ({
    cwd: repo,
    hasUI: true,
    sessionManager: { getEntries: () => entries, getBranch: () => branch, getSessionFile: () => sessionFile },
    ui: { select: async () => answers.shift(), notify: () => {}, setEditorText: () => {} },
    navigateTree: async () => ({ editorText: '', cancelled: false }),
  })
  const fire = async (name: string, event: any, c = ctx([], [], [])) => {
    for (const fn of handlers.get(name) ?? []) await fn(event, c)
  }
  const rewind = () => commands.get('rewind')?.handler('', ctx(appended, [userEntry], [`1. ${new Date(appended[0].data.createdAt).toLocaleTimeString()}  ${appended[0].data.prompt}`, 'Code only']))
  const run = async (edit: () => Promise<void>) => {
    await fire('session_start', { reason: 'startup' })
    await fire('agent_start', {})
    await fire('turn_start', { turnIndex: 0 })
    await edit()
    await fire('turn_end', { turnIndex: 0 }, ctx([], [userEntry], []))
  }
  return { repo, run, rewind }
}

describe('checkpoints of pi-agent-ide edits', () => {
  it('restores a file changed by an IDE mutation tool (core loaded after pi-code)', async () => {
    const b = bus()
    const t = setup(b.events)
    b.startCore(KNOWN_TEXT_EDITOR_API_VERSION + 1) // a newer core: the version comes from its readiness event
    expect(b.guards.edit).toHaveLength(1)
    const file = join(t.repo, 'loader.ts')
    writeFileSync(file, 'before\n')

    await t.run(async () => {
      const verdict = await b.guards.edit[0].guard({ resources: [{ source: file }] }, { cwd: t.repo })
      expect(verdict).toEqual({ kind: 'accepted' })
      writeFileSync(file, 'after\n') // `replace` writes only after every guard accepted
    })
    await t.rewind()
    expect(readFileSync(file, 'utf8')).toBe('before\n')
  })

  it('restores a file an IDE delete removed (core loaded before pi-code)', async () => {
    const b = bus()
    b.startCore(KNOWN_TEXT_EDITOR_API_VERSION)
    const t = setup(b.events)
    expect(b.guards.remove).toHaveLength(1)
    const file = join(t.repo, 'old.ts')
    writeFileSync(file, 'keep me\n')

    await t.run(async () => {
      expect(await b.guards.remove[0].guard({ path: file, kind: 'file' })).toEqual({ decision: 'allow' })
      unlinkSync(file)
    })
    expect(existsSync(file)).toBe(false)
    await t.rewind()
    expect(readFileSync(file, 'utf8')).toBe('keep me\n')
  })

  it('reads file URLs, skips remote resources, and never blocks an edit', async () => {
    const b = bus()
    b.startCore(KNOWN_TEXT_EDITOR_API_VERSION)
    const seen: string[][] = []
    const connected = onIdeEdits({ events: b.events, on: () => () => {} }, 'probe', (files) => {
      seen.push(files)
      throw new Error('checkpoint store unavailable')
    })
    const local = join(tmpdir(), 'x.ts')
    const verdict = await b.guards.edit[0].guard({ resources: [{ source: pathToFileURL(local).href }, { source: 'ssh://box/home/a.ts' }] }, {})
    expect(verdict).toEqual({ kind: 'accepted' })
    expect(seen).toEqual([[local]])
    await Promise.resolve()
    expect(connected()).toBe(true)
  })

  it('stays off without pi-agent-ide', () => {
    expect(onIdeEdits({ on: () => () => {} }, 'probe', () => {})()).toBe(false)
  })
})
