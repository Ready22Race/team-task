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
import type { Context } from '@deepseek-ai/cordis';
/** Register the `/team-task` command (global; every command adapter sees it). */
export declare function registerTeamTaskCommand(ctx: Context, stateDir: string): void;
