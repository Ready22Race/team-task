/**
 * The scheduler: one idempotent `kick` that owns claiming, delivery,
 * settlement, and review-side effects — triggered by idle edges, log writes,
 * and a resident reconciler timer (design.md A4/A5).
 *
 * Crash recovery is not a special path: a node stuck `running` whose member
 * is not actually running is settled by the reconciler through the same
 * pipeline the idle edge uses. Runtime-owned settlement (design.md A2) lives
 * here: a member that never calls `team_task_complete` still settles at its
 * idle edge, outcome `turn_ended`.
 * @module team-task/scheduler
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentStatus } from '@deepseek-ai/dsh-agent'
import { join } from 'node:path'
import {
  createMessage,
  identityOf,
  listTaskIds,
  mutateTask,
  openNodeOf,
  readState,
  readyNodes,
  undeliveredTo,
} from './log.ts'
import {
  assignmentPrompt,
  brandedSessionId,
  deliverToMember,
  memberActivity,
  steerLead,
} from './members.ts'
import { LEAD_KEY, type PlanNode, type TeamTaskEvent, type TeamTaskState } from './types.ts'

export interface SchedulerConfig {
  readonly stateDir: string
  readonly reconcileIntervalMs: number
}

export interface TaskScheduler {
  /** Give every idle member one unit of work and flush undelivered mail. */
  kickTask(workspace: string, taskId: string, lead?: Agent): Promise<void>
  /** Remember a workspace so the reconciler sweeps it. */
  trackWorkspace(workspace: string): void
}

function liveLead(ctx: Context, leadSessionId: string, supplied?: Agent): Agent | undefined {
  if (supplied !== undefined && supplied.id === leadSessionId) return supplied
  return ctx.agents.get(brandedSessionId(leadSessionId))
}

function fallbackMailPrompt(messages: { from: string; content: string }[]): string {
  return [
    'team-task delivered messages that were persisted while you were unavailable:',
    ...messages.map(m => `\nFrom ${m.from}:\n${m.content}`),
    '\nHandle these in this turn. Node assignments still require the current fence.',
  ].join('\n')
}

/** Settle-pipeline side effects shared by idle edge, reconciler, and inline. */
function settleEvents(
  state: TeamTaskState,
  node: PlanNode,
  settledBy: string,
  note?: string,
): TeamTaskEvent[] {
  const claimed = node.output !== undefined
  const events: TeamTaskEvent[] = [{
    type: 'run_settled',
    key: node.key,
    fence: node.fence,
    outcome: claimed ? 'completed' : 'turn_ended',
    settledBy,
    ...note === undefined ? {} : { note },
  }]
  // The fast lane applies only to a *claimed* completion (design.md §3):
  // a runtime-settled run always waits for the lead's review.
  if (claimed && node.autoApprove) {
    events.push({ type: 'node_reviewed', key: node.key, verdict: 'approve', feedback: 'auto-approved (fast lane)' })
  }
  events.push({
    type: 'message_sent',
    message: createMessage(
      'runtime',
      LEAD_KEY,
      claimed
        ? `Node ${node.key} settled (completed${node.autoApprove ? ', auto-approved' : ', awaiting your review'}). Output:\n${node.output ?? ''}`
        : `Node ${node.key} settled WITHOUT a completion claim (outcome turn_ended, via ${settledBy}). Review what is on disk, then approve or rework with feedback.`,
    ),
  })
  return events
}

/** Install one scheduler: kick + idle-edge settlement + reconciler timer. */
export function installScheduler(ctx: Context, config: SchedulerConfig): TaskScheduler {
  const workspaces = new Set<string>()

  const deliverLeadMail = async (workspace: string, state: TeamTaskState, lead: Agent): Promise<void> => {
    const stateRoot = join(workspace, config.stateDir)
    const pending = undeliveredTo(state, LEAD_KEY)
    if (pending.length === 0) return
    for (const message of pending) {
      if (!steerLead(lead, message.from, message.content)) break
      await mutateTask(stateRoot, state.id, () => [{ type: 'message_delivered', id: message.id }])
    }
  }

  const runtime: TaskScheduler = {
    trackWorkspace(workspace) {
      workspaces.add(workspace)
    },

    async kickTask(workspace, taskId, suppliedLead) {
      workspaces.add(workspace)
      const stateRoot = join(workspace, config.stateDir)
      let state = await readState(stateRoot, taskId)
      if (state === undefined || state.finishedAt !== undefined) return
      const lead = liveLead(ctx, state.leadSessionId, suppliedLead)

      // Reconciler half of settlement (design.md A5): a node "running" whose
      // member is not actually running lost its turn (interrupt, crash,
      // restart). Settle it through the normal pipeline.
      for (const node of state.nodes) {
        if (node.status !== 'running') continue
        const member = state.members.find(m => m.name === node.assignee)
        if (member === undefined) continue
        if (memberActivity(ctx, member.sessionId) === 'running') continue
        try {
          const result = await mutateTask(stateRoot, taskId, (fresh) => {
            const current = fresh.nodes.find(n => n.key === node.key)
            if (current === undefined || current.status !== 'running' || current.fence !== node.fence) {
              return { error: 'raced; skip' }
            }
            return settleEvents(fresh, current, 'reconciler', 'member was not running')
          })
          state = result.state
        } catch {
          // Raced with the idle-edge observer — its settle is equivalent.
        }
      }

      if (lead === undefined) return
      await deliverLeadMail(workspace, state, lead)

      for (const member of state.members) {
        if (member.retired === true || member.sessionId === '') continue
        if (memberActivity(ctx, member.sessionId) === 'running') continue

        // Durable mail first: undelivered messages are real pending work.
        const mail = undeliveredTo(state, member.name)
        if (mail.length > 0) {
          const accepted = await deliverToMember(
            ctx, lead, member.sessionId, fallbackMailPrompt(mail), new AbortController().signal,
          )
          if (accepted) {
            for (const message of mail) {
              await mutateTask(stateRoot, taskId, () => [{ type: 'message_delivered', id: message.id }])
            }
          }
          continue
        }

        // An open dispatched node without a started run = delivery owed
        // (fresh dispatch, or the wake was lost). Redelivery is fence-safe.
        const open = openNodeOf(state, member.name)
        if (open !== undefined && open.status === 'dispatched') {
          const accepted = await deliverToMember(
            ctx, lead, member.sessionId,
            assignmentPrompt(open, state, config.stateDir),
            new AbortController().signal,
          )
          if (accepted) {
            try {
              const result = await mutateTask(stateRoot, taskId, () => [{
                type: 'run_started', key: open.key, fence: open.fence, sessionId: member.sessionId,
              }])
              state = result.state
            } catch { /* raced */ }
          }
          continue
        }
        if (open !== undefined) continue

        // Auto-claim: prefer nodes pre-assigned to this member, else any
        // unassigned ready node.
        const ready = readyNodes(state)
        const target = ready.find(n => n.assignee === member.name)
          ?? ready.find(n => n.assignee === undefined)
        if (target === undefined) continue
        try {
          const result = await mutateTask(stateRoot, taskId, (fresh) => {
            const current = fresh.nodes.find(n => n.key === target.key)
            if (current === undefined || current.status !== 'pending') return { error: 'raced; skip' }
            return [{
              type: 'node_dispatched', key: current.key, assignee: member.name, fence: current.fence + 1,
            }]
          })
          state = result.state
          const dispatched = state.nodes.find(n => n.key === target.key)
          if (dispatched === undefined) continue
          const accepted = await deliverToMember(
            ctx, lead, member.sessionId,
            assignmentPrompt(dispatched, state, config.stateDir),
            new AbortController().signal,
          )
          if (accepted) {
            const result2 = await mutateTask(stateRoot, taskId, () => [{
              type: 'run_started', key: dispatched.key, fence: dispatched.fence, sessionId: member.sessionId,
            }])
            state = result2.state
          }
        } catch { /* raced */ }
      }
    },
  }

  // Idle-edge observer: the runtime-owned settlement (design.md A2).
  const onStatus = async (agent: Agent, status: AgentStatus): Promise<void> => {
    if (status !== 'idle') return
    const workspace = agent.session.header.cwd ?? process.cwd()
    workspaces.add(workspace)
    const stateRoot = join(workspace, config.stateDir)
    for (const taskId of await listTaskIds(stateRoot)) {
      const state = await readState(stateRoot, taskId)
      if (state === undefined || state.finishedAt !== undefined) continue
      const identity = identityOf(state, agent.id)
      if (identity === undefined) continue
      if (identity.kind === 'member') {
        const open = openNodeOf(state, identity.member.name)
        if (open !== undefined && open.status === 'running') {
          try {
            await mutateTask(stateRoot, taskId, (fresh) => {
              const current = fresh.nodes.find(n => n.key === open.key)
              if (current === undefined || current.status !== 'running' || current.fence !== open.fence) {
                return { error: 'raced; skip' }
              }
              return settleEvents(fresh, current, 'idle-edge')
            })
          } catch { /* raced with reconciler */ }
        }
      }
      // Any participant edge (lead finished a turn, member settled) is a
      // scheduling opportunity for the whole task.
      await runtime.kickTask(workspace, taskId)
    }
  }

  ctx.on('agent/status', ({ agent, status }) => {
    void onStatus(agent, status).catch((error: unknown) => {
      ctx.logger.warn(`team-task: status scheduling failed for ${agent.id}: ${String(error)}`)
    })
  })

  // Resident reconciler (design.md A5): same kick, low frequency, liveness.
  ctx.effect(() => {
    const timer = setInterval(() => {
      void (async () => {
        for (const workspace of workspaces) {
          const stateRoot = join(workspace, config.stateDir)
          for (const taskId of await listTaskIds(stateRoot)) {
            await runtime.kickTask(workspace, taskId)
          }
        }
      })().catch((error: unknown) => {
        ctx.logger.warn(`team-task: reconcile sweep failed: ${String(error)}`)
      })
    }, config.reconcileIntervalMs)
    return () => clearInterval(timer)
  }, 'team-task: reconciler timer')

  return runtime
}
