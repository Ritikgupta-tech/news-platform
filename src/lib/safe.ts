/** Await a data call; on failure log server-side only (no internals to the client) and report it. */
export async function settle<T>(label: string, p: Promise<T>, fallback: T): Promise<{ data: T; failed: boolean }> {
  try {
    return { data: await p, failed: false };
  } catch (err) {
    console.error(`[content] ${label} failed:`, err instanceof Error ? err.message : "unknown error");
    return { data: fallback, failed: true };
  }
}
