'use strict'
// Talks to the server over stdio like an MCP client would, and runs the shell commands against the same board.
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn, execFileSync } = require('child_process')

const SERVER = path.join(__dirname, 'index.js')

function client(env, cwd) {
  const child = spawn(process.execPath, [SERVER], { env: { ...process.env, ...env }, cwd })
  const waiting = new Map()
  let buffer = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    let index
    while ((index = buffer.indexOf('\n')) >= 0) {
      const message = JSON.parse(buffer.slice(0, index))
      buffer = buffer.slice(index + 1)
      waiting.get(message.id)?.(message)
    }
  })
  let next = 1
  const request = (method, params) => new Promise((resolve) => {
    const id = next++
    waiting.set(id, resolve)
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
  return { request, close: () => child.kill() }
}

test('two clients share one project board', async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'board-'))
  const claude = client({ AGENTVERA_BLACKBOARD_FILE: '', AGENTVERA_AGENT_NAME: '' }, project)
  const codex = client({ AGENTVERA_BLACKBOARD_FILE: '', AGENTVERA_AGENT_NAME: '' }, project)
  try {
    const init = await claude.request('initialize', { protocolVersion: '2025-06-18', clientInfo: { name: 'claude-code', version: '2' }, capabilities: {} })
    assert.equal(init.result.serverInfo.name, 'agentvera-board')
    await codex.request('initialize', { protocolVersion: '2025-06-18', clientInfo: { name: 'codex-mcp-client', version: '1' }, capabilities: {} })

    const list = await claude.request('tools/list', {})
    assert.deepEqual(list.result.tools.map((t) => t.name), ['board_read', 'board_post', 'board_update'])

    const posted = await claude.request('tools/call', { name: 'board_post', arguments: { kind: 'todo', title: 'Write tests for auth', path: 'src/auth' } })
    const id = posted.result.content[0].text.replace('Posted ', '')
    await codex.request('tools/call', { name: 'board_post', arguments: { kind: 'decision', title: 'Use JWT' } })

    const read = (await codex.request('tools/call', { name: 'board_read', arguments: {} })).result.content[0].text
    assert.match(read, /todo ☐ · Write tests for auth \(src\/auth\) — claude-code/)
    assert.match(read, /decision · Use JWT — codex-mcp-client/)

    await codex.request('tools/call', { name: 'board_update', arguments: { id, done: true } })
    const open = (await claude.request('tools/call', { name: 'board_read', arguments: { open_todos_only: true } })).result.content[0].text
    assert.equal(open, 'The board is empty.')

    const bad = await claude.request('tools/call', { name: 'board_post', arguments: { kind: 'oops', title: 'x' } })
    assert.equal(bad.result.isError, true)
    assert.ok(fs.existsSync(path.join(project, '.agentvera', 'board.json')))

    const shell = execFileSync(process.execPath, [SERVER, 'read', 'JWT'], { cwd: project, env: { ...process.env, AGENTVERA_BLACKBOARD_FILE: '' }, encoding: 'utf8' })
    assert.match(shell, /Use JWT/)
  } finally {
    claude.close()
    codex.close()
  }
})
