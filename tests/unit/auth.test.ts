import { createAuthMiddleware } from "../../src/bot/middleware/auth.js";
import { createMockContext, createMockNext } from "../helpers/mock-telegram.js";

describe("createAuthMiddleware", () => {
  it("calls next() for authorized user", async () => {
    const middleware = createAuthMiddleware([123456789]);
    const ctx = createMockContext({ userId: 123456789 });
    const next = createMockNext();

    await middleware(ctx as any, next);

    expect(next).toHaveBeenCalled();
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("replies with rejection and does NOT call next() for unauthorized user", async () => {
    const middleware = createAuthMiddleware([111111]);
    const ctx = createMockContext({ userId: 999999 });
    const next = createMockNext();

    await middleware(ctx as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("not authorized"),
    );
  });

  it("replies with 'Unable to identify' and does NOT call next() when ctx.from is undefined", async () => {
    const middleware = createAuthMiddleware([123456789]);
    const ctx = createMockContext({ noFrom: true });
    const next = createMockNext();

    await middleware(ctx as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("Unable to identify"),
    );
  });

  it("works with multiple IDs in allowlist", async () => {
    const middleware = createAuthMiddleware([111, 222, 333]);
    const next = createMockNext();

    const ctx1 = createMockContext({ userId: 111 });
    await middleware(ctx1 as any, next);
    expect(next).toHaveBeenCalledTimes(1);

    const ctx2 = createMockContext({ userId: 222 });
    await middleware(ctx2 as any, next);
    expect(next).toHaveBeenCalledTimes(2);

    const ctx3 = createMockContext({ userId: 333 });
    await middleware(ctx3 as any, next);
    expect(next).toHaveBeenCalledTimes(3);
  });

  it("rejects all users when allowlist is empty", async () => {
    const middleware = createAuthMiddleware([]);
    const ctx = createMockContext({ userId: 123456789 });
    const next = createMockNext();

    await middleware(ctx as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining("not authorized"),
    );
  });
});
