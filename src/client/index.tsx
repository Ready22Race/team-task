/** Browser plugin: the team-task board floater and conversation card. */

import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { createRoot } from 'react-dom/client'
// Module-loading import: the card registers into the conversation chat-node
// slot, whose keyed renderer map lives in the ui-conversation contract.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { teamTaskCardDefinition } from './card-definition.ts'
import { Panel } from './Panel.tsx'
import { TeamTaskCard } from './TeamTaskCard.tsx'

/** Required services: conversation nodes, slots, and sessions navigation. */
export const inject = ['conversationEvents', 'slots', 'sessions']

/**
 * Mount the board through a body portal (the web shell has no top-right
 * slot) and register the in-conversation task card; the card's board button
 * re-activates the floater via a window event.
 */
export function apply(ctx: ClientContext): void {
  const host = document.createElement('div')
  host.dataset.teamTaskHost = ''
  document.body.appendChild(host)
  const root = createRoot(host)
  root.render(<Panel
    sessionsList={ctx.sessions.list}
    openSession={(id: SessionId) => { ctx.sessions.open(id) }}
  />)
  ctx.effect(() => () => {
    root.unmount()
    host.remove()
  }, 'team-task: board floater')

  ctx.conversationEvents.register(teamTaskCardDefinition)
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'team-task',
  }, TeamTaskCard))
}
