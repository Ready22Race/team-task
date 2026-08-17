/** Ad-hoc probe of the v2 storage layout (tasks/ list + snapshot + inbox). */
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listTaskIds, mintTaskId, mutateTask } from '../lib/log.js'

const root = mkdtempSync(join(tmpdir(), 'team-task-layout-'))
const id = mintTaskId('竞品分析示例任务', new Date())
await mutateTask(root, id, () => [
  { type: 'task_created', id, name: '竞品分析示例任务', goal: 'demo', leadSessionId: 'lead-1' },
  { type: 'member_added', member: { name: 'researcher', role: 'r', sessionId: '' } },
  { type: 'message_sent', message: { id: 'm1', from: 'lead', to: 'researcher', content: 'hi', ts: Date.now() } },
])
console.log('id:', id)
console.log('list:', await listTaskIds(root))
const walk = (dir, prefix = '') => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, `${prefix}${name}/`)
    else console.log('file:', `${prefix}${name}`)
  }
}
walk(root)
const snapshot = JSON.parse(readFileSync(join(root, 'tasks', id, 'snapshot.json'), 'utf8'))
console.log('snapshot keys:', Object.keys(snapshot).join(','), '| members:', snapshot.members.length)
console.log('inbox researcher:', readFileSync(join(root, 'tasks', id, 'inbox', 'researcher.jsonl'), 'utf8').trim())
rmSync(root, { recursive: true, force: true })
console.log('layout check ok')
