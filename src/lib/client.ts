export type ApiResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export async function apiRequest<T = unknown>(
  url: string,
  options: { method?: string; body?: unknown; formData?: FormData } = {},
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, {
      method: options.method ?? (options.body || options.formData ? "POST" : "GET"),
      headers: options.formData ? undefined : { "Content-Type": "application/json" },
      body: options.formData ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        error:
          (payload && typeof payload === "object" && "error" in payload && String(payload.error)) ||
          `Request failed (${response.status}).`,
      };
    }
    return { ok: true, data: payload as T };
  } catch {
    return { ok: false, error: "Network error. Check your connection and try again." };
  }
}
