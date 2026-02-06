# Architecture Overview

## Overview

The Telegram Bot Claude Code Controller is a locally-run Node.js application that bridges Telegram messaging with the Claude Code CLI. It uses the [grammY](https://grammy.dev/) framework to handle Telegram Bot API interactions and communicates with the Claude Code CLI through a bidirectional stream-json interface over stdin/stdout. Each Claude Code session runs as a managed child process.

The bot does not use any cloud infrastructure beyond the Telegram Bot API itself. It runs on the same machine where Claude Code is installed, giving it direct access to the local filesystem and CLI binary.

## System Components

### Config (`src/config.ts`)

Loads and validates environment variables at startup. Exports a typed configuration object consumed by all other modules. Required variables (`TELEGRAM_BOT_TOKEN`, `ALLOWED_USER_IDS`) cause a hard exit if missing. Optional variables (`DEFAULT_MODEL`, `DEFAULT_PERMISSION_MODE`, `CLAUDE_CLI_PATH`, `MAX_SESSIONS`) fall back to sensible defaults.

### Bot (`src/bot/`)

The grammY bot instance. Registers command handlers (`/start`, `/new`, `/sessions`, `/resume`, `/switch`, `/send`, `/model`, `/budget`, `/stop`, `/status`, `/help`) and a fallback text handler that forwards plain messages to the active session. Also sets up middleware (auth) and keyboard interactions.

### Auth Middleware (`src/bot/middleware/`)

Runs before every update. Compares the incoming Telegram user ID against the allowlist parsed from `ALLOWED_USER_IDS`. Unauthorized users receive a rejection message and the update is not processed further.

### Session Manager (`src/claude/`)

Maintains the registry of active Claude Code sessions. Responsible for:

- Spawning new sessions (with project path, model, and permission mode)
- Tracking which session is "active" for each Telegram chat
- Resuming existing sessions by session ID
- Enforcing the `MAX_SESSIONS` concurrency limit
- Cleaning up sessions on stop or unexpected exit

### Session (`src/claude/`)

A child process wrapper around a single `claude` CLI invocation. Extends `EventEmitter` and emits the following events:

| Event | Description |
|-------|-------------|
| `response` | A complete assistant message has been received |
| `stream` | A partial/streaming message update |
| `result` | The final result from the CLI (session complete) |
| `error` | An error occurred in the CLI or the process |
| `attention-needed` | Claude is waiting for user input or a permission decision |
| `exit` | The child process has exited |

Provides methods to send messages to stdin and to stop/kill the process.

### Stream Parser (`src/claude/`)

Parses newline-delimited JSON events from the Claude CLI stdout stream. Each line is a JSON object with a `type` field. The parser classifies events and emits them through the Session's EventEmitter interface.

### History Reader (`src/claude/`)

Reads Claude Code's on-disk session history to support the `/sessions` and `/resume` commands. Looks up:

- **Per-project history**: `~/.claude/projects/<encoded-path>/<session-id>.jsonl`
- **Global history index**: `~/.claude/history.jsonl`

Parses JSONL files to extract session metadata (ID, project path, timestamps, last message preview).

### Notifier (`src/notifications/`)

Subscribes to Session events and translates them into Telegram messages sent back to the user. Handles formatting, chunking, and delivery. Manages streaming edits (updating a single Telegram message as Claude's response streams in).

## Message Flow

The end-to-end path of a user message and its response:

```
User sends message in Telegram
        |
        v
Telegram Bot API delivers update
        |
        v
grammY receives update
        |
        v
Auth Middleware checks ALLOWED_USER_IDS
        |
        v
Command handler or text handler
        |
        v
Session Manager resolves the active Session
        |
        v
Session writes JSON to Claude CLI stdin
        |
        v
Claude CLI processes the prompt
        |
        v
Claude CLI writes stream-json events to stdout
        |
        v
Stream Parser reads and classifies each JSON event
        |
        v
Session emits typed events (stream, response, result, error, ...)
        |
        v
Notifier receives events
        |
        v
Notifier formats and sends Telegram messages back to user
```

## Claude Code CLI Integration

### Spawning a Session

A new session is started by spawning the `claude` CLI as a child process:

```bash
claude -p \
  --input-format stream-json \
  --output-format stream-json \
  --verbose \
  --include-partial-messages \
  --dangerously-skip-permissions
```

Flag breakdown:

| Flag | Purpose |
|------|---------|
| `-p` | Non-interactive (pipe) mode |
| `--input-format stream-json` | Accept JSON messages on stdin |
| `--output-format stream-json` | Emit JSON events on stdout |
| `--verbose` | Include additional diagnostic events |
| `--include-partial-messages` | Emit partial streaming content for live updates |
| `--dangerously-skip-permissions` | Skip interactive permission prompts (configurable via `DEFAULT_PERMISSION_MODE`) |

### Sending Messages

Messages are sent to the CLI by writing a JSON object followed by a newline to the child process stdin:

```json
{"type":"user","content":"explain this codebase"}
```

### Receiving Events

The CLI emits newline-delimited JSON events on stdout. The primary event types are:

**SystemInit** -- Emitted once at startup. Contains the session ID and system information.

```json
{
  "type": "system",
  "subtype": "init",
  "session_id": "abc-123",
  "tools": [...],
  "model": "claude-sonnet-4-20250514"
}
```

**AssistantMessage** -- A complete assistant message with full content blocks (text, tool use, tool results).

```json
{
  "type": "assistant",
  "message": {
    "role": "assistant",
    "content": [
      {"type": "text", "text": "Here is the explanation..."}
    ]
  }
}
```

**StreamEvent** -- A partial message update during streaming. Sent when `--include-partial-messages` is enabled.

```json
{
  "type": "assistant",
  "subtype": "partial",
  "message": {
    "role": "assistant",
    "content": [
      {"type": "text", "text": "Here is the expl"}
    ]
  }
}
```

**Result** -- The final result event, emitted when the CLI finishes processing. Contains cost and token usage metadata.

```json
{
  "type": "result",
  "result": "Here is the full response text",
  "session_id": "abc-123",
  "cost_usd": 0.012,
  "usage": {"input_tokens": 1500, "output_tokens": 800}
}
```

### Resuming Sessions

An existing session is resumed by passing the session ID:

```bash
claude -p \
  --input-format stream-json \
  --output-format stream-json \
  --verbose \
  --include-partial-messages \
  --dangerously-skip-permissions \
  --resume abc-123
```

This restores the full conversation history from Claude Code's local storage before accepting new input.

### Session History on Disk

Claude Code stores session data in the local filesystem:

- **Per-project sessions**: `~/.claude/projects/<encoded-path>/<session-id>.jsonl`
  - `<encoded-path>` is the project directory path with `/` replaced by `-`
  - Each line is a JSON object representing a conversation turn
- **Global history index**: `~/.claude/history.jsonl`
  - Contains session metadata entries (session ID, project path, timestamps)
  - Used by the History Reader to list recent sessions across all projects

## Session Lifecycle

1. **Spawn** -- User sends `/new <project-path>`. Session Manager spawns a new `claude` child process with the appropriate flags. The Session object begins listening on stdout/stderr.

2. **Init** -- The CLI emits a `SystemInit` event. The Session stores the session ID and notifies the user that the session is ready.

3. **Streaming** -- User sends messages (via `/send` or plain text). Each message is written to stdin as JSON. The CLI streams back events which the Stream Parser classifies and the Session re-emits. The Notifier sends live-updating Telegram messages.

4. **Idle** -- Between messages, the session remains alive. The child process stays running, holding its conversation context in memory.

5. **Resume** -- If a session was previously stopped or the bot restarted, `/resume <session-id>` spawns a new child process with `--resume` to restore history.

6. **Stop** -- User sends `/stop` or the session exits on its own. The Session Manager sends SIGTERM to the child process, waits for graceful exit, cleans up resources, and removes the session from the active registry.

7. **Cleanup** -- On bot shutdown, all active sessions are stopped. Orphaned child processes are killed.

## Telegram Output Handling

### Message Chunking

Telegram enforces a 4096-character limit per message. When Claude's response exceeds this limit, the Notifier splits the content into multiple sequential messages. Splitting is done at line boundaries when possible to avoid breaking code blocks or formatting.

### Markdown Formatting

Responses are formatted using Telegram's MarkdownV2 parse mode. Special characters are escaped as required by the MarkdownV2 specification. Code blocks from Claude's response are preserved with appropriate fencing.

### Streaming Edits

To provide a live-typing experience, the Notifier uses Telegram's `editMessageText` API to update a single message as streaming events arrive. The flow:

1. On the first `stream` event, send a new message with the initial partial content.
2. On subsequent `stream` events, edit that message with the updated content.
3. Rate-limit edits to avoid hitting Telegram API rate limits (typically one edit per second).
4. On the final `response` or `result` event, perform a final edit with the complete content.

If the streaming content grows beyond 4096 characters, the current message is finalized and a new message is started for the overflow.
