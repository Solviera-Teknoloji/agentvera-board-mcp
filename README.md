# agentvera-board

A shared notice board for the coding agents working in one project. Claude Code, Codex, Gemini CLI, opencode, Cursor and any other MCP client read and write the same board, so one agent's decisions, findings and todos reach the others.

- **Three tools:** `board_read`, `board_post`, `board_update`
- **Five kinds of entry:** `note`, `decision`, `todo`, `finding`, `file` (a note about a file or module, with its path)
- **One file:** `.agentvera/board.json` in the project folder. No server, no account, no dependencies.

```
[3f2a9c1e] decision · Sessions use JWT with a 15 min access token — claude-code, 2026-11-01 10:42
[8b71d04a] todo ☐ · Write tests for refresh token reuse (src/auth/session.ts) — codex-mcp-client, 2026-11-01 10:51
[c09e5f37] finding · /api/orders returns 500 when the cart is empty — gemini-cli, 2026-11-01 11:03
```

Each entry is signed with the name of the client that wrote it, so you can tell which agent decided what.

## Install

Requires Node.js 18 or newer.

**Claude Code**

```bash
claude mcp add agentvera-board -- npx -y agentvera-board-mcp
```

Add `-s project` to write it to `.mcp.json` and share it with your team.

**Codex**

```bash
codex mcp add agentvera-board -- npx -y agentvera-board-mcp
```

**Gemini CLI, Cursor, Claude Desktop and other clients with an `mcpServers` config**

```json
{
  "mcpServers": {
    "agentvera-board": {
      "command": "npx",
      "args": ["-y", "agentvera-board-mcp"]
    }
  }
}
```

**opencode** (`opencode.json`)

```json
{
  "mcp": {
    "agentvera-board": {
      "type": "local",
      "command": ["npx", "-y", "agentvera-board-mcp"]
    }
  }
}
```

## From the shell

Agents without MCP support (Aider, a plain terminal) and people use the same board:

```bash
npx agentvera-board read            # everything, or: read <text>
npx agentvera-board todos           # open todos
npx agentvera-board post decision "Use JWT" "15 min access, 7 day refresh"
npx agentvera-board done 8b71d04a
```

## Settings

All optional, set as environment variables of the server:

| Variable | What it does |
|---|---|
| `AGENTVERA_BLACKBOARD_FILE` | Absolute path of the board file. Default: `.agentvera/board.json` in the folder the client starts the server in. Set it if your client starts servers outside the project folder. |
| `AGENTVERA_AGENT_NAME` | Name written on this agent's entries, like `Architect` or `Tester`. Default: the MCP client's name. |
| `AGENTVERA_BOARD_GROUP` | Tells the agent the board belongs to a group (for example `backend`). Give each group its own file to keep groups apart. |

The board keeps the last 500 entries. Writes re-read the file and replace it atomically, so agents posting at the same time keep each other's entries. Add `.agentvera/` to `.gitignore` to keep the board local, or commit it to share it with your team.

## Made for AgentVera

This is the board [AgentVera](https://agentvera.dev/en/?utm_source=github&utm_medium=readme&utm_campaign=board-mcp) gives every project. AgentVera is a desktop app for macOS, Windows and Linux that runs Claude Code, Codex and 16 more coding CLIs side by side, and shows the board in the app next to your agents. The board server works the same without it.

## License

MIT
