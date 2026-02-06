# CLAUDE.md

## Project Overview

Telegram Bot Claude Code Controller — a TypeScript bot that allows controlling Claude Code sessions remotely via Telegram. Runs locally, communicates with Claude Code CLI via bidirectional stream-json stdin/stdout.

## Tech Stack

- **Runtime**: Node.js >= 18
- **Language**: TypeScript 5.x (ESM)
- **Bot Framework**: grammY
- **Testing**: Vitest
- **Build**: tsc (production), tsx (development)
- **Linting**: ESLint with @typescript-eslint

## Commands

- `npm run dev` — Start in development mode with hot reload
- `npm run build` — Compile TypeScript to dist/
- `npm start` — Run compiled output
- `npm test` — Run all tests
- `npm run test:watch` — Run tests in watch mode
- `npm run test:coverage` — Run tests with coverage report
- `npm run lint` — Check for lint errors
- `npm run lint:fix` — Auto-fix lint errors
- `npm run typecheck` — Type-check without emitting

## Architecture

- `src/bot/` — grammY bot setup, commands, keyboards, auth middleware
- `src/claude/` — Session management, stream parsing, history reading
- `src/notifications/` — Event-based Telegram notifications
- `src/config.ts` — Environment variable loading and validation
- `src/types.ts` — Shared TypeScript interfaces

## Key Patterns

- Claude Code integration uses `claude -p --input-format stream-json --output-format stream-json`
- Sessions are managed as child processes with stdin/stdout JSON streaming
- Session class is an EventEmitter emitting: `response`, `stream`, `result`, `error`, `attention-needed`, `exit`
- Auth is allowlist-based via `ALLOWED_USER_IDS` env var
- All PRDs are in `docs/prds/` with testable acceptance criteria

## Testing

- Unit tests mock child_process.spawn and grammY context
- Integration tests use mock Claude process helper
- Coverage target: 80%+
