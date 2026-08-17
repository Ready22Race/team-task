import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * team-task conversation card: the durable in-conversation anchor for one
 * task — name, goal, live node/member counts, and a button that (re)opens
 * the board floater. Folds from the first-party `team_task_create` tool
 * records; live counts poll the same projection route as the board.
 * @module team-task/client/card
 */
import { useEffect, useState } from 'react';
import { progressOf } from "./board-model.js";
import { OPEN_BOARD_EVENT } from "./Panel.js";
import css from './TeamTaskCard.module.css';
/** Render one durable task as a compact conversation card. */
export function TeamTaskCard({ node }) {
    const data = node.data;
    const [live, setLive] = useState();
    useEffect(() => {
        let cancelled = false;
        const tick = async () => {
            try {
                const response = await fetch('/plugins/team-task/state', { cache: 'no-store' });
                if (!response.ok)
                    return;
                const body = (await response.json());
                const found = Array.isArray(body.tasks)
                    ? body.tasks.find(t => t.state.id === data.taskId)
                    : undefined;
                if (!cancelled)
                    setLive(found);
            }
            catch {
                // Host restarting; retry next poll.
            }
        };
        void tick();
        const timer = setInterval(() => { void tick(); }, 2500);
        return () => { cancelled = true; clearInterval(timer); };
    }, [data.taskId]);
    const progress = live === undefined ? undefined : progressOf(live.state);
    const members = live?.state.members.filter(m => m.retired !== true).length;
    const finished = live?.state.finishStatus;
    return (_jsxs("section", { className: css.root, "data-team-task-card": true, "data-task-id": data.taskId, children: [_jsxs("header", { className: css.head, children: [_jsx("span", { className: css.mark, children: "T" }), _jsx("span", { className: css.name, children: live?.state.name ?? data.taskName }), _jsx("span", { className: css.tag, children: "team-task" })] }), (live?.state.goal ?? data.goal) !== '' && _jsx("p", { className: css.goal, children: live?.state.goal ?? data.goal }), _jsxs("footer", { className: css.foot, children: [_jsx("span", { className: css.meta, children: finished !== undefined
                            ? `finished: ${finished}`
                            : progress === undefined
                                ? `${data.seededNodes} nodes planned`
                                : `${progress.done}/${progress.total} approved · ${members ?? 0} members` }), _jsx("button", { type: "button", className: css.boardButton, onClick: () => { window.dispatchEvent(new CustomEvent(OPEN_BOARD_EVENT)); }, children: "\u770B\u677F board" })] })] }));
}
