# PRD-005: Auth and Access Control

## Overview

Implement allowlist-based user authentication using Telegram user IDs. Since this bot provides direct access to Claude Code with `--dangerously-skip-permissions`, it is critical that only explicitly authorized users can interact with it. All incoming messages must pass through an authentication middleware before reaching any command handler.

## Background

Telegram provides a unique numeric user ID (`ctx.from.id`) for each message sender. This ID is stable and cannot be spoofed within the Telegram API. By maintaining an allowlist of permitted user IDs, the bot can restrict access to a known set of trusted users.

Some message types (such as channel posts or anonymous group admin messages) may not have a `ctx.from` field, and these must be handled gracefully.

## Requirements

### R1: Environment Variable Configuration

The allowlist is configured via the `ALLOWED_USER_IDS` environment variable:

- Contains a comma-separated list of Telegram user IDs.
- Example: `ALLOWED_USER_IDS=123456789,987654321,555555555`
- Whitespace around IDs must be trimmed (e.g., `123 , 456` is valid).
- The variable is read once at startup and parsed into a `Set<number>`.

### R2: Authentication Middleware

Implement a Grammy middleware function that:

1. Extracts `ctx.from.id` from the incoming update.
2. Checks if the ID exists in the allowlist Set.
3. If authorized: calls `next()` to proceed to the command handler.
4. If unauthorized: sends a rejection message and does **not** call `next()`.

### R3: Authorization Check

- Authorized users: their `ctx.from.id` is present in the `ALLOWED_USER_IDS` set.
- Unauthorized users: their `ctx.from.id` is not in the set, or `ctx.from` is undefined.

### R4: Rejection Message

Unauthorized users receive a message such as:

```
Access denied. You are not authorized to use this bot.
```

The message must not reveal which users are authorized or how to gain access.

### R5: Missing User ID Handling

If `ctx.from` is `undefined` (e.g., channel posts, forwarded channel messages, anonymous admin posts):

- Do not crash or throw an unhandled error.
- Treat as unauthorized and silently ignore, or send a rejection if a reply is possible.

### R6: Empty Allowlist

If `ALLOWED_USER_IDS` is empty or not set:

- No users are authorized.
- All messages are rejected.
- The bot should log a warning at startup indicating that no users are configured.

## Security Considerations

- The allowlist is enforced at the middleware level, before any command handler runs. There is no way to bypass it by crafting specific messages.
- The bot does not support dynamic allowlist modification at runtime. Changes require restarting the bot with an updated environment variable.
- Telegram user IDs are integers. Non-numeric values in the environment variable must be filtered out during parsing with a warning logged.

## Implementation Notes

```typescript
// Pseudocode for middleware
function authMiddleware(allowedIds: Set<number>) {
  return async (ctx: Context, next: NextFunction) => {
    const userId = ctx.from?.id;
    if (userId === undefined || !allowedIds.has(userId)) {
      await ctx.reply("Access denied. You are not authorized to use this bot.");
      return;
    }
    await next();
  };
}
```

## Acceptance Criteria

### AC1: Authorized User Passes Middleware

**Given** `ALLOWED_USER_IDS=123456789,987654321`
**When** a message arrives from user ID `123456789`
**Then** the middleware calls `next()` and the command handler executes normally

### AC2: Unauthorized User Blocked

**Given** `ALLOWED_USER_IDS=123456789,987654321`
**When** a message arrives from user ID `111111111`
**Then** the middleware sends "Access denied" message and does not call `next()`

### AC3: Missing ctx.from Handled Without Crash

**Given** a message update where `ctx.from` is `undefined`
**When** the middleware processes the update
**Then** no error is thrown, the update is treated as unauthorized, and command handlers are not invoked

### AC4: Empty Allowlist Rejects All Users

**Given** `ALLOWED_USER_IDS` is set to an empty string `""`
**When** a message arrives from any user
**Then** the middleware rejects the message with "Access denied"

### AC5: Allowlist Parsed Correctly from Comma-Separated String

**Given** `ALLOWED_USER_IDS=111,222,333`
**When** the allowlist is parsed at startup
**Then** the resulting Set contains exactly three numbers: `111`, `222`, `333`

### AC6: Whitespace in Allowlist Values Trimmed

**Given** `ALLOWED_USER_IDS= 111 , 222 , 333 `
**When** the allowlist is parsed at startup
**Then** the resulting Set contains exactly three numbers: `111`, `222`, `333` (no parsing errors from whitespace)
