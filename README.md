# Telegram Bot Claude Code Controller

A Telegram bot that lets you control [Claude Code](https://docs.anthropic.com/en/docs/claude-code) sessions remotely. Run it locally on your machine and interact with Claude Code through Telegram — spawn new sessions, resume existing ones, and get notifications when sessions need your attention.

## Features

- **Remote Claude Code Control** — Send prompts and receive responses via Telegram
- **Session Management** — Create, resume, switch between, and stop multiple concurrent sessions
- **Session History** — Browse and resume past sessions from Claude Code's history
- **Streaming Responses** — See Claude's responses as they stream in, with live message updates
- **Notifications** — Get notified when Claude needs input, completes a task, or encounters an error
- **Access Control** — Allowlist-based authentication by Telegram user ID
- **Model Selection** — Choose between Claude models per session
- **Budget Control** — Set spending limits per session

## Prerequisites

- Node.js >= 18
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and configured
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

## Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/telegram-bot-claude-code-controller.git
   cd telegram-bot-claude-code-controller
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your bot token and user IDs
   ```

4. **Start the bot**
   ```bash
   npm run dev
   ```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather | *required* |
| `ALLOWED_USER_IDS` | Comma-separated Telegram user IDs | *required* |
| `DEFAULT_MODEL` | Default Claude model (`sonnet`, `opus`, `haiku`) | `sonnet` |
| `DEFAULT_PERMISSION_MODE` | Permission mode for sessions | `dangerously-skip-permissions` |
| `CLAUDE_CLI_PATH` | Path to Claude CLI binary | `claude` |
| `MAX_SESSIONS` | Maximum concurrent sessions | `5` |

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message and auth check |
| `/new <project-path>` | Start a new session in a project directory |
| `/sessions` | List active and recent sessions |
| `/resume <session-id>` | Resume an existing session |
| `/switch <session-id>` | Switch the active session for this chat |
| `/send <message>` | Send a message to the active session |
| `/model <model>` | Change model for the active session |
| `/budget <amount>` | Set budget limit for the active session |
| `/stop [session-id]` | Stop the active or specified session |
| `/status` | Show active session info |
| `/help` | Show command list |

Plain text messages are automatically sent to the active session.

## Development

```bash
# Run in development mode with hot reload
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint
npm run lint

# Type check
npm run typecheck

# Build for production
npm run build
npm start
```

## Architecture

See [docs/architecture.md](docs/architecture.md) for a detailed technical overview.

The bot communicates with Claude Code CLI using its bidirectional stream-json interface:

```
Telegram User → grammY Bot → Session Manager → Claude CLI (stdin/stdout JSON streaming)
                    ↑                                    ↓
                Notifier  ←  Session Events  ←  Stream Parser
```

## Documentation

- [Architecture Overview](docs/architecture.md)
- [Setup Guide](docs/setup-guide.md)
- [PRDs](docs/prds/)
- [Contributing](CONTRIBUTING.md)

## License

MIT — see [LICENSE](LICENSE).
