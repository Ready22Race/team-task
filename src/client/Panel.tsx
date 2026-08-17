/**
 * The team-task board floater: an event-log-native kanban (design.md §6),
 * themed with the host's `--dsw-alias-*` design tokens.
 *
 * Three view modes: expanded board, collapsed pill (–), fully hidden (×,
 * reopened by the conversation card's board button or a new task). Polls the
 * host projection; lanes pending / working / review / approved, attention
 * split into reviews (warn) and queued mail (info), member activity dots.
 * @module team-task/client/panel
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  groupLanes, LANES, progressOf,
  type BoardNode, type BoardTask, type Lane,
} from './board-model.ts'
import css from './Panel.module.css'

/** Window event the conversation card fires to (re)open the board. */
export const OPEN_BOARD_EVENT = 'team-task:open-board'

const LANE_LABEL: Record<Lane, string> = {
  pending: 'Pending',
  working: 'Working',
  awaiting_review: 'Needs review',
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
      <span className={css.nodeTitle} title={node.title}>{node.title}</span>
      {node.assignee !== undefined && <span className={css.badge}>{node.assignee}</span>}
      {node.attempts > 1 && <span className={css.badgeWarn}>#{node.attempts}</span>}
      {node.autoApprove && <span className={css.badgeFast}>fast</span>}
      {node.status === 'awaiting_review' && (
        <span className={outcome === 'completed' ? css.badgeFast : css.badgeWarn}>
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
  const reviews = task.state.nodes.filter(n => n.status === 'awaiting_review')
  const queuedMail = task.state.messages.filter(m => m.deliveredAt === undefined)
  return (
    <div className={css.body}>
      {task.state.goal !== '' && <p className={css.goal}>{task.state.goal}</p>}
      {task.state.finishedAt !== undefined && (
        <div className={css.finished}>finished: {task.state.finishStatus}</div>
      )}
      {(reviews.length > 0 || queuedMail.length > 0) && (
        <div className={css.attention}>
          {reviews.map(node => (
            <span key={node.key} className={css.attentionReview}>
              <span className={css.attentionIcon}>⚠</span>
              review {node.key} · {node.runs.at(-1)?.outcome === 'completed' ? 'claimed complete' : 'settled without claim — inspect disk'}
            </span>
          ))}
          {queuedMail.map(message => (
            <span key={message.id} className={css.attentionMail}>
              <span className={css.attentionIcon}>✉</span>
              queued: {message.from} → {message.to} · delivers at the next turn boundary
            </span>
          ))}
        </div>
      )}
      <div className={css.members}>
        {task.state.members.filter(m => m.retired !== true).map((member) => {
          const activity = member.sessionId === '' ? 'unspawned' : (task.activity[member.name] ?? 'ready')
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
              <span className={css.memberRole}>{member.role.split(/[:：]/)[0]}</span>
            </button>
          )
        })}
      </div>
      <div className={css.lanes}>
        {LANES.map((lane) => {
          const nodes = lanes[lane]
          if (nodes.length === 0) return null
          return (
            <div key={lane}>
              <div className={`${css.laneHead} ${lane === 'awaiting_review' ? css.laneHeadReview : ''}`}>
                <span>{LANE_LABEL[lane]}</span>
                <span>{nodes.length}</span>
              </div>
              {nodes.map(node => <NodeRow key={node.key} node={node} />)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

type ViewMode = 'board' | 'pill' | 'hidden'

/** The floater. Board ↔ pill (–) ↔ hidden (×); session-follow. */
export function Panel({ sessionsList, openSession }: {
  sessionsList: SessionListLike
  openSession: (id: SessionId) => void
}) {
  const [tasks, setTasks] = useState<readonly BoardTask[]>([])
  const [mode, setMode] = useState<ViewMode>('pill')
  const [autoOpenedFor, setAutoOpenedFor] = useState<string>('')
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
    const onOpen = (): void => { setMode('board') }
    window.addEventListener(OPEN_BOARD_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_BOARD_EVENT, onOpen)
  }, [])

  const mine = useMemo(
    () => tasks.filter(t => current !== undefined && t.state.leadSessionId === current),
    [tasks, current],
  )
  const task = mine.find(t => t.state.finishedAt === undefined) ?? mine.at(-1)

  // Auto-expand once per task; the user's – / × afterwards is respected.
  useEffect(() => {
    if (task !== undefined && task.state.id !== autoOpenedFor) {
      setAutoOpenedFor(task.state.id)
      setMode('board')
    }
  }, [task, autoOpenedFor])

  if (task === undefined || mode === 'hidden') return null
  const progress = progressOf(task.state)
  const percent = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100)
  const anyRunning = Object.values(task.activity).includes('running')

  if (mode === 'pill') {
    return (
      <div className={css.host}>
        <button type="button" className={css.pill} onClick={() => setMode('board')}>
          {anyRunning && <span className={css.pulse} />}
          {task.state.name}
          <span className={css.pillCount}>{progress.done}/{progress.total}</span>
        </button>
      </div>
    )
  }
  return (
    <div className={css.host}>
      <section className={css.board} data-team-task-board>
        <header className={css.head}>
          <span className={css.title} title={task.state.name}>{task.state.name}</span>
          <span className={css.percent}>{progress.done}/{progress.total}</span>
          <button type="button" className={css.headButton} title="收起 collapse" onClick={() => setMode('pill')}>–</button>
          <button type="button" className={css.headButton} title="关闭 close" onClick={() => setMode('hidden')}>×</button>
        </header>
        <div className={css.progressTrack}>
          <div className={css.progressFill} style={{ width: `${percent}%` }} />
        </div>
        <TaskBoard task={task} openSession={openSession} />
      </section>
    </div>
  )
}
