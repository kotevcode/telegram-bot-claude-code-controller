import { loadConfig, ConfigError } from "../../src/config.js";

describe("loadConfig", () => {
  const validEnv = {
    TELEGRAM_BOT_TOKEN: "test-token",
    ALLOWED_USER_IDS: "123,456",
  };

  it("throws ConfigError if TELEGRAM_BOT_TOKEN is missing", () => {
    expect(() => loadConfig({ ALLOWED_USER_IDS: "123" })).toThrow(ConfigError);
    expect(() => loadConfig({ ALLOWED_USER_IDS: "123" })).toThrow(
      "TELEGRAM_BOT_TOKEN is required",
    );
  });

  it("throws ConfigError if ALLOWED_USER_IDS is missing", () => {
    expect(() => loadConfig({ TELEGRAM_BOT_TOKEN: "test-token" })).toThrow(
      ConfigError,
    );
    expect(() => loadConfig({ TELEGRAM_BOT_TOKEN: "test-token" })).toThrow(
      "ALLOWED_USER_IDS is required",
    );
  });

  it("parses valid configuration correctly", () => {
    const config = loadConfig(validEnv);

    expect(config.telegramBotToken).toBe("test-token");
    expect(config.allowedUserIds).toEqual([123, 456]);
    expect(config.defaultModel).toBe("sonnet");
    expect(config.claudeCliPath).toBe("claude");
    expect(config.maxSessions).toBe(5);
  });

  it("parses comma-separated ALLOWED_USER_IDS into number array", () => {
    const config = loadConfig({
      ...validEnv,
      ALLOWED_USER_IDS: "111,222,333",
    });

    expect(config.allowedUserIds).toEqual([111, 222, 333]);
  });

  it("trims whitespace from user IDs", () => {
    const config = loadConfig({
      ...validEnv,
      ALLOWED_USER_IDS: " 123 , 456 , 789 ",
    });

    expect(config.allowedUserIds).toEqual([123, 456, 789]);
  });

  it("throws ConfigError for non-numeric user ID", () => {
    expect(() =>
      loadConfig({ ...validEnv, ALLOWED_USER_IDS: "123,abc,456" }),
    ).toThrow(ConfigError);
    expect(() =>
      loadConfig({ ...validEnv, ALLOWED_USER_IDS: "123,abc,456" }),
    ).toThrow('Invalid user ID: "abc"');
  });

  it("throws ConfigError for invalid DEFAULT_MODEL", () => {
    expect(() =>
      loadConfig({ ...validEnv, DEFAULT_MODEL: "gpt-4" }),
    ).toThrow(ConfigError);
    expect(() =>
      loadConfig({ ...validEnv, DEFAULT_MODEL: "gpt-4" }),
    ).toThrow("Invalid DEFAULT_MODEL");
  });

  it("uses default values for optional fields", () => {
    const config = loadConfig(validEnv);

    expect(config.defaultModel).toBe("sonnet");
    expect(config.claudeCliPath).toBe("claude");
    expect(config.maxSessions).toBe(5);
  });

  it("throws ConfigError for non-integer MAX_SESSIONS", () => {
    expect(() =>
      loadConfig({ ...validEnv, MAX_SESSIONS: "2.5" }),
    ).toThrow(ConfigError);
    expect(() =>
      loadConfig({ ...validEnv, MAX_SESSIONS: "2.5" }),
    ).toThrow('Invalid MAX_SESSIONS: "2.5"');
  });

  it("throws ConfigError for MAX_SESSIONS < 1", () => {
    expect(() =>
      loadConfig({ ...validEnv, MAX_SESSIONS: "0" }),
    ).toThrow(ConfigError);
    expect(() =>
      loadConfig({ ...validEnv, MAX_SESSIONS: "0" }),
    ).toThrow('Invalid MAX_SESSIONS: "0"');
  });
});
