export interface MockContext {
  from: { id: number; first_name: string } | undefined;
  chat: { id: number; type: string } | undefined;
  message: { text: string } | undefined;
  callbackQuery: { data: string } | undefined;
  reply: ReturnType<typeof vi.fn>;
  answerCallbackQuery: ReturnType<typeof vi.fn>;
}

export function createMockContext(
  overrides: Partial<{
    userId: number;
    chatId: number;
    text: string;
    callbackData: string;
    noFrom: boolean;
  }> = {},
): MockContext {
  return {
    from: overrides.noFrom
      ? undefined
      : {
          id: overrides.userId ?? 123456789,
          first_name: "Test",
        },
    chat: {
      id: overrides.chatId ?? 100,
      type: "private",
    },
    message: overrides.text !== undefined ? { text: overrides.text } : undefined,
    callbackQuery: overrides.callbackData
      ? { data: overrides.callbackData }
      : undefined,
    reply: vi.fn().mockResolvedValue(undefined),
    answerCallbackQuery: vi.fn().mockResolvedValue(undefined),
  };
}

export function createMockNext() {
  return vi.fn().mockResolvedValue(undefined);
}
