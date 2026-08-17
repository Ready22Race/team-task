/**
 * Board data model: the wire shapes the panel/card poll from the host's
 * event-log data plane, plus the pure lane grouping (design.md §6).
 *
 * Zero @deepseek-ai imports: shared by card and panel inside this bundle.
 * @module team-task/client/board-model
 */
/** Mirror of the host projection (types.ts TeamTaskState), wire-shaped. */
export interface BoardRun {
    readonly fence: number;
    readonly memberName: string;
    readonly sessionId: string;
    readonly startedAt: number;
    readonly settledAt?: number;
    readonly outcome?: string;
    readonly settledBy?: string;
}
export interface BoardNode {
    readonly key: string;
    readonly title: string;
    readonly goal?: string;
    readonly dependsOn: readonly string[];
    readonly autoApprove: boolean;
    readonly status: 'pending' | 'dispatched' | 'running' | 'awaiting_review' | 'approved' | 'cancelled';
    readonly assignee?: string;
    readonly fence: number;
    readonly attempts: number;
    readonly output?: string;
    readonly feedback?: string;
    readonly runs: readonly BoardRun[];
}
export interface BoardMember {
    readonly name: string;
    readonly role: string;
    readonly sessionId: string;
    readonly model?: string;
    readonly effort?: string;
    readonly retired?: boolean;
}
export interface BoardMessage {
    readonly id: string;
    readonly from: string;
    readonly to: string;
    readonly content: string;
    readonly deliveredAt?: number;
}
export interface BoardState {
    readonly id: string;
    readonly name: string;
    readonly goal: string;
    readonly leadSessionId: string;
    readonly createdAt: number;
    readonly finishedAt?: number;
    readonly finishStatus?: string;
    readonly members: readonly BoardMember[];
    readonly nodes: readonly BoardNode[];
    readonly messages: readonly BoardMessage[];
    readonly seq: number;
}
export interface BoardTask {
    readonly workspace: string;
    readonly state: BoardState;
    readonly activity: Readonly<Record<string, 'running' | 'idle' | 'ready'>>;
}
/** The kanban lanes, in board order. */
export declare const LANES: readonly ["pending", "working", "awaiting_review", "approved"];
export type Lane = (typeof LANES)[number];
/** Lane of one node (dispatched+running share the working lane). */
export declare function laneOf(node: BoardNode): Lane | undefined;
/** Group nodes into lanes. */
export declare function groupLanes(nodes: readonly BoardNode[]): Record<Lane, BoardNode[]>;
/** The attention strip: everything that needs the lead or a human. */
export declare function attentionOf(task: BoardTask): string[];
/** Overall progress: approved / non-cancelled. */
export declare function progressOf(state: BoardState): {
    done: number;
    total: number;
};
/**
 * Resolve a card/pin reference to a live task. Conversation cards fold the
 * `team_task_create` ARGUMENTS, which only yield the name slug — the real id
 * carries a host-minted `YYYYMMDD-HHmmss-` prefix (storage v2). Match the
 * exact id first, then the slug suffix, preferring the newest match.
 */
export declare function resolveTask(tasks: readonly BoardTask[], reference: string): BoardTask | undefined;
