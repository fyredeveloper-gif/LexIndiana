export const TEST_PASSWORD = "TestPassword123";

export function sessionCookie(response: Response): string {
  const cookies = response.headers.getSetCookie();
  const cookie = cookies.find((value) => value.startsWith("lex_session="));
  if (!cookie) {
    throw new Error(`No session cookie was set. Cookies: ${cookies.join(" | ")}`);
  }
  return cookie.split(";")[0];
}

export async function postJson(
  baseUrl: string,
  path: string,
  body: unknown,
  cookie?: string,
): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}
