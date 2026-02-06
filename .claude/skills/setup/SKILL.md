---
name: setup
description: Interactive setup wizard to configure and run the Telegram Bot Claude Code Controller
disable-model-invocation: true
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# Setup Wizard for Telegram Bot Claude Code Controller

You are guiding the user through setting up this Telegram bot for the first time. Follow these steps interactively, waiting for user input at each step that requires it.

## Pre-flight Checks

First, verify the environment is ready:

1. Check Node.js version is >= 18: `node --version`
2. Check that the `claude` CLI is available: `which claude && claude --version`
3. Check that dependencies are installed: look for `node_modules/` directory. If missing, run `npm install`.

If any check fails, explain what's wrong and how to fix it before proceeding.

## Step 1: Create Telegram Bot

Tell the user:

> **Let's create your Telegram bot!**
>
> 1. Open Telegram and go to [@BotFather](https://t.me/BotFather)
> 2. Send `/newbot`
> 3. Choose a display name (e.g., "Claude Code Controller")
> 4. Choose a username ending in `bot` (e.g., `my_claude_code_bot`)
> 5. BotFather will reply with a **bot token** — it looks like `123456789:ABCdefGHI...`
>
> **Paste the bot token here when you have it.**

Wait for the user to provide the bot token. Validate it looks like a bot token (contains a colon, has a numeric prefix).

## Step 2: Get Telegram User ID

Tell the user:

> **Now let's get your Telegram user ID for access control.**
>
> Send any message to [@userinfobot](https://t.me/userinfobot) on Telegram.
> It will reply with your numeric user ID (e.g., `123456789`).
>
> **Paste your user ID here.**

Wait for the user to provide their user ID. Validate it's a positive integer.

## Step 3: Configure Environment

Once you have both values:

1. Check if `.env` already exists. If so, read it first.
2. Create or update the `.env` file with:

```
TELEGRAM_BOT_TOKEN=<the token they provided>
ALLOWED_USER_IDS=<the user ID they provided>
DEFAULT_MODEL=sonnet
DEFAULT_PERMISSION_MODE=dangerously-skip-permissions
CLAUDE_CLI_PATH=claude
MAX_SESSIONS=5
```

Confirm the `.env` file was written successfully.

## Step 4: Register Bot Commands (Optional)

Ask the user if they want to register command hints with BotFather for autocomplete:

> **Optional: Register command hints with BotFather**
>
> Send `/setcommands` to @BotFather, select your bot, then paste:
> ```
> start - Welcome message and auth check
> new - Start a new session in a project directory
> sessions - List active and recent sessions
> resume - Resume an existing session
> switch - Switch the active session
> send - Send a message to the active session
> model - Change model for the active session
> budget - Set budget limit
> stop - Stop a session
> status - Show active session info
> help - Show command list
> ```

This step is optional — proceed regardless of whether the user does it.

## Step 5: Start the Bot

Run the bot in development mode:

```bash
npm run dev
```

Tell the user:

> **The bot is starting!** Once you see "Bot started as @yourbot", open Telegram and send `/start` to your bot to verify it works.
>
> When you're done testing, press Ctrl+C to stop the bot.

Run the command and show the output to the user. The bot will keep running until they stop it.

## Troubleshooting

If the bot fails to start:
- **"TELEGRAM_BOT_TOKEN is required"**: The `.env` file is missing or the token is empty
- **"401: Unauthorized"**: The bot token is invalid — double-check with BotFather
- **"ALLOWED_USER_IDS is required"**: The user ID is missing from `.env`
- **Module not found errors**: Run `npm install` first
