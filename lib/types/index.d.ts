/**
 * team-task for DeepSeek Harness — long-horizon multi-agent tasks.
 *
 * Lead/member orchestration with an event-log source of truth,
 * runtime-owned settlement, a reviewed plan DAG (approve/rework gate),
 * fence-guarded execution, a resident reconciler, and progressive
 * playbook loading. See docs/design.md.
 *
 * Install (bundle): `dsh plugin --profile <name> add @ready22race/dsh-team-task`
 * @module team-task
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export declare const name = "team-task";
export declare const inject: string[];
/** Plugin configuration. */
export interface Config {
    /** State directory name under the workspace (default `.team-task`). */
    stateDir?: string;
    /** `ctx.subagents` provider for members (default `spawn`). */
    memberProvider?: string;
    /** Member delegation depth cap (default `1`; `0` forbids delegation). */
    memberMaxDepth?: number;
    /** Member cap per task (default `8`). */
    maxMembers?: number;
    /** Reconciler sweep interval in ms (default `30000`). */
    reconcileIntervalMs?: number;
    /** Prompt-section order for the trigger (default `118`). */
    promptSectionOrder?: number;
}
export declare const Config: z<Config>;
export declare function apply(ctx: Context, config: Config): void;
