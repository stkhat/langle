// The scriptlets that change what `fetch` and XMLHttpRequest answer the page.
import { isObject, regexOf, textTest, wrapMethod, type Win } from "./shared";

/** What a request is matched by: its URL and the other options it was made with. */
export type RequestProps = Readonly<Record<string, string>>;

/**
 * uBO's `propsToMatch`: space-separated parts that must all match. `name:value` matches
 * a request option (`method:POST`, `url:/api/`); anything else matches the URL.
 * Values are text a property must contain, or `/re/flags`.
 */
export function requestTest(spec: string): (props: RequestProps) => boolean {
  const tests = spec
    .split(/\s+/)
    .filter((part) => part !== "")
    .map((part) => {
      // `https://…` and `/re:x/` are URLs, not options.
      const named = /^([A-Za-z]+):(.+)$/.exec(part);
      const option =
        named && regexOf(part) === undefined && !named[2]?.startsWith("//")
          ? { name: named[1] ?? "url", value: named[2] ?? "" }
          : { name: "url", value: part };
      const { name } = option;
      const test = textTest(option.value);
      return (props: RequestProps) =>
        props[name] !== undefined && test(props[name]);
    });
  return (props) => tests.every((test) => test(props));
}

function fetchProps(win: Win, args: unknown[]): RequestProps {
  const [input, init] = args;
  const props: Record<string, string> = { method: "GET" };
  if (input instanceof win.Request) {
    props.url = input.url;
    props.method = input.method;
    props.mode = input.mode;
    props.credentials = input.credentials;
  } else props.url = String(input);
  if (isObject(init))
    for (const [name, value] of Object.entries(init))
      if (typeof value === "string") props[name] = value;
  return props;
}

/**
 * Lets `edit` change the text of the responses of the page's `fetch` calls that
 * `matches`; `edit` answers undefined to leave a response as it came.
 */
export function editFetchResponses(
  win: Win,
  matches: (props: RequestProps) => boolean,
  edit: (text: string) => string | undefined,
) {
  wrapMethod(win, "fetch", (original, self, args) => {
    const response = Reflect.apply(original, self, args) as Promise<Response>;
    if (!matches(fetchProps(win, args))) return response;
    return response.then(async (response) => {
      try {
        const text = await response.clone().text();
        const edited = edit(text);
        if (edited === undefined || edited === text) return response;
        const replaced = new win.Response(edited, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
        for (const name of ["url", "type", "redirected"] as const)
          Object.defineProperty(replaced, name, { value: response[name] });
        return replaced;
      } catch {
        return response;
      }
    });
  });
}

/**
 * Lets `edit` change the text of the responses the page's XMLHttpRequests that
 * `matches` receive (as `response` and `responseText`); undefined leaves them.
 */
export function editXhrResponses(
  win: Win,
  matches: (props: RequestProps) => boolean,
  edit: (text: string) => string | undefined,
) {
  const Native = win.XMLHttpRequest;
  win.XMLHttpRequest = class extends Native {
    #matched = false;
    #raw: unknown = undefined;
    #edited: unknown = undefined;

    override open(method: string, url: string | URL, ...rest: unknown[]) {
      this.#matched = matches({ method, url: String(url) });
      this.#raw = undefined;
      // @ts-expect-error -- open's optional arguments pass through as they came.
      return super.open(method, url, ...rest);
    }

    /** The response as `edit` left it, worked out once per response. */
    #result(raw: unknown, asText: boolean): unknown {
      if (raw === this.#raw) return this.#edited;
      this.#raw = raw;
      this.#edited = raw;
      try {
        if (typeof raw === "string") this.#edited = edit(raw) ?? raw;
        else if (this.responseType === "json" && raw !== null && !asText) {
          const edited = edit(JSON.stringify(raw));
          if (edited !== undefined) this.#edited = JSON.parse(edited);
        }
      } catch {
        this.#edited = raw;
      }
      return this.#edited;
    }

    override get response(): unknown {
      const raw: unknown = super.response;
      if (!this.#matched || this.readyState !== 4) return raw;
      return this.#result(raw, false);
    }

    override get responseText(): string {
      const raw = super.responseText;
      if (!this.#matched || this.readyState !== 4) return raw;
      return this.#result(raw, true) as string;
    }
  };
}
