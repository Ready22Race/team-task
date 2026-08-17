/**
 * The team-task board floater — event-log-native (design.md §6), themed with
 * the host's `--dsw-alias-*` tokens.
 *
 * Visual structure: header (title · n/m · – · ×) → segmented progress (one
 * segment per plan node, colored by status) → attention (reviews ⚠ / queued
 * mail ✉) → member avatar row → a vertical plan stepper in plan order with
 * a status rail. Modes: board ↔ pill (–) ↔ hidden (×; the conversation
 * card's board button or a new task reopens it).
 * @module team-task/client/panel
 */
import type { SessionId } from '@deepseek-ai/dsh-session/types';
/** Window event the conversation card fires to (re)open the board. */
export declare const OPEN_BOARD_EVENT = "team-task:open-board";
interface SessionListLike {
    subscribe(listener: () => void): () => void;
    getSnapshot(): {
        current?: SessionId | undefined;
    };
}
/** The floater. Board ↔ pill (–) ↔ hidden (×); session-follow. */
export declare function Panel({ sessionsList, openSession }: {
    sessionsList: SessionListLike;
    openSession: (id: SessionId) => void;
}): import("react").JSX.Element | null;
export {};
