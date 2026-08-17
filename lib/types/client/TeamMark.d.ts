/**
 * The team-task mark: one lead node wired to three worker nodes — the plugin's
 * identity glyph, readable at 14px as "a team" and at 28px as "a plan DAG".
 * Shared by the conversation card and the board header so both surfaces carry
 * the same symbol.
 * @module team-task/client/mark
 */
/** Lead + 3 workers, connected. `currentColor` so callers own the color. */
export declare function TeamMark({ size }: {
    size?: number;
}): import("react").JSX.Element;
