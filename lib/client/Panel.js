import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { progressOf } from "./board-model.js";
import css from './Panel.module.css';
/** Window event the conversation card fires to (re)open the board. */
export const OPEN_BOARD_EVENT = 'team-task:open-board';
/** Stable avatar hue per member name (theme-agnostic accent). */
function avatarColor(name) {
    let hash = 0;
    for (let index = 0; index < name.length; index += 1) {
        hash = ((hash << 5) - hash + name.charCodeAt(index)) | 0;
    }
    const hue = ((hash % 360) + 360) % 360;
    return `hsl(${hue} 42% 46%)`;
}
function initialOf(name) {
    const first = [...name.trim()][0];
    return first === undefined ? '?' : first.toUpperCase();
}
function segmentClass(node) {
    switch (node.status) {
        case 'approved': return `${css.segment} ${css.segmentApproved}`;
        case 'running':
        case 'dispatched': return `${css.segment} ${css.segmentRunning}`;
        case 'awaiting_review': return `${css.segment} ${css.segmentReview}`;
        case 'cancelled': return `${css.segment} ${css.segmentCancelled}`;
        default: return css.segment ?? '';
    }
}
function railOf(node) {
    switch (node.status) {
        case 'approved': return { className: `${css.rail} ${css.railApproved}`, glyph: '✓' };
        case 'running':
        case 'dispatched': return { className: `${css.rail} ${css.railRunning}`, glyph: '' };
        case 'awaiting_review': return { className: `${css.rail} ${css.railReview}`, glyph: '!' };
        case 'cancelled': return { className: `${css.rail} ${css.railCancelled}`, glyph: '×' };
        default: return { className: `${css.rail} ${css.railPending}`, glyph: '·' };
    }
}
function StepRow({ node, members, isLast, openSession }) {
    const rail = railOf(node);
    const outcome = node.runs.at(-1)?.outcome;
    const assignee = node.assignee === undefined
        ? undefined
        : members.find(m => m.name === node.assignee);
    const blocked = node.status === 'pending' && node.dependsOn.length > 0;
    const titleClass = node.status === 'cancelled'
        ? `${css.nodeTitle} ${css.titleStruck}`
        : blocked ? `${css.nodeTitle} ${css.titleDim}` : css.nodeTitle;
    const meta = [];
    if (node.assignee !== undefined) {
        meta.push(_jsxs("span", { className: css.assigneeMini, style: assignee === undefined ? undefined : { cursor: 'pointer' }, onClick: () => { if (assignee !== undefined && assignee.sessionId !== '')
                openSession(assignee.sessionId); }, children: [_jsx("span", { className: css.miniAvatar, style: { background: avatarColor(node.assignee) }, children: initialOf(node.assignee) }), node.assignee] }, "assignee"));
    }
    if (node.status === 'awaiting_review') {
        meta.push(_jsx("span", { className: outcome === 'completed' ? css.metaOk : css.metaWarn, children: outcome === 'completed' ? 'claimed · review' : 'settled without claim' }, "review"));
    }
    if (node.attempts > 1)
        meta.push(_jsxs("span", { className: css.metaWarn, children: ["attempt ", node.attempts] }, "attempts"));
    if (node.autoApprove && node.status !== 'approved')
        meta.push(_jsx("span", { children: "fast-lane" }, "fast"));
    if (blocked)
        meta.push(_jsxs("span", { children: ["waits: ", node.dependsOn.join(', ')] }, "deps"));
    return (_jsxs("div", { className: css.step, children: [_jsxs("div", { className: css.railWrap, children: [_jsx("span", { className: rail.className, children: rail.glyph }), _jsx("span", { className: `${css.railLine} ${isLast ? css.railLineHidden : ''}` })] }), _jsxs("div", { className: css.stepBody, children: [_jsxs("div", { className: css.stepTop, children: [_jsx("span", { className: css.nodeKey, children: node.key }), _jsx("span", { className: titleClass, title: node.goal ?? node.title, children: node.title })] }), meta.length > 0 && _jsx("div", { className: css.stepMeta, children: meta })] })] }));
}
function TaskBoard({ task, openSession }) {
    const reviews = task.state.nodes.filter(n => n.status === 'awaiting_review');
    const queuedMail = task.state.messages.filter(m => m.deliveredAt === undefined);
    const members = task.state.members.filter(m => m.retired !== true);
    const nodes = task.state.nodes;
    return (_jsxs("div", { className: css.body, children: [task.state.finishedAt !== undefined && (_jsxs("div", { className: css.finished, children: ["finished \u00B7 ", task.state.finishStatus] })), (reviews.length > 0 || queuedMail.length > 0) && (_jsxs("div", { className: css.attention, children: [reviews.map(node => (_jsxs("span", { className: css.attentionReview, children: [_jsx("span", { className: css.attentionIcon, children: "\u26A0" }), "review ", node.key, " \u00B7 ", node.runs.at(-1)?.outcome === 'completed' ? 'claimed complete' : 'settled without claim'] }, node.key))), queuedMail.map(message => (_jsxs("span", { className: css.attentionMail, children: [_jsx("span", { className: css.attentionIcon, children: "\u2709" }), message.from, " \u2192 ", message.to, " \u00B7 queued for the next turn"] }, message.id)))] })), members.length > 0 && (_jsx("div", { className: css.members, children: members.map((member) => {
                    const activity = member.sessionId === '' ? 'ready' : (task.activity[member.name] ?? 'ready');
                    const dotClass = activity === 'running' ? css.statusRunning : activity === 'idle' ? css.statusIdle : css.statusReady;
                    return (_jsxs("button", { type: "button", className: css.member, title: `${member.role} — ${activity}${member.model !== undefined ? ` · ${member.model}` : ''}`, onClick: () => { if (member.sessionId !== '')
                            openSession(member.sessionId); }, children: [_jsxs("span", { className: css.avatar, style: { background: avatarColor(member.name) }, children: [initialOf(member.name), _jsx("span", { className: `${css.statusDot} ${dotClass}` })] }), _jsx("span", { className: css.memberName, children: member.name })] }, member.name));
                }) })), _jsx("div", { className: css.plan, children: nodes.map((node, index) => (_jsx(StepRow, { node: node, members: members, isLast: index === nodes.length - 1, openSession: openSession }, node.key))) })] }));
}
/** The floater. Board ↔ pill (–) ↔ hidden (×); session-follow. */
export function Panel({ sessionsList, openSession }) {
    const [tasks, setTasks] = useState([]);
    const [mode, setMode] = useState('pill');
    const [autoOpenedFor, setAutoOpenedFor] = useState('');
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
        const timer = setInterval(() => { void tick(); }, 1500);
        return () => { cancelled = true; clearInterval(timer); };
    }, []);
    useEffect(() => {
        const onOpen = () => { setMode('board'); };
        window.addEventListener(OPEN_BOARD_EVENT, onOpen);
        return () => window.removeEventListener(OPEN_BOARD_EVENT, onOpen);
    }, []);
    const mine = useMemo(() => tasks.filter(t => current !== undefined && t.state.leadSessionId === current), [tasks, current]);
    const task = mine.find(t => t.state.finishedAt === undefined) ?? mine.at(-1);
    // Auto-expand once per task; the user's – / × afterwards is respected.
    useEffect(() => {
        if (task !== undefined && task.state.id !== autoOpenedFor) {
            setAutoOpenedFor(task.state.id);
            setMode('board');
        }
    }, [task, autoOpenedFor]);
    if (task === undefined || mode === 'hidden')
        return null;
    const progress = progressOf(task.state);
    const anyRunning = Object.values(task.activity).includes('running');
    if (mode === 'pill') {
        return (_jsx("div", { className: css.host, children: _jsxs("button", { type: "button", className: css.pill, onClick: () => setMode('board'), children: [anyRunning && _jsx("span", { className: css.pulse }), task.state.name, _jsxs("span", { className: css.pillCount, children: [progress.done, "/", progress.total] })] }) }));
    }
    return (_jsx("div", { className: css.host, children: _jsxs("section", { className: css.board, "data-team-task-board": true, children: [_jsxs("header", { className: css.head, children: [_jsx("span", { className: css.title, title: task.state.goal, children: task.state.name }), _jsxs("span", { className: css.percent, children: [progress.done, "/", progress.total] }), _jsx("button", { type: "button", className: css.headButton, title: "\u6536\u8D77", onClick: () => setMode('pill'), children: "\u2013" }), _jsx("button", { type: "button", className: css.headButton, title: "\u5173\u95ED", onClick: () => setMode('hidden'), children: "\u00D7" })] }), _jsx("div", { className: css.segments, children: task.state.nodes.map(node => _jsx("span", { className: segmentClass(node), title: `${node.key} · ${node.status}` }, node.key)) }), _jsx(TaskBoard, { task: task, openSession: openSession })] }) }));
}
