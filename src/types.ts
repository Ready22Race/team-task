/**
 * Durable team-task domain types.
 *
 * The single source of truth is an append-only event log
 * (`<workspace>/<stateDir>/<taskId>/log.jsonl`); everything in this module is
 * either an event on that log or a pure projection of it (design.md A1).
 * @module team-task/types
 */

/** Node lifecycle statuses (design.md §3). */
export type NodeStatus =
  | 'pending'
  | 'dispatched'
  | 'running'
  | 'awaiting_review'
  | 'approved'
  | 'cancelled'

/** Statuses that unblock nothing and accept no further runs. */
export const TERMINAL_NODE_STATUSES: readonly NodeStatus[] = ['approved', 'cancelled']

/** How a run ended (design.md §3 "Runs and settlement"). */
export type RunOutcome = 'completed' | 'turn_ended' | 'failed'

/** One execution attempt of one node. Attempt history is first-class. */
export interface RunRecord {
  /** The fence this run held; stale fences cannot write. */
  fence: number
  memberName: string
  /** The member's durable subagent session id ('' for lead-executed runs). */
  sessionId: string
  startedAt: number
  settledAt?: number
  outcome?: RunOutcome
  /** Who settled it: 'claim' (model ritual), 'idle-edge', 'reconciler', 'inline'. */
  settledBy?: string
  note?: string
}

/** One plan-DAG node. */
export interface PlanNode {
  key: string
  title: string
  goal?: string
  /** Node keys that must reach `approved` before this node is ready. */
  dependsOn: string[]
  /**
   * Lead-declared fast lane: a *claimed* completion settles straight to
   * `approved`. Runtime-settled runs always wait for review regardless.
   */
  autoApprove: boolean
  /** Reasoning-effort hint carried into the assignment prompt. */
  effort?: string
  status: NodeStatus
  assignee?: string
  /** Monotonic execution generation; bumped on every dispatch. */
  fence: number
  /** Count of dispatches (== number of runs started). */
  attempts: number
  /** Latest claimed/settled output (display; see claimedFence for validity). */
  output?: string
  /**
   * Fence of the attempt that claimed `output`. A claim is only CURRENT when
   * `claimedFence === fence` — a reworked node keeps the old output for
   * display, but settlement must never mistake it for the new attempt's
   * completion (review P1-1).
   */
  claimedFence?: number
  /** Per-dispatch effort hint (carried into the assignment prompt). */
  effortHint?: string
  /** Lead feedback from the latest `rework`; the next dispatch carries it. */
  feedback?: string
  runs: RunRecord[]
  updatedAt: number
}

/** One team member: a durable continuable subagent plus its role profile. */
export interface Member {
  name: string
  role: string
  /** Optional role playbook name served by `team_task_playbook`. */
  playbook?: string
  provider?: string
  model?: string
  effort?: string
  /**
   * Durable child session id. '' until the member is actually spawned —
   * members spawn LAZILY at their first dispatch (no upfront welcome turn,
   * no freelancing window), not at `team_task_add_member`.
   */
  sessionId: string
  addedAt: number
  retired?: boolean
}

/** Mailbox key of the lead. */
export const LEAD_KEY = 'lead'

/** One durable message. Delivery is the scheduler's job (design.md A4). */
export interface Message {
  id: string
  /** `lead`, a member name, or `runtime`. */
  from: string
  /** `lead` or a member name. */
  to: string
  content: string
  ts: number
  deliveredAt?: number
}

/** Full projected task state. */
export interface TeamTaskState {
  id: string
  name: string
  goal: string
  leadSessionId: string
  createdAt: number
  finishedAt?: number
  finishStatus?: 'completed' | 'abandoned'
  members: Member[]
  nodes: PlanNode[]
  messages: Message[]
  /** Seq of the last folded event. */
  seq: number
}

/** Fields accepted when planning a node. */
export interface NodeSpec {
  key: string
  title: string
  goal?: string
  dependsOn?: string[]
  autoApprove?: boolean
  effort?: string
  /**
   * Pre-routed member. THE PLAN IS THE ROUTING TABLE: the scheduler
   * auto-flows a ready node only when the lead pre-assigned it here;
   * an unassigned node always waits for an explicit dispatch.
   */
  assignee?: string
}

/** Events. Stored one JSON object per line as `{seq, ts, ...event}`. */
export type TeamTaskEvent =
  | { type: 'task_created'; id: string; name: string; goal: string; leadSessionId: string }
  | { type: 'member_added'; member: Omit<Member, 'addedAt'> }
  | { type: 'member_spawned'; name: string; sessionId: string }
  | { type: 'member_retired'; name: string }
  | { type: 'node_planned'; node: NodeSpec }
  | { type: 'node_updated'; key: string; patch: Partial<Omit<NodeSpec, 'key'>> }
  | { type: 'node_cancelled'; key: string }
  | { type: 'node_dispatched'; key: string; assignee: string; fence: number; effortHint?: string }
  | { type: 'run_started'; key: string; fence: number; sessionId: string }
  | { type: 'completion_claimed'; key: string; fence: number; output: string }
  | {
    type: 'run_settled'
    key: string
    fence: number
    outcome: RunOutcome
    settledBy: string
    note?: string
  }
  | { type: 'node_reviewed'; key: string; verdict: 'approve' | 'rework'; feedback?: string }
  | { type: 'message_sent'; message: Omit<Message, 'deliveredAt'> }
  | { type: 'message_delivered'; id: string }
  | { type: 'task_finished'; status: 'completed' | 'abandoned'; summary?: string }

/** One persisted log line. */
export type LogLine = TeamTaskEvent & { seq: number; ts: number }
