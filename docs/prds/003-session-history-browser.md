# PRD-003: Session History Browser

## Overview

Read and display Claude Code session history for browsing and resuming past sessions. The bot reads from Claude Code's local history files to provide users with a list of their previous sessions, organized by project and sorted by recency.

## Background

Claude Code stores session history in the user's home directory:

- **Global history**: `~/.claude/history.jsonl` -- A newline-delimited JSON file where each line represents a session record.
- **Project-specific sessions**: `~/.claude/projects/<encoded-path>/` -- Directories containing session data for each project, where `<encoded-path>` is the filesystem-safe encoding of the project's absolute path.

This data allows the bot to present a browsable list of past sessions that users can resume without needing to remember session IDs.

## Requirements

### R1: Read Global Session History

Parse `~/.claude/history.jsonl` to extract session metadata. Each line contains a JSON object with at minimum:

- `sessionId` -- Unique identifier for the session.
- `path` -- The project path the session was associated with.
- `timestamp` -- When the session was created or last active.
- `model` -- The model used for the session (if available).

Lines that fail to parse as valid JSON must be skipped without affecting other entries.

### R2: Read Project-Specific Sessions

Scan `~/.claude/projects/<encoded-path>/` directories to discover sessions associated with specific projects. This provides an alternative view grouped by project rather than a flat chronological list.

### R3: Sort by Recency

All session lists must be sorted with the most recent session first, based on the `timestamp` field.

### R4: Display Session Information

Each session entry displayed to the user must include:

- Project name (derived from the project path, typically the last path component).
- Date and time of the session (human-readable format).
- Model used (if available).
- Session ID (truncated for display, full ID available on selection).

### R5: Paginated Display

When the number of sessions exceeds what can be reasonably displayed in a single Telegram message (more than 8 sessions), use pagination:

- Show 8 sessions per page.
- Provide "Next" and "Previous" inline keyboard buttons for navigation.
- Display current page number and total pages.

### R6: Resume from History

When a user selects a session from the history browser, initiate a resume operation (delegates to PRD-001 session resume functionality).

## Data Format

### history.jsonl Example

```jsonl
{"sessionId":"sess_abc123","path":"/home/user/project-a","timestamp":"2025-01-15T10:30:00Z","model":"claude-sonnet-4-20250514"}
{"sessionId":"sess_def456","path":"/home/user/project-b","timestamp":"2025-01-14T14:00:00Z","model":"claude-sonnet-4-20250514"}
```

## API

### getRecentSessions(limit?: number): SessionRecord[]

Returns the most recent sessions from the global history file.

- `limit` defaults to 20.
- Returns an empty array if the history file does not exist.
- Skips malformed lines.

### getSessionsForProject(projectPath: string): SessionRecord[]

Returns sessions associated with a specific project path.

- Reads from the project-specific directory.
- Returns an empty array if the directory does not exist.

### SessionRecord Interface

```typescript
interface SessionRecord {
  sessionId: string;
  projectPath: string;
  projectName: string;  // Derived from path
  timestamp: Date;
  model?: string;
}
```

## Acceptance Criteria

### AC1: getRecentSessions Returns Parsed Sessions

**Given** a `~/.claude/history.jsonl` file with 5 valid session entries
**When** `getRecentSessions()` is called
**Then** it returns an array of 5 `SessionRecord` objects with correct `sessionId`, `projectPath`, `projectName`, `timestamp`, and `model` fields

### AC2: Sessions Sorted by Most Recent First

**Given** a history file with sessions timestamped at 10:00, 14:00, and 12:00
**When** `getRecentSessions()` is called
**Then** the returned array is ordered: 14:00, 12:00, 10:00

### AC3: Malformed JSONL Lines Skipped Gracefully

**Given** a history file with 3 valid lines and 1 line containing `{invalid json`
**When** `getRecentSessions()` is called
**Then** it returns 3 `SessionRecord` objects and does not throw an error

### AC4: Missing History File Returns Empty Array

**Given** the file `~/.claude/history.jsonl` does not exist
**When** `getRecentSessions()` is called
**Then** it returns an empty array `[]` without throwing an error

### AC5: getSessionsForProject Reads Project Directory

**Given** a project path `/home/user/my-app` with 2 session files in `~/.claude/projects/<encoded>/`
**When** `getSessionsForProject("/home/user/my-app")` is called
**Then** it returns an array of 2 `SessionRecord` objects for that project

### AC6: /sessions Command Shows Formatted Session List

**Given** a user has 3 recent sessions in history
**When** the user sends `/sessions`
**Then** the bot responds with a message containing an inline keyboard with 3 buttons, each showing project name and date

### AC7: Selecting a Session Resumes It

**Given** the sessions list is displayed with inline keyboard buttons
**When** the user taps a button for session `sess_abc123`
**Then** the bot initiates a resume for session `sess_abc123` and sets it as the active session
