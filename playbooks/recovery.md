# team-task recovery playbook

What the runtime already does on its own, and what genuinely needs you.

## Already automatic — do not re-plan around these

- **Unclaimed settles**: a member that ended its turn without
  `team_task_complete` is settled `turn_ended` at its idle edge; the node
  waits in `awaiting_review` with whatever is on disk.
- **Lost runs**: a node `running` whose member is not actually running
  (interrupt, crash, harness restart) is settled by the reconciler through
  the same pipeline, note `member was not running`.
- **Lost wake-ups**: a `dispatched` node whose member never started is
  redelivered on the next kick; redelivery is fence-safe.
- **Durable mail**: undelivered messages are retried at every kick; nothing
  is lost when a recipient (or the lead) is temporarily offline.
- **Stale writers**: any write carrying an old fence is rejected at the log.

## Needs the lead

- Review every `awaiting_review` node — especially `turn_ended` settles:
  inspect actual disk state, then `approve` or `rework` with concrete
  feedback.
- A node failing repeatedly (attempts climbing) usually means the node is
  mis-scoped: split it with `team_task_plan` instead of re-dispatching.
- A member whose profile is wrong for the role: add a better-profiled member
  and cancel/reassign; members are cheap, mis-assignments are not.

## Needs a human

- The goal itself is ambiguous or the deliverable acceptance is unclear.
- Repeated rework converges nowhere after ~3 attempts on the same node.
- Anything involving credentials, spending, or irreversible external actions.
