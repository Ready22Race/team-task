/**
 * team-task conversation card: the durable in-conversation anchor for one
 * task — name, goal, live node/member counts, and a button that (re)opens
 * the board floater. Folds from the first-party `team_task_create` tool
 * records; live counts poll the same projection route as the board.
 * @module team-task/client/card
 */

import { useEffect, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { progressOf, resolveTask, type BoardTask } from './board-model.ts'
import type { TeamTaskCardData } from './card-definition.ts'
import { TeamMark } from './TeamMark.tsx'
import { OPEN_BOARD_EVENT } from './Panel.tsx'
import css from './TeamTaskCard.module.css'

/** Complete keyed Chat renderer props. */
export type TeamTaskCardProps = PropsRuntime<'conversation.chat.node', 'team-task'>

/** Render one durable task as a compact conversation card. */
export function TeamTaskCard({ node }: TeamTaskCardProps) {
  const data = node.data as TeamTaskCardData
  const [live, setLive] = useState<BoardTask | undefined>()

  useEffect(() => {
    let cancelled = false
    const tick = async (): Promise<void> => {
      try {
        const response = await fetch('/plugins/team-task/state', { cache: 'no-store' })
        if (!response.ok) return
        const body = (await response.json()) as { tasks?: BoardTask[] }
        const found = Array.isArray(body.tasks)
          ? resolveTask(body.tasks, data.taskId)
          : undefined
        if (!cancelled) setLive(found)
      } catch {
        // Host restarting; retry next poll.
      }
    }
    void tick()
    const timer = setInterval(() => { void tick() }, 2500)
    return () => { cancelled = true; clearInterval(timer) }
  }, [data.taskId])

  const progress = live === undefined ? undefined : progressOf(live.state)
  const members = live?.state.members.filter(m => m.retired !== true).length
  const finished = live?.state.finishStatus
  return (
    <section className={css.root} data-team-task-card data-task-id={data.taskId}>
      <header className={css.head}>
        <span className={css.mark}><TeamMark size={14} /></span>
        <span className={css.name}>{live?.state.name ?? data.taskName}</span>
        <span className={css.tag}>team-task</span>
      </header>
      {(live?.state.goal ?? data.goal) !== '' && <p className={css.goal}>{live?.state.goal ?? data.goal}</p>}
      <footer className={css.foot}>
        <span className={css.meta}>
          {finished !== undefined
            ? `finished: ${finished}`
            : progress === undefined
              ? `${data.seededNodes} nodes planned`
              : `${progress.done}/${progress.total} approved · ${members ?? 0} members`}
        </span>
        <button
          type="button"
          className={css.boardButton}
          onClick={() => {
            // Carry the task id: a session may hold several tasks over time,
            // and this card means THIS one (the panel otherwise shows the
            // newest unfinished task and the click looks broken).
            window.dispatchEvent(new CustomEvent(OPEN_BOARD_EVENT, {
              detail: { taskId: live?.state.id ?? data.taskId },
            }))
          }}
        >
          看板 board
        </button>
      </footer>
    </section>
  )
}
