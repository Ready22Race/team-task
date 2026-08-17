/**
 * Durable team-task domain types.
 *
 * The single source of truth is an append-only event log
 * (`<workspace>/<stateDir>/<taskId>/log.jsonl`); everything in this module is
 * either an event on that log or a pure projection of it (design.md A1).
 * @module team-task/types
 */
/** Statuses that unblock nothing and accept no further runs. */
export const TERMINAL_NODE_STATUSES = ['approved', 'cancelled'];
/** Mailbox key of the lead. */
export const LEAD_KEY = 'lead';
