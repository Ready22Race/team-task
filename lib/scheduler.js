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
import { join } from 'node:path';
import { createMessage, identityOf, listTaskIds, mutateTask, openNodeOf, readState, readyNodes, undeliveredTo, } from "./log.js";
import { assignmentPrompt, brandedSessionId, deliverToMember, memberActivity, spawnMember, steerLead, } from "./members.js";
import { LEAD_KEY } from "./types.js";
function liveLead(ctx, leadSessionId, supplied) {
    if (supplied !== undefined && supplied.id === leadSessionId)
        return supplied;
    return ctx.agents.get(brandedSessionId(leadSessionId));
}
function fallbackMailPrompt(messages) {
    return [
        'team-task delivered messages that were persisted while you were unavailable:',
        ...messages.map(m => `\nFrom ${m.from}:\n${m.content}`),
        '\nHandle these in this turn. Node assignments still require the current fence.',
    ].join('\n');
}
/** Settle-pipeline side effects shared by idle edge, reconciler, and inline. */
function settleEvents(state, node, settledBy, note) {
    const claimed = node.output !== undefined;
    const events = [{
            type: 'run_settled',
            key: node.key,
            fence: node.fence,
            outcome: claimed ? 'completed' : 'turn_ended',
            settledBy,
            ...note === undefined ? {} : { note },
        }];
    // The fast lane applies only to a *claimed* completion (design.md §3):
    // a runtime-settled run always waits for the lead's review.
    if (claimed && node.autoApprove) {
        events.push({ type: 'node_reviewed', key: node.key, verdict: 'approve', feedback: 'auto-approved (fast lane)' });
    }
    events.push({
        type: 'message_sent',
        message: createMessage('runtime', LEAD_KEY, claimed
            ? `Node ${node.key} settled (completed${node.autoApprove ? ', auto-approved' : ', awaiting your review'}). Output:\n${node.output ?? ''}`
            : `Node ${node.key} settled WITHOUT a completion claim (outcome turn_ended, via ${settledBy}). Review what is on disk, then approve or rework with feedback.`),
    });
    return events;
}
/** Install one scheduler: kick + idle-edge settlement + reconciler timer. */
export function installScheduler(ctx, config) {
    const workspaces = new Set();
    const deliverLeadMail = async (workspace, state, lead) => {
        const stateRoot = join(workspace, config.stateDir);
        const pending = undeliveredTo(state, LEAD_KEY);
        if (pending.length === 0)
            return;
        for (const message of pending) {
            if (!steerLead(lead, message.from, message.content))
                break;
            await mutateTask(stateRoot, state.id, () => [{ type: 'message_delivered', id: message.id }]);
        }
    };
    const runtime = {
        trackWorkspace(workspace) {
            workspaces.add(workspace);
        },
        async kickTask(workspace, taskId, suppliedLead) {
            workspaces.add(workspace);
            const stateRoot = join(workspace, config.stateDir);
            let state = await readState(stateRoot, taskId);
            if (state === undefined || state.finishedAt !== undefined)
                return;
            const lead = liveLead(ctx, state.leadSessionId, suppliedLead);
            // Reconciler half of settlement (design.md A5): a node "running" whose
            // member is not actually running lost its turn (interrupt, crash,
            // restart). Settle it through the normal pipeline.
            for (const node of state.nodes) {
                if (node.status !== 'running')
                    continue;
                const member = state.members.find(m => m.name === node.assignee);
                if (member === undefined)
                    continue;
                if (memberActivity(ctx, member.sessionId) === 'running')
                    continue;
                try {
                    const result = await mutateTask(stateRoot, taskId, (fresh) => {
                        const current = fresh.nodes.find(n => n.key === node.key);
                        if (current === undefined || current.status !== 'running' || current.fence !== node.fence) {
                            return { error: 'raced; skip' };
                        }
                        return settleEvents(fresh, current, 'reconciler', 'member was not running');
                    });
                    state = result.state;
                }
                catch {
                    // Raced with the idle-edge observer — its settle is equivalent.
                }
            }
            if (lead === undefined)
                return;
            await deliverLeadMail(workspace, state, lead);
            /**
             * Hand one dispatched node to its member. LAZY SPAWN lives here: a
             * member with no session yet is created NOW, with the assignment as
             * its very first prompt — no welcome turn, no freelancing window.
             * Returns the refreshed state (or undefined when delivery failed).
             */
            const deliverAssignment = async (member, node) => {
                if (member.sessionId === '') {
                    let sessionId;
                    try {
                        sessionId = await spawnMember(ctx, config.memberRuntime, lead, state, { name: member.name, role: member.role, ...member.playbook === undefined ? {} : { playbook: member.playbook }, ...member.provider === undefined ? {} : { provider: member.provider }, ...member.model === undefined ? {} : { model: member.model }, ...member.effort === undefined ? {} : { effort: member.effort } }, config.stateDir, assignmentPrompt(node, state, config.stateDir), new AbortController().signal);
                    }
                    catch (error) {
                        ctx.logger.warn(`team-task: lazy spawn of ${member.name} failed: ${String(error)}`);
                        return undefined;
                    }
                    try {
                        const result = await mutateTask(stateRoot, taskId, () => [
                            { type: 'member_spawned', name: member.name, sessionId },
                            { type: 'run_started', key: node.key, fence: node.fence, sessionId },
                        ]);
                        return result.state;
                    }
                    catch {
                        return undefined;
                    }
                }
                const accepted = await deliverToMember(ctx, lead, member.sessionId, assignmentPrompt(node, state, config.stateDir), new AbortController().signal);
                if (!accepted)
                    return undefined;
                try {
                    const result = await mutateTask(stateRoot, taskId, () => [{
                            type: 'run_started', key: node.key, fence: node.fence, sessionId: member.sessionId,
                        }]);
                    return result.state;
                }
                catch {
                    return undefined;
                }
            };
            for (const member of state.members) {
                if (member.retired === true)
                    continue;
                // Durable mail first — deliverable even to a RUNNING member
                // (`followup` queues FIFO for its next turn boundary). Only a
                // never-spawned member's mail waits for its first assignment.
                const mail = undeliveredTo(state, member.name);
                if (mail.length > 0 && member.sessionId !== '') {
                    const accepted = await deliverToMember(ctx, lead, member.sessionId, fallbackMailPrompt(mail), new AbortController().signal);
                    if (accepted) {
                        for (const message of mail) {
                            await mutateTask(stateRoot, taskId, () => [{ type: 'message_delivered', id: message.id }]);
                        }
                    }
                    continue;
                }
                if (member.sessionId !== '' && memberActivity(ctx, member.sessionId) === 'running')
                    continue;
                // An open dispatched node without a started run = delivery owed
                // (fresh dispatch, or the wake was lost). Redelivery is fence-safe.
                const open = openNodeOf(state, member.name);
                if (open !== undefined && open.status === 'dispatched') {
                    state = await deliverAssignment(member, open) ?? state;
                    continue;
                }
                if (open !== undefined)
                    continue;
                // Auto-flow: ONLY nodes the plan pre-routed to this member. The
                // plan is the routing table — an unassigned ready node waits for
                // the lead's explicit dispatch, so there is exactly one dispatch
                // authority per node and the lead never races the scheduler.
                const ready = readyNodes(state);
                const target = ready.find(n => n.assignee === member.name);
                if (target === undefined)
                    continue;
                try {
                    const result = await mutateTask(stateRoot, taskId, (fresh) => {
                        const current = fresh.nodes.find(n => n.key === target.key);
                        if (current === undefined || current.status !== 'pending')
                            return { error: 'raced; skip' };
                        return [{
                                type: 'node_dispatched', key: current.key, assignee: member.name, fence: current.fence + 1,
                            }];
                    });
                    state = result.state;
                    const dispatched = state.nodes.find(n => n.key === target.key);
                    if (dispatched === undefined)
                        continue;
                    state = await deliverAssignment({ ...member, sessionId: state.members.find(m => m.name === member.name)?.sessionId ?? member.sessionId }, dispatched) ?? state;
                }
                catch { /* raced */ }
            }
        },
    };
    // Idle-edge observer: the runtime-owned settlement (design.md A2).
    const onStatus = async (agent, status) => {
        if (status !== 'idle')
            return;
        const workspace = agent.session.header.cwd ?? process.cwd();
        workspaces.add(workspace);
        const stateRoot = join(workspace, config.stateDir);
        for (const taskId of await listTaskIds(stateRoot)) {
            const state = await readState(stateRoot, taskId);
            if (state === undefined || state.finishedAt !== undefined)
                continue;
            const identity = identityOf(state, agent.id);
            if (identity === undefined)
                continue;
            if (identity.kind === 'member') {
                const open = openNodeOf(state, identity.member.name);
                if (open !== undefined && open.status === 'running') {
                    try {
                        await mutateTask(stateRoot, taskId, (fresh) => {
                            const current = fresh.nodes.find(n => n.key === open.key);
                            if (current === undefined || current.status !== 'running' || current.fence !== open.fence) {
                                return { error: 'raced; skip' };
                            }
                            return settleEvents(fresh, current, 'idle-edge');
                        });
                    }
                    catch { /* raced with reconciler */ }
                }
            }
            // Any participant edge (lead finished a turn, member settled) is a
            // scheduling opportunity for the whole task.
            await runtime.kickTask(workspace, taskId);
        }
    };
    ctx.on('agent/status', ({ agent, status }) => {
        void onStatus(agent, status).catch((error) => {
            ctx.logger.warn(`team-task: status scheduling failed for ${agent.id}: ${String(error)}`);
        });
    });
    // Resident reconciler (design.md A5): same kick, low frequency, liveness.
    ctx.effect(() => {
        const timer = setInterval(() => {
            void (async () => {
                for (const workspace of workspaces) {
                    const stateRoot = join(workspace, config.stateDir);
                    for (const taskId of await listTaskIds(stateRoot)) {
                        await runtime.kickTask(workspace, taskId);
                    }
                }
            })().catch((error) => {
                ctx.logger.warn(`team-task: reconcile sweep failed: ${String(error)}`);
            });
        }, config.reconcileIntervalMs);
        return () => clearInterval(timer);
    }, 'team-task: reconciler timer');
    return runtime;
}
