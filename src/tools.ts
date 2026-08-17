/**
 * The `team_task_*` model-facing tools.
 *
 * Thin doors over the event log: each tool resolves the caller's identity
 * (lead = the session that created the task; member = a spawned child),
 * gates by role, and proposes events through `mutateTask` — the fence and
 * status rules live in the log's validator, not here (design.md A3).
 * @module team-task/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createMessage,
  identityOf,
  listTaskIds,
  mutateTask,
  readState,
  sanitizeTaskId,
  undeliveredTo,
  unsatisfiedDependencies,
} from './log.ts'
import {
  deliverToMember,
  interruptMember,
  memberActivity,
  steerLead,
} from './members.ts'
import type { TaskScheduler } from './scheduler.ts'
import {
  LEAD_KEY,
  type NodeSpec,
  type TeamTaskEvent,
  type TeamTaskState,
} from './types.ts'

/** Resolved plugin config consumed by the tools. */
export interface ToolsConfig {
  stateDir: string
  memberProvider: string
  memberMaxDepth?: number
  maxMembers: number
}

/** The caller agent, or a loud failure for non-agent callers. */
function requireAgent(exec: ToolRunContext): Agent {
  if (!exec.agent) throw new Error('team_task tools require a calling agent')
  return exec.agent
}

function workspaceOf(agent: Agent): string {
  return agent.session.header.cwd ?? process.cwd()
}

/** Find the unfinished task this caller participates in. */
async function findParticipantTask(
  stateRoot: string,
  callerId: string,
): Promise<TeamTaskState | undefined> {
  for (const taskId of await listTaskIds(stateRoot)) {
    const state = await readState(stateRoot, taskId)
    if (state === undefined || state.finishedAt !== undefined) continue
    if (identityOf(state, callerId) !== undefined) return state
  }
  return undefined
}

async function requireTask(stateRoot: string, callerId: string): Promise<TeamTaskState> {
  const state = await findParticipantTask(stateRoot, callerId)
  if (state === undefined) {
    throw new Error('no active team task for this session — the lead creates one with team_task_create')
  }
  return state
}

function requireLead(state: TeamTaskState, callerId: string): void {
  if (state.leadSessionId !== callerId) {
    throw new Error('lead-only operation (your session is a member of this task)')
  }
}

/** Playbook names → packaged markdown (progressive loading, design.md §4). */
const PLAYBOOK_DIR = fileURLToPath(new URL('../playbooks/', import.meta.url))
const PLAYBOOKS = new Set(['lead', 'member', 'recovery'])

/** Wire shape of a node argument (arrays of objects reach us as JsonValue). */
interface RawNodeArg {
  key: string
  title?: string
  goal?: string
  depends_on?: string[]
  auto_approve?: boolean
  effort?: string
  assignee?: string
}

function nodePatchFromArgs(raw: RawNodeArg): Partial<NodeSpec> & { key: string } {
  return {
    key: raw.key,
    ...raw.title === undefined ? {} : { title: raw.title },
    ...raw.goal === undefined ? {} : { goal: raw.goal },
    ...raw.depends_on === undefined ? {} : { dependsOn: raw.depends_on },
    ...raw.auto_approve === undefined ? {} : { autoApprove: raw.auto_approve },
    ...raw.effort === undefined ? {} : { effort: raw.effort },
    ...raw.assignee === undefined ? {} : { assignee: raw.assignee },
  }
}

/** Add-path spec (the schema requires `title`, so the cast is a boundary restoration). */
function nodeSpecFromArgs(raw: RawNodeArg): NodeSpec {
  const patch = nodePatchFromArgs(raw)
  if (patch.title === undefined || patch.title.trim() === '') {
    throw new Error(`node "${raw.key}" needs a title`)
  }
  return patch as NodeSpec
}

/** A compact, model-facing task snapshot. */
function statusView(ctx: Context, state: TeamTaskState, callerId: string): Record<string, JsonValue> {
  const identity = identityOf(state, callerId)
  const nodes = state.nodes.map(n => ({
    key: n.key,
    title: n.title,
    status: n.status,
    assignee: n.assignee ?? '',
    depends_on: n.dependsOn,
    blocked_on: n.status === 'pending' ? unsatisfiedDependencies(state, n) : [],
    fence: n.fence,
    attempts: n.attempts,
    auto_approve: n.autoApprove,
    ...n.output === undefined ? {} : { output: n.output },
    ...n.feedback === undefined ? {} : { feedback: n.feedback },
    runs: n.runs.map(r => ({
      fence: r.fence,
      member: r.memberName,
      outcome: r.outcome ?? 'open',
      settled_by: r.settledBy ?? '',
    })),
  }))
  const members = state.members.filter(m => m.retired !== true).map(m => ({
    name: m.name,
    role: m.role,
    activity: memberActivity(ctx, m.sessionId),
    ...m.model === undefined ? {} : { model: m.model },
    ...m.effort === undefined ? {} : { effort: m.effort },
  }))
  const attention = [
    ...state.nodes.filter(n => n.status === 'awaiting_review')
      .map(n => `review node ${n.key} (${(n.runs.at(-1)?.outcome) ?? 'settled'})`),
    ...undeliveredTo(state, LEAD_KEY).map(m => `undelivered message from ${m.from}`),
  ]
  return {
    task_id: state.id,
    name: state.name,
    goal: state.goal,
    viewer: identity?.kind === 'member' ? identity.member.name : LEAD_KEY,
    members,
    nodes,
    attention,
    inbox: identity === undefined
      ? []
      : undeliveredTo(state, identity.kind === 'lead' ? LEAD_KEY : identity.member.name)
        .slice(-10)
        .map(m => ({ from: m.from, content: m.content })),
  }
}

/** Register every `team_task_*` tool. */
export function registerTeamTaskTools(
  ctx: Context,
  config: ToolsConfig,
  scheduler: TaskScheduler,
): void {
  const stateRootOf = (workspace: string): string => join(workspace, config.stateDir)

  ctx.tools.register(defineTool({
    name: 'team_task_create',
    description: 'Create a long-horizon team task: you become the LEAD (one active task per lead). Optionally seed the plan DAG in the same call. Load the lead playbook first with team_task_playbook(role="lead").',
    parameters: {
      name: { type: 'string', required: true, description: 'Task name (its stable id).' },
      goal: { type: 'string', required: true, description: 'The deliverable this task must produce.' },
      nodes: {
        type: 'array',
        description: 'Optional initial plan nodes.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            key: { type: 'string', required: true },
            title: { type: 'string', required: true },
            goal: { type: 'string' },
            depends_on: { type: 'array', items: { type: 'string' } },
            auto_approve: { type: 'boolean', description: 'Fast lane for mechanical nodes: a CLAIMED completion settles straight to approved. Judgment nodes must stay false.' },
            effort: { type: 'string', description: 'Reasoning-effort hint for whoever runs this node.' },
            assignee: { type: 'string', description: 'Pre-route this node to a member: when its dependencies approve, the scheduler auto-flows it to that member. Unassigned nodes wait for explicit team_task_dispatch.' },
          },
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          task_id: { type: 'string', required: true },
          state_dir: { type: 'string', required: true },
          nodes: { type: 'number', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `team task ${value.task_id} created (${value.nodes} nodes).` }],
    },
    async execute(args, exec) {
      const lead = requireAgent(exec)
      const workspace = workspaceOf(lead)
      const stateRoot = stateRootOf(workspace)
      const existing = await findParticipantTask(stateRoot, lead.id)
      if (existing !== undefined) {
        throw new Error(`this session already participates in active task "${existing.id}" — finish it first`)
      }
      const taskId = sanitizeTaskId(args.name)
      const specs = ((args.nodes ?? []) as unknown as RawNodeArg[]).map(nodeSpecFromArgs)
      await mutateTask(stateRoot, taskId, () => [
        { type: 'task_created', id: taskId, name: args.name, goal: args.goal, leadSessionId: lead.id },
        ...specs.map(node => ({ type: 'node_planned', node }) satisfies TeamTaskEvent),
      ])
      scheduler.trackWorkspace(workspace)
      return { task_id: taskId, state_dir: `${config.stateDir}/${taskId}`, nodes: specs.length }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'team_task_playbook',
    description: 'Load a team-task playbook on demand (progressive protocol loading): "lead" before creating/driving a task, "member" for workers, "recovery" when something looks stuck.',
    parameters: {
      role: { type: 'string', required: true, enum: ['lead', 'member', 'recovery'], description: 'Which playbook to load.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { playbook: { type: 'string', required: true } },
      },
      render: (_args, value) => [{ type: 'text', text: value.playbook }],
    },
    async execute(args) {
      if (!PLAYBOOKS.has(args.role)) throw new Error(`unknown playbook "${args.role}"`)
      const playbook = await readFile(join(PLAYBOOK_DIR, `${args.role}.md`), 'utf8')
      return { playbook }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'team_task_add_member',
    description: 'Register one member ROLE PROFILE. The member subagent spawns LAZILY at its first node dispatch (no upfront turn is spent). Omitted provider/model inherit your current route; pass them only for heterogeneous teams. effort sizes its reasoning; playbook names a role-specific protocol it loads on demand.',
    parameters: {
      name: { type: 'string', required: true, description: 'Unique member name inside the task.' },
      role: { type: 'string', required: true, description: 'Role description, e.g. researcher / engineer / reviewer.' },
      provider: { type: 'string', description: 'Explicit LLM provider route (requires model).' },
      model: { type: 'string', description: 'Explicit model id.' },
      effort: { type: 'string', description: 'Reasoning-effort hint for this member.' },
      playbook: { type: 'string', description: 'Role playbook name the member should load.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          member: { type: 'string', required: true },
          spawn: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `member ${value.member} registered (${value.spawn}).` }],
    },
    async execute(args, exec) {
      const lead = requireAgent(exec)
      const workspace = workspaceOf(lead)
      const stateRoot = stateRootOf(workspace)
      const state = await requireTask(stateRoot, lead.id)
      requireLead(state, lead.id)
      if (state.members.filter(m => m.retired !== true).length >= config.maxMembers) {
        throw new Error(`member cap reached (${config.maxMembers})`)
      }
      if (state.members.some(m => m.name === args.name && m.retired !== true)) {
        throw new Error(`member "${args.name}" already exists`)
      }
      if (args.provider !== undefined && args.model === undefined) {
        throw new Error('an explicit provider requires an explicit model')
      }
      const profile = {
        name: args.name,
        role: args.role,
        ...args.provider === undefined ? {} : { provider: args.provider },
        ...args.model === undefined ? {} : { model: args.model },
        ...args.effort === undefined ? {} : { effort: args.effort },
        ...args.playbook === undefined ? {} : { playbook: args.playbook },
      }
      // Lazy spawn (design.md §5): record the profile only. The subagent is
      // created by the scheduler at this member's FIRST node dispatch, with
      // the assignment as its very first prompt.
      await mutateTask(stateRoot, state.id, () => [{
        type: 'member_added', member: { ...profile, sessionId: '' },
      }])
      return { member: args.name, spawn: 'lazy (at first dispatch)' }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'team_task_plan',
    description: 'Mutate the plan DAG (lead only): add nodes, update pending/settled nodes, cancel nodes. One node = one reviewable deliverable; wire depends_on for parallelism; auto_approve only for mechanical nodes.',
    parameters: {
      add: {
        type: 'array',
        description: 'Nodes to add.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            key: { type: 'string', required: true },
            title: { type: 'string', required: true },
            goal: { type: 'string' },
            depends_on: { type: 'array', items: { type: 'string' } },
            auto_approve: { type: 'boolean' },
            effort: { type: 'string' },
            assignee: { type: 'string' },
          },
        },
      },
      update: {
        type: 'array',
        description: 'Patches to existing non-terminal nodes.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            key: { type: 'string', required: true },
            title: { type: 'string' },
            goal: { type: 'string' },
            depends_on: { type: 'array', items: { type: 'string' } },
            auto_approve: { type: 'boolean' },
            effort: { type: 'string' },
            assignee: { type: 'string' },
          },
        },
      },
      cancel: { type: 'array', items: { type: 'string' }, description: 'Node keys to cancel.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { applied: { type: 'number', required: true } },
      },
      render: (_args, value) => [{ type: 'text', text: `plan updated (${value.applied} changes).` }],
    },
    async execute(args, exec) {
      const lead = requireAgent(exec)
      const workspace = workspaceOf(lead)
      const stateRoot = stateRootOf(workspace)
      const state = await requireTask(stateRoot, lead.id)
      requireLead(state, lead.id)
      const events: TeamTaskEvent[] = [
        ...((args.add ?? []) as unknown as RawNodeArg[]).map(raw => ({ type: 'node_planned', node: nodeSpecFromArgs(raw) }) satisfies TeamTaskEvent),
        ...((args.update ?? []) as unknown as RawNodeArg[]).map((raw) => {
          const { key, ...patchRaw } = nodePatchFromArgs(raw)
          return { type: 'node_updated', key, patch: patchRaw } satisfies TeamTaskEvent
        }),
        ...((args.cancel ?? []) as unknown as string[]).map(key => ({ type: 'node_cancelled', key }) satisfies TeamTaskEvent),
      ]
      if (events.length === 0) throw new Error('nothing to change')
      await mutateTask(stateRoot, state.id, () => events)
      await scheduler.kickTask(workspace, state.id, lead)
      return { applied: events.length }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'team_task_dispatch',
    description: 'Dispatch one ready node (lead only): bumps its fence and delivers the assignment. assignee "lead" means you execute it yourself inline. Nodes pre-assigned in the plan auto-flow when unlocked — dispatching one that already flowed is a harmless no-op confirming the assignment.',
    parameters: {
      key: { type: 'string', required: true },
      assignee: { type: 'string', description: 'Member name, or "lead" to take it yourself.' },
      effort_hint: { type: 'string', description: 'Per-dispatch reasoning-effort hint.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          key: { type: 'string', required: true },
          fence: { type: 'number', required: true },
          assignee: { type: 'string', required: true },
          note: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `node ${value.key} → ${value.assignee} (fence ${value.fence}): ${value.note}` }],
    },
    async execute(args, exec) {
      const lead = requireAgent(exec)
      const workspace = workspaceOf(lead)
      const stateRoot = stateRootOf(workspace)
      const state = await requireTask(stateRoot, lead.id)
      requireLead(state, lead.id)
      const node = state.nodes.find(n => n.key === args.key)
      if (node === undefined) throw new Error(`no node "${args.key}"`)
      // Benign-race absorption: the node already flowed (scheduler auto-flow
      // of a pre-assigned node, or a duplicate call). Same intent → confirm
      // instead of erroring; a DIFFERENT assignee is a real conflict.
      if (node.status === 'dispatched' || node.status === 'running') {
        if (args.assignee === undefined || args.assignee === node.assignee) {
          return {
            key: args.key,
            fence: node.fence,
            assignee: node.assignee ?? '',
            note: `already ${node.status} (auto-flowed from the plan); no new dispatch needed`,
          }
        }
        throw new Error(
          `node "${args.key}" is already ${node.status} with ${node.assignee} — `
          + 'reassignment is not supported yet; rework after settle instead',
        )
      }
      const blocked = unsatisfiedDependencies(state, node)
      if (blocked.length > 0) throw new Error(`node "${args.key}" waits on approval of: ${blocked.join(', ')}`)
      if (args.assignee === undefined) {
        if (node.assignee !== undefined) {
          await scheduler.kickTask(workspace, state.id, lead)
          const fresh = (await readState(stateRoot, state.id))?.nodes.find(n => n.key === args.key)
          return {
            key: args.key,
            fence: fresh?.fence ?? node.fence,
            assignee: node.assignee,
            note: fresh?.status === 'pending' ? 'pre-assigned; member busy, flows when idle' : 'flowed to its pre-assigned member',
          }
        }
        throw new Error(`node "${args.key}" has no assignee — name one, or pre-assign it in the plan for auto-flow`)
      }
      if (args.assignee === LEAD_KEY) {
        const { state: next } = await mutateTask(stateRoot, state.id, fresh => [
          { type: 'node_dispatched', key: args.key, assignee: LEAD_KEY, fence: (fresh.nodes.find(n => n.key === args.key)?.fence ?? 0) + 1 },
        ])
        const fresh = next.nodes.find(n => n.key === args.key)!
        await mutateTask(stateRoot, state.id, () => [
          { type: 'run_started', key: args.key, fence: fresh.fence, sessionId: '' },
        ])
        return { key: args.key, fence: fresh.fence, assignee: LEAD_KEY, note: 'inline run started; complete it with team_task_complete' }
      }
      const member = state.members.find(m => m.name === args.assignee && m.retired !== true)
      if (member === undefined) throw new Error(`no member "${args.assignee}"`)
      const { state: next } = await mutateTask(stateRoot, state.id, fresh => [{
        type: 'node_dispatched',
        key: args.key,
        assignee: member.name,
        fence: (fresh.nodes.find(n => n.key === args.key)?.fence ?? 0) + 1,
        ...args.effort_hint === undefined ? {} : { effortHint: args.effort_hint },
      }])
      await scheduler.kickTask(workspace, state.id, lead)
      const fence = next.nodes.find(n => n.key === args.key)?.fence ?? 0
      return { key: args.key, fence, assignee: member.name, note: 'dispatched' }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'team_task_await',
    description: 'Block until the given nodes (default: all non-terminal) leave the working states — i.e. until there is review work or everything is done. Use this instead of polling team_task_status.',
    parameters: {
      keys: { type: 'array', items: { type: 'string' }, description: 'Node keys to wait for (default all).' },
      timeout_seconds: { type: 'number', description: 'Max wait (default 300, cap 900).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          done: { type: 'boolean', required: true },
          awaiting_review: { type: 'array', required: true, items: { type: 'string' } },
          still_working: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.done
          ? `await complete — review: [${value.awaiting_review.join(', ')}]`
          : `await timeout — review: [${value.awaiting_review.join(', ')}], still working: [${value.still_working.join(', ')}]`,
      }],
    },
    async execute(args, exec) {
      const lead = requireAgent(exec)
      const workspace = workspaceOf(lead)
      const stateRoot = stateRootOf(workspace)
      const initial = await requireTask(stateRoot, lead.id)
      requireLead(initial, lead.id)
      const timeoutMs = Math.min(Math.max(args.timeout_seconds ?? 300, 5), 900) * 1000
      const deadline = Date.now() + timeoutMs
      const watched = (state: TeamTaskState): { working: string[]; review: string[] } => {
        const targets = state.nodes.filter(n => args.keys === undefined || args.keys.includes(n.key))
        return {
          working: targets.filter(n => n.status === 'pending' || n.status === 'dispatched' || n.status === 'running').map(n => n.key),
          review: targets.filter(n => n.status === 'awaiting_review').map(n => n.key),
        }
      }
      for (;;) {
        if (exec.signal.aborted) throw exec.signal.reason ?? new Error('await cancelled')
        const state = await readState(stateRoot, initial.id)
        if (state === undefined) throw new Error('task disappeared')
        const { working, review } = watched(state)
        // Wake as soon as ANY review work exists, or everything settled.
        if (working.length === 0 || review.length > 0) {
          return { done: working.length === 0, awaiting_review: review, still_working: working }
        }
        await scheduler.kickTask(workspace, initial.id, lead)
        if (Date.now() >= deadline) {
          return { done: false, awaiting_review: review, still_working: working }
        }
        await new Promise(resolve => setTimeout(resolve, 1500))
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'team_task_complete',
    description: 'Claim completion of YOUR assigned node with its current fence and a self-contained output. A stale-fence rejection means the node was reassigned: stop that work. Call this BEFORE ending your turn.',
    parameters: {
      node_key: { type: 'string', required: true },
      fence: { type: 'number', required: true, description: 'The fence from your assignment.' },
      output: { type: 'string', required: true, description: 'Self-contained result: what/where/decisions.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          accepted: { type: 'boolean', required: true },
          node_status: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `completion recorded; node is ${value.node_status}.` }],
    },
    async execute(args, exec) {
      const caller = requireAgent(exec)
      const workspace = workspaceOf(caller)
      const stateRoot = stateRootOf(workspace)
      const state = await requireTask(stateRoot, caller.id)
      const identity = identityOf(state, caller.id)!
      const callerName = identity.kind === 'lead' ? LEAD_KEY : identity.member.name
      const node = state.nodes.find(n => n.key === args.node_key)
      if (node === undefined) throw new Error(`no node "${args.node_key}"`)
      if (node.assignee !== callerName) {
        throw new Error(`node "${args.node_key}" is assigned to ${node.assignee ?? 'nobody'}, not you`)
      }
      const { state: next } = await mutateTask(stateRoot, state.id, () => {
        const events: TeamTaskEvent[] = [
          { type: 'completion_claimed', key: args.node_key, fence: args.fence, output: args.output },
        ]
        // A lead-executed node has no idle edge: settle inline (design.md §3).
        if (callerName === LEAD_KEY) {
          events.push({ type: 'run_settled', key: args.node_key, fence: args.fence, outcome: 'completed', settledBy: 'inline' })
          if (node.autoApprove) {
            events.push({ type: 'node_reviewed', key: args.node_key, verdict: 'approve', feedback: 'auto-approved (fast lane)' })
          }
        }
        return events
      })
      return {
        accepted: true,
        node_status: next.nodes.find(n => n.key === args.node_key)?.status ?? 'unknown',
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'team_task_review',
    description: 'Review one awaiting_review node (lead only). approve unlocks dependents; rework REQUIRES feedback — the node returns to pending and the next assignment carries your feedback verbatim.',
    parameters: {
      key: { type: 'string', required: true },
      verdict: { type: 'string', required: true, enum: ['approve', 'rework'] },
      feedback: { type: 'string', description: 'Required for rework: concrete, point-by-point.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          key: { type: 'string', required: true },
          verdict: { type: 'string', required: true },
          auto_flowing: { type: 'array', required: true, items: { type: 'string' }, description: 'Unlocked nodes pre-assigned in the plan — the scheduler is already flowing them; do NOT dispatch these.' },
          needs_dispatch: { type: 'array', required: true, items: { type: 'string' }, description: 'Unlocked nodes with no assignee — dispatch these explicitly.' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `node ${value.key} ${value.verdict}`
          + `${value.auto_flowing.length > 0 ? `; auto-flowing: ${value.auto_flowing.join(', ')}` : ''}`
          + `${value.needs_dispatch.length > 0 ? `; needs dispatch: ${value.needs_dispatch.join(', ')}` : ''}.`,
      }],
    },
    async execute(args, exec) {
      const lead = requireAgent(exec)
      const workspace = workspaceOf(lead)
      const stateRoot = stateRootOf(workspace)
      const state = await requireTask(stateRoot, lead.id)
      requireLead(state, lead.id)
      if (args.verdict === 'rework' && (args.feedback === undefined || args.feedback.trim() === '')) {
        throw new Error('rework requires concrete feedback — the next attempt carries it verbatim')
      }
      const { state: next } = await mutateTask(stateRoot, state.id, () => [{
        type: 'node_reviewed',
        key: args.key,
        verdict: args.verdict as 'approve' | 'rework',
        ...args.feedback === undefined ? {} : { feedback: args.feedback },
      }])
      const unlocked = args.verdict === 'approve'
        ? next.nodes.filter(n => n.status === 'pending' && n.dependsOn.includes(args.key)
            && unsatisfiedDependencies(next, n).length === 0)
        : []
      await scheduler.kickTask(workspace, state.id, lead)
      return {
        key: args.key,
        verdict: args.verdict,
        auto_flowing: unlocked.filter(n => n.assignee !== undefined).map(n => n.key),
        needs_dispatch: unlocked.filter(n => n.assignee === undefined).map(n => n.key),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'team_task_send',
    description: 'Send a durable message to the lead or a teammate. The message is safe immediately (event log); the scheduler delivers it when the recipient can receive — no relay, no polling.',
    parameters: {
      to: { type: 'string', required: true, description: '"lead" or a member name.' },
      content: { type: 'string', required: true },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          message_id: { type: 'string', required: true },
          delivered: { type: 'string', required: true, description: 'live | queued' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `message ${value.message_id} ${value.delivered}.` }],
    },
    async execute(args, exec) {
      const caller = requireAgent(exec)
      const workspace = workspaceOf(caller)
      const stateRoot = stateRootOf(workspace)
      const state = await requireTask(stateRoot, caller.id)
      const identity = identityOf(state, caller.id)!
      const from = identity.kind === 'lead' ? LEAD_KEY : identity.member.name
      const to = args.to.trim()
      if (to !== LEAD_KEY && !state.members.some(m => m.name === to && m.retired !== true)) {
        throw new Error(`no recipient "${to}"`)
      }
      const message = createMessage(from, to, args.content)
      await mutateTask(stateRoot, state.id, () => [{ type: 'message_sent', message }])

      // Best-effort immediate delivery; the durable log already holds it.
      let delivered = false
      const lead = state.leadSessionId === caller.id
        ? caller
        : ctx.agents.get(state.leadSessionId as Parameters<typeof ctx.agents.get>[0])
      if (to === LEAD_KEY) {
        if (lead !== undefined && from !== LEAD_KEY) delivered = steerLead(lead, from, args.content)
      } else if (lead !== undefined) {
        const recipient = state.members.find(m => m.name === to)!
        if (recipient.sessionId !== '' && memberActivity(ctx, recipient.sessionId) !== 'running') {
          const text = from === LEAD_KEY
            ? args.content
            : `Message from teammate ${from}:\n\n${args.content}`
          delivered = await deliverToMember(ctx, lead, recipient.sessionId, text, exec.signal)
        }
      }
      if (delivered) {
        await mutateTask(stateRoot, state.id, () => [{ type: 'message_delivered', id: message.id }])
      }
      return { message_id: message.id, delivered: delivered ? 'live' : 'queued' }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'team_task_status',
    description: 'Task snapshot: plan nodes with runs/fences, member activity, the attention list (reviews owed, undelivered mail), and your inbox. Also kicks the scheduler. Prefer team_task_await over polling this.',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: true, properties: {} },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(_args, exec) {
      const caller = requireAgent(exec)
      const workspace = workspaceOf(caller)
      const stateRoot = stateRootOf(workspace)
      const state = await requireTask(stateRoot, caller.id)
      await scheduler.kickTask(workspace, state.id, state.leadSessionId === caller.id ? caller : undefined)
      const fresh = await readState(stateRoot, state.id) ?? state
      return statusView(ctx, fresh, caller.id) as Record<string, JsonValue>
    },
  }))

  ctx.tools.register(defineTool({
    name: 'team_task_finish',
    description: 'Finish the task (lead only) after presenting the deliverable: interrupts members best-effort and closes the log. The full event history and every run stay archived on disk.',
    parameters: {
      status: { type: 'string', required: true, enum: ['completed', 'abandoned'] },
      summary: { type: 'string', description: 'One-paragraph outcome summary for the archive.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { finished: { type: 'boolean', required: true } },
      },
      render: (_args, value) => [{ type: 'text', text: value.finished ? 'task finished and archived.' : 'finish failed.' }],
    },
    async execute(args, exec) {
      const lead = requireAgent(exec)
      const workspace = workspaceOf(lead)
      const stateRoot = stateRootOf(workspace)
      const state = await requireTask(stateRoot, lead.id)
      requireLead(state, lead.id)
      for (const member of state.members) {
        if (member.retired !== true && member.sessionId !== '') interruptMember(ctx, lead, member.sessionId)
      }
      await mutateTask(stateRoot, state.id, () => [
        ...state.members.filter(m => m.retired !== true)
          .map(m => ({ type: 'member_retired', name: m.name }) satisfies TeamTaskEvent),
        {
          type: 'task_finished',
          status: args.status as 'completed' | 'abandoned',
          ...args.summary === undefined ? {} : { summary: args.summary },
        },
      ])
      return { finished: true }
    },
  }))
}
