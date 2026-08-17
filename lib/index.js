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
import z from '@deepseek-ai/schemastery';
import { join } from 'node:path';
import { registerTeamTaskCommand } from "./command.js";
import { listTaskIds, readLog, readState } from "./log.js";
import { memberActivity } from "./members.js";
import { installScheduler } from "./scheduler.js";
import { registerTeamTaskTools } from "./tools.js";
const WEB_SERVER_KEYS = ['webServer', 'httpServer'];
const WORKSPACE_KEYS = ['workspaceRegistry', 'workspace'];
export const name = 'team-task';
export const inject = ['tools', 'llm', 'subagents', 'systemPrompt', 'agents', 'commands'];
export const Config = z.object({
    stateDir: z.string().default('.team-task'),
    memberProvider: z.string().default('spawn'),
    memberMaxDepth: z.natural().default(1),
    maxMembers: z.natural().min(1).default(8),
    reconcileIntervalMs: z.natural().min(5000).default(30000),
    promptSectionOrder: z.natural().default(118),
});
/**
 * The resident trigger — deliberately tiny (design.md §4). The full protocol
 * loads on demand through `team_task_playbook`.
 */
const TRIGGER_SECTION = `team-task runs a goal as a lead/member team: a reviewed plan DAG, durable members, runtime settlement and crash recovery. The user can also start one explicitly with /team-task <goal>.
USE IT when the goal (a) needs 3+ distinct deliverables that different roles should own, or (b) has steps that must be reviewed before later steps build on them, or (c) is expected to outlive one turn — e.g. multi-source research reports, repo-wide audits, staged analysis→synthesis→writeup pipelines.
DO NOT use it for single-file edits, one lookup, a quick question, or anything you can finish well in one turn — the plan/review overhead is not free.
When it applies, say so in one line and call team_task_playbook role="lead" FIRST; the playbook owns the rest. Members load role "member" themselves.
Loop: team_task_create → add_member → plan → dispatch/auto-flow → await → review (approve unlocks dependents; rework returns feedback) → finish.`;
export function apply(ctx, config) {
    const resolved = {
        stateDir: config.stateDir ?? '.team-task',
        memberProvider: config.memberProvider ?? 'spawn',
        memberMaxDepth: config.memberMaxDepth ?? 1,
        maxMembers: config.maxMembers ?? 8,
        reconcileIntervalMs: config.reconcileIntervalMs ?? 30000,
    };
    ctx.systemPrompt.section({
        name: 'team-task:trigger',
        order: config.promptSectionOrder ?? 118,
        text: TRIGGER_SECTION,
    });
    const scheduler = installScheduler(ctx, {
        stateDir: resolved.stateDir,
        reconcileIntervalMs: resolved.reconcileIntervalMs,
        memberRuntime: {
            provider: resolved.memberProvider,
            ...resolved.memberMaxDepth === undefined ? {} : { maxDepth: resolved.memberMaxDepth },
        },
    });
    registerTeamTaskTools(ctx, resolved, scheduler);
    // Deterministic entry point, independent of model judgement.
    registerTeamTaskCommand(ctx, resolved.stateDir);
    // Board data plane (design.md §6): projection bootstrap + incremental log.
    // Lazy registration: web server / workspace registry may bind after mount,
    // and headless profiles never bind them (plugin stays tool-only there).
    let webRegistered = false;
    const registerWebSurface = () => {
        if (webRegistered)
            return;
        const webServer = (ctx.get(WEB_SERVER_KEYS[0]) ?? ctx.get(WEB_SERVER_KEYS[1]));
        const workspaces = (ctx.get(WORKSPACE_KEYS[0]) ?? ctx.get(WORKSPACE_KEYS[1]));
        if (webServer === undefined || workspaces === undefined)
            return;
        webRegistered = true;
        ctx.effect(() => webServer.register({
            kind: 'exact',
            path: '/plugins/team-task/state',
            handler: async (_req, res) => {
                const tasks = [];
                for (const workspace of workspaces.list()) {
                    const stateRoot = join(workspace.path, resolved.stateDir);
                    for (const taskId of await listTaskIds(stateRoot)) {
                        const state = await readState(stateRoot, taskId);
                        if (state === undefined)
                            continue;
                        scheduler.trackWorkspace(workspace.path);
                        tasks.push({
                            workspace: workspace.title,
                            state,
                            activity: Object.fromEntries(state.members.map(m => [m.name, memberActivity(ctx, m.sessionId)])),
                        });
                    }
                }
                res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
                res.end(JSON.stringify({ tasks }));
            },
        }), 'team-task: state route');
        ctx.effect(() => webServer.register({
            kind: 'exact',
            path: '/plugins/team-task/log',
            handler: async (req, res) => {
                const url = new URL(req.url ?? '/', 'http://x');
                const taskId = url.searchParams.get('task') ?? '';
                const after = Number(url.searchParams.get('after') ?? '0');
                for (const workspace of workspaces.list()) {
                    const stateRoot = join(workspace.path, resolved.stateDir);
                    if (!(await listTaskIds(stateRoot)).includes(taskId))
                        continue;
                    const lines = (await readLog(stateRoot, taskId)).filter(line => line.seq > after);
                    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
                    res.end(JSON.stringify({ events: lines }));
                    return;
                }
                res.writeHead(404);
                res.end();
            },
        }), 'team-task: log route');
    };
    registerWebSurface();
    ctx.on('internal/service', (serviceName) => {
        if (WEB_SERVER_KEYS.includes(serviceName)
            || WORKSPACE_KEYS.includes(serviceName)) {
            registerWebSurface();
        }
    });
}
