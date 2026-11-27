import { describe, expect, it } from "vitest";
import type { AppGoogleAuth, AppGoogleToken } from "../../core/app-host";
import { CloudError } from "../../core/cloud/provider";
import { createAppGoogleAuth } from "./app-google-auth";

const NOW = Date.parse("2026-11-27T10:00:00Z");
const HOUR = 3_600_000;

async function failure(promise: Promise<unknown>): Promise<CloudError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(CloudError);
    return error as CloudError;
  }
  throw new Error("did not fail");
}

/**
 * A shell as M7a measured them: a sheet signs in, a silent call renews the grant's
 * token, a refused token is dropped first; `answer` overrides the next answer.
 */
function fakeShell() {
  const asked: Parameters<AppGoogleAuth["token"]>[0][] = [];
  let granted = false;
  let n = 0;
  let forgotten = 0;
  const next: (AppGoogleToken | Error)[] = [];
  const googleAuth: AppGoogleAuth = {
    async token(request) {
      asked.push(request);
      const planned = next.shift();
      if (planned instanceof Error) throw planned;
      if (planned) return planned;
      if (request.interactive) granted = true;
      if (!granted) return { error: "unauthorized" };
      return { token: `ya29.${++n}`, expiresAt: NOW + HOUR };
    },
    async forget() {
      forgotten++;
    },
  };
  return {
    googleAuth,
    asked,
    answer: (value: AppGoogleToken | Error) => next.push(value),
    forgotten: () => forgotten,
  };
}

describe("createAppGoogleAuth", () => {
  it("signs in with the sheet and keeps the token in memory until shortly before it ends", async () => {
    const shell = fakeShell();
    let now = NOW;
    const auth = createAppGoogleAuth(shell.googleAuth, () => now);
    await expect(auth.token({ interactive: true })).resolves.toBe("ya29.1");
    await expect(auth.token({ interactive: false })).resolves.toBe("ya29.1");
    expect(shell.asked).toEqual([{ interactive: true }]);

    now = NOW + HOUR - 30_000;
    await expect(auth.token({ interactive: false })).resolves.toBe("ya29.2");
    expect(shell.asked).toEqual([
      { interactive: true },
      { interactive: false },
    ]);
  });

  it("always asks the shell when the sheet is wanted", async () => {
    const shell = fakeShell();
    const auth = createAppGoogleAuth(shell.googleAuth, () => NOW);
    await auth.token({ interactive: true });
    await expect(auth.token({ interactive: true })).resolves.toBe("ya29.2");
  });

  it("passes a refused token to the shell, which renews it", async () => {
    const shell = fakeShell();
    const auth = createAppGoogleAuth(shell.googleAuth, () => NOW);
    await auth.token({ interactive: true });
    await expect(
      auth.token({ interactive: false, refused: "ya29.1" }),
    ).resolves.toBe("ya29.2");
    expect(shell.asked.at(-1)).toEqual({
      interactive: false,
      refused: "ya29.1",
    });
    // The new one is kept.
    await expect(auth.token({ interactive: false })).resolves.toBe("ya29.2");
    expect(shell.asked).toHaveLength(2);
  });

  it("is unauthorized when the shell cannot renew without the sheet", async () => {
    const shell = fakeShell();
    const auth = createAppGoogleAuth(shell.googleAuth, () => NOW);
    expect((await failure(auth.token({ interactive: false }))).kind).toBe(
      "unauthorized",
    );
  });

  it("takes a closed sheet as unauthorized, which connect treats as the user's answer, and keeps the token it had", async () => {
    const shell = fakeShell();
    const auth = createAppGoogleAuth(shell.googleAuth, () => NOW);
    await auth.token({ interactive: true });
    shell.answer({ error: "cancelled" });
    const error = await failure(auth.token({ interactive: true }));
    expect(error.kind).toBe("unauthorized");
    expect(error.message).toContain("cancelled");
    await expect(auth.token({ interactive: false })).resolves.toBe("ya29.1");
  });

  it("is unauthorized when the call fails, and retry when the shell could not reach Google", async () => {
    const shell = fakeShell();
    const auth = createAppGoogleAuth(shell.googleAuth, () => NOW);
    shell.answer(new Error("appHost.googleAuth.token is not available here."));
    const failed = await failure(auth.token({ interactive: true }));
    expect(failed.kind).toBe("unauthorized");
    expect(failed.message).toContain("not available here");
    shell.answer({ error: "retry" });
    expect((await failure(auth.token({ interactive: false }))).kind).toBe(
      "retry",
    );
  });

  it("forget drops the kept token and tells the shell", async () => {
    const shell = fakeShell();
    const auth = createAppGoogleAuth(shell.googleAuth, () => NOW);
    await auth.token({ interactive: true });
    await auth.forget();
    expect(shell.forgotten()).toBe(1);
    await expect(auth.token({ interactive: false })).resolves.toBe("ya29.2");
    expect(shell.asked).toHaveLength(2);
  });
});
