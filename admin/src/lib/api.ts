export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface Api {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  blob(path: string): Promise<Blob>;
}

export function createApi(baseUrl: string, getToken: () => string | null, onUnauthorized: () => void, fetcher: Fetcher = (url, init) => fetch(url, init)): Api {
  async function call(method: string, path: string, body?: unknown): Promise<Response> {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetcher(baseUrl + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.status === 401 && token) onUnauthorized();
    if (!response.ok) {
      let code = `http_${response.status}`;
      try {
        const data = (await response.json()) as { error?: unknown };
        if (typeof data.error === "string") code = data.error;
      } catch {}
      throw new ApiError(response.status, code);
    }
    return response;
  }

  return {
    get: async (path) => (await call("GET", path)).json(),
    post: async (path, body) => (await call("POST", path, body)).json(),
    blob: async (path) => (await call("GET", path)).blob(),
  };
}
