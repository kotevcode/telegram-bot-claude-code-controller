import { loadConfig } from "./config.js";
import { createBot } from "./bot/bot.js";

async function main() {
  console.log("Loading configuration...");
  const config = loadConfig();

  console.log("Starting Telegram Bot Claude Code Controller...");
  const { bot, sessionManager } = createBot(config);

  // Graceful shutdown
  const shutdown = () => {
    console.log("\nShutting down...");
    sessionManager.stopAll();
    bot.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await bot.start({
    onStart: (info) => {
      console.log(`Bot started as @${info.username}`);
      console.log(`Allowed users: ${config.allowedUserIds.join(", ")}`);
      console.log(`Default model: ${config.defaultModel}`);
      console.log(`Max sessions: ${config.maxSessions}`);
    },
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
