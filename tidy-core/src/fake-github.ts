/**
 * A fake GitHub API at the `fetch` level, for unit tests of the tidy
 * actions. It records every request and routes it to the first handler that
 * answers; the routes themselves belong to the action's own test code. Not
 * exported from `index.ts`: tests import it directly, so it never reaches a
 * bundle.
 */

export interface RecordedRequest {
  method: string;
  /** Path with the query string. */
  path: string;
  body: string;
}

/** What a handler sees of a request. */
export interface FakeRequest extends RecordedRequest {
  url: URL;
}

/** Answers a request, or returns `undefined` to pass it to the next handler. */
export type FakeHandler = (request: FakeRequest) => Response | undefined;

export interface FakeApiOptions {
  /** Tried in order; the first answer wins. No answer is a 404 naming the route. */
  handlers: FakeHandler[];
  /**
   * Fault injection, asked before the handlers. A status answers with that
   * status and a `forced <status>` message, an `Error` rejects the fetch (a
   * network failure), `undefined` passes.
   */
  fail?: (request: RecordedRequest) => number | Error | undefined;
}

export function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/**
 * The 1-based `page` query parameter's slice of `items` as a 200 response,
 * with a `Link: <next>; rel="next"` header when more items follow.
 */
export function jsonPage<T>(items: T[], url: URL, size: number): Response {
  const page = Number(url.searchParams.get("page") ?? "1");
  const headers: Record<string, string> = {};
  if (page * size < items.length) {
    const next = new URL(url);
    next.searchParams.set("page", String(page + 1));
    headers["link"] = `<${next.toString()}>; rel="next"`;
  }
  return json(200, items.slice((page - 1) * size, page * size), headers);
}

/** A handler for one method and one exact path (without the query string). */
export function onPath(
  method: string,
  path: string,
  answer: (request: FakeRequest) => Response,
): FakeHandler {
  return (request) =>
    request.method === method && request.url.pathname === path ? answer(request) : undefined;
}

/** A handler for one method and every path below `prefix`; `answer` gets the rest of the path, still encoded. */
export function onPrefix(
  method: string,
  prefix: string,
  answer: (rest: string, request: FakeRequest) => Response,
): FakeHandler {
  return (request) =>
    request.method === method && request.url.pathname.startsWith(prefix)
      ? answer(request.url.pathname.slice(prefix.length), request)
      : undefined;
}

export function createFakeApi(options: FakeApiOptions): {
  fetch: typeof fetch;
  requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];

  const fakeFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : undefined;
    const url = new URL(request?.url ?? String(input));
    const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? init.body : "";
    const recorded: RecordedRequest = { method, path: url.pathname + url.search, body };
    requests.push(recorded);

    const forced = options.fail?.(recorded);
    if (forced instanceof Error) return Promise.reject(forced);
    if (forced !== undefined) {
      return Promise.resolve(json(forced, { message: `forced ${String(forced)}` }));
    }
    const fakeRequest: FakeRequest = { ...recorded, url };
    for (const handler of options.handlers) {
      const response = handler(fakeRequest);
      if (response !== undefined) return Promise.resolve(response);
    }
    return Promise.resolve(
      json(404, { message: `fake has no route for ${method} ${url.pathname}` }),
    );
  };

  return { fetch: fakeFetch as typeof fetch, requests };
}
