/**
 * The team-task board floater: an event-log-native kanban (design.md §6).
 *
 * Polls the host projection route; lanes pending / working / review /
 * approved, an attention strip (reviews owed, undelivered mail), member
 * activity dots (click opens the member session), and per-node attempt
 * badges. Session-follow: shows tasks whose lead is the current session.
 * @module team-task/client/panel
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  attentionOf, groupLanes, LANES, progressOf,
  type BoardNode, type BoardTask, type Lane,
} from './board-model.ts'
import css from './Panel.module.css'

/** Window event the conversation card fires to (re)open the board. */
export const OPEN_BOARD_EVENT = 'team-task:open-board'

const LANE_LABEL: Record<Lane, string> = {
  pending: 'Pending',
  working: 'Working',
  awaiting_review: 'Review',
  approved: 'Approved',
}

interface SessionListLike {
  subscribe(listener: () => void): () => void
  getSnapshot(): { current?: SessionId | undefined }
}

function NodeRow({ node }: { node: BoardNode }) {
  const outcome = node.runs.at(-1)?.outcome
  return (
    <div className={`${css.node} ${node.status === 'pending' && node.dependsOn.length > 0 ? css.blocked : ''}`}>
      <span className={css.nodeKey}>{node.key}</span>
      <span className={css.nodeTitle}>{node.title}</span>
      {node.assignee !== undefined && <span className={css.badge}>{node.assignee}</span>}
      {node.attempts > 1 && <span className={css.badgeWarn}>#{node.attempts}</span>}
      {node.autoApprove && <span className={css.badgeFast}>fast</span>}
      {node.status === 'awaiting_review' && (
        <span className={outcome === 'completed' ? css.badge : css.badgeWarn}>
          {outcome === 'completed' ? 'claimed' : outcome ?? 'settled'}
        </span>
      )}
    </div>
  )
}

function TaskBoard({ task, openSession }: {
  task: BoardTask
  openSession: (id: SessionId) => void
}) {
  const lanes = useMemo(() => groupLanes(task.state.nodes), [task.state.nodes])
  const attention = useMemo(() => attentionOf(task), [task])
  const progress = progressOf(task.state)
  const percent = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)
  return (
    <>
      <p className={css.goal}>{task.state.goal}</p>
      <div className={css.progressTrack}>
        <div className={css.progressFill} style={{ width: `${percent}%` }} />
      </div>
      {task.state.finishedAt !== undefined && (
        <div className={css.finished}>finished: {task.state.finishStatus}</div>
      )}
      {attention.length > 0 && (
        <div className={css.attention}>
          {attention.map(item => <span key={item} className={css.attentionItem}>⚠ {item}</span>)}
        </div>
      )}
      <div className={css.members}>
        {task.state.members.filter(m => m.retired !== true).map((member) => {
          const activity = task.activity[member.name] ?? 'ready'
          const dot = activity === 'running' ? css.dotRunning : activity === 'idle' ? css.dotIdle : css.dotReady
          return (
            <button
              key={member.name}
              type="button"
              className={css.member}
              title={`${member.role} — ${activity}${member.model !== undefined ? ` · ${member.model}` : ''}`}
              onClick={() => { if (member.sessionId !== '') openSession(member.sessionId as SessionId) }}
            >
              <span className={`${css.dot} ${dot}`} />
              {member.name}
              <span className={css.memberRole}>{member.role}</span>
            </button>
          )
        })}
      </div>
      <div className={css.lanes}>
        {LANES.map((lane) => {
          const nodes = lanes[lane]
          if (nodes.length === 0) return null
          return (
            <div key={lane} className={`${css.lane} ${lane === 'awaiting_review' ? css.laneReview : ''}`}>
              <div className={css.laneHead}>
                <span>{LANE_LABEL[lane]}</span>
                <span>{nodes.length}</span>
              </div>
              {nodes.map(node => <NodeRow key={node.key} node={node} />)}
            </div>
          )
        })}
      </div>
    </>
  )
}

/** The floater. Collapsed pill ↔ expanded board; session-follow. */
export function Panel({ sessionsList, openSession }: {
  sessionsList: SessionListLike
  openSession: (id: SessionId) => void
}) {
  const [tasks, setTasks] = useState<readonly BoardTask[]>([])
  const [open, setOpen] = useState(false)
  const [manuallyClosed, setManuallyClosed] = useState(false)
  const current = useSyncExternalStore(sessionsList.subscribe, sessionsList.getSnapshot).current

  useEffect(() => {
    let cancelled = false
    let inFlight = false
    const tick = async (): Promise<void> => {
      if (inFlight) return
      inFlight = true
      try {
        const response = await fetch('/plugins/team-task/state', { cache: 'no-store' })
        if (!response.ok) return
        const body = (await response.json()) as { tasks?: BoardTask[] }
        if (!cancelled && Array.isArray(body.tasks)) setTasks(body.tasks)
      } catch {
        // Host restarting; keep the last snapshot.
      } finally {
        inFlight = false
      }
    }
    void tick()
    const timer = setInterval(() => { void tick() }, 1500)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  useEffect(() => {
    const onOpen = (): void => { setOpen(true); setManuallyClosed(false) }
    window.addEventListener(OPEN_BOARD_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_BOARD_EVENT, onOpen)
  }, [])

  const mine = useMemo(
    () => tasks.filter(t => current !== undefined && t.state.leadSessionId === current),
    [tasks, current],
  )

  // Auto-expand when the current session's task appears (unless user closed).
  useEffect(() => {
    if (mine.length > 0 && !manuallyClosed) setOpen(true)
  }, [mine.length, manuallyClosed])

  if (mine.length === 0) return null
  const task = mine.find(t => t.state.finishedAt === undefined) ?? mine[mine.length - 1]!
  const anyRunning = Object.values(task.activity).includes('running')

  if (!open) {
    return (
      <div className={css.host}>
        <button type="button" className={css.pill} onClick={() => { setOpen(true); setManuallyClosed(false) }}>
          {anyRunning && <span className={css.pulse} />}
          team-task · {task.state.name}
        </button>
      </div>
    )
  }
  return (
    <div className={css.host}>
      <section className={css.board} data-team-task-board>
        <header className={css.head}>
          <span className={css.title}>{task.state.name}</span>
          <button type="button" className={css.close} onClick={() => { setOpen(false); setManuallyClosed(true) }}>×</button>
        </header>
        <TaskBoard task={task} openSession={openSession} />
      </section>
    </div>
  )
}
