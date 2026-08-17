import { jsx as _jsx } from "react/jsx-runtime";
import { createRoot } from 'react-dom/client';
import { teamTaskCardDefinition } from "./card-definition.js";
import { Panel } from "./Panel.js";
import { TeamTaskCard } from "./TeamTaskCard.js";
/** Required services: conversation nodes, slots, and sessions navigation. */
export const inject = ['conversationEvents', 'slots', 'sessions'];
/**
 * Mount the board through a body portal (the web shell has no top-right
 * slot) and register the in-conversation task card; the card's board button
 * re-activates the floater via a window event.
 */
export function apply(ctx) {
    const host = document.createElement('div');
    host.dataset.teamTaskHost = '';
    document.body.appendChild(host);
    const root = createRoot(host);
    root.render(_jsx(Panel, { sessionsList: ctx.sessions.list, openSession: (id) => { ctx.sessions.open(id); } }));
    ctx.effect(() => () => {
        root.unmount();
        host.remove();
    }, 'team-task: board floater');
    ctx.conversationEvents.register(teamTaskCardDefinition);
    ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
        name: 'conversation.chat.node',
        key: 'team-task',
    }, TeamTaskCard));
}
