/**
 * team-task conversation card definition: folds the durable first-party
 * `tool/call` + `tool/result` records of `team_task_create` into one keyed
 * chat node, so the card survives restarts and renders in historical
 * sessions without any out-of-repo event type.
 * @module team-task/client/card-definition
 */
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-runtime/client';
/** Final keyed Chat payload for the task card. */
export interface TeamTaskCardData {
    readonly taskId: string;
    readonly leadSessionId: string;
    readonly taskName: string;
    readonly goal: string;
    readonly seededNodes: number;
}
declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
    interface ChatNodeDataMap {
        /** Long-horizon team-task summary card anchoring the conversation. */
        'team-task': TeamTaskCardData;
    }
}
/** Folded create-call record (the node's business state). */
export interface TeamTaskNodeState {
    readonly taskId: string;
    readonly name: string;
    readonly goal: string;
    readonly seededNodes: number;
    readonly accepted: boolean;
}
/** Parse the create-call fields the card owns (mirrors host sanitizeTaskId). */
export declare function parseCreateArgs(value: string): {
    taskId: string;
    name: string;
    goal: string;
    seededNodes: number;
} | undefined;
/** Durable first-party tool events folded into one keyed Chat node. */
export declare const teamTaskCardDefinition: ConversationNodeDefinition<TeamTaskNodeState>;
