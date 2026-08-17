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
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { type MemberRuntimeConfig } from './members.ts';
export interface SchedulerConfig {
    readonly stateDir: string;
    readonly reconcileIntervalMs: number;
    /** Member subagent runtime (lazy spawn happens here, at first dispatch). */
    readonly memberRuntime: MemberRuntimeConfig;
}
export interface TaskScheduler {
    /** Give every idle member one unit of work and flush undelivered mail. */
    kickTask(workspace: string, taskId: string, lead?: Agent): Promise<void>;
    /** Remember a workspace so the reconciler sweeps it. */
    trackWorkspace(workspace: string): void;
}
/** Install one scheduler: kick + idle-edge settlement + reconciler timer. */
export declare function installScheduler(ctx: Context, config: SchedulerConfig): TaskScheduler;
