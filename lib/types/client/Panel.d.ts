/**
 * The team-task board — V3 "right rail card" (approved mockup): run header
 * with Live chip / elapsed / big fraction, glowing per-node segments,
 * All·Active·Issues filters, node cards with icon rail + connector, a
 * click-to-inspect drawer (latest run, output excerpt, rework feedback),
 * and a footer status bar. Surfaces/text ride the host --dsw-alias-*
 * tokens; the violet/cyan/amber accents are the panel's identity.
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
