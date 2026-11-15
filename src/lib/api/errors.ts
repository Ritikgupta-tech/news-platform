/** Stable, machine-readable error codes returned by every endpoint. */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_TOKEN"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VERSION_CONFLICT"
  | "INVALID_TRANSITION"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const Errors = {
  unauthenticated: () => new ApiError(401, "UNAUTHENTICATED", "Authentication required"),
  forbidden: () => new ApiError(403, "FORBIDDEN", "You do not have permission to perform this action"),
  notFound: (what = "Resource") => new ApiError(404, "NOT_FOUND", `${what} not found`),
  conflict: (message: string) => new ApiError(409, "CONFLICT", message),
  versionConflict: (current: number) =>
    new ApiError(409, "VERSION_CONFLICT", "This item was modified by someone else. Reload and retry.", {
      currentVersion: current,
    }),
  invalidTransition: (from: string, to: string) =>
    new ApiError(422, "INVALID_TRANSITION", `Cannot move article from ${from} to ${to}`),
  rateLimited: (retryAfterSeconds: number) =>
    new ApiError(429, "RATE_LIMITED", "Too many requests", { retryAfterSeconds }),
};
