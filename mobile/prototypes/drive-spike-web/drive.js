// M7a spike (docs/notes/mobile.md "Drive sign-in (M7a)"): the Drive API from the app origin's
// WebView with `fetch`, as core/cloud/google-drive.ts calls it. Served by both shells from the
// app origin (Android: https://appassets.androidplatform.net, iOS: langle-app://app).
// The shell calls `driveSpike.run(token, platform)` (or `.bad()`, `.probe(token)`) and gets
// one result object back through `spikeBridge`. Nothing here prints file contents or the
// account's address: only sizes, names under devices/…, statuses and timings.
(() => {
  const API = "https://www.googleapis.com/drive/v3/files";
  const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
  const ABOUT = "https://www.googleapis.com/drive/v3/about";
  const FIELDS = "id,name,modifiedTime,size,appProperties";

  function post(result) {
    const text = JSON.stringify(result);
    document.getElementById("out").textContent = text;
    if (window.spikeBridge) window.spikeBridge.postMessage(text);
    else if (window.webkit?.messageHandlers?.spikeBridge)
      window.webkit.messageHandlers.spikeBridge.postMessage(text);
  }

  /** One request: the status, or the error a blocked request throws (CORS is a TypeError). */
  async function call(step, url, init, read) {
    const started = performance.now();
    const entry = { step };
    try {
      const response = await fetch(url, init);
      entry.status = response.status;
      entry.type = response.type;
      if (read) Object.assign(entry, await read(response));
      else if (!response.ok) entry.body = (await response.text()).slice(0, 400);
    } catch (error) {
      entry.error = `${error?.name}: ${error?.message}`;
    }
    entry.ms = Math.round(performance.now() - started);
    return entry;
  }

  const auth = (token) => ({ Authorization: `Bearer ${token}` });

  function gzipBytes(text) {
    // Not real gzip; the content type is what the extension sends.
    return new TextEncoder().encode(text);
  }

  function multipart(metadata, bytes) {
    const boundary = `spike-${crypto.randomUUID()}`;
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\nContent-Type: application/gzip\r\n\r\n`,
      bytes,
      `\r\n--${boundary}--`,
    ]);
    return { body, type: `multipart/related; boundary=${boundary}` };
  }

  async function run(token, platform) {
    const steps = [];
    const result = { what: "run", origin: location.origin, platform, steps };

    // 1. files.list in appDataFolder (the extension's query).
    let listed = [];
    const listUrl = new URL(API);
    listUrl.searchParams.set("spaces", "appDataFolder");
    listUrl.searchParams.set("fields", `nextPageToken,files(${FIELDS})`);
    listUrl.searchParams.set("pageSize", "1000");
    steps.push(
      await call("list", listUrl.href, { headers: auth(token) }, async (r) => {
        if (!r.ok) return { body: (await r.text()).slice(0, 400) };
        const page = await r.json();
        listed = page.files ?? [];
        return {
          count: listed.length,
          paths: listed
            .map((f) => f.appProperties?.path ?? `(no path) ${f.name}`)
            .sort(),
          sizes: listed
            .map((f) => `${f.appProperties?.path ?? f.name}=${f.size}`)
            .sort(),
        };
      }),
    );

    // 2. multipart create: a file the extension ignores (no appProperties.path).
    const name = `m7a-spike-${platform}.bin`;
    let id;
    const first = `created ${new Date().toISOString()}`;
    const { body, type } = multipart(
      { name, parents: ["appDataFolder"], appProperties: { spike: "m7a" } },
      gzipBytes(first),
    );
    steps.push(
      await call(
        "create",
        `${UPLOAD}?uploadType=multipart&fields=${encodeURIComponent(FIELDS)}`,
        {
          method: "POST",
          headers: { ...auth(token), "Content-Type": type },
          body,
        },
        async (r) => {
          if (!r.ok) return { body: (await r.text()).slice(0, 400) };
          const file = await r.json();
          id = file.id;
          return { size: file.size, name: file.name };
        },
      ),
    );

    // 3. media update (PATCH uploadType=media), as the extension writes an existing path.
    const second = `updated ${new Date().toISOString()}`;
    if (id)
      steps.push(
        await call(
          "update",
          `${UPLOAD}/${encodeURIComponent(id)}?uploadType=media&fields=${encodeURIComponent(FIELDS)}`,
          {
            method: "PATCH",
            headers: { ...auth(token), "Content-Type": "application/gzip" },
            body: new Blob([gzipBytes(second)]),
          },
          async (r) =>
            r.ok
              ? { size: (await r.json()).size }
              : { body: (await r.text()).slice(0, 400) },
        ),
      );

    // 4. alt=media: the spike's own file (compared), then one of the extension's (size only).
    if (id)
      steps.push(
        await call(
          "download-own",
          `${API}/${encodeURIComponent(id)}?alt=media`,
          { headers: auth(token) },
          async (r) =>
            r.ok
              ? { matches: (await r.text()) === second }
              : { body: (await r.text()).slice(0, 400) },
        ),
      );
    const theirs = listed.find((f) =>
      f.appProperties?.path?.startsWith("devices/"),
    );
    if (theirs)
      steps.push(
        await call(
          "download-extension",
          `${API}/${encodeURIComponent(theirs.id)}?alt=media`,
          { headers: auth(token) },
          async (r) =>
            r.ok
              ? {
                  path: theirs.appProperties.path,
                  bytes: (await r.arrayBuffer()).byteLength,
                  listedSize: theirs.size,
                }
              : { body: (await r.text()).slice(0, 400) },
        ),
      );

    // about.get (the account's address): only whether one came back.
    steps.push(
      await call(
        "about",
        `${ABOUT}?fields=user(emailAddress)`,
        { headers: auth(token) },
        async (r) =>
          r.ok
            ? {
                hasAddress: (
                  (await r.json()).user?.emailAddress ?? ""
                ).includes("@"),
              }
            : { body: (await r.text()).slice(0, 400) },
      ),
    );

    // Clean up: the extension never sees the file, but leave nothing behind.
    if (id)
      steps.push(
        await call("delete", `${API}/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: auth(token),
        }),
      );

    post(result);
  }

  /** A token Drive refuses: what the 401 looks like. */
  async function refused(token, label) {
    const url = new URL(API);
    url.searchParams.set("spaces", "appDataFolder");
    url.searchParams.set("fields", "files(id)");
    const step = await call(
      label,
      url.href,
      { headers: auth(token) },
      async (r) => ({
        body: r.ok
          ? `ok, ${((await r.json()).files ?? []).length} files`
          : (await r.text()).slice(0, 600),
        wwwAuthenticate: r.headers.get("www-authenticate"),
      }),
    );
    post({ what: label, origin: location.origin, steps: [step] });
  }

  /** Google's tokeninfo: the client the token is for, its scope and how long it has left. */
  async function probe(token) {
    const step = await call(
      "tokeninfo",
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`,
      {},
      async (r) => {
        const info = await r.json();
        return {
          azp: info.azp,
          scope: info.scope,
          expires_in: info.expires_in,
          error: info.error_description,
        };
      },
    );
    post({ what: "probe", origin: location.origin, steps: [step] });
  }

  window.driveSpike = { run, refused, probe };
  post({ what: "loaded", origin: location.origin, secure: isSecureContext });
})();
