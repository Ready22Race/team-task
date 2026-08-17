/**
 * The append-only event log and its projection (design.md A1) plus the
 * fence-guarded mutation door (design.md A3).
 *
 * Every mutation goes through {@link mutateTask}: read log → project →
 * caller proposes events against current state → validate (fences, status
 * transitions) → append. Read-modify-append is serialized by an in-process
 * per-task promise chain; the log file is the cross-restart truth.
 * @module team-task/log
 */
import { type LogLine, type Member, type Message, type PlanNode, type TeamTaskEvent, type TeamTaskState } from './types.ts';
/** Serialize one async operation per lock key. */
export declare function withTaskLock<T>(key: string, operation: () => Promise<T>): Promise<T>;
/** Slug of a task name: unicode letters/digits kept (CJK included). */
export declare function sanitizeTaskId(name: string): string;
/**
 * Mint a unique, chronologically-sortable task id:
 * `YYYYMMDD-HHmmss-<slug>` (local time). The stamp guarantees uniqueness
 * across same-named tasks and makes `tasks/` an ordered task list.
 */
export declare function mintTaskId(name: string, at: Date): string;
/** Read and parse the raw log ([] for a missing file). */
export declare function readLog(stateRoot: string, taskId: string): Promise<LogLine[]>;
/** Fold one event into the state (pure; exported for the board/verify). */
export declare function applyEvent(state: TeamTaskState, line: LogLine): TeamTaskState;
/** Empty pre-creation state. */
export declare function emptyState(): TeamTaskState;
/** Fold a full log. */
export declare function project(lines: readonly LogLine[]): TeamTaskState;
/** Read + project ('undefined' when the task does not exist). */
export declare function readState(stateRoot: string, taskId: string): Promise<TeamTaskState | undefined>;
/** List every task id: the v2 `tasks/` list plus legacy v1 flat dirs. */
export declare function listTaskIds(stateRoot: string): Promise<string[]>;
/**
 * Append-time validation: the fence/status rules that make late writers
 * harmless (design.md A3). Returns an error string or undefined.
 */
export declare function validateEvent(state: TeamTaskState, event: TeamTaskEvent): string | undefined;
/** Outcome of one {@link mutateTask} proposal. */
export interface MutationResult {
    state: TeamTaskState;
    appended: LogLine[];
}
/**
 * THE mutation door. Reads + projects under the task lock, lets the caller
 * propose events against fresh state, validates each, appends, returns the
 * post-mutation state. Proposal errors throw with the validator's message.
 */
export declare function mutateTask(stateRoot: string, taskId: string, propose: (state: TeamTaskState) => TeamTaskEvent[] | {
    error: string;
}): Promise<MutationResult>;
/** Dependency keys of `node` that have not reached `approved`. */
export declare function unsatisfiedDependencies(state: TeamTaskState, node: PlanNode): string[];
/** Pending nodes whose dependencies are all approved. */
export declare function readyNodes(state: TeamTaskState): PlanNode[];
/** The open (dispatched/running) node owned by one member, if any. */
export declare function openNodeOf(state: TeamTaskState, memberName: string): PlanNode | undefined;
/** Undelivered messages addressed to one recipient. */
export declare function undeliveredTo(state: TeamTaskState, recipient: string): Message[];
/** The participant identity of a session id: lead, a member, or none. */
export declare function identityOf(state: TeamTaskState, sessionId: string): {
    kind: 'lead';
} | {
    kind: 'member';
    member: Member;
} | undefined;
/** Create one durable message value. */
export declare function createMessage(from: string, to: string, content: string): Omit<Message, 'deliveredAt'>;
