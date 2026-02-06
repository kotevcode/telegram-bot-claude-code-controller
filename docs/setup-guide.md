# Setup Guide

## Prerequisites

Before setting up the bot, ensure you have the following installed and configured:

### Node.js >= 18

The bot requires Node.js version 18 or later. Check your version:

```bash
node --version
```

If you need to install or update Node.js, visit [nodejs.org](https://nodejs.org/) or use a version manager like [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm install 18
nvm use 18
```

### Claude Code CLI

The Claude Code CLI must be installed and authenticated on the machine where the bot will run. Follow the official setup instructions at [docs.anthropic.com/en/docs/claude-code](https://docs.anthropic.com/en/docs/claude-code).

Verify the CLI is working:

```bash
claude --version
```

Ensure you have completed the authentication flow (`claude login` or equivalent) so the CLI can make API calls without interactive prompts.

### Telegram Bot Token

You need a bot token from Telegram's BotFather. See the next section for step-by-step instructions.

## Getting a Bot Token from BotFather

1. Open Telegram and search for [@BotFather](https://t.me/BotFather), or navigate to `https://t.me/BotFather`.
2. Start a conversation and send `/newbot`.
3. BotFather will ask for a display name. Enter something like `Claude Code Controller`.
4. BotFather will ask for a username. This must end in `bot`, for example `my_claude_code_bot`.
5. BotFather will respond with your bot token. It looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`. Copy this value.
6. Keep this token secret. Anyone with the token can control your bot.

Optional but recommended BotFather configuration:

- Send `/setdescription` to set a description for your bot.
- Send `/setcommands` to register the command list so users see autocomplete hints. Paste the following:

```
start - Welcome message and auth check
new - Start a new session in a project directory
sessions - List active and recent sessions
resume - Resume an existing session
switch - Switch the active session for this chat
send - Send a message to the active session
model - Change model for the active session
budget - Set budget limit for the active session
stop - Stop the active or specified session
status - Show active session info
help - Show command list
```

## Finding Your Telegram User ID

The bot uses Telegram user IDs for access control. Only users whose IDs appear in the `ALLOWED_USER_IDS` list can interact with the bot.

To find your user ID:

1. Search for [@userinfobot](https://t.me/userinfobot) on Telegram.
2. Start a conversation and send any message.
3. The bot will reply with your user ID (a numeric value like `123456789`).

Alternatively, you can use [@RawDataBot](https://t.me/RawDataBot) which returns your full user object including the `id` field.

If you need to authorize multiple users, collect each person's user ID using the same method.

## Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/your-username/telegram-bot-claude-code-controller.git
   cd telegram-bot-claude-code-controller
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Create your environment file**

   ```bash
   cp .env.example .env
   ```

4. **Edit `.env`** with your configuration values (see the next section).

## Environment Variable Configuration

Edit the `.env` file with the following variables:

### `TELEGRAM_BOT_TOKEN` (required)

The bot token you received from BotFather.

```
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
```

### `ALLOWED_USER_IDS` (required)

A comma-separated list of Telegram user IDs that are allowed to use the bot. Users not in this list will be rejected by the auth middleware.

```
ALLOWED_USER_IDS=123456789
```

For multiple users:

```
ALLOWED_USER_IDS=123456789,987654321,111222333
```

### `DEFAULT_MODEL` (optional, default: `sonnet`)

The default Claude model to use when spawning new sessions. Valid values: `sonnet`, `opus`, `haiku`.

```
DEFAULT_MODEL=sonnet
```

### `DEFAULT_PERMISSION_MODE` (optional, default: `dangerously-skip-permissions`)

Controls how the Claude CLI handles tool-use permission prompts. Options:

- `dangerously-skip-permissions` -- Automatically approves all tool-use requests without prompting. This is the default because interactive permission prompts cannot be handled through the bot's stdin interface.
- `default` -- Uses the CLI's default permission behavior. Note that this may cause sessions to hang if the CLI waits for interactive input that the bot cannot provide.

```
DEFAULT_PERMISSION_MODE=dangerously-skip-permissions
```

### `CLAUDE_CLI_PATH` (optional, default: `claude`)

The path to the Claude Code CLI binary. If `claude` is on your `PATH`, the default works. If you installed it in a non-standard location, provide the full path.

```
CLAUDE_CLI_PATH=/usr/local/bin/claude
```

### `MAX_SESSIONS` (optional, default: `5`)

The maximum number of concurrent Claude Code sessions the bot will allow. Each session is a separate child process consuming memory and API credits.

```
MAX_SESSIONS=5
```

## Running in Development Mode

Development mode uses `tsx` for TypeScript execution with hot reload. File changes automatically restart the bot.

```bash
npm run dev
```

You should see log output indicating the bot has connected to Telegram. Send `/start` to your bot in Telegram to verify it is working.

## Running in Production

For production use, compile TypeScript to JavaScript first, then run the compiled output.

1. **Build the project**

   ```bash
   npm run build
   ```

   This runs `tsc` and outputs compiled JavaScript to the `dist/` directory.

2. **Start the bot**

   ```bash
   npm start
   ```

   This runs `node dist/index.js`.

For long-running production deployments, consider using a process manager like [pm2](https://pm2.keymetrics.io/):

```bash
npm install -g pm2
pm2 start dist/index.js --name claude-bot
pm2 save
pm2 startup
```

Or use systemd on Linux:

```ini
[Unit]
Description=Telegram Claude Code Controller Bot
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/telegram-bot-claude-code-controller
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=5
EnvironmentFile=/path/to/telegram-bot-claude-code-controller/.env

[Install]
WantedBy=multi-user.target
```

## Troubleshooting

### Bot does not respond to messages

- Verify the `TELEGRAM_BOT_TOKEN` is correct. A wrong token causes a silent connection failure.
- Check that your Telegram user ID is in `ALLOWED_USER_IDS`. Send a message and check the bot's console output for auth rejection logs.
- Ensure no other instance of the bot is running with the same token. Telegram only delivers updates to one active polling connection per token.

### "claude: command not found" or similar

- The Claude Code CLI is not installed or not on your `PATH`.
- Set `CLAUDE_CLI_PATH` to the full absolute path of the `claude` binary.
- Verify the CLI works independently: `claude --version`.

### Sessions hang or produce no output

- If `DEFAULT_PERMISSION_MODE` is set to `default`, the CLI may be waiting for an interactive permission prompt that the bot cannot answer. Set it to `dangerously-skip-permissions`.
- Check that the Claude Code CLI is properly authenticated. Run `claude -p "hello"` manually to verify.

### "Maximum sessions reached" error

- You have hit the `MAX_SESSIONS` limit. Stop unused sessions with `/stop` or increase `MAX_SESSIONS` in your `.env` file.

### Telegram messages appear truncated or malformed

- Responses longer than 4096 characters are split across multiple messages. This is expected behavior due to Telegram's message length limit.
- If markdown formatting looks broken, this may be a MarkdownV2 escaping issue. Check the bot's console output for Telegram API errors.

### Bot crashes on startup

- Run `npm run typecheck` to check for TypeScript compilation errors.
- Ensure all required environment variables (`TELEGRAM_BOT_TOKEN`, `ALLOWED_USER_IDS`) are set.
- Verify Node.js version is 18 or later: `node --version`.

### Claude CLI returns authentication errors

- Re-run `claude login` or re-authenticate the CLI.
- Ensure your Anthropic API key or OAuth session has not expired.
- Check that the API key has sufficient permissions and credits.
