import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The team-task mark: one lead node wired to three worker nodes — the plugin's
 * identity glyph, readable at 14px as "a team" and at 28px as "a plan DAG".
 * Shared by the conversation card and the board header so both surfaces carry
 * the same symbol.
 * @module team-task/client/mark
 */
/** Lead + 3 workers, connected. `currentColor` so callers own the color. */
export function TeamMark({ size = 16 }) {
    return (_jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", "aria-hidden": "true", children: [_jsx("path", { d: "M12 8.6v3.2M12 12.6 6.6 15.4M12 12.6l5.4 2.8", opacity: "0.55" }), _jsx("circle", { cx: "12", cy: "6", r: "2.6", fill: "currentColor", stroke: "none" }), _jsx("circle", { cx: "5", cy: "17.4", r: "2.2" }), _jsx("circle", { cx: "12", cy: "14.6", r: "2.2" }), _jsx("circle", { cx: "19", cy: "17.4", r: "2.2" })] }));
}
