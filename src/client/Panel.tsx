/**
 * The team-task board — V3 "right rail card" (approved mockup): run header
 * with Live chip / elapsed / big fraction, glowing per-node segments,
 * All·Active·Issues filters, node cards with icon rail + connector, a
 * click-to-inspect drawer (latest run, output excerpt, rework feedback),
 * and a footer status bar. Surfaces/text ride the host --dsw-alias-*
 * tokens; the violet/cyan/amber accents are the panel's identity.
 * @module team-task/client/panel
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { progressOf, resolveTask, type BoardMember, type BoardNode, type BoardTask } from './board-model.ts'
import { TeamMark } from './TeamMark.tsx'
import css from './Panel.module.css'

/** Window event the conversation card fires to (re)open the board. */
export const OPEN_BOARD_EVENT = 'team-task:open-board'

interface SessionListLike {
  subscribe(listener: () => void): () => void
  getSnapshot(): { current?: SessionId | undefined }
}

function initialOf(name: string): string {
  const first = [...name.trim()][0]
  return first === undefined ? '?' : first.toUpperCase()
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const p = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`
}

function segmentClass(node: BoardNode): string {
  const base = css.segment ?? ''
  switch (node.status) {
    case 'approved': return `${base} ${css.segmentDone}`
    case 'running':
    case 'dispatched': return `${base} ${css.segmentRunning}`
    case 'awaiting_review': return `${base} ${css.segmentReview}`
    case 'cancelled': return `${base} ${css.segmentCancelled}`
    default: return base
  }
}

function nodeIcon(node: BoardNode, index: number): { className: string; glyph: string } {
  switch (node.status) {
    case 'approved': return { className: `${css.node} ${css.nodeDone}`, glyph: '✓' }
    case 'running':
    case 'dispatched': return { className: `${css.node} ${css.nodeRunning}`, glyph: '⌁' }
    case 'awaiting_review': return { className: `${css.node} ${css.nodeReview}`, glyph: '!' }
    case 'cancelled': return { className: `${css.node} ${css.nodeCancelled}`, glyph: '×' }
    default: return { className: `${css.node} ${css.nodeQueued}`, glyph: String(index + 1) }
  }
}

function stateLabel(node: BoardNode): { text: string; className: string } {
  const outcome = node.runs.at(-1)?.outcome
  switch (node.status) {
    case 'approved': return { text: 'done', className: `${css.state} ${css.stateOk}` }
    case 'running': return { text: 'running', className: `${css.state} ${css.stateRun}` }
    case 'dispatched': return { text: 'dispatched', className: `${css.state} ${css.stateRun}` }
    case 'awaiting_review':
      return outcome === 'completed'
        ? { text: 'review', className: `${css.state} ${css.stateWarn}` }
        : { text: 'unclaimed', className: `${css.state} ${css.stateWarn}` }
    case 'cancelled': return { text: 'cancelled', className: css.state ?? '' }
    default:
      return node.dependsOn.length > 0
        ? { text: 'blocked', className: css.state ?? '' }
        : { text: 'queued', className: css.state ?? '' }
  }
}

function runDuration(node: BoardNode, now: number): string | undefined {
  const run = node.runs.at(-1)
  if (run === undefined) return undefined
  const end = run.settledAt ?? (node.status === 'running' ? now : undefined)
  if (end === undefined) return undefined
  return formatElapsed(end - run.startedAt)
}

type Filter = 'all' | 'active' | 'issues'

function isIssue(node: BoardNode): boolean {
  return node.status === 'awaiting_review' || node.attempts > 1
}

function isActive(node: BoardNode): boolean {
  return node.status === 'running' || node.status === 'dispatched'
}

function TaskRow({ node, index, now, isLast, selected, onSelect }: {
  node: BoardNode
  index: number
  now: number
  isLast: boolean
  selected: boolean
  onSelect: () => void
}) {
  const icon = nodeIcon(node, index)
  const state = stateLabel(node)
  const duration = runDuration(node, now)
  const blocked = node.status === 'pending' && node.dependsOn.length > 0
  return (
    <button type="button" className={`${css.task} ${selected ? css.taskSelected : ''}`} onClick={onSelect}>
      <i className={icon.className}>{icon.glyph}</i>
      {!isLast && <i className={css.line} />}
      <div className={css.taskTitle}>
        <span className={css.taskKey}>{node.key}</span>
        <span className={state.className}>{state.text}</span>
      </div>
      <div className={css.taskDesc} title={node.goal ?? node.title}>{node.title}</div>
      <div className={css.taskMeta}>
        {node.assignee !== undefined && (
          <>
            <i className={css.avatar}>{initialOf(node.assignee)}</i>
            {node.assignee}
          </>
        )}
        {node.attempts > 1
          ? <span className={css.retry}>attempt {node.attempts}</span>
          : blocked
            ? <span className={css.waits}>waits {node.dependsOn.join(', ')}</span>
            : duration !== undefined && <span className={css.duration}>{duration}</span>}
      </div>
    </button>
  )
}

function Inspector({ node, members, onClose, openSession }: {
  node: BoardNode
  members: readonly BoardMember[]
  onClose: () => void
  openSession: (id: SessionId) => void
}) {
  const run = node.runs.at(-1)
  const member = members.find(m => m.name === node.assignee)
  return (
    <div className={css.inspector}>
      <div className={css.inspectHead}>
        <div>
          <b>{node.key}</b>
          <div className={css.inspectSub}>{node.status} · attempt {Math.max(node.attempts, 1)} · fence {node.fence}</div>
        </div>
        <button type="button" className={css.inspectClose} onClick={onClose}>×</button>
      </div>
      <div className={css.inspectBody}>
        {node.runs.map(r => (
          <div key={r.fence} className={css.runLine}>
            <span>#{r.fence}</span>
            <span>{r.memberName}</span>
            <span className={r.outcome === 'completed' ? 'ok' : r.outcome === undefined ? '' : 'warn'}>
              {r.outcome ?? 'open'}
            </span>
            {r.settledBy !== undefined && <span>via {r.settledBy}</span>}
            {r.settledAt !== undefined && <span>{formatElapsed(r.settledAt - r.startedAt)}</span>}
          </div>
        ))}
        {node.feedback !== undefined && <div className={css.feedbackBlock}>rework: {node.feedback}</div>}
        {node.output !== undefined && <div className={css.outputBlock}>{node.output}</div>}
        {member !== undefined && member.sessionId !== '' && (
          <div className={css.runLine}>
            <span
              style={{ cursor: 'pointer', textDecoration: 'underline' }}
              onClick={() => openSession(member.sessionId as SessionId)}
            >
              open {member.name}'s session →
            </span>
          </div>
        )}
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
  /** Task the user explicitly asked for (card button / switcher); wins over
   * the "newest unfinished" default until they pick something else. */
  const [pinnedTaskId, setPinnedTaskId] = useState<string | undefined>()
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedKey, setSelectedKey] = useState<string | undefined>()
  const [now, setNow] = useState<number>(() => Date.now())
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
    const timer = setInterval(() => { void tick(); setNow(Date.now()) }, 1500)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  useEffect(() => {
    const onOpen = (event: Event): void => {
      const requested = (event as CustomEvent<{ taskId?: string }>).detail?.taskId
      if (requested !== undefined) setPinnedTaskId(requested)
      setMode('board')
    }
    window.addEventListener(OPEN_BOARD_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_BOARD_EVENT, onOpen)
  }, [])

  const mine = useMemo(
    () => tasks.filter(t => current !== undefined && t.state.leadSessionId === current),
    [tasks, current],
  )
  const task = (pinnedTaskId === undefined ? undefined : resolveTask(mine, pinnedTaskId))
    ?? mine.find(t => t.state.finishedAt === undefined)
    ?? mine.at(-1)

  useEffect(() => {
    if (task !== undefined && task.state.id !== autoOpenedFor) {
      setAutoOpenedFor(task.state.id)
      if (pinnedTaskId === undefined) setMode('board')
      setSelectedKey(undefined)
      setFilter('all')
    }
  }, [task, autoOpenedFor, pinnedTaskId])

  if (task === undefined || mode === 'hidden') return null

  /** Switch filter; drop a selection the new filter no longer shows,
   * so the inspector never displays a node absent from the list. */
  const applyFilter = (next: Filter): void => {
    setFilter(next)
    if (selectedKey !== undefined) {
      const node = task.state.nodes.find(n => n.key === selectedKey)
      const visible = node !== undefined
        && (next === 'all' || (next === 'active' ? isActive(node) : isIssue(node)))
      if (!visible) setSelectedKey(undefined)
    }
  }

  const progress = progressOf(task.state)
  const anyRunning = Object.values(task.activity).includes('running')
  const members = task.state.members.filter(m => m.retired !== true)
  const nodes = task.state.nodes
  const activeCount = nodes.filter(isActive).length
  const issueCount = nodes.filter(isIssue).length
  const queuedMail = task.state.messages.filter(m => m.deliveredAt === undefined)

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

  const visible = nodes.filter(n => filter === 'all' ? true : filter === 'active' ? isActive(n) : isIssue(n))
  const selected = selectedKey === undefined ? undefined : nodes.find(n => n.key === selectedKey)
  const elapsedMs = (task.state.finishedAt ?? now) - task.state.createdAt
  const runningCount = Object.values(task.activity).filter(a => a === 'running').length

  return (
    <div className={css.host}>
      <section className={css.panel} data-team-task-board>
        <header className={css.head}>
          <div className={css.headRow}>
            <div className={css.runIcon}><TeamMark size={16} /></div>
            <div className={css.headTitles}>
              <div className={css.runName} title={task.state.goal}>{task.state.name}</div>
              <div className={css.runId}>{task.state.id}</div>
            </div>
            <div className={css.headActions}>
              {mine.length > 1 && (
                <button
                  type="button"
                  className={css.tiny}
                  title={`本会话 ${mine.length} 个任务 · 切换到下一个`}
                  onClick={() => {
                    const index = mine.findIndex(t => t.state.id === task.state.id)
                    const next = mine[(index + 1) % mine.length]
                    if (next !== undefined) {
                      setPinnedTaskId(next.state.id)
                      setSelectedKey(undefined)
                      setFilter('all')
                    }
                  }}
                >⇄</button>
              )}
              <button type="button" className={css.tiny} title="收起" onClick={() => setMode('pill')}>—</button>
              <button type="button" className={css.tiny} title="关闭" onClick={() => setMode('hidden')}>×</button>
            </div>
          </div>
          <div className={css.statusRow}>
            {task.state.finishedAt !== undefined
              ? <span className={css.idle}>{task.state.finishStatus}</span>
              : anyRunning
                ? <span className={css.live}><i className={css.pulse} />Live</span>
                : <span className={css.idle}>Waiting</span>}
            <span className={css.elapsed}>{formatElapsed(elapsedMs)} elapsed</span>
            <span className={css.fraction}><b>{progress.done}</b> / {progress.total}</span>
          </div>
          <div className={css.segments}>
            {nodes.map(node => <i key={node.key} className={segmentClass(node)} title={`${node.key} · ${node.status}`} />)}
          </div>
        </header>

        <div className={css.tools}>
          <button type="button" className={`${css.filter} ${filter === 'all' ? css.filterOn : ''}`} onClick={() => applyFilter('all')}>
            All<span className={css.count}>{nodes.length}</span>
          </button>
          <button type="button" className={`${css.filter} ${filter === 'active' ? css.filterOn : ''}`} onClick={() => applyFilter('active')}>
            Active<span className={css.count}>{activeCount}</span>
          </button>
          <button type="button" className={`${css.filter} ${filter === 'issues' ? css.filterOn : ''}`} onClick={() => applyFilter('issues')}>
            Issues<span className={css.count}>{issueCount}</span>
          </button>
          <span className={css.toolSpacer} />
          <span className={css.autoTag}>EVENT LOG</span>
        </div>

        {queuedMail.length > 0 && (
          <div className={css.attention}>
            {queuedMail.slice(0, 3).map(message => (
              <span key={message.id} className={css.attentionMail}>
                ✉ {message.from} → {message.to} · queued for the next turn
              </span>
            ))}
          </div>
        )}

        <div className={css.list}>
          {visible.map((node) => (
            <TaskRow
              key={node.key}
              node={node}
              index={nodes.indexOf(node)}
              now={now}
              isLast={node === visible.at(-1)}
              selected={node.key === selectedKey}
              onSelect={() => setSelectedKey(node.key === selectedKey ? undefined : node.key)}
            />
          ))}
        </div>

        {selected !== undefined && (
          <Inspector
            node={selected}
            members={members}
            onClose={() => setSelectedKey(undefined)}
            openSession={openSession}
          />
        )}

        <footer className={css.foot}>
          <span>● {members.length} members{runningCount > 0 ? ` · ${runningCount} running` : ''}</span>
          <span className={css.footModel}>{members.find(m => m.model !== undefined)?.model ?? 'inherited route'}</span>
        </footer>
      </section>
    </div>
  )
}
