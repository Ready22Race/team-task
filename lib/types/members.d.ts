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
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { SessionId } from '@deepseek-ai/dsh-session';
import { type Member, type PlanNode, type TeamTaskState } from './types.ts';
/** Restore the SessionId brand on an id round-tripped through the log. */
export declare function brandedSessionId(value: string): SessionId;
/** Runtime knobs for member spawning. */
export interface MemberRuntimeConfig {
    provider: string;
    maxDepth?: number;
}
/** The compact member persona — a pointer, not a policy dump (design.md §4). */
export declare function memberPersona(state: TeamTaskState, member: Member, stateDir: string): string;
/** Build the assignment prompt for a dispatch ticket. */
export declare function assignmentPrompt(node: PlanNode, state: TeamTaskState, stateDir: string, effortHint?: string): string;
/**
 * Spawn one member as a durable continuable subagent of the lead and return
 * its child session id. Route resolution (design.md §5): explicit profile
 * fields win; otherwise the child inherits the lead's current route via the
 * harness's own descriptor snapshot.
 */
export declare function spawnMember(ctx: Context, config: MemberRuntimeConfig, lead: Agent, state: TeamTaskState, member: Omit<Member, 'addedAt' | 'sessionId'>, stateDir: string, firstPrompt: string, signal: AbortSignal): Promise<string>;
/**
 * Deliver one message into a member's FIFO inbox as its next turn.
 * Best-effort: failure is reported as false; the durable log already holds
 * the message (design.md A4).
 */
export declare function deliverToMember(ctx: Context, lead: Agent, childId: string, text: string, signal: AbortSignal): Promise<boolean>;
/**
 * Deliver a durable report at the lead's nearest model boundary. `steer`
 * targets the next step while the lead runs and wakes a turn when idle.
 */
export declare function steerLead(lead: Pick<Agent, 'steer'>, from: string, content: string): boolean;
/** Request cancellation of one live member's current turn (best effort). */
export declare function interruptMember(ctx: Context, lead: Agent, childId: string): void;
/** Real activity of one member session: running / idle / ready (cold). */
export declare function memberActivity(ctx: Context, sessionId: string): 'running' | 'idle' | 'ready';
