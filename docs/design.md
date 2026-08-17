# team-task — Design

> A DeepSeek Harness (dsh) plugin for **long-horizon multi-agent tasks**: a lead
> session plans a reviewed DAG, durable members execute nodes, and a resident
> reconciler keeps the task moving — across model failures, interrupted turns,
> and harness restarts.
>
> 中文速览见 [README](../README.md#中文速览)。

## 1. Why another team plugin

[`dsh-agent-teams`](https://github.com/NanmiCoder/dsh-agent-teams) proved that
multi-agent teamwork fits dsh's capability seams beautifully. But its design
optimizes for *short cooperative bursts*. Long tasks fail differently:

| Failure mode | agent-teams behavior | team-task behavior |
|---|---|---|
| Member finishes but never calls the completion tool | task stuck `in_progress` forever; panel "reports disk truth as-is" | **runtime settles the run at the idle edge** — model ritual accelerates, never gates |
| Captain session goes offline | whole team frozen (scheduling is idle-edge only) | resident **reconciler timer** re-kicks every task; work resumes the moment the captain is back |
| First member hallucinates | `completed` unlocks dependents immediately | **review gate**: nothing unlocks until the lead approves; `rework` sends feedback back to the *same node* |
| Stale worker writes late | attempt-id capability (good) | same idea, one mechanism: **fence token on the event log** |
| Protocol prompt cost | full policy resident in every request | **progressive playbooks**: ~8-line resident trigger, full playbook loaded on demand |

## 2. Axioms

**A1 — One truth: an append-only event log.**
Task state is a projection of `<workspace>/.team-task/<taskId>/log.jsonl`.
No mutable `team.json` to reconcile, no in-memory registry to lose. The board
UI, the status tool, archival review, and offline verification all fold the
same events. (agent-teams' own conversation card already folds session events —
we promote that pattern to be the *only* source of truth.)

**A2 — Progress belongs to the runtime; expression belongs to the model.**
Every state-machine edge (`dispatched → running → settled → reviewed`) is
written by runtime hooks (delivery accepted, idle edge, reconciler verdict).
Model-facing tools *enrich* (output, completion claim, review verdict) but a
member that never calls a tool still settles. This is the single biggest
lesson from our host-side task subsystem (finalize-in-`finally`).

**A3 — The right to run is a fence, and stop = revoke.**
Each dispatch bumps the node's `fence`. Every completion claim and settle
carries the fence it belongs to; stale fences are rejected at append time,
under the log lock. Reassignment is not a message to the old worker — it is
the invalidation of its fence.

**A4 — Delivery is the scheduler's job, not the sender's.**
`team_task_send` only appends `message_sent` (durable). One scheduler —
triggered by idle edges, log writes, and the timer — owns all delivery
(`followup` to wake a member, `steer` to reach a running lead) and appends
`message_delivered`. A sender never needs the recipient (or the captain) to be
alive for the message to be safe.

**A5 — Event-driven first, reconciled always.**
Idle edges and tool calls call `kick()` for latency; a resident interval calls
the same `kick()` for liveness. `kick()` is idempotent and fence-guarded, so
double triggering is harmless. Crash recovery is not a special path: a node
stuck `running` with a non-running member is just another reconciler verdict
that flows through the normal settle pipeline.

## 3. Domain model

```
TeamTask
├── members[]   { name, role, playbook?, provider?, model?, effort?, sessionId }
├── nodes[]     { key, title, goal, dependsOn[], autoApprove, effort?,
│                 status, assignee?, fence, attempts, output?, feedback?, runs[] }
└── messages[]  { id, from, to, content, ts, deliveredAt? }
```

### Node state machine

```
            plan                     kick delivers            idle edge / reconciler
 pending ────────► dispatched(fence n) ────────► running ────────► awaiting_review
    ▲                                                                   │
    │            rework(feedback, attempts++)                 lead review│  autoApprove
    └───────────────────────────────────────────────◄── rework ────────┤  (mechanical
                                                        approve ───────►│   nodes skip
                                                                 approved◄─  the gate)
 cancelled  (lead may cancel any non-approved node)
```

- **Review is the default gate**: `approved` — not `settled` — unlocks
  dependents. A hallucinated result cannot poison downstream nodes.
- **`autoApprove: true`** is the fast lane the lead declares *at plan time* for
  mechanical nodes, so the lead does not become the review bottleneck.
  It only applies to a run that settled with a *claimed completion*; a
  runtime-settled (`turn_ended` / reconciler) run always waits for review.
- **`rework`** stores the lead's feedback on the node; the next dispatch's
  assignment prompt carries it, and `attempts` increments. Every run is kept in
  `runs[]` with its own fence and outcome — attempt history is first-class
  (Run ≠ node).

### Runs and settlement

`completion_claimed` (the member's `team_task_complete` call) marks intent and
carries output. The authoritative edge is `run_settled`, written by:

1. the **idle-edge observer** — member went idle: outcome `completed` if a
   valid claim exists, else `turn_ended` (the member "forgot the ritual");
2. the **reconciler** — node `running` but the member is not actually running
   (process restarted mid-run, driver died): outcome `turn_ended`, note
   `reconciler`;
3. **the same mutate** when the *lead itself* executes a node (no idle edge to
   wait for).

All three converge on one settle pipeline: notify the lead (durable message +
best-effort steer), auto-approve if eligible, kick dependents.

## 4. Progressive playbooks (skills-style loading)

The resident system-prompt section is a trigger only (~8 lines): *"for
long/multi-step goals, call `team_task_playbook('lead')` first"*. The full
protocol lives in packaged markdown served by the `team_task_playbook` tool:

- `lead` — plan discipline (node granularity, dependency wiring, autoApprove
  criteria), dispatch/await/review loop, recovery moves;
- `member` — fence rules, complete-before-idle, how to ask the lead/user;
- `recovery` — what the reconciler already did, what needs a human.

Members never load the lead playbook; their persona is a compact pointer.
Rationale: agent-teams pays its full policy in **every request of every
session**; we pay ~8 lines until a team task actually starts. The same
markdown ships under `skills/` for `npx skills add` compatibility.

## 5. Member role profiles (not just a model snapshot)

agent-teams snapshots the captain's provider/model/effort — good default, and
we keep it as the fallback. But a member is a *role*, not a clone:

```
team_task_add_member { name, role, playbook?, provider?, model?, effort? }
```

- omitted → snapshot the lead's current route (their good idea, kept);
- `provider`/`model` → heterogeneous teams (cheap model for mechanical roles);
- `effort` → per-member reasoning-effort hint, and `team_task_dispatch`
  accepts a per-node `effort_hint` — long tasks burn most budget in members,
  so effort placement is a first-class knob;
- `playbook` → a role-specific playbook name the member loads on demand,
  aligning with the identity/method/brain/equipment split we use for agents.

**Members spawn lazily.** `team_task_add_member` records the profile only;
the subagent is created by the scheduler at the member's *first node
dispatch*, with the assignment as its very first prompt. No welcome turn is
paid upfront, and there is no idle window in which an unassigned member can
freelance — the two failure modes observed when spawning at registration
(members burning tens of thousands of tokens on "recon" before any node was
ready for them).

## 6. Board UI (event-log native)

> Design for M2; the host data plane ships in M1 so the board is a pure client.

Not a disk-snapshot poller. The board **folds the same event log**:

- `GET /plugins/team-task/state` — projection per task (bootstrap);
- `GET /plugins/team-task/log?task=<id>&after=<seq>` — incremental events.

The client keeps `(projection, seq)` and applies deltas; on gap or restart it
re-bootstraps. Live and archived tasks render through the same fold — replay
is free because the log *is* the state.

Surfaces:

1. **Kanban lanes** `pending / dispatched·running / awaiting_review / approved`
   — cards show node key, assignee avatar, attempt count, fence, effort tag.
2. **DAG overlay** — dependency edges over the lanes; blocked nodes show which
   upstream approval they wait for (approval, not completion — the gate is
   visible).
3. **Attention strip** (the long-task heart): `awaiting_review` items with
   one-click approve/rework(+feedback), undelivered messages, reconciler
   verdicts (`turn_ended` settles), stalled dispatches. Everything needing a
   human, one strip.
4. **Run timeline per node** — every attempt with fence, outcome, feedback
   that triggered the retry; click-through to the member session.
5. **Replay slider** — drag `seq` to watch the task unfold (fold prefix of the
   log). Free by construction; impossible for snapshot-based boards.

## 7. What the runtime seams give us / still need upstream

Used today: `ctx.tools`, `ctx.subagents.startContinuable/followup/interrupt/
listChildren`, `ctx.agents` (+ `agent/status` idle edges), `steer`,
`ctx.systemPrompt.section`, web route registration.

Known seam limits (tracked for upstream issues):

1. **`followup` requires the live parent Agent** — member wake-ups still need
   the captain resident. The reconciler narrows the damage (resume on return),
   but a parentless wake needs an upstream seam.
2. **No turn-consumption receipt** — we mark `message_delivered` when the
   inbox accepts; if that turn is later aborted the message may go unread.
   True consumption-ack ("the turn that carried it committed") needs a seam.
3. **Out-of-repo session event types** are dropped by `session.append`
   vocabulary checks — the board reads our own log instead, so this costs us
   nothing, but conversation-flow cards for team events would want it.

## 8. Milestones

- **M1 (this repo, v0.1)** — host plugin end-to-end: tools, event log, fence,
  scheduler + reconciler, runtime settlement, review/rework, playbooks,
  offline verification, board data routes.
- **M2** — board UI client bundle (§6), conversation-flow cards.
- **M3** — consumption-ack + parentless wake (upstream seams), npm publish,
  cost/token accounting per run.
