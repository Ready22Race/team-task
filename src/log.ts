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
import { appendFile, mkdir, readFile, readdir } from 'node:fs/promises'
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

/** Sanitize a task name into a stable directory id. */
export function sanitizeTaskId(name: string): string {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned === '' ? 'task' : cleaned
}

function taskDir(stateRoot: string, taskId: string): string {
  return join(stateRoot, taskId)
}

function logPath(stateRoot: string, taskId: string): string {
  return join(taskDir(stateRoot, taskId), 'log.jsonl')
}

/** Read and parse the raw log ([] for a missing file). */
export async function readLog(stateRoot: string, taskId: string): Promise<LogLine[]> {
  let raw: string
  try {
    raw = await readFile(logPath(stateRoot, taskId), 'utf8')
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
        nodes: state.nodes.map(n => n.key === line.key
          ? {
              ...n,
              status: 'dispatched',
              assignee: line.assignee,
              fence: line.fence,
              attempts: n.attempts + 1,
              updatedAt: at,
            }
          : n),
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
          ? { ...n, output: line.output, updatedAt: at }
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

/** List every task id under the state root. */
export async function listTaskIds(stateRoot: string): Promise<string[]> {
  try {
    const entries = await readdir(stateRoot, { withFileTypes: true })
    return entries.filter(e => e.isDirectory()).map(e => e.name)
  } catch {
    return []
  }
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
  return withTaskLock(`${stateRoot} ${taskId}`, async () => {
    const lines = await readLog(stateRoot, taskId)
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
    if (appended.length > 0) {
      await mkdir(taskDir(stateRoot, taskId), { recursive: true })
      const payload = appended.map(line => `${JSON.stringify(line)}\n`).join('')
      await appendFile(logPath(stateRoot, taskId), payload, 'utf8')
    }
    return { state, appended }
  })
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
