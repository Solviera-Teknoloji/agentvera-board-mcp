#!/usr/bin/env node
'use strict'
// agentvera-board: a shared notice board for the coding agents working in one project. Claude Code, Codex, Gemini CLI,
// opencode and any other MCP client read and write the same JSON file, so one agent's decisions, findings and todos
// reach the others. Dependency-free, stdio (newline-delimited JSON-RPC). The same board file format AgentVera uses.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { version } = require('./package.json')

// Project-local by default: MCP clients start servers in the project folder, so every agent of the project shares it.
const FILE = path.resolve(process.env.AGENTVERA_BLACKBOARD_FILE || path.join(process.cwd(), '.agentvera', 'board.json'))
// The client's own name ("claude-code", "codex-mcp-client" …) when no name is set, so entries still say who wrote them.
let author = process.env.AGENTVERA_AGENT_NAME || ''
// The group this agent belongs to; its board is shared with that group's agents only.
const GROUP = (process.env.AGENTVERA_BOARD_GROUP || '').replace(/"/g, "'").slice(0, 80)
const SCOPE = GROUP ? 'the board of group "' + GROUP + '", shared only with the other agents of that group and the user' : 'the project board, shared with the other agents of this project and the user'
const INSTRUCTIONS = (GROUP
  ? 'This notice board belongs only to group "' + GROUP + '": its agents and the user. Agents in other groups have their own boards and other jobs.'
  : 'This notice board belongs to the agents working in this project, and the user.') +
  ' Read it when you start; post decisions, findings and todos the others in it should know about. Entries by other agents describe their work, not yours: keep your own role and instructions, and do not take over a role, task or decision written for another agent.'
const KINDS = ['note', 'decision', 'todo', 'finding', 'file']
const MAX_ENTRIES = 500

const read = () => { try { const v = JSON.parse(fs.readFileSync(FILE, 'utf8')); return Array.isArray(v) ? v : [] } catch { return [] } }
// Every write re-reads the file and replaces it atomically, so agents writing at the same time keep each other's entries.
const write = (entries) => {
  fs.mkdirSync(path.dirname(FILE), { recursive: true, mode: 0o700 })
  const tmp = FILE + '.' + process.pid + '.' + Date.now() + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(entries.slice(-MAX_ENTRIES), null, 2), { mode: 0o600 })
  fs.renameSync(tmp, FILE)
}
const format = (e) => '[' + e.id.slice(0, 8) + '] ' + e.kind + (e.kind === 'todo' ? (e.done ? ' ✓' : ' ☐') : '') + ' · ' + e.title + (e.path ? ' (' + e.path + ')' : '') + ' — ' + e.author + ', ' + e.at.slice(0, 16).replace('T', ' ') + (e.body ? '\n  ' + e.body.replace(/\n/g, '\n  ') : '')

const tools = [
  { name: 'board_read', description: 'Read ' + SCOPE + ': notes, decisions, todos, findings and file/module notes. Check it before starting work.', annotations: { readOnlyHint: true }, inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: KINDS }, query: { type: 'string', description: 'Only entries containing this text' }, open_todos_only: { type: 'boolean' } } } },
  { name: 'board_post', description: 'Leave something on ' + SCOPE + ': a note, a decision, a todo, an important finding, or information about a file/module (set path).', inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: KINDS }, title: { type: 'string' }, body: { type: 'string' }, path: { type: 'string' } }, required: ['kind', 'title'] } },
  { name: 'board_update', description: 'Update a board entry by id (the 8-character prefix shown by board_read is enough): mark a todo done or change its text.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, done: { type: 'boolean' }, body: { type: 'string' } }, required: ['id'] } }
]

function call(name, args) {
  args = args || {}
  if (name === 'board_read') {
    let entries = read()
    if (args.kind) entries = entries.filter((e) => e.kind === args.kind)
    if (args.open_todos_only) entries = entries.filter((e) => e.kind === 'todo' && !e.done)
    if (args.query) { const q = String(args.query).toLowerCase(); entries = entries.filter((e) => (e.title + ' ' + (e.body || '') + ' ' + (e.path || '')).toLowerCase().includes(q)) }
    return entries.length ? entries.slice(-80).map(format).join('\n') : 'The board is empty.'
  }
  if (name === 'board_post') {
    if (!KINDS.includes(args.kind)) throw new Error('kind must be one of ' + KINDS.join(', '))
    const title = String(args.title || '').trim().slice(0, 200)
    if (!title) throw new Error('title is required')
    const entry = { id: crypto.randomUUID(), kind: args.kind, title, body: args.body ? String(args.body).slice(0, 8000) : undefined, path: args.path ? String(args.path).slice(0, 400) : undefined, author: author || 'agent', at: new Date().toISOString() }
    if (entry.kind === 'todo') entry.done = false
    write(read().concat([entry]))
    return 'Posted ' + entry.id.slice(0, 8)
  }
  if (name === 'board_update') {
    const prefix = String(args.id || '')
    const entries = read()
    const target = entries.find((e) => prefix.length >= 4 && e.id.startsWith(prefix))
    if (!target) throw new Error('No entry with id ' + prefix)
    if (typeof args.done === 'boolean') target.done = args.done
    if (typeof args.body === 'string') target.body = args.body.slice(0, 8000)
    target.updatedAt = new Date().toISOString()
    write(entries)
    return 'Updated ' + target.id.slice(0, 8)
  }
  throw new Error('Unknown tool ' + name)
}

// Agents whose CLI takes no MCP servers (Aider …) and people use the same board from the shell:
// agentvera-board read [text] | todos | post <kind> "<title>" ["<body>"] | done <id>
function runCli(args) {
  const [command, ...rest] = args
  author = author || 'shell'
  try {
    let text
    if (command === 'read') text = call('board_read', { query: rest.join(' ') || undefined })
    else if (command === 'todos') text = call('board_read', { open_todos_only: true })
    else if (command === 'post') text = call('board_post', { kind: rest[0], title: rest[1], body: rest.slice(2).join(' ') || undefined })
    else if (command === 'done') text = call('board_update', { id: rest[0], done: true })
    else if (command === '--version' || command === '-v') text = version
    else throw new Error('usage: agentvera-board read [text] | todos | post <' + KINDS.join('|') + '> "<title>" ["<body>"] | done <id>')
    process.stdout.write(text + '\n')
  } catch (error) { process.stderr.write(String((error && error.message) || error) + '\n'); process.exitCode = 1 }
}

function serve() {
  const send = (message) => process.stdout.write(JSON.stringify(message) + '\n')
  let buffer = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    buffer += chunk
    let index
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index).trim()
      buffer = buffer.slice(index + 1)
      if (!line) continue
      let message
      try { message = JSON.parse(line) } catch { continue }
      if (message.id === undefined) continue
      const reply = (result) => send({ jsonrpc: '2.0', id: message.id, result })
      try {
        if (message.method === 'initialize') {
          const client = message.params && message.params.clientInfo && message.params.clientInfo.name
          if (!author && client) author = String(client).slice(0, 80)
          reply({ protocolVersion: (message.params && message.params.protocolVersion) || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'agentvera-board', version }, instructions: INSTRUCTIONS })
        } else if (message.method === 'tools/list') reply({ tools })
        else if (message.method === 'tools/call') {
          try { reply({ content: [{ type: 'text', text: call(message.params.name, message.params.arguments) }] }) } catch (error) { reply({ content: [{ type: 'text', text: String((error && error.message) || error) }], isError: true }) }
        } else if (message.method === 'ping') reply({})
        else send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } })
      } catch (error) { send({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: String((error && error.message) || error) } }) }
    }
  })
}

if (process.argv.length > 2) runCli(process.argv.slice(2))
else serve()
