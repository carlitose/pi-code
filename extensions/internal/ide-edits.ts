/**
 * Files about to change through pi-agent-ide's mutation tools.
 *
 * pi-agent-ide replaces pi's `edit` with `replace`, `insert`, `delete`, `move` and `copy`
 * (and its own `write`), whose `path` can be a Read result, an anchor or a symbol rather
 * than a file name, so a `tool_call` reader cannot tell which file they touch. The package
 * resolves every call to one plan before the first write and hands it to registered guards
 * over pi's event bus (its docs/user-hooks.md, "Protect files from edits" and "Protect whole
 * objects from deletion"). This joins that protocol without depending on the package: the
 * core checks the plugin's API version for equality, so the version is the one its
 * readiness event announces, or the last known one when the core loaded first.
 */

import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'

const PROTOCOL = 'pi-agent-text-editor'
/** pi-agent-ide 0.8.1 (pi-agent-text-editor TEXT_EDITOR_API_VERSION). */
export const KNOWN_TEXT_EDITOR_API_VERSION = 32
export const TEXT_EDITOR_READY_EVENT = `${PROTOCOL}/core/ready`
export const TEXT_EDITOR_REGISTER_EVENT = `${PROTOCOL}/plugin/register`

type Host = Pick<ExtensionAPI, 'on'> & { events?: ExtensionAPI['events'] }

/** The part of the text-editor core's plugin API this module uses. */
type EditorApi = {
  addMutationGuard(registration: { id: string; guard(plan: { resources?: ReadonlyArray<{ source?: unknown }> }): Promise<{ kind: 'accepted' }> }): void
  addDeleteGuard?(registration: { id: string; guard(event: { path?: unknown; kind?: unknown }): Promise<{ decision: 'allow' }> }): void
}

/** A local file a plan names, or undefined for a remote (SSH) or other non-file resource. */
function localFile(source: unknown): string | undefined {
  if (typeof source !== 'string' || source.length === 0) return undefined
  if (source.startsWith('file://')) {
    try {
      return fileURLToPath(source)
    } catch {
      return undefined
    }
  }
  return path.isAbsolute(source) ? source : undefined
}

/** Call `listener` with the local files each pi-agent-ide edit or file deletion is about to
 * change, before it writes. The listener's own failure never blocks the edit. Returns
 * whether the core accepted the registration so far (false without pi-agent-ide). */
export function onIdeEdits(pi: Host, id: string, listener: (files: string[]) => Promise<void> | void): () => boolean {
  const events = pi.events
  let connected = false
  if (!events) return () => connected
  const notify = async (files: string[]): Promise<void> => {
    if (files.length === 0) return
    try {
      await listener(files)
    } catch {
      // a checkpoint that cannot be taken must not stop the edit
    }
  }
  const announce = (apiVersion: number): boolean => {
    let accepted = false
    events.emit(TEXT_EDITOR_REGISTER_EVENT, {
      plugin: {
        protocol: PROTOCOL,
        apiVersion,
        id: `pi-code/${id}`,
        setup(api: EditorApi) {
          api.addMutationGuard({
            id: `pi-code-${id}`,
            async guard(plan) {
              await notify((plan.resources ?? []).flatMap((resource) => localFile(resource.source) ?? []))
              return { kind: 'accepted' }
            },
          })
          api.addDeleteGuard?.({
            id: `pi-code-${id}`,
            async guard(event) {
              const file = event.kind === 'file' ? localFile(event.path) : undefined
              if (file) await notify([file])
              return { decision: 'allow' }
            },
          })
        },
      },
      accept(registration: Promise<void>) {
        accepted = true
        void Promise.resolve(registration).then(
          () => {
            connected = true
          },
          () => {},
        )
      },
    })
    return accepted
  }
  if (announce(KNOWN_TEXT_EDITOR_API_VERSION)) return () => connected
  const unsubscribe = events.on(TEXT_EDITOR_READY_EVENT, (ready) => {
    const version = ready as { protocol?: unknown; apiVersion?: unknown } | undefined
    if (version?.protocol !== PROTOCOL || typeof version.apiVersion !== 'number') return
    if (announce(version.apiVersion)) unsubscribe()
  })
  pi.on('session_shutdown', unsubscribe)
  return () => connected
}
