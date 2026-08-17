/**
 * The append-only event log and its projection (design.md A1) plus the
 * fence-guarded mutation door (design.md A3).
 *
 * Every mutation goes through {@link mutateTask}: read log → project →
 * caller proposes events against current state → validate (fences, status
 * transitions) → append. Read-modify-append is serialized by an in-process
 * per-task promise chain; the log file is the cross-restart truth.
 * @module team-task/log
 */

import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, readFile, readdir, rename, truncate, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  LEAD_KEY,
  TERMINAL_NODE_STATUSES,
  type LogLine,
  type Member,
  type Message,
  type PlanNode,
  type RunRecord,
  type TeamTaskEvent,
  type TeamTaskState,
} from './types.ts'

/** In-process per-task mutation queues (promise chains). */
const locks = new Map<string, Promise<unknown>>()

/** Serialize one async operation per lock key. */
export async function withTaskLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const tail = previous.then(() => gate)
  locks.set(key, tail)
  await previous
  try {
    return await operation()
  } finally {
    release()
    if (locks.get(key) === tail) locks.delete(key)
  }
}

/** Slug of a task name: unicode letters/digits kept (CJK included). */
export function sanitizeTaskId(name: string): string {
  const cleaned = name.replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-+|-+$/g, '')
  return cleaned === '' ? 'task' : cleaned
}

/**
 * Mint a unique, chronologically-sortable task id:
 * `YYYYMMDD-HHmmss-<slug>` (local time). The stamp guarantees uniqueness
 * across same-named tasks and makes `tasks/` an ordered task list.
 */
export function mintTaskId(name: string, at: Date): string {
  const p = (n: number, w = 2): string => String(n).padStart(w, '0')
  const stamp = `${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}`
    + `-${p(at.getHours())}${p(at.getMinutes())}${p(at.getSeconds())}`
  return `${stamp}-${sanitizeTaskId(name)}`
}

/** Task-list directory (storage v2): `<stateRoot>/tasks/<taskId>/`. */
function taskDir(stateRoot: string, taskId: string): string {
  return join(stateRoot, 'tasks', taskId)
}

/**
 * Resolve where a task actually lives: v2 `tasks/<id>` first, then the
 * legacy v1 flat `<stateRoot>/<id>` (pre-redesign tasks keep working).
 * Missing tasks resolve to the v2 location (creation target).
 */
async function resolveTaskDir(stateRoot: string, taskId: string): Promise<string> {
  const v2 = taskDir(stateRoot, taskId)
  try {
    await readFile(join(v2, 'log.jsonl'), 'utf8')
    return v2
  } catch { /* fall through */ }
  const legacy = join(stateRoot, taskId)
  try {
    await readFile(join(legacy, 'log.jsonl'), 'utf8')
    return legacy
  } catch {
    return v2
  }
}

/** Read and parse the raw log ([] for a missing file). */
export async function readLog(stateRoot: string, taskId: string): Promise<LogLine[]> {
  let raw: string
  try {
    raw = await readFile(join(await resolveTaskDir(stateRoot, taskId), 'log.jsonl'), 'utf8')
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error
      && (error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const lines: LogLine[] = []
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim()
    if (line === '') continue
    try {
      lines.push(JSON.parse(line) as LogLine)
    } catch {
      // A torn tail write must not brick the task; later appends resume seq.
    }
  }
  return lines
}

/** Strict parse for the MUTATION path (review P1-2): locates the last good
 * byte so a torn tail can be truncated before appending, and distinguishes
 * a torn tail (crash mid-write, recoverable) from mid-log corruption
 * (refuse to append — repair by hand rather than silently fork history). */
export function parseRawLog(raw: string): {
  lines: LogLine[]
  goodByteLength: number
  tornTail: boolean
  corruptLine?: number
} {
  const lines: LogLine[] = []
  const segments = raw.split('\n')
  let offset = 0
  let good = 0
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!
    const bytes = Buffer.byteLength(segment, 'utf8')
    const isLastContent = segments.slice(index + 1).every(rest => rest.trim() === '')
    if (segment.trim() === '') {
      offset += bytes + (index < segments.length - 1 ? 1 : 0)
      good = offset
      continue
    }
    try {
      lines.push(JSON.parse(segment) as LogLine)
      offset += bytes + (index < segments.length - 1 ? 1 : 0)
      good = offset
    } catch {
      if (isLastContent) return { lines, goodByteLength: good, tornTail: true }
      return { lines, goodByteLength: good, tornTail: false, corruptLine: index + 1 }
    }
  }
  return { lines, goodByteLength: good, tornTail: false }
}

/** Fold one event into the state (pure; exported for the board/verify). */
export function applyEvent(state: TeamTaskState, line: LogLine): TeamTaskState {
  const at = line.ts
  const node = (key: string): PlanNode | undefined => state.nodes.find(n => n.key === key)
  switch (line.type) {
    case 'task_created':
      return {
        ...state,
        id: line.id,
        name: line.name,
        goal: line.goal,
        leadSessionId: line.leadSessionId,
        createdAt: at,
        seq: line.seq,
      }
    case 'member_added': {
      const member: Member = { ...line.member, addedAt: at }
      return { ...state, members: [...state.members, member], seq: line.seq }
    }
    case 'member_spawned':
      return {
        ...state,
        members: state.members.map(m => m.name === line.name ? { ...m, sessionId: line.sessionId } : m),
        seq: line.seq,
      }
    case 'member_retired':
      return {
        ...state,
        members: state.members.map(m => m.name === line.name ? { ...m, retired: true } : m),
        seq: line.seq,
      }
    case 'node_planned': {
      const fresh: PlanNode = {
        key: line.node.key,
        title: line.node.title,
        dependsOn: line.node.dependsOn ?? [],
        autoApprove: line.node.autoApprove ?? false,
        status: 'pending',
        fence: 0,
        attempts: 0,
        runs: [],
        updatedAt: at,
        ...line.node.goal === undefined ? {} : { goal: line.node.goal },
        ...line.node.effort === undefined ? {} : { effort: line.node.effort },
        ...line.node.assignee === undefined ? {} : { assignee: line.node.assignee },
      }
      return { ...state, nodes: [...state.nodes, fresh], seq: line.seq }
    }
    case 'node_updated':
      return {
        ...state,
        nodes: state.nodes.map(n => n.key === line.key
          ? { ...n, ...line.patch, updatedAt: at }
          : n),
        seq: line.seq,
      }
    case 'node_cancelled':
      return {
        ...state,
        nodes: state.nodes.map(n => n.key === line.key
          ? { ...n, status: 'cancelled', updatedAt: at }
          : n),
        seq: line.seq,
      }
    case 'node_dispatched':
      return {
        ...state,
        nodes: state.nodes.map((n) => {
          if (n.key !== line.key) return n
          const { effortHint: _stale, ...rest } = n
          return {
            ...rest,
            status: 'dispatched',
            assignee: line.assignee,
            fence: line.fence,
            attempts: n.attempts + 1,
            updatedAt: at,
            ...line.effortHint === undefined ? {} : { effortHint: line.effortHint },
          }
        }),
        seq: line.seq,
      }
    case 'run_started': {
      const target = node(line.key)
      if (target === undefined) return { ...state, seq: line.seq }
      const run: RunRecord = {
        fence: line.fence,
        memberName: target.assignee ?? LEAD_KEY,
        sessionId: line.sessionId,
        startedAt: at,
      }
      return {
        ...state,
        nodes: state.nodes.map(n => n.key === line.key
          ? { ...n, status: 'running', runs: [...n.runs, run], updatedAt: at }
          : n),
        seq: line.seq,
      }
    }
    case 'completion_claimed':
      return {
        ...state,
        nodes: state.nodes.map(n => n.key === line.key
          ? { ...n, output: line.output, claimedFence: line.fence, updatedAt: at }
          : n),
        seq: line.seq,
      }
    case 'run_settled': {
      return {
        ...state,
        nodes: state.nodes.map((n) => {
          if (n.key !== line.key) return n
          const runs = n.runs.map(run => run.fence === line.fence && run.settledAt === undefined
            ? {
                ...run,
                settledAt: at,
                outcome: line.outcome,
                settledBy: line.settledBy,
                ...line.note === undefined ? {} : { note: line.note },
              }
            : run)
          return { ...n, status: 'awaiting_review', runs, updatedAt: at }
        }),
        seq: line.seq,
      }
    }
    case 'node_reviewed':
      return {
        ...state,
        nodes: state.nodes.map((n) => {
          if (n.key !== line.key) return n
          if (line.verdict === 'approve') return { ...n, status: 'approved', updatedAt: at }
          const { feedback: _old, ...rest } = n
          return {
            ...rest,
            status: 'pending',
            updatedAt: at,
            ...line.feedback === undefined ? {} : { feedback: line.feedback },
          }
        }),
        seq: line.seq,
      }
    case 'message_sent': {
      const message: Message = { ...line.message }
      return { ...state, messages: [...state.messages, message], seq: line.seq }
    }
    case 'message_delivered':
      return {
        ...state,
        messages: state.messages.map(m => m.id === line.id ? { ...m, deliveredAt: at } : m),
        seq: line.seq,
      }
    case 'task_finished':
      return { ...state, finishedAt: at, finishStatus: line.status, seq: line.seq }
  }
}

/** Empty pre-creation state. */
export function emptyState(): TeamTaskState {
  return {
    id: '',
    name: '',
    goal: '',
    leadSessionId: '',
    createdAt: 0,
    members: [],
    nodes: [],
    messages: [],
    seq: 0,
  }
}

/** Fold a full log. */
export function project(lines: readonly LogLine[]): TeamTaskState {
  let state = emptyState()
  for (const line of lines) state = applyEvent(state, line)
  return state
}

/** Read + project ('undefined' when the task does not exist). */
export async function readState(stateRoot: string, taskId: string): Promise<TeamTaskState | undefined> {
  const lines = await readLog(stateRoot, taskId)
  if (lines.length === 0) return undefined
  return project(lines)
}

/** List every task id: the v2 `tasks/` list plus legacy v1 flat dirs. */
export async function listTaskIds(stateRoot: string): Promise<string[]> {
  const ids: string[] = []
  try {
    const entries = await readdir(join(stateRoot, 'tasks'), { withFileTypes: true })
    ids.push(...entries.filter(e => e.isDirectory()).map(e => e.name))
  } catch { /* no v2 list yet */ }
  try {
    const entries = await readdir(stateRoot, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'tasks' || entry.name === 'archive') continue
      try {
        await readFile(join(stateRoot, entry.name, 'log.jsonl'), 'utf8')
        if (!ids.includes(entry.name)) ids.push(entry.name)
      } catch { /* not a task dir */ }
    }
  } catch { /* no state root yet */ }
  return ids.sort()
}

/**
 * Append-time validation: the fence/status rules that make late writers
 * harmless (design.md A3). Returns an error string or undefined.
 */
export function validateEvent(state: TeamTaskState, event: TeamTaskEvent): string | undefined {
  const node = 'key' in event ? state.nodes.find(n => n.key === event.key) : undefined
  switch (event.type) {
    case 'task_created':
      return state.createdAt === 0 ? undefined : 'task already exists'
    case 'node_planned':
      return state.nodes.some(n => n.key === event.node.key)
        ? `node "${event.node.key}" already exists`
        : undefined
    case 'member_spawned': {
      const member = state.members.find(m => m.name === event.name && m.retired !== true)
      if (member === undefined) return `no member "${event.name}"`
      if (member.sessionId !== '') return `member "${event.name}" is already spawned`
      return undefined
    }
    case 'node_updated':
    case 'node_cancelled':
      if (node === undefined) return `no node "${event.key}"`
      if (TERMINAL_NODE_STATUSES.includes(node.status)) return `node "${event.key}" is ${node.status}`
      return undefined
    case 'node_dispatched':
      if (node === undefined) return `no node "${event.key}"`
      if (node.status !== 'pending') return `node "${event.key}" is ${node.status}, not pending`
      if (event.fence !== node.fence + 1) return `stale dispatch fence ${event.fence} (current ${node.fence})`
      return undefined
    case 'run_started':
      if (node === undefined) return `no node "${event.key}"`
      if (node.status !== 'dispatched') return `node "${event.key}" is ${node.status}, not dispatched`
      if (event.fence !== node.fence) return `stale fence ${event.fence} (current ${node.fence})`
      return undefined
    case 'completion_claimed':
      if (node === undefined) return `no node "${event.key}"`
      if (node.status !== 'running' && node.status !== 'dispatched') {
        return `node "${event.key}" is ${node.status}; nothing to complete`
      }
      if (event.fence !== node.fence) {
        return `stale fence ${event.fence} (current ${node.fence}) — the node was reassigned; stop working on it`
      }
      return undefined
    case 'run_settled':
      if (node === undefined) return `no node "${event.key}"`
      if (node.status !== 'running' && node.status !== 'dispatched') {
        return `node "${event.key}" is ${node.status}; no open run`
      }
      if (event.fence !== node.fence) return `stale settle fence ${event.fence} (current ${node.fence})`
      return undefined
    case 'node_reviewed':
      if (node === undefined) return `no node "${event.key}"`
      if (node.status !== 'awaiting_review') return `node "${event.key}" is ${node.status}, not awaiting_review`
      return undefined
    case 'message_delivered':
      return state.messages.some(m => m.id === event.id) ? undefined : `no message "${event.id}"`
    case 'task_finished':
      return state.finishedAt === undefined ? undefined : 'task already finished'
    default:
      return undefined
  }
}

/** Outcome of one {@link mutateTask} proposal. */
export interface MutationResult {
  state: TeamTaskState
  appended: LogLine[]
}

/**
 * THE mutation door. Reads + projects under the task lock, lets the caller
 * propose events against fresh state, validates each, appends, returns the
 * post-mutation state. Proposal errors throw with the validator's message.
 */
export async function mutateTask(
  stateRoot: string,
  taskId: string,
  propose: (state: TeamTaskState) => TeamTaskEvent[] | { error: string },
): Promise<MutationResult> {
  return withTaskLock(`${stateRoot} ${taskId}`, async () => {
    const dir = await resolveTaskDir(stateRoot, taskId)
    const logFile = join(dir, 'log.jsonl')
    let raw = ''
    try {
      raw = await readFile(logFile, 'utf8')
    } catch (error: unknown) {
      if (!(error instanceof Error && 'code' in error
        && (error as NodeJS.ErrnoException).code === 'ENOENT')) throw error
    }
    const parsed = parseRawLog(raw)
    if (parsed.corruptLine !== undefined) {
      throw new Error(
        `event log corrupted at line ${parsed.corruptLine} (${logFile}) — `
        + 'refusing to append past mid-log corruption; repair the file by hand',
      )
    }
    if (parsed.tornTail) {
      // Crash mid-write: drop the incomplete tail so the next append starts
      // on a clean line instead of concatenating onto garbage (review P1-2).
      await truncate(logFile, parsed.goodByteLength)
    }
    const lines = parsed.lines
    let state = project(lines)
    const proposal = propose(state)
    if (!Array.isArray(proposal)) throw new Error(proposal.error)
    const appended: LogLine[] = []
    let seq = lines.length === 0 ? 0 : lines[lines.length - 1]!.seq
    for (const event of proposal) {
      const error = validateEvent(state, event)
      if (error !== undefined) throw new Error(error)
      seq += 1
      const line: LogLine = { ...event, seq, ts: Date.now() }
      state = applyEvent(state, line)
      appended.push(line)
    }
    // Whole-graph invariants AFTER the batch (per-event checks cannot see
    // forward references inside one proposal): existence, self-edges,
    // cycles (review P2-4). Nothing is written when the graph is invalid.
    if (appended.some(line => line.type === 'node_planned' || line.type === 'node_updated')) {
      const graphError = validatePlanGraph(state)
      if (graphError !== undefined) throw new Error(graphError)
    }
    if (appended.length > 0) {
      await mkdir(dir, { recursive: true })
      const payload = appended.map(line => `${JSON.stringify(line)}\n`).join('')
      await appendFile(logFile, payload, 'utf8')
      await writeSnapshot(dir, state)
      await mirrorInbox(dir, appended)
    }
    return { state, appended }
  })
}

/** Plan-graph invariants: every dependency exists, no self-edges, no cycles. */
export function validatePlanGraph(state: TeamTaskState): string | undefined {
  const keys = new Set(state.nodes.map(n => n.key))
  for (const node of state.nodes) {
    if (node.status === 'cancelled') continue
    for (const dep of node.dependsOn) {
      if (dep === node.key) return `node "${node.key}" depends on itself`
      if (!keys.has(dep)) return `node "${node.key}" depends on unknown node "${dep}"`
    }
  }
  const nodesByKey = new Map(state.nodes.map(n => [n.key, n]))
  const color = new Map<string, 1 | 2>()
  const visit = (key: string): string | undefined => {
    color.set(key, 1)
    for (const dep of nodesByKey.get(key)?.dependsOn ?? []) {
      const mark = color.get(dep)
      if (mark === 1) return `dependency cycle through "${dep}"`
      if (mark === undefined) {
        const error = visit(dep)
        if (error !== undefined) return error
      }
    }
    color.set(key, 2)
    return undefined
  }
  for (const node of state.nodes) {
    if (node.status === 'cancelled' || color.has(node.key)) continue
    const error = visit(node.key)
    if (error !== undefined) return error
  }
  return undefined
}

/**
 * DERIVED VIEWS (human diagnostics; the log stays the only truth):
 * `snapshot.json` — the latest projection (current team situation, nodes,
 * seq), rewritten after every mutation via tmp+rename so a reader never
 * sees a torn file. `inbox/<recipient>.jsonl` — a write-through mailbox
 * mirror: one line per message on send, one `{delivered}` mark line.
 */
async function writeSnapshot(dir: string, state: TeamTaskState): Promise<void> {
  try {
    const tmp = join(dir, '.snapshot.json.tmp')
    await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    await rename(tmp, join(dir, 'snapshot.json'))
  } catch { /* diagnostics only — never fail the mutation */ }
}

async function mirrorInbox(dir: string, appended: readonly LogLine[]): Promise<void> {
  for (const line of appended) {
    try {
      if (line.type === 'message_sent') {
        const inbox = join(dir, 'inbox')
        await mkdir(inbox, { recursive: true })
        const key = line.message.to.replace(/[^\p{Letter}\p{Number}_-]+/gu, '_')
        await appendFile(join(inbox, `${key}.jsonl`), `${JSON.stringify(line.message)}\n`, 'utf8')
      } else if (line.type === 'message_delivered') {
        const inbox = join(dir, 'inbox')
        await mkdir(inbox, { recursive: true })
        await appendFile(join(inbox, '.delivered.jsonl'), `${JSON.stringify({ delivered: line.id, ts: line.ts })}\n`, 'utf8')
      }
    } catch { /* diagnostics only */ }
  }
}

// ---------------------------------------------------------------------------
// Pure queries shared by the tools, scheduler, and board.
// ---------------------------------------------------------------------------

/** Dependency keys of `node` that have not reached `approved`. */
export function unsatisfiedDependencies(state: TeamTaskState, node: PlanNode): string[] {
  return node.dependsOn.filter((key) => {
    const dep = state.nodes.find(n => n.key === key)
    return dep === undefined || dep.status !== 'approved'
  })
}

/** Pending nodes whose dependencies are all approved. */
export function readyNodes(state: TeamTaskState): PlanNode[] {
  return state.nodes.filter(n => n.status === 'pending' && unsatisfiedDependencies(state, n).length === 0)
}

/** Whether the node's CURRENT attempt claimed completion (review P1-1):
 * an output left over from a reworked attempt carries a stale claimedFence
 * and must never settle the new attempt as completed. */
export function hasCurrentClaim(node: PlanNode): boolean {
  return node.output !== undefined && node.claimedFence === node.fence
}

/** The open (dispatched/running) node owned by one member, if any. */
export function openNodeOf(state: TeamTaskState, memberName: string): PlanNode | undefined {
  return state.nodes.find(n => n.assignee === memberName
    && (n.status === 'dispatched' || n.status === 'running'))
}

/** Undelivered messages addressed to one recipient. */
export function undeliveredTo(state: TeamTaskState, recipient: string): Message[] {
  return state.messages.filter(m => m.to === recipient && m.deliveredAt === undefined)
}

/** The participant identity of a session id: lead, a member, or none. */
export function identityOf(
  state: TeamTaskState,
  sessionId: string,
): { kind: 'lead' } | { kind: 'member'; member: Member } | undefined {
  if (state.leadSessionId === sessionId) return { kind: 'lead' }
  const member = state.members.find(m => m.sessionId === sessionId && m.retired !== true)
  return member === undefined ? undefined : { kind: 'member', member }
}

/** Create one durable message value. */
export function createMessage(from: string, to: string, content: string): Omit<Message, 'deliveredAt'> {
  return { id: randomUUID(), from, to, content, ts: Date.now() }
}
