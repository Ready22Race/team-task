/**
 * Member subagent runtime: spawn durable continuable children with a role
 * profile, deliver messages/assignments, observe real activity.
 *
 * A member is a *role*, not a clone of the lead (design.md §5): its route
 * defaults to a snapshot of the lead's current provider/model, but the role
 * profile may override provider/model/effort and name a role playbook the
 * member loads on demand (progressive loading, design.md §4).
 * @module team-task/members
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
// Declaration merge only: makes ctx.subagents visible.
import type {} from '@deepseek-ai/dsh-subagent'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { LEAD_KEY, type Member, type PlanNode, type TeamTaskState } from './types.ts'

/** Lead-only tools hidden from members at spawn time (static narrowing). */
const MEMBER_DENIED_TOOLS = [
  'team_task_create',
  'team_task_add_member',
  'team_task_plan',
  'team_task_dispatch',
  'team_task_await',
  'team_task_review',
  'team_task_finish',
] as const

/** Restore the SessionId brand on an id round-tripped through the log. */
export function brandedSessionId(value: string): SessionId {
  return value as SessionId
}

/** Runtime knobs for member spawning. */
export interface MemberRuntimeConfig {
  provider: string
  maxDepth?: number
}

/** The compact member persona — a pointer, not a policy dump (design.md §4). */
export function memberPersona(state: TeamTaskState, member: Member, stateDir: string): string {
  const playbookHint = member.playbook === undefined
    ? 'team_task_playbook with role "member"'
    : `team_task_playbook with role "member" and again with role "${member.playbook}"`
  return `You are ${member.name}, a member of team-task "${state.name}" (goal: ${state.goal}). Your role: ${member.role}. The lead plans and reviews; you execute assigned plan nodes.

Before your first node, call ${playbookHint} to load your working protocol. Non-negotiable rules even before loading it:
1. Assignments carry a node key and a fence number. Include that exact fence in every team_task_complete call; a stale-fence rejection means the node was reassigned — stop that work immediately.
2. When you finish a node, call team_task_complete (fence, output) BEFORE ending your turn. If you end your turn without it, the runtime settles your run as unclaimed and the lead reviews whatever is on disk.
3. Message the lead or teammates with team_task_send; check your situation with team_task_status.
4. ${stateDir}/${state.id}/ is read-only diagnostics; mutate task state only through team_task_* tools.
5. You are a worker: never plan, dispatch, review, or finish the task.`
}

/** The initial message delivered when the member is created. */
export function memberWelcome(state: TeamTaskState): string {
  return `You joined team-task "${state.name}" as a member. Wait for node assignments; the scheduler wakes you when work is ready.`
}

/** Build the assignment prompt for a dispatch ticket. */
export function assignmentPrompt(
  node: PlanNode,
  state: TeamTaskState,
  stateDir: string,
  effortHint?: string,
): string {
  const goal = node.goal === undefined ? '' : `\n\n${node.goal}`
  const feedback = node.feedback === undefined
    ? ''
    : `\n\nLead feedback on the previous attempt (attempt ${node.attempts - 1}) — address every point:\n${node.feedback}`
  const effort = effortHint ?? node.effort
  const effortLine = effort === undefined ? '' : `\nEffort guidance: ${effort}.`
  return `team-task assignment from the shared plan.

Node: ${node.key} — ${node.title}${goal}${feedback}
Fence: ${node.fence} (attempt ${node.attempts})${effortLine}

Work only this node this turn. When done, call team_task_complete with node_key=${node.key}, fence=${node.fence}, and a self-contained output. Then report anything the lead must know via team_task_send (to=${LEAD_KEY}) and end your turn.

State policy: ${stateDir}/${state.id}/ is read-only diagnostics; mutate task state only through team_task_* tools.`
}

/**
 * Spawn one member as a durable continuable subagent of the lead and return
 * its child session id. Route resolution (design.md §5): explicit profile
 * fields win; otherwise the child inherits the lead's current route via the
 * harness's own descriptor snapshot.
 */
export async function spawnMember(
  ctx: Context,
  config: MemberRuntimeConfig,
  lead: Agent,
  state: TeamTaskState,
  member: Omit<Member, 'addedAt' | 'sessionId'>,
  stateDir: string,
  signal: AbortSignal,
): Promise<string> {
  // Fail loud at first use: provider registration is a sibling plugin row's
  // effect and may settle after mount (loader activates rows concurrently).
  const provider = ctx.subagents.getProvider(config.provider)
  if (provider === undefined) {
    throw new Error(
      `team-task: no subagent provider "${config.provider}" is registered`
      + ` (available: ${ctx.subagents.list().join(', ') || 'none'})`,
    )
  }
  if (provider.prepareContinuable === undefined) {
    throw new Error(`team-task: provider "${config.provider}" does not support continuable members`)
  }
  if (!provider.capabilities.persona) {
    throw new Error(`team-task: provider "${config.provider}" cannot apply a member persona`)
  }
  if (!provider.capabilities.toolFilter) {
    throw new Error(`team-task: provider "${config.provider}" cannot restrict lead-only tools`)
  }
  const stateWithMember: TeamTaskState = {
    ...state,
    members: [...state.members],
  }
  const persona = memberPersona(stateWithMember, { ...member, sessionId: '', addedAt: Date.now() }, stateDir)
  const agentOptions: Record<string, string> = {}
  if (member.provider !== undefined) agentOptions['provider'] = member.provider
  if (member.model !== undefined) agentOptions['model'] = member.model
  const start = await ctx.subagents.startContinuable({
    provider: config.provider,
    label: `team-task:${state.id}:${member.name}`,
    request: {
      prompt: [{ type: 'text', text: memberWelcome(state) }],
      parent: lead,
      persona,
      toolFilter: { deny: [...MEMBER_DENIED_TOOLS] },
      ...Object.keys(agentOptions).length === 0 ? {} : { agentOptions },
      ...config.maxDepth !== undefined ? { maxDepth: config.maxDepth } : {},
    },
    signal,
  })
  return start.childId
}

/**
 * Deliver one message into a member's FIFO inbox as its next turn.
 * Best-effort: failure is reported as false; the durable log already holds
 * the message (design.md A4).
 */
export async function deliverToMember(
  ctx: Context,
  lead: Agent,
  childId: string,
  text: string,
  signal: AbortSignal,
): Promise<boolean> {
  try {
    await ctx.subagents.followup(lead, brandedSessionId(childId), [{ type: 'text', text }], {
      source: { kind: 'plugin', plugin: 'team-task' },
      signal,
    })
    return true
  } catch (error: unknown) {
    ctx.logger.warn(`team-task: followup to member ${childId} failed: ${String(error)}`)
    return false
  }
}

/**
 * Deliver a durable report at the lead's nearest model boundary. `steer`
 * targets the next step while the lead runs and wakes a turn when idle.
 */
export function steerLead(lead: Pick<Agent, 'steer'>, from: string, content: string): boolean {
  try {
    lead.steer(createUserMessage({
      content: [{ type: 'text', text: `team-task message from ${from}:\n\n${content}` }],
      source: { kind: 'plugin', plugin: 'team-task' },
    }))
    return true
  } catch {
    return false
  }
}

/** Request cancellation of one live member's current turn (best effort). */
export function interruptMember(ctx: Context, lead: Agent, childId: string): void {
  try {
    ctx.subagents.interrupt(brandedSessionId(childId), { kind: 'ancestor', agent: lead })
  } catch (error: unknown) {
    ctx.logger.warn(`team-task: interrupt of member ${childId} failed: ${String(error)}`)
  }
}

/** Real activity of one member session: running / idle / ready (cold). */
export function memberActivity(ctx: Context, sessionId: string): 'running' | 'idle' | 'ready' {
  if (sessionId === '') return 'ready'
  const live = ctx.agents.get(brandedSessionId(sessionId))
  return live === undefined ? 'ready' : live.status
}
