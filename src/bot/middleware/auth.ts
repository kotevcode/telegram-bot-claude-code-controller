import type { Context, NextFunction } from "grammy";

export function createAuthMiddleware(allowedUserIds: number[]) {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    const userId = ctx.from?.id;

    if (!userId) {
      await ctx.reply("Unable to identify user. Access denied.");
      return;
    }

    if (!allowedUserIds.includes(userId)) {
      await ctx.reply(
        "You are not authorized to use this bot. Contact the bot administrator.",
      );
      return;
    }

    await next();
  };
}
