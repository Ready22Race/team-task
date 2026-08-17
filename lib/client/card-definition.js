/**
 * team-task conversation card definition: folds the durable first-party
 * `tool/call` + `tool/result` records of `team_task_create` into one keyed
 * chat node, so the card survives restarts and renders in historical
 * sessions without any out-of-repo event type.
 * @module team-task/client/card-definition
 */
/** Parse the create-call fields the card owns (mirrors host sanitizeTaskId). */
export function parseCreateArgs(value) {
    try {
        const parsed = JSON.parse(value);
        if (typeof parsed !== 'object' || parsed === null)
            return undefined;
        const record = parsed;
        if (typeof record.name !== 'string' || record.name.trim() === '')
            return undefined;
        const name = record.name.trim();
        const cleaned = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        return {
            taskId: cleaned === '' ? 'task' : cleaned,
            name,
            goal: typeof record.goal === 'string' ? record.goal : '',
            seededNodes: Array.isArray(record.nodes) ? record.nodes.length : 0,
        };
    }
    catch {
        return undefined;
    }
}
/** Durable first-party tool events folded into one keyed Chat node. */
export const teamTaskCardDefinition = {
    kind: 'team-task',
    target: 'chat',
    match: (event) => {
        if (event.type === 'tool/call' && event.data.name === 'team_task_create') {
            return parseCreateArgs(event.data.arguments) === undefined
                ? null
                : { id: String(event.data.callId), role: 'start' };
        }
        if (event.type === 'tool/result' && event.data.message.source.kind === 'tool') {
            return { id: String(event.data.message.source.callId), role: 'update' };
        }
        return null;
    },
    start: (_context, match) => {
        if (match.event.type !== 'tool/call') {
            throw new Error('team-task card start requires a team_task_create tool/call');
        }
        const parsed = parseCreateArgs(match.event.data.arguments);
        if (parsed === undefined)
            throw new Error('team-task card start requires valid create arguments');
        return { ...parsed, accepted: false };
    },
    update: (context, match) => {
        if (match.event.type !== 'tool/result')
            return context.state;
        const failed = match.event.data.error !== undefined
            || match.event.data.message.content.some(block => block.type === 'tool-result' && block.isError === true);
        if (failed)
            return context.state;
        return { ...context.state, accepted: true };
    },
    buildViewNode: (context) => {
        if (context.start === undefined)
            return null;
        const state = context.state;
        if (!state.accepted)
            return null;
        return {
            key: context.key,
            kind: 'team-task',
            id: context.id,
            target: 'chat',
            anchorSeq: context.start.event.seq,
            location: context.start.location,
            visibility: 'visible',
            data: {
                taskId: state.taskId,
                leadSessionId: '',
                taskName: state.name,
                goal: state.goal,
                seededNodes: state.seededNodes,
            },
        };
    },
};
