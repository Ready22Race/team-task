/**
 * Offline verification of the event log + state machine: fences, the review
 * gate, rework feedback, runtime settlement, message delivery marks.
 * Runs against the built lib/ (no dsh needed): `pnpm build && pnpm verify`.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendFile, readFile } from 'node:fs/promises'
import {
  mutateTask, readState, project, readLog, hasCurrentClaim,
  readyNodes, unsatisfiedDependencies, openNodeOf, undeliveredTo, identityOf, createMessage,
} from '../lib/log.js'

const root = mkdtempSync(join(tmpdir(), 'team-task-verify-'))
const T = 'demo'
let failures = 0

async function expectReject(promise, pattern, label) {
  try {
    await promise
    console.error(`✗ ${label}: expected rejection`)
    failures += 1
  } catch (error) {
    assert.match(String(error.message ?? error), pattern, label)
    console.log(`✓ ${label}`)
  }
}

function ok(label) { console.log(`✓ ${label}`) }

// --- create + plan -----------------------------------------------------------
await mutateTask(root, T, () => [
  { type: 'task_created', id: T, name: 'Demo', goal: 'ship the demo', leadSessionId: 'lead-1' },
  { type: 'node_planned', node: { key: 'a', title: 'collect', autoApprove: true } },
  { type: 'node_planned', node: { key: 'b', title: 'analyze', dependsOn: ['a'] } },
  { type: 'node_planned', node: { key: 'c', title: 'report', dependsOn: ['b'] } },
])
let s = await readState(root, T)
assert.equal(s.nodes.length, 3)
assert.deepEqual(readyNodes(s).map(n => n.key), ['a'], 'only a is ready')
assert.deepEqual(unsatisfiedDependencies(s, s.nodes[1]), ['a'])
ok('create + plan DAG; readiness honors dependencies')

await expectReject(
  mutateTask(root, T, () => [{ type: 'node_planned', node: { key: 'a', title: 'dup' } }]),
  /already exists/, 'duplicate node key rejected',
)

// --- member (lazy spawn) + dispatch + fence ---------------------------------
await mutateTask(root, T, () => [
  { type: 'member_added', member: { name: 'worker', role: 'researcher', sessionId: '' } },
])
s = await readState(root, T)
assert.equal(s.members[0].sessionId, '', 'member registered unspawned (lazy)')
await mutateTask(root, T, () => [
  { type: 'node_dispatched', key: 'a', assignee: 'worker', fence: 1 },
  { type: 'member_spawned', name: 'worker', sessionId: 'sess-w' },
  { type: 'run_started', key: 'a', fence: 1, sessionId: 'sess-w' },
])
await expectReject(
  mutateTask(root, T, () => [{ type: 'member_spawned', name: 'worker', sessionId: 'sess-x' }]),
  /already spawned/, 'double spawn rejected',
)
s = await readState(root, T)
assert.equal(identityOf(s, 'sess-w').member.name, 'worker')
assert.equal(identityOf(s, 'lead-1').kind, 'lead')
assert.equal(openNodeOf(s, 'worker').key, 'a')
assert.equal(s.nodes[0].status, 'running')
assert.equal(s.nodes[0].attempts, 1)
ok('dispatch + run_started; identity + open-node queries')

await expectReject(
  mutateTask(root, T, () => [{ type: 'completion_claimed', key: 'a', fence: 99, output: 'late' }]),
  /stale fence/, 'stale completion fence rejected',
)
await expectReject(
  mutateTask(root, T, () => [{ type: 'node_dispatched', key: 'a', assignee: 'worker', fence: 2 }]),
  /not pending/, 'double dispatch rejected',
)

// --- claimed completion + auto-approve fast lane -----------------------------
await mutateTask(root, T, () => [
  { type: 'completion_claimed', key: 'a', fence: 1, output: 'collected 5 files' },
  { type: 'run_settled', key: 'a', fence: 1, outcome: 'completed', settledBy: 'idle-edge' },
  { type: 'node_reviewed', key: 'a', verdict: 'approve', feedback: 'auto-approved (fast lane)' },
])
s = await readState(root, T)
assert.equal(s.nodes[0].status, 'approved')
assert.equal(s.nodes[0].runs[0].outcome, 'completed')
assert.deepEqual(readyNodes(s).map(n => n.key), ['b'], 'approval unlocked b')
ok('claimed settle + fast lane approve unlocks dependents')

// --- runtime settlement (no claim) + review gate -----------------------------
await mutateTask(root, T, () => [
  { type: 'node_dispatched', key: 'b', assignee: 'worker', fence: 1 },
  { type: 'run_started', key: 'b', fence: 1, sessionId: 'sess-w' },
  { type: 'completion_claimed', key: 'b', fence: 1, output: 'analysis v1' },
  { type: 'run_settled', key: 'b', fence: 1, outcome: 'turn_ended', settledBy: 'reconciler', note: 'member was not running' },
])
s = await readState(root, T)
assert.equal(s.nodes[1].status, 'awaiting_review', 'unclaimed settle waits for review')
assert.deepEqual(readyNodes(s), [], 'c stays blocked: settle does NOT unlock — approval does')
ok('runtime settlement lands in awaiting_review; gate holds dependents')

// --- rework carries feedback, attempts increment -----------------------------
await mutateTask(root, T, () => [
  { type: 'node_reviewed', key: 'b', verdict: 'rework', feedback: 'cite sources; re-run the numbers' },
])
s = await readState(root, T)
assert.equal(s.nodes[1].status, 'pending')
assert.equal(s.nodes[1].feedback, 'cite sources; re-run the numbers')
await mutateTask(root, T, () => [
  { type: 'node_dispatched', key: 'b', assignee: 'worker', fence: 2 },
  { type: 'run_started', key: 'b', fence: 2, sessionId: 'sess-w' },
])
s = await readState(root, T)
assert.equal(s.nodes[1].attempts, 2)
assert.equal(s.nodes[1].runs.length, 2)
ok('rework: feedback stored, same node redispatched, attempt history kept')

await expectReject(
  mutateTask(root, T, () => [{ type: 'run_settled', key: 'b', fence: 1, outcome: 'completed', settledBy: 'idle-edge' }]),
  /stale settle fence/, 'stale settle from the reworked attempt rejected',
)

// review P1-1: attempt 1 claimed, rework, attempt 2 (fence 2) has NOT
// claimed — the old output must not count as the new attempt's completion.
{
  const nodeB = s.nodes.find(n => n.key === 'b')
  assert.equal(nodeB.output, 'analysis v1', 'old output retained for display')
  assert.equal(nodeB.claimedFence, 1, 'claim belongs to fence 1')
  assert.equal(nodeB.fence, 2, 'current attempt is fence 2')
  assert.equal(hasCurrentClaim(nodeB), false, 'stale claim is NOT a current claim')
  ok('P1-1: stale output cannot settle the reworked attempt as completed')
}

await mutateTask(root, T, () => [
  { type: 'completion_claimed', key: 'b', fence: 2, output: 'analysis v2 with sources' },
  { type: 'run_settled', key: 'b', fence: 2, outcome: 'completed', settledBy: 'idle-edge' },
  { type: 'node_reviewed', key: 'b', verdict: 'approve' },
])
s = await readState(root, T)
assert.deepEqual(readyNodes(s).map(n => n.key), ['c'], 'approve unlocks c')
ok('review approve unlocks the chain')

// --- plan routing table (pre-assignment) ------------------------------------
await mutateTask(root, T, () => [
  { type: 'node_planned', node: { key: 'r1', title: 'routed', dependsOn: ['b'], assignee: 'worker' } },
])
s = await readState(root, T)
const routed = s.nodes.find(n => n.key === 'r1')
assert.equal(routed.assignee, 'worker', 'plan carries the routing table')
assert.equal(routed.status, 'pending')
assert.deepEqual(readyNodes(s).filter(n => n.assignee === 'worker').map(n => n.key), ['r1'],
  'pre-assigned ready node is auto-flow eligible')
await mutateTask(root, T, () => [{ type: 'node_cancelled', key: 'r1' }])
ok('pre-assigned node: plan is the routing table')

// --- plan graph invariants (review P2-4) ------------------------------------
await expectReject(
  mutateTask(root, T, () => [{ type: 'node_planned', node: { key: 'g1', title: 'self', dependsOn: ['g1'] } }]),
  /depends on itself/, 'self-dependency rejected',
)
await expectReject(
  mutateTask(root, T, () => [{ type: 'node_planned', node: { key: 'g2', title: 'ghost', dependsOn: ['nope'] } }]),
  /unknown node/, 'missing dependency rejected',
)
await expectReject(
  mutateTask(root, T, () => [
    { type: 'node_planned', node: { key: 'g3', title: 'x', dependsOn: ['g4'] } },
    { type: 'node_planned', node: { key: 'g4', title: 'y', dependsOn: ['g3'] } },
  ]),
  /cycle/, 'dependency cycle rejected (whole batch, nothing written)',
)
s = await readState(root, T)
assert.equal(s.nodes.some(n => n.key.startsWith('g')), false, 'rejected graph events left no trace')
ok('P2-4: graph invariants — existence, self-edge, cycle')

// --- torn tail recovery (review P1-2) ---------------------------------------
{
  const T2 = 'torn'
  await mutateTask(root, T2, () => [
    { type: 'task_created', id: T2, name: 'Torn', goal: 'g', leadSessionId: 'lead-2' },
  ])
  const logFile = `${root}/tasks/${T2}/log.jsonl`
  await appendFile(logFile, '{"seq":9,"type":"node_pla', 'utf8')   // crash mid-write
  const after = await mutateTask(root, T2, () => [
    { type: 'node_planned', node: { key: 'ok', title: 'post-crash node' } },
  ])
  assert.equal(after.state.nodes.length, 1, 'append after torn tail lands cleanly')
  const rawLines = (await readFile(logFile, 'utf8')).trim().split('\n')
  for (const line of rawLines) JSON.parse(line)   // every line parses
  assert.equal(rawLines.length, 2, 'torn fragment truncated, not concatenated')
  const replayT2 = project(await readLog(root, T2))
  assert.equal(replayT2.nodes[0].key, 'ok')
  ok('P1-2: torn tail truncated under the lock; log stays parseable')
}

// --- durable messages --------------------------------------------------------
const msg = createMessage('worker', 'lead', 'b is done, see analysis v2')
await mutateTask(root, T, () => [{ type: 'message_sent', message: msg }])
s = await readState(root, T)
assert.equal(undeliveredTo(s, 'lead').length, 1)
await mutateTask(root, T, () => [{ type: 'message_delivered', id: msg.id }])
s = await readState(root, T)
assert.equal(undeliveredTo(s, 'lead').length, 0)
ok('message durable-first; delivery mark clears the queue')

// --- finish + projection determinism ----------------------------------------
await mutateTask(root, T, () => [
  { type: 'node_cancelled', key: 'c' },
  { type: 'member_retired', name: 'worker' },
  { type: 'task_finished', status: 'completed', summary: 'demo shipped' },
])
await expectReject(
  mutateTask(root, T, () => [{ type: 'task_finished', status: 'completed' }]),
  /already finished/, 'double finish rejected',
)
const lines = await readLog(root, T)
const replayed = project(lines)
s = await readState(root, T)
assert.deepEqual(replayed, s, 'projection is a pure fold (replay == state)')
assert.equal(replayed.finishStatus, 'completed')
assert.equal(lines.at(-1).seq, lines.length, 'seq is dense and monotonic')
ok('finish + full-log replay determinism (the board contract)')

rmSync(root, { recursive: true, force: true })
if (failures > 0) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log('\nteam-task verify: all checks passed')
