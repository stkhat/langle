/**
 * Google's auth half for cloud sync in the phone app (mobile-app.md "M7"): the shells
 * sign in through the platform (`appHost.googleAuth`; Google refuses sign-in in a
 * WebView), and the Drive calls stay in this JS as in the extension. The shells keep
 * the grant (Android: Play services; iOS: the refresh token in the Keychain); the
 * access token is kept here in memory only, until shortly before it ends.
 */
import type { AppGoogleAuth } from "../../core/app-host";
import { CloudError, type CloudAuth } from "../../core/cloud/provider";
import { errorText } from "../../core/util";

/** A kept token is renewed this long before the shell says it ends. */
const EXPIRY_MARGIN_MS = 60_000;

export function createAppGoogleAuth(
  googleAuth: AppGoogleAuth,
  now: () => number = Date.now,
): CloudAuth {
  let kept: { token: string; expiresAt: number } | undefined;

  return {
    async token({ interactive, refused }) {
      if (
        !interactive &&
        kept &&
        kept.token !== refused &&
        kept.expiresAt - EXPIRY_MARGIN_MS > now()
      )
        return kept.token;
      if (refused !== undefined && kept?.token === refused) kept = undefined;
      // The shell gets the refused token too, so it drops its own cached copy.
      let answer;
      try {
        answer = await googleAuth.token({
          interactive,
          ...(refused !== undefined && { refused }),
        });
      } catch (error) {
        throw new CloudError(
          "unauthorized",
          `Google sign-in: ${errorText(error)}`,
        );
      }
      if ("error" in answer)
        // `cancelled` ends as `unauthorized`, like a closed sign-in window on desktop:
        // the backend's connect takes it as the user's answer.
        throw new CloudError(
          answer.error === "retry" ? "retry" : "unauthorized",
          `Google sign-in: ${answer.error}`,
        );
      kept = { token: answer.token, expiresAt: answer.expiresAt };
      return answer.token;
    },

    async forget() {
      kept = undefined;
      await googleAuth.forget();
    },
  };
}
