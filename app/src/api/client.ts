export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface ApiOptions {
  baseUrl: string;
  fetcher?: Fetcher;
  getToken: () => string | null;
  onUnauthorized?: () => void;
}

export interface Api {
  get<T>(path: string): Promise<T>;
  send<T>(method: "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<T>;
  upload<T>(path: string, bytes: ArrayBuffer | Uint8Array, headers: Record<string, string>): Promise<T>;
  bytes(path: string): Promise<Uint8Array>;
  url(path: string): string;
}

async function readError(response: Response): Promise<ApiError> {
  let code = `http_${response.status}`;
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") code = body.error;
  } catch {}
  return new ApiError(response.status, code);
}

export function createApi(options: ApiOptions): Api {
  const fetcher: Fetcher = options.fetcher ?? ((url, init) => fetch(url, init));

  async function request<T>(method: string, path: string, headers: Record<string, string>, body?: BodyInit): Promise<T> {
    const token = options.getToken();
    const finalHeaders = token ? { ...headers, Authorization: `Bearer ${token}` } : headers;
    const response = await fetcher(options.baseUrl + path, { method, headers: finalHeaders, body });
    if (response.status === 401 && token) options.onUnauthorized?.();
    if (!response.ok) throw await readError(response);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  return {
    get: (path) => request("GET", path, {}),
    send: (method, path, body) =>
      request(method, path, body === undefined ? {} : { "Content-Type": "application/json" }, body === undefined ? undefined : JSON.stringify(body)),
    upload: (path, bytes, headers) => request("PUT", path, headers, bytes as unknown as BodyInit),
    bytes: async (path) => {
      const token = options.getToken();
      const response = await fetcher(options.baseUrl + path, { method: "GET", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (response.status === 401 && token) options.onUnauthorized?.();
      if (!response.ok) throw await readError(response);
      return new Uint8Array(await response.arrayBuffer());
    },
    url: (path) => options.baseUrl + path,
  };
}
