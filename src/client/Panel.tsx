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

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { progressOf, type BoardMember, type BoardNode, type BoardTask } from './board-model.ts'
import css from './Panel.module.css'

/** Window event the conversation card fires to (re)open the board. */
export const OPEN_BOARD_EVENT = 'team-task:open-board'

interface SessionListLike {
  subscribe(listener: () => void): () => void
  getSnapshot(): { current?: SessionId | undefined }
}

/** Stable avatar hue per member name (theme-agnostic accent). */
function avatarColor(name: string): string {
  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = ((hash << 5) - hash + name.charCodeAt(index)) | 0
  }
  const hue = ((hash % 360) + 360) % 360
  return `hsl(${hue} 42% 46%)`
}

function initialOf(name: string): string {
  const first = [...name.trim()][0]
  return first === undefined ? '?' : first.toUpperCase()
}

function segmentClass(node: BoardNode): string {
  switch (node.status) {
    case 'approved': return `${css.segment} ${css.segmentApproved}`
    case 'running':
    case 'dispatched': return `${css.segment} ${css.segmentRunning}`
    case 'awaiting_review': return `${css.segment} ${css.segmentReview}`
    case 'cancelled': return `${css.segment} ${css.segmentCancelled}`
    default: return css.segment ?? ''
  }
}

function railOf(node: BoardNode): { className: string; glyph: string } {
  switch (node.status) {
    case 'approved': return { className: `${css.rail} ${css.railApproved}`, glyph: '✓' }
    case 'running':
    case 'dispatched': return { className: `${css.rail} ${css.railRunning}`, glyph: '' }
    case 'awaiting_review': return { className: `${css.rail} ${css.railReview}`, glyph: '!' }
    case 'cancelled': return { className: `${css.rail} ${css.railCancelled}`, glyph: '×' }
    default: return { className: `${css.rail} ${css.railPending}`, glyph: '·' }
  }
}

function StepRow({ node, members, isLast, openSession }: {
  node: BoardNode
  members: readonly BoardMember[]
  isLast: boolean
  openSession: (id: SessionId) => void
}) {
  const rail = railOf(node)
  const outcome = node.runs.at(-1)?.outcome
  const assignee = node.assignee === undefined
    ? undefined
    : members.find(m => m.name === node.assignee)
  const blocked = node.status === 'pending' && node.dependsOn.length > 0
  const titleClass = node.status === 'cancelled'
    ? `${css.nodeTitle} ${css.titleStruck}`
    : blocked ? `${css.nodeTitle} ${css.titleDim}` : css.nodeTitle
  const meta: React.ReactNode[] = []
  if (node.assignee !== undefined) {
    meta.push(
      <span
        key="assignee"
        className={css.assigneeMini}
        style={assignee === undefined ? undefined : { cursor: 'pointer' }}
        onClick={() => { if (assignee !== undefined && assignee.sessionId !== '') openSession(assignee.sessionId as SessionId) }}
      >
        <span className={css.miniAvatar} style={{ background: avatarColor(node.assignee) }}>
          {initialOf(node.assignee)}
        </span>
        {node.assignee}
      </span>,
    )
  }
  if (node.status === 'awaiting_review') {
    meta.push(
      <span key="review" className={outcome === 'completed' ? css.metaOk : css.metaWarn}>
        {outcome === 'completed' ? 'claimed · review' : 'settled without claim'}
      </span>,
    )
  }
  if (node.attempts > 1) meta.push(<span key="attempts" className={css.metaWarn}>attempt {node.attempts}</span>)
  if (node.autoApprove && node.status !== 'approved') meta.push(<span key="fast">fast-lane</span>)
  if (blocked) meta.push(<span key="deps">waits: {node.dependsOn.join(', ')}</span>)
  return (
    <div className={css.step}>
      <div className={css.railWrap}>
        <span className={rail.className}>{rail.glyph}</span>
        <span className={`${css.railLine} ${isLast ? css.railLineHidden : ''}`} />
      </div>
      <div className={css.stepBody}>
        <div className={css.stepTop}>
          <span className={css.nodeKey}>{node.key}</span>
          <span className={titleClass} title={node.goal ?? node.title}>{node.title}</span>
        </div>
        {meta.length > 0 && <div className={css.stepMeta}>{meta}</div>}
      </div>
    </div>
  )
}

function TaskBoard({ task, openSession }: {
  task: BoardTask
  openSession: (id: SessionId) => void
}) {
  const reviews = task.state.nodes.filter(n => n.status === 'awaiting_review')
  const queuedMail = task.state.messages.filter(m => m.deliveredAt === undefined)
  const members = task.state.members.filter(m => m.retired !== true)
  const nodes = task.state.nodes
  return (
    <div className={css.body}>
      {task.state.finishedAt !== undefined && (
        <div className={css.finished}>finished · {task.state.finishStatus}</div>
      )}
      {(reviews.length > 0 || queuedMail.length > 0) && (
        <div className={css.attention}>
          {reviews.map(node => (
            <span key={node.key} className={css.attentionReview}>
              <span className={css.attentionIcon}>⚠</span>
              review {node.key} · {node.runs.at(-1)?.outcome === 'completed' ? 'claimed complete' : 'settled without claim'}
            </span>
          ))}
          {queuedMail.map(message => (
            <span key={message.id} className={css.attentionMail}>
              <span className={css.attentionIcon}>✉</span>
              {message.from} → {message.to} · queued for the next turn
            </span>
          ))}
        </div>
      )}
      {members.length > 0 && (
        <div className={css.members}>
          {members.map((member) => {
            const activity = member.sessionId === '' ? 'ready' : (task.activity[member.name] ?? 'ready')
            const dotClass = activity === 'running' ? css.statusRunning : activity === 'idle' ? css.statusIdle : css.statusReady
            return (
              <button
                key={member.name}
                type="button"
                className={css.member}
                title={`${member.role} — ${activity}${member.model !== undefined ? ` · ${member.model}` : ''}`}
                onClick={() => { if (member.sessionId !== '') openSession(member.sessionId as SessionId) }}
              >
                <span className={css.avatar} style={{ background: avatarColor(member.name) }}>
                  {initialOf(member.name)}
                  <span className={`${css.statusDot} ${dotClass}`} />
                </span>
                <span className={css.memberName}>{member.name}</span>
              </button>
            )
          })}
        </div>
      )}
      <div className={css.plan}>
        {nodes.map((node, index) => (
          <StepRow
            key={node.key}
            node={node}
            members={members}
            isLast={index === nodes.length - 1}
            openSession={openSession}
          />
        ))}
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
          <span className={css.title} title={task.state.goal}>{task.state.name}</span>
          <span className={css.percent}>{progress.done}/{progress.total}</span>
          <button type="button" className={css.headButton} title="收起" onClick={() => setMode('pill')}>–</button>
          <button type="button" className={css.headButton} title="关闭" onClick={() => setMode('hidden')}>×</button>
        </header>
        <div className={css.segments}>
          {task.state.nodes.map(node => <span key={node.key} className={segmentClass(node)} title={`${node.key} · ${node.status}`} />)}
        </div>
        <TaskBoard task={task} openSession={openSession} />
      </section>
    </div>
  )
}
