/** Turns a failed API response into a sentence safe to show. Never shows stack traces or raw bodies. */
export async function errorMessage(res: Response, fallback = "That didn’t work. Please try again."): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string; details?: { message: string }[] } };
    const detail = body.error?.details?.[0]?.message;
    if (res.status === 409 || res.status === 422) return detail ?? body.error?.message ?? fallback;
    if (res.status === 403) return "You don’t have permission to do that.";
  } catch { /* fall through */ }
  return fallback;
}
