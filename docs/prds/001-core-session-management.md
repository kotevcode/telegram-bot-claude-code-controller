# PRD-001: Core Session Management

## Overview

Manage Claude Code child processes using stream-json I/O. This is the foundational layer that spawns, communicates with, and manages the lifecycle of Claude Code CLI processes. Each session wraps a single child process and exposes an event-driven interface for sending messages and receiving typed responses.

## Background

Claude Code CLI supports a machine-readable streaming protocol via `--input-format stream-json` and `--output-format stream-json`. This allows programmatic control of Claude Code sessions by writing JSON to stdin and reading JSON events from stdout. The bot leverages this protocol to bridge Telegram users to Claude Code.

## Requirements

### R1: Spawn Claude Code Process

Spawn a Claude Code child process with the following CLI invocation:

```
claude -p \
  --input-format stream-json \
  --output-format stream-json \
  --verbose \
  --include-partial-messages \
  --dangerously-skip-permissions \
  --cwd <projectPath>
```

- The process must be spawned with `stdio: ['pipe', 'pipe', 'pipe']` to allow stdin/stdout/stderr access.
- The working directory (`--cwd`) is a required parameter when creating a session.

### R2: Send User Messages

Send user messages to the child process by writing newline-delimited JSON to stdin:

```json
{"type": "user", "content": "<message text>"}
```

- Each message must be followed by a newline character.
- The session must validate that the process is running before attempting to write.

### R3: Receive and Parse JSON Events

Read stdout line-by-line and parse each line as a JSON event. Expected event types include:

- **SystemInit** (`type: "system"`) -- Initial system information including session ID.
- **AssistantMessage** (`type: "assistant"`, `subtype: "message"`) -- Partial or complete assistant response chunks.
- **Result** (`type: "result"`) -- Final result indicating the turn is complete, includes cost and duration metadata.

Each parsed event must be emitted on the session's EventEmitter with the event type as the key.

### R4: Session Lifecycle

A session progresses through the following states:

1. **Created** -- Session object instantiated, process not yet spawned.
2. **Running** -- Process spawned and accepting input.
3. **Idle** -- Process running, awaiting next user message (after a Result event).
4. **Stopped** -- Process terminated, session no longer usable.
5. **Error** -- Process crashed or encountered an unrecoverable error.

### R5: Resume Sessions

Support resuming a previous session by passing the `--resume <session-id>` flag when spawning the process. The session ID is obtained from the SystemInit event of a prior session or from the session history file.

### R6: Model Selection

Support specifying the Claude model via the `--model <model>` flag. If no model is specified, the CLI default is used.

### R7: Budget Control

Support limiting session cost or turns via `--max-turns <n>` flag. This prevents runaway sessions.

### R8: Clean Process Shutdown

When `stop()` is called:

1. Send SIGTERM to the child process.
2. Wait up to 5 seconds for graceful exit.
3. Send SIGKILL if the process has not exited.
4. Clean up all event listeners and streams.
5. Update session state to Stopped.

### R9: Crash Handling

If the child process exits unexpectedly (non-zero exit code or signal):

1. Emit an `error` event with exit code and signal information.
2. Update session state to Error.
3. Clean up all event listeners and streams.
4. Do not automatically restart -- the user must explicitly resume or create a new session.

## Acceptance Criteria

### AC1: Process Spawn with Correct Flags

**Given** a project path `/home/user/my-project`
**When** a new session is created with that project path
**Then** a child process is spawned with arguments including `--input-format stream-json`, `--output-format stream-json`, `--verbose`, `--include-partial-messages`, `--dangerously-skip-permissions`, and `--cwd /home/user/my-project`

### AC2: Valid JSON Written to stdin

**Given** a running session
**When** `sendMessage("Hello, Claude")` is called
**Then** the string `{"type":"user","content":"Hello, Claude"}\n` is written to the child process stdin

### AC3: stdout JSON Lines Parsed into Typed Events

**Given** a running session
**When** the child process writes `{"type":"assistant","subtype":"message","content":"Hi"}\n` to stdout
**Then** an `assistant` event is emitted with the parsed object containing `subtype: "message"` and `content: "Hi"`

### AC4: Result Event Indicates Turn Completion

**Given** a running session that has received an assistant message
**When** a `{"type":"result","duration_ms":1500,"cost_usd":0.003}` event is received
**Then** a `result` event is emitted and the session state transitions to Idle

### AC5: stop() Kills Process and Cleans Up

**Given** a running session with an active child process (PID known)
**When** `stop()` is called
**Then** the child process is terminated (no longer running), all event listeners are removed, and the session state is Stopped

### AC6: Resume Creates Process with --resume Flag

**Given** a session ID `abc-123` from a previous session
**When** a session is created with `resume: "abc-123"`
**Then** the spawned process arguments include `--resume abc-123`

### AC7: Process Crash Emits Error Event

**Given** a running session
**When** the child process exits with code 1 and no signal
**Then** an `error` event is emitted with `{ exitCode: 1, signal: null }` and the session state becomes Error

### AC8: Model Flag Passed When Specified

**Given** a model value `claude-sonnet-4-20250514`
**When** a session is created with `model: "claude-sonnet-4-20250514"`
**Then** the spawned process arguments include `--model claude-sonnet-4-20250514`
