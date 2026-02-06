# PRD-004: Notification System

## Overview

Detect important session events and proactively send Telegram notifications to the user. Since Claude Code sessions can run autonomously for extended periods, users need to be alerted when their attention is required, when tasks complete, or when errors occur.

## Background

Claude Code sessions emit various events during execution. Some of these events are informational (partial message chunks), while others represent significant state changes that the user should be aware of. The notification system subscribes to session events and translates them into user-facing Telegram messages.

## Notification Types

### 1. Needs Attention

**Trigger**: Claude Code uses the `AskUserQuestion` tool within an assistant message, indicating it needs human input to proceed.

**Priority**: High

**Content**: The question text from the AskUserQuestion tool call, prefixed with a header indicating attention is needed.

**Format Example**:
```
Attention Required [project-name | sess_abc123]

Claude is asking:
"Should I proceed with deleting the old migration files?"
```

### 2. Task Completed

**Trigger**: A `Result` event is received from the session, indicating the current turn has finished.

**Priority**: Normal

**Content**: Summary of the result including cost and duration metadata.

**Format Example**:
```
Task Completed [project-name | sess_abc123]

Duration: 45s | Cost: $0.05
```

### 3. Session Error

**Trigger**: The child process emits an error or exits with a non-zero exit code.

**Priority**: High

**Content**: Error details including exit code and any stderr output.

**Format Example**:
```
Session Error [project-name | sess_abc123]

Process exited with code 1
Error: Connection timeout
```

### 4. Session Ended

**Trigger**: The child process exits (regardless of exit code).

**Priority**: Normal

**Content**: Exit status and session summary.

**Format Example**:
```
Session Ended [project-name | sess_abc123]

Process exited normally (code 0)
```

## Requirements

### R1: Event Subscription

When a session is created, the notification system must subscribe to the following EventEmitter events:

- `assistant` -- To detect AskUserQuestion tool usage.
- `result` -- To detect turn completion.
- `error` -- To detect process errors.
- `exit` -- To detect process termination.

### R2: Notification Formatting

Each notification must include:

- A header with the notification type.
- The project name (derived from the session's project path).
- The session ID (truncated to first 8 characters for readability).
- Type-specific content (question text, result summary, error details, etc.).

### R3: Chat Routing

Notifications must be sent to the Telegram chat ID that owns the session. The mapping from session to chat ID must be maintained by the session manager.

### R4: Debouncing

Rapid successive events of the same type from the same session must be debounced:

- Minimum interval between notifications of the same type: 2 seconds.
- If multiple events arrive within the debounce window, only the last one is sent.
- Different notification types are debounced independently.

### R5: Unsubscribe on Session Stop

When a session is stopped or destroyed, all event subscriptions for that session must be removed to prevent memory leaks and stale notifications.

## Architecture

```
Session EventEmitter
       |
       v
NotificationManager.subscribe(session, chatId)
       |
       +--> AskUserQuestion detector --> format --> debounce --> send to chatId
       +--> Result detector           --> format --> debounce --> send to chatId
       +--> Error detector            --> format --> debounce --> send to chatId
       +--> Exit detector             --> format --> debounce --> send to chatId
```

## Acceptance Criteria

### AC1: AskUserQuestion Triggers Attention Notification

**Given** a running session subscribed to notifications
**When** an assistant message event contains a tool use of type `AskUserQuestion` with question "Should I delete the file?"
**Then** a Telegram message is sent with header "Attention Required", the project name, session ID, and the question text

### AC2: Result Event Triggers Completion Notification

**Given** a running session subscribed to notifications
**When** a `result` event is received with `duration_ms: 45000` and `cost_usd: 0.05`
**Then** a Telegram message is sent with header "Task Completed", the project name, session ID, duration "45s", and cost "$0.05"

### AC3: Process Error Triggers Error Notification

**Given** a running session subscribed to notifications
**When** the child process emits an error with exit code 1 and stderr "Connection timeout"
**Then** a Telegram message is sent with header "Session Error", the project name, session ID, exit code, and error text

### AC4: Process Exit Triggers Ended Notification

**Given** a running session subscribed to notifications
**When** the child process exits with code 0
**Then** a Telegram message is sent with header "Session Ended", the project name, session ID, and exit status

### AC5: Notifications Include Session Context

**Given** a session with project path `/home/user/my-api` and session ID `sess_abc12345`
**When** any notification is triggered
**Then** the notification message contains "my-api" (project name) and "sess_abc1" (truncated session ID)

### AC6: Notifications Sent to Correct Chat ID

**Given** session A is owned by chat ID 111 and session B is owned by chat ID 222
**When** session A triggers a completion notification
**Then** the notification is sent to chat ID 111 and not to chat ID 222
