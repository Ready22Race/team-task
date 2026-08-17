/**
 * team-task conversation card: the durable in-conversation anchor for one
 * task — name, goal, live node/member counts, and a button that (re)opens
 * the board floater. Folds from the first-party `team_task_create` tool
 * records; live counts poll the same projection route as the board.
 * @module team-task/client/card
 */
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
/** Complete keyed Chat renderer props. */
export type TeamTaskCardProps = PropsRuntime<'conversation.chat.node', 'team-task'>;
/** Render one durable task as a compact conversation card. */
export declare function TeamTaskCard({ node }: TeamTaskCardProps): import("react").JSX.Element;
