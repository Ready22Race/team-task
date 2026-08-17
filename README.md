# team-task — long-horizon multi-agent tasks for DeepSeek Harness

A [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness)
plugin: a **lead** session plans a reviewed DAG, durable **members** execute
its nodes, and a resident reconciler keeps the task moving — across model
failures, interrupted turns, and harness restarts.

Built for goals that take hours, not turns.

## Why

Team plugins optimized for short bursts fail on long tasks in predictable
ways. team-task's answers, in one table:

| Long-task failure | team-task answer |
|---|---|
| A member finishes but never calls the completion tool | **Runtime-owned settlement**: the run settles at its idle edge regardless; tools accelerate, never gate |
| The lead session goes offline mid-task | **Resident reconciler** re-kicks every task on a timer; work resumes the moment the lead returns |
| An early hallucination poisons downstream work | **Review gate**: only lead `approve` unlocks dependents; `rework` sends feedback back to the *same node*, attempts are first-class history |
| A reassigned worker writes a late result | **Fence tokens** on an append-only event log; stale fences are rejected at the log, not by etiquette |
| Crashed process, lost wake-ups, stranded messages | The event log is the only truth; delivery is the scheduler's job and is retried at every kick |
| Protocol prompt tax in every request | **Progressive playbooks**: ~8-line resident trigger; lead/member protocols load on demand via `team_task_playbook` |

Full rationale, axioms, state machine, and the event-log-native board design:
[docs/design.md](docs/design.md).

## Install

Requires a working dsh installation (`npx @deepseek-ai/dsh web`; Node
`^22.19 || >=24`).

From npm:

```sh
dsh plugin --profile web add @ready22race/dsh-team-task
```

Or straight from GitHub (the repo ships its build output — no build step):

```sh
dsh plugin --profile web add github:Ready22Race/dsh-team-task
```

From source:

```sh
git clone https://github.com/Ready22Race/dsh-team-task.git
cd dsh-team-task && pnpm install && pnpm build
dsh plugin --profile web add .
```

Validate and restart:

```sh
dsh --profile web --dump-config   # expect an `id: team-task` row
dsh web
```

Then ask:

> Use team-task to research X across three angles, review each result, and
> merge them into one report.

## Tools

| Tool | Who | What |
|---|---|---|
| `team_task_playbook` | anyone | Load the lead / member / recovery protocol on demand |
| `team_task_create` | lead | Create the task (+ optional initial plan DAG) |
| `team_task_add_member` | lead | Spawn a durable member with a **role profile** (provider/model/effort/playbook; omitted fields inherit the lead's route) |
| `team_task_plan` | lead | Add / update / cancel plan nodes |
| `team_task_dispatch` | lead | Dispatch a node (fence++), to a member, the shared pool, or the lead itself |
| `team_task_await` | lead | Block until review work exists or all nodes settle — instead of polling |
| `team_task_complete` | assignee | Claim completion with the current fence + a self-contained output |
| `team_task_review` | lead | `approve` (unlocks dependents) or `rework` (feedback required, carried into the next attempt) |
| `team_task_send` | anyone | Durable message to lead or teammate; scheduler delivers |
| `team_task_status` | anyone | Snapshot: nodes, runs, fences, member activity, attention list, your inbox |
| `team_task_finish` | lead | Close and archive (full event history and every run retained) |

## Storage

```
<workspace>/.team-task/
└── tasks/                                  # the task list, chronologically sorted
    └── 20260816-2145-竞品分析示例任务/       # id = created-at stamp + name slug (CJK kept)
        ├── log.jsonl        # append-only event log — the ONLY truth
        ├── snapshot.json    # latest projection (team situation + nodes + seq); derived
        └── inbox/
            ├── lead.jsonl   # per-recipient mailbox mirror; derived, human-readable
            └── <member>.jsonl
```

`log.jsonl` is the single source of truth; every surface (tools, board
routes, offline verify) folds the same events, and any historical "team
situation at time T" is a replay of the log prefix. `snapshot.json` and
`inbox/` are write-through **derived views** for humans — safe to read,
never written by hand, and never read back by the code.

## Configuration

```yaml
- id: team-task
  config:
    stateDir: .team-task
    memberProvider: spawn      # subagent runtime backend, not an LLM provider
    memberMaxDepth: 1
    maxMembers: 8
    reconcileIntervalMs: 30000
```

## Development

```sh
pnpm install
pnpm build
pnpm verify   # offline: fences, review gate, rework, settlement, replay determinism
```

## Status & roadmap

- **M1 (this release)** — host plugin end-to-end: tools, event log, fences,
  scheduler + reconciler, runtime settlement, review/rework, playbooks, board
  data routes (`/plugins/team-task/state`, `/plugins/team-task/log`).
- **M2** — the event-log-native board UI (kanban lanes + DAG overlay +
  attention strip + per-node run timeline + replay slider; design.md §6).
- **M3** — consumption-acked delivery and parentless member wake (needs
  upstream seams; tracked in design.md §7), npm publish, per-run cost
  accounting.

Known limits (v0.1): member wake-ups still require the live lead Agent (an
upstream `followup` constraint — the reconciler resumes work when the lead
returns); `message_delivered` marks inbox acceptance, not turn consumption.

## 中文速览

team-task 是面向**长任务**的 dsh 多智能体插件：lead 规划一张**需评审的
DAG**，durable member 执行节点，常驻 reconciler 保证崩溃/重启后任务继续。

核心主张（详见 [docs/design.md](docs/design.md)）：

1. **事件日志是唯一真相** —— 状态是 `log.jsonl` 的纯投影，看板/工具/验证
   折叠同一份事件，重放即历史。
2. **进度归运行时，表达归模型** —— 成员不调完成工具也会在 idle 边被结算；
   工具只是加速，不是闸门。
3. **fence 即运行权** —— 每次派发递增 fence，旧 fence 的迟到写入在日志层
   被拒；停止 = 撤销 fence，不是发消息。
4. **投递归调度器** —— 消息先落日志（立即安全），调度器在 idle 边 / 定时
   sweep 时投递；没有"队长在线才能通信"。
5. **评审是默认闸门** —— 只有 lead `approve` 才解锁下游；`rework` 必须带
   反馈，原节点重派、attempt 历史完整保留；机械节点可声明 `auto_approve`
   走快速档。
6. **渐进式 playbook** —— 常驻 prompt 只有 ~8 行触发器，完整协议按角色
   （lead / member / recovery）用 `team_task_playbook` 按需加载。

## License

[MIT](LICENSE)
