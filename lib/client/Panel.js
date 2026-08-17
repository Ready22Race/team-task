import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * The team-task board — V3 "right rail card" (approved mockup): run header
 * with Live chip / elapsed / big fraction, glowing per-node segments,
 * All·Active·Issues filters, node cards with icon rail + connector, a
 * click-to-inspect drawer (latest run, output excerpt, rework feedback),
 * and a footer status bar. Surfaces/text ride the host --dsw-alias-*
 * tokens; the violet/cyan/amber accents are the panel's identity.
 * @module team-task/client/panel
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { progressOf, resolveTask } from "./board-model.js";
import { TeamMark } from "./TeamMark.js";
import css from './Panel.module.css';
/** Window event the conversation card fires to (re)open the board. */
export const OPEN_BOARD_EVENT = 'team-task:open-board';
function initialOf(name) {
    const first = [...name.trim()][0];
    return first === undefined ? '?' : first.toUpperCase();
}
function formatElapsed(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const p = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}
function segmentClass(node) {
    const base = css.segment ?? '';
    switch (node.status) {
        case 'approved': return `${base} ${css.segmentDone}`;
        case 'running':
        case 'dispatched': return `${base} ${css.segmentRunning}`;
        case 'awaiting_review': return `${base} ${css.segmentReview}`;
        case 'cancelled': return `${base} ${css.segmentCancelled}`;
        default: return base;
    }
}
function nodeIcon(node, index) {
    switch (node.status) {
        case 'approved': return { className: `${css.node} ${css.nodeDone}`, glyph: '✓' };
        case 'running':
        case 'dispatched': return { className: `${css.node} ${css.nodeRunning}`, glyph: '⌁' };
        case 'awaiting_review': return { className: `${css.node} ${css.nodeReview}`, glyph: '!' };
        case 'cancelled': return { className: `${css.node} ${css.nodeCancelled}`, glyph: '×' };
        default: return { className: `${css.node} ${css.nodeQueued}`, glyph: String(index + 1) };
    }
}
function stateLabel(node) {
    const outcome = node.runs.at(-1)?.outcome;
    switch (node.status) {
        case 'approved': return { text: 'done', className: `${css.state} ${css.stateOk}` };
        case 'running': return { text: 'running', className: `${css.state} ${css.stateRun}` };
        case 'dispatched': return { text: 'dispatched', className: `${css.state} ${css.stateRun}` };
        case 'awaiting_review':
            return outcome === 'completed'
                ? { text: 'review', className: `${css.state} ${css.stateWarn}` }
                : { text: 'unclaimed', className: `${css.state} ${css.stateWarn}` };
        case 'cancelled': return { text: 'cancelled', className: css.state ?? '' };
        default:
            return node.dependsOn.length > 0
                ? { text: 'blocked', className: css.state ?? '' }
                : { text: 'queued', className: css.state ?? '' };
    }
}
function runDuration(node, now) {
    const run = node.runs.at(-1);
    if (run === undefined)
        return undefined;
    const end = run.settledAt ?? (node.status === 'running' ? now : undefined);
    if (end === undefined)
        return undefined;
    return formatElapsed(end - run.startedAt);
}
function isIssue(node) {
    return node.status === 'awaiting_review' || node.attempts > 1;
}
function isActive(node) {
    return node.status === 'running' || node.status === 'dispatched';
}
function TaskRow({ node, index, now, isLast, selected, onSelect }) {
    const icon = nodeIcon(node, index);
    const state = stateLabel(node);
    const duration = runDuration(node, now);
    const blocked = node.status === 'pending' && node.dependsOn.length > 0;
    return (_jsxs("button", { type: "button", className: `${css.task} ${selected ? css.taskSelected : ''}`, onClick: onSelect, children: [_jsx("i", { className: icon.className, children: icon.glyph }), !isLast && _jsx("i", { className: css.line }), _jsxs("div", { className: css.taskTitle, children: [_jsx("span", { className: css.taskKey, children: node.key }), _jsx("span", { className: state.className, children: state.text })] }), _jsx("div", { className: css.taskDesc, title: node.goal ?? node.title, children: node.title }), _jsxs("div", { className: css.taskMeta, children: [node.assignee !== undefined && (_jsxs(_Fragment, { children: [_jsx("i", { className: css.avatar, children: initialOf(node.assignee) }), node.assignee] })), node.attempts > 1
                        ? _jsxs("span", { className: css.retry, children: ["attempt ", node.attempts] })
                        : blocked
                            ? _jsxs("span", { className: css.waits, children: ["waits ", node.dependsOn.join(', ')] })
                            : duration !== undefined && _jsx("span", { className: css.duration, children: duration })] })] }));
}
function Inspector({ node, members, onClose, openSession }) {
    const run = node.runs.at(-1);
    const member = members.find(m => m.name === node.assignee);
    return (_jsxs("div", { className: css.inspector, children: [_jsxs("div", { className: css.inspectHead, children: [_jsxs("div", { children: [_jsx("b", { children: node.key }), _jsxs("div", { className: css.inspectSub, children: [node.status, " \u00B7 attempt ", Math.max(node.attempts, 1), " \u00B7 fence ", node.fence] })] }), _jsx("button", { type: "button", className: css.inspectClose, onClick: onClose, children: "\u00D7" })] }), _jsxs("div", { className: css.inspectBody, children: [node.runs.map(r => (_jsxs("div", { className: css.runLine, children: [_jsxs("span", { children: ["#", r.fence] }), _jsx("span", { children: r.memberName }), _jsx("span", { className: r.outcome === 'completed' ? 'ok' : r.outcome === undefined ? '' : 'warn', children: r.outcome ?? 'open' }), r.settledBy !== undefined && _jsxs("span", { children: ["via ", r.settledBy] }), r.settledAt !== undefined && _jsx("span", { children: formatElapsed(r.settledAt - r.startedAt) })] }, r.fence))), node.feedback !== undefined && _jsxs("div", { className: css.feedbackBlock, children: ["rework: ", node.feedback] }), node.output !== undefined && _jsx("div", { className: css.outputBlock, children: node.output }), member !== undefined && member.sessionId !== '' && (_jsx("div", { className: css.runLine, children: _jsxs("span", { style: { cursor: 'pointer', textDecoration: 'underline' }, onClick: () => openSession(member.sessionId), children: ["open ", member.name, "'s session \u2192"] }) }))] })] }));
}
/** The floater. Board ↔ pill (–) ↔ hidden (×); session-follow. */
export function Panel({ sessionsList, openSession }) {
    const [tasks, setTasks] = useState([]);
    const [mode, setMode] = useState('pill');
    const [autoOpenedFor, setAutoOpenedFor] = useState('');
    /** Task the user explicitly asked for (card button / switcher); wins over
     * the "newest unfinished" default until they pick something else. */
    const [pinnedTaskId, setPinnedTaskId] = useState();
    const [filter, setFilter] = useState('all');
    const [selectedKey, setSelectedKey] = useState();
    const [now, setNow] = useState(() => Date.now());
    const current = useSyncExternalStore(sessionsList.subscribe, sessionsList.getSnapshot).current;
    useEffect(() => {
        let cancelled = false;
        let inFlight = false;
        const tick = async () => {
            if (inFlight)
                return;
            inFlight = true;
            try {
                const response = await fetch('/plugins/team-task/state', { cache: 'no-store' });
                if (!response.ok)
                    return;
                const body = (await response.json());
                if (!cancelled && Array.isArray(body.tasks))
                    setTasks(body.tasks);
            }
            catch {
                // Host restarting; keep the last snapshot.
            }
            finally {
                inFlight = false;
            }
        };
        void tick();
        const timer = setInterval(() => { void tick(); setNow(Date.now()); }, 1500);
        return () => { cancelled = true; clearInterval(timer); };
    }, []);
    useEffect(() => {
        const onOpen = (event) => {
            const requested = event.detail?.taskId;
            if (requested !== undefined)
                setPinnedTaskId(requested);
            setMode('board');
        };
        window.addEventListener(OPEN_BOARD_EVENT, onOpen);
        return () => window.removeEventListener(OPEN_BOARD_EVENT, onOpen);
    }, []);
    const mine = useMemo(() => tasks.filter(t => current !== undefined && t.state.leadSessionId === current), [tasks, current]);
    const task = (pinnedTaskId === undefined ? undefined : resolveTask(mine, pinnedTaskId))
        ?? mine.find(t => t.state.finishedAt === undefined)
        ?? mine.at(-1);
    useEffect(() => {
        if (task !== undefined && task.state.id !== autoOpenedFor) {
            setAutoOpenedFor(task.state.id);
            if (pinnedTaskId === undefined)
                setMode('board');
            setSelectedKey(undefined);
            setFilter('all');
        }
    }, [task, autoOpenedFor, pinnedTaskId]);
    if (task === undefined || mode === 'hidden')
        return null;
    /** Switch filter; drop a selection the new filter no longer shows,
     * so the inspector never displays a node absent from the list. */
    const applyFilter = (next) => {
        setFilter(next);
        if (selectedKey !== undefined) {
            const node = task.state.nodes.find(n => n.key === selectedKey);
            const visible = node !== undefined
                && (next === 'all' || (next === 'active' ? isActive(node) : isIssue(node)));
            if (!visible)
                setSelectedKey(undefined);
        }
    };
    const progress = progressOf(task.state);
    const anyRunning = Object.values(task.activity).includes('running');
    const members = task.state.members.filter(m => m.retired !== true);
    const nodes = task.state.nodes;
    const activeCount = nodes.filter(isActive).length;
    const issueCount = nodes.filter(isIssue).length;
    const queuedMail = task.state.messages.filter(m => m.deliveredAt === undefined);
    if (mode === 'pill') {
        return (_jsx("div", { className: css.host, children: _jsxs("button", { type: "button", className: css.pill, onClick: () => setMode('board'), children: [anyRunning && _jsx("span", { className: css.pulse }), task.state.name, _jsxs("span", { className: css.pillCount, children: [progress.done, "/", progress.total] })] }) }));
    }
    const visible = nodes.filter(n => filter === 'all' ? true : filter === 'active' ? isActive(n) : isIssue(n));
    const selected = selectedKey === undefined ? undefined : nodes.find(n => n.key === selectedKey);
    const elapsedMs = (task.state.finishedAt ?? now) - task.state.createdAt;
    const runningCount = Object.values(task.activity).filter(a => a === 'running').length;
    return (_jsx("div", { className: css.host, children: _jsxs("section", { className: css.panel, "data-team-task-board": true, children: [_jsxs("header", { className: css.head, children: [_jsxs("div", { className: css.headRow, children: [_jsx("div", { className: css.runIcon, children: _jsx(TeamMark, { size: 16 }) }), _jsxs("div", { className: css.headTitles, children: [_jsx("div", { className: css.runName, title: task.state.goal, children: task.state.name }), _jsx("div", { className: css.runId, children: task.state.id })] }), _jsxs("div", { className: css.headActions, children: [mine.length > 1 && (_jsx("button", { type: "button", className: css.tiny, title: `本会话 ${mine.length} 个任务 · 切换到下一个`, onClick: () => {
                                                const index = mine.findIndex(t => t.state.id === task.state.id);
                                                const next = mine[(index + 1) % mine.length];
                                                if (next !== undefined) {
                                                    setPinnedTaskId(next.state.id);
                                                    setSelectedKey(undefined);
                                                    setFilter('all');
                                                }
                                            }, children: "\u21C4" })), _jsx("button", { type: "button", className: css.tiny, title: "\u6536\u8D77", onClick: () => setMode('pill'), children: "\u2014" }), _jsx("button", { type: "button", className: css.tiny, title: "\u5173\u95ED", onClick: () => setMode('hidden'), children: "\u00D7" })] })] }), _jsxs("div", { className: css.statusRow, children: [task.state.finishedAt !== undefined
                                    ? _jsx("span", { className: css.idle, children: task.state.finishStatus })
                                    : anyRunning
                                        ? _jsxs("span", { className: css.live, children: [_jsx("i", { className: css.pulse }), "Live"] })
                                        : _jsx("span", { className: css.idle, children: "Waiting" }), _jsxs("span", { className: css.elapsed, children: [formatElapsed(elapsedMs), " elapsed"] }), _jsxs("span", { className: css.fraction, children: [_jsx("b", { children: progress.done }), " / ", progress.total] })] }), _jsx("div", { className: css.segments, children: nodes.map(node => _jsx("i", { className: segmentClass(node), title: `${node.key} · ${node.status}` }, node.key)) })] }), _jsxs("div", { className: css.tools, children: [_jsxs("button", { type: "button", className: `${css.filter} ${filter === 'all' ? css.filterOn : ''}`, onClick: () => applyFilter('all'), children: ["All", _jsx("span", { className: css.count, children: nodes.length })] }), _jsxs("button", { type: "button", className: `${css.filter} ${filter === 'active' ? css.filterOn : ''}`, onClick: () => applyFilter('active'), children: ["Active", _jsx("span", { className: css.count, children: activeCount })] }), _jsxs("button", { type: "button", className: `${css.filter} ${filter === 'issues' ? css.filterOn : ''}`, onClick: () => applyFilter('issues'), children: ["Issues", _jsx("span", { className: css.count, children: issueCount })] }), _jsx("span", { className: css.toolSpacer }), _jsx("span", { className: css.autoTag, children: "EVENT LOG" })] }), queuedMail.length > 0 && (_jsx("div", { className: css.attention, children: queuedMail.slice(0, 3).map(message => (_jsxs("span", { className: css.attentionMail, children: ["\u2709 ", message.from, " \u2192 ", message.to, " \u00B7 queued for the next turn"] }, message.id))) })), _jsx("div", { className: css.list, children: visible.map((node) => (_jsx(TaskRow, { node: node, index: nodes.indexOf(node), now: now, isLast: node === visible.at(-1), selected: node.key === selectedKey, onSelect: () => setSelectedKey(node.key === selectedKey ? undefined : node.key) }, node.key))) }), selected !== undefined && (_jsx(Inspector, { node: selected, members: members, onClose: () => setSelectedKey(undefined), openSession: openSession })), _jsxs("footer", { className: css.foot, children: [_jsxs("span", { children: ["\u25CF ", members.length, " members", runningCount > 0 ? ` · ${runningCount} running` : ''] }), _jsx("span", { className: css.footModel, children: members.find(m => m.model !== undefined)?.model ?? 'inherited route' })] })] }) }));
}
