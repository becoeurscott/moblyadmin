const API_BASE = "/api/proxy";

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string;
  params?: Record<string, string | number | undefined>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, token, params } = opts;

  let url = `${API_BASE}${path}`;
  if (params) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") sp.set(k, String(v));
    }
    const qs = sp.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.error || res.statusText, data.code);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export function adminApi<T = unknown>(
  path: string,
  token: string,
  opts: Omit<RequestOptions, "token"> = {},
): Promise<T> {
  return api<T>(`/admin${path}`, { ...opts, token });
}
