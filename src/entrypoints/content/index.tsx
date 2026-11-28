import { render } from "preact";
import { startContentCheck } from "../../check/start";
import { ArticleUi } from "../../content/article/ArticleUi";
import { runArticle } from "../../content/article/article";
import { leaveWhenOrphaned } from "../../content/orphan";
import { reportPageVisit } from "../../content/recents";
import { runWhenSetUp } from "../../content/setup";
import { shadowRootMode } from "../../content/shadow-host";
import { leaveWhenAccessRemoved } from "../../content/site-access";
import { inUiLocale } from "../../content/ui-locale";
import { isVideoSite } from "../../content/video/platform";
import { answerPageRequests, contentDeps } from "../../content/wiring";
import { guardShadowRoot } from "../../ui/from-user";
import { UiRoot } from "../../ui/locale-root";

export default defineContentScript({
  // Chrome registers it at run time for the hosts the user turned on, and injects it
  // into the tab a host was just turned on in (src/background/site-access.ts). The
  // phone app injects what its manifest lists and has no per-site access.
  registration: { chrome: "runtime", "langle-app": "manifest" },
  matches: { "langle-app": ["<all_urls>"] },
  // The UI is styled inline and imports no CSS: nothing to load into its shadow root
  // ("ui" would fetch a content.css that is never built) or into the page.
  cssInjectionMode: "manual",
  main(ctx) {
    // The video UI runs there and answers the popup.
    if (isVideoSite(location.hostname)) return;
    // A registered and an injected copy never both run: WXT's context of a newer copy
    // invalidates the older one as it is made, before `main` (the background also
    // injects only where no copy answers).
    leaveWhenAccessRemoved(ctx);
    // `npm run build:check` only: the error log and the settings channel (src/check/).
    if (import.meta.env.MODE === "check") startContentCheck("article");
    runWhenSetUp(
      ctx,
      inUiLocale(ctx, () => {
        const deps = contentDeps(ctx);
        // The phone app's recent pages: nothing elsewhere.
        reportPageVisit({ send: deps.send });
        const runner = runArticle({
          ...deps,
          async mountUi(app) {
            const ui = await createShadowRootUi(ctx, {
              name: "langle-article",
              mode: shadowRootMode(),
              position: "inline",
              anchor: "body",
              onMount(container, shadow) {
                guardShadowRoot(shadow);
                render(
                  <UiRoot>
                    <ArticleUi app={app} />
                  </UiRoot>,
                  container,
                );
              },
              onRemove(container) {
                if (container) render(null, container);
              },
            });
            ui.mount();
            return () => ui.remove();
          },
        });
        ctx.onInvalidated(() => runner.stop());
        leaveWhenOrphaned(ctx);
        answerPageRequests(ctx, runner.handlePageRequest);
      }),
    );
  },
});
