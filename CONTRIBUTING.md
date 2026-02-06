# Contributing

Thanks for your interest in contributing to the Telegram Bot Claude Code Controller!

## Getting Started

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and fill in your values
4. Run tests: `npm test`
5. Start development: `npm run dev`

## Development Workflow

1. Create a branch for your feature or fix
2. Write tests for new functionality
3. Ensure all tests pass: `npm test`
4. Ensure no lint errors: `npm run lint`
5. Ensure types check: `npm run typecheck`
6. Submit a pull request

## Project Structure

- `src/bot/` — Telegram bot setup, commands, middleware
- `src/claude/` — Claude Code CLI integration
- `src/notifications/` — Event-based notification system
- `tests/unit/` — Unit tests for individual modules
- `tests/integration/` — Integration tests for full flows
- `tests/helpers/` — Reusable test mocks and utilities
- `docs/prds/` — Product requirement documents

## Testing

We use [Vitest](https://vitest.dev/) for testing. Coverage target is 80%+.

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

When adding new features:
- Add unit tests for each new module
- Add integration tests for user-facing flows
- Use existing test helpers in `tests/helpers/`

## Code Style

- TypeScript strict mode
- ESM modules
- ESLint with @typescript-eslint rules
- No `any` types unless absolutely necessary (and with `// eslint-disable` comment)

## PRDs

All features have associated PRDs in `docs/prds/` with acceptance criteria. When implementing a feature, check the relevant PRD for requirements.
