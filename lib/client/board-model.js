/**
 * Board data model: the wire shapes the panel/card poll from the host's
 * event-log data plane, plus the pure lane grouping (design.md §6).
 *
 * Zero @deepseek-ai imports: shared by card and panel inside this bundle.
 * @module team-task/client/board-model
 */
/** The kanban lanes, in board order. */
export const LANES = ['pending', 'working', 'awaiting_review', 'approved'];
/** Lane of one node (dispatched+running share the working lane). */
export function laneOf(node) {
    switch (node.status) {
        case 'pending': return 'pending';
        case 'dispatched':
        case 'running': return 'working';
        case 'awaiting_review': return 'awaiting_review';
        case 'approved': return 'approved';
        default: return undefined;
    }
}
/** Group nodes into lanes. */
export function groupLanes(nodes) {
    const lanes = {
        pending: [], working: [], awaiting_review: [], approved: [],
    };
    for (const node of nodes) {
        const lane = laneOf(node);
        if (lane !== undefined)
            lanes[lane].push(node);
    }
    return lanes;
}
/** The attention strip: everything that needs the lead or a human. */
export function attentionOf(task) {
    const items = [];
    for (const node of task.state.nodes) {
        if (node.status !== 'awaiting_review')
            continue;
        const outcome = node.runs.at(-1)?.outcome ?? 'settled';
        items.push(outcome === 'completed'
            ? `review ${node.key} (claimed complete)`
            : `review ${node.key} (settled ${outcome} — inspect disk state)`);
    }
    for (const message of task.state.messages) {
        if (message.deliveredAt === undefined)
            items.push(`undelivered: ${message.from} → ${message.to}`);
    }
    return items;
}
/** Overall progress: approved / non-cancelled. */
export function progressOf(state) {
    const active = state.nodes.filter(n => n.status !== 'cancelled');
    return { done: active.filter(n => n.status === 'approved').length, total: active.length };
}
