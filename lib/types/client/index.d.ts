/** Browser plugin: the team-task board floater and conversation card. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
/** Required services: conversation nodes, slots, and sessions navigation. */
export declare const inject: string[];
/**
 * Mount the board through a body portal (the web shell has no top-right
 * slot) and register the in-conversation task card; the card's board button
 * re-activates the floater via a window event.
 */
export declare function apply(ctx: ClientContext): void;
