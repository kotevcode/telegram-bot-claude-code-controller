# PRD-002: Telegram Bot Commands

## Overview

Provide a Telegram bot interface for interacting with Claude Code sessions. Users control sessions through bot commands and receive streamed responses. The bot uses the Grammy framework and supports inline keyboards for interactive navigation.

## Background

Telegram bots communicate through commands (prefixed with `/`) and plain text messages. The bot must map these interactions to the underlying session management layer (PRD-001). Responses from Claude Code are streamed and must be formatted for Telegram's message size limits and MarkdownV2 rendering.

## Commands

### /start

- Display a welcome message with a brief description of the bot.
- Verify the user is authorized (see PRD-005).
- If unauthorized, display a rejection message and do not process further commands.

### /new \<project-path\>

- Create a new Claude Code session with the specified project path.
- Set the new session as the user's active session.
- Respond with confirmation including session ID.
- Error if project path is missing or invalid.

### /sessions

- List all active sessions for the user.
- Also list recent sessions from history (see PRD-003).
- Display as an inline keyboard with session summaries (project name, timestamp).
- Tapping a session switches to it or offers resume/switch options.

### /resume \<session-id\>

- Resume a previous session by its session ID.
- Set the resumed session as the user's active session.
- Respond with confirmation.

### /switch \<session-id\>

- Switch the user's active session to an existing running session.
- Does not create a new process -- only changes which session receives plain text messages.
- Error if the session ID is not found or not running.

### /send \<message\>

- Send the provided message to the user's active session.
- Equivalent to sending a plain text message.
- Error if no active session exists.

### /model \<model\>

- Set the model to use for the next session created with /new.
- Display the currently selected model if no argument is provided.

### /budget \<amount\>

- Set the max-turns budget for the next session.
- Display the current budget if no argument is provided.

### /stop \[session-id\]

- Stop the specified session, or the active session if no ID is provided.
- Clean up the child process (delegates to session manager).
- Confirm the session has been stopped.

### /status

- Show details about the active session: session ID, project path, model, state, uptime.
- Show "No active session" if none is set.

### /help

- Display a formatted list of all available commands with brief descriptions.

## Plain Text Message Routing

Any plain text message (not starting with `/`) from an authorized user is forwarded to their active session as a user message. If no active session exists, respond with an error prompting the user to start one.

## Response Formatting

### Chunking

Telegram messages have a maximum length of 4096 characters. Responses from Claude Code that exceed this limit must be split into multiple messages:

1. Split on paragraph boundaries when possible.
2. Fall back to splitting at the 4096-character boundary if no paragraph break exists.
3. Send chunks sequentially with a small delay to maintain order.

### Markdown

Format responses using Telegram MarkdownV2:

- Escape special characters as required by Telegram: `_`, `*`, `[`, `]`, `(`, `)`, `~`, `` ` ``, `>`, `#`, `+`, `-`, `=`, `|`, `{`, `}`, `.`, `!`.
- Preserve code blocks from Claude Code output.

### Streaming Display

For a more responsive experience:

1. Send an initial placeholder message (e.g., "Thinking...") when a user message is sent.
2. As assistant message chunks arrive, edit the placeholder message with accumulated text.
3. Debounce edits to avoid rate limiting (minimum 1 second between edits).
4. On Result event, perform a final edit with the complete response.

## Acceptance Criteria

### AC1: /start Responds with Welcome for Authorized Users

**Given** an authorized user sends `/start`
**When** the bot processes the command
**Then** the bot responds with a welcome message containing bot description and available commands

### AC2: /start Rejects Unauthorized Users

**Given** an unauthorized user (not in allowlist) sends `/start`
**When** the bot processes the command
**Then** the bot responds with a rejection message and does not process further interactions

### AC3: /new Creates Session and Sets Active

**Given** an authorized user sends `/new /home/user/project`
**When** the bot processes the command
**Then** a new Claude Code session is created with cwd `/home/user/project`, the session is set as the user's active session, and a confirmation message with the session ID is sent

### AC4: /sessions Lists Active and Recent Sessions

**Given** a user has 2 active sessions and 3 recent sessions in history
**When** the user sends `/sessions`
**Then** the bot responds with an inline keyboard showing all 5 sessions with project names and timestamps

### AC5: /resume Resumes a Session by ID

**Given** a session ID `abc-123` exists in session history
**When** the user sends `/resume abc-123`
**Then** the session is resumed (new process spawned with --resume flag), set as active, and a confirmation is sent

### AC6: Plain Text Routes to Active Session

**Given** a user has an active session
**When** the user sends a plain text message "Fix the bug in auth.ts"
**Then** the message is forwarded to the active session as `{"type":"user","content":"Fix the bug in auth.ts"}`

### AC7: Responses Chunked at 4096 Characters

**Given** a Claude Code response of 10,000 characters
**When** the response is sent to Telegram
**Then** it is split into 3 messages, each at most 4096 characters, split at paragraph boundaries where possible

### AC8: /stop Kills the Session

**Given** a user has an active running session
**When** the user sends `/stop`
**Then** the session's child process is terminated, the session state is Stopped, and a confirmation message is sent

### AC9: /status Shows Active Session Details

**Given** a user has an active session on project `/home/user/app` using model `claude-sonnet-4-20250514`
**When** the user sends `/status`
**Then** the bot responds with session ID, project path, model, current state, and uptime

### AC10: /help Lists All Commands

**Given** an authorized user sends `/help`
**When** the bot processes the command
**Then** the bot responds with a formatted list of all commands (/start, /new, /sessions, /resume, /switch, /send, /model, /budget, /stop, /status, /help) with brief descriptions
