/**
 * The `team_task_*` model-facing tools.
 *
 * Thin doors over the event log: each tool resolves the caller's identity
 * (lead = the session that created the task; member = a spawned child),
 * gates by role, and proposes events through `mutateTask` — the fence and
 * status rules live in the log's validator, not here (design.md A3).
 * @module team-task/tools
 */
import type { Context } from '@deepseek-ai/cordis';
import type { TaskScheduler } from './scheduler.ts';
/** Resolved plugin config consumed by the tools. */
export interface ToolsConfig {
    stateDir: string;
    memberProvider: string;
    memberMaxDepth?: number;
    maxMembers: number;
}
/** Register every `team_task_*` tool. */
export declare function registerTeamTaskTools(ctx: Context, config: ToolsConfig, scheduler: TaskScheduler): void;
