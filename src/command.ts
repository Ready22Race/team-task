/**
 * `/team-task` — the DETERMINISTIC entry point.
 *
 * Model-judged triggers are inherently unreliable: a resident prompt section
 * competes with every other plugin's protocol for the model's attention, and
 * whether a goal counts as "long-horizon" is a judgement call the model makes
 * differently each time. A slash command removes the judgement: the user says
 * when, the command steers an unambiguous kickoff instruction into the
 * session, and the model's only remaining job is to follow the lead playbook.
 * @module team-task/command
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
// Declaration merge only: makes ctx.commands visible.
import type {} from '@deepseek-ai/dsh-commands'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { join } from 'node:path'
import { listTaskIds, readState } from './log.ts'

/**
 * The user's own ask, as a user message. `/team-task <goal>` is authored by
 * the human — rendering it as a user bubble is accurate provenance (and the
 * transcript reads like a conversation instead of starting mid-air). The
 * protocol scaffolding below is OURS and stays attributed to the plugin.
 */
function userAsk(goal: string): string {
  return `Use team-task to run: ${goal}`
}

/** Our protocol scaffolding — plugin-attributed, collapsed behind a summary. */
function kickoffProtocol(goal: string): string {
  return `The user invoked /team-task, so running this as a team task is settled — use the team_task_* tools, not a solo attempt and not another team plugin.

GOAL: ${goal}

Follow this order exactly:
1. team_task_playbook role="lead" — load the protocol before planning.
2. team_task_create — name the task and seed the plan DAG. One node = one reviewable deliverable; wire depends_on for parallelism; pre-assign (assignee) every node whose owner you already know so the scheduler auto-flows it; set auto_approve only on mechanical nodes.
3. team_task_add_member — one per role the plan needs (registration is free; members spawn lazily at their first dispatch).
4. Drive the loop: dispatch anything unrouted → team_task_await → team_task_review (approve unlocks dependents; rework REQUIRES concrete feedback) → repeat until every node is approved.
5. Present the deliverable, then team_task_finish.`
}

/** Register the `/team-task` command (global; every command adapter sees it). */
export function registerTeamTaskCommand(ctx: Context, stateDir: string): void {
  ctx.commands.register({
    name: 'team-task',
    description: 'run a goal as a long-horizon team task (lead plans a reviewed DAG, members execute)',
    input: { hint: '[<goal>|status]' },
    handler: async (invocation: CommandInvocation): Promise<CommandResult> => {
      const agent: Agent = invocation.agent
      const argument = invocation.rawInput.trim()
      const workspace = agent.session.header.cwd ?? process.cwd()
      const stateRoot = join(workspace, stateDir)

      // Bare `/team-task` (or `status`): report this session's task without
      // spending a model turn — the command result never enters history.
      if (argument === '' || argument === 'status') {
        const lines: string[] = []
        for (const taskId of await listTaskIds(stateRoot)) {
          const state = await readState(stateRoot, taskId)
          if (state === undefined || state.leadSessionId !== agent.id) continue
          const active = state.nodes.filter(n => n.status !== 'cancelled')
          const approved = active.filter(n => n.status === 'approved').length
          const review = active.filter(n => n.status === 'awaiting_review')
          lines.push(
            `${state.name} — ${approved}/${active.length} approved`
            + `${state.finishedAt === undefined ? '' : ` · finished (${state.finishStatus})`}`
            + `${review.length === 0 ? '' : `\n  needs review: ${review.map(n => n.key).join(', ')}`}`,
          )
        }
        return lines.length === 0
          ? {
              kind: 'success' as const,
              text: 'No team task in this session. Start one with /team-task <goal>.',
            }
          : { kind: 'success' as const, text: lines.join('\n') }
      }

      // `/team-task <goal>`: steer the kickoff instruction in. `steer` lands
      // at the nearest model boundary (next step while running, a fresh turn
      // when idle), so the command works whether or not a turn is in flight.
      try {
        // The human's ask first (user bubble), then our protocol as a quiet
        // collapsed notice — two sources, each honestly attributed.
        agent.steer(createUserMessage({
          content: [{ type: 'text', text: userAsk(argument) }],
          source: { kind: 'user' },
        }))
        agent.steer(createUserMessage({
          content: [{ type: 'text', text: kickoffProtocol(argument) }],
          source: {
            kind: 'plugin',
            plugin: 'team-task',
            form: 'notice',
            summary: 'team-task kickoff protocol (plan → dispatch → review → finish)',
          },
        }))
      } catch (error: unknown) {
        return {
          kind: 'error' as const,
          text: `team-task could not start: ${String(error)}`,
        }
      }
      return {
        kind: 'success' as const,
        text: `team-task starting: ${argument}`,
      }
    },
  })
}
