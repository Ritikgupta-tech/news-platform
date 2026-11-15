import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "./errors";

/**
 * Response envelope (all endpoints):
 *   success: { "data": <T>, "meta"?: {...} }
 *   failure: { "error": { "code": string, "message": string, "details"?: unknown, "requestId": string } }
 */
export function ok<T>(data: T, meta?: object, init?: ResponseInit) {
  return NextResponse.json(meta ? { data, meta } : { data }, init);
}

export function created<T>(data: T) {
  return NextResponse.json({ data }, { status: 201 });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/** Wraps a route handler: maps Zod/ApiError to the envelope, hides internals on unknown errors. */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    const requestId = crypto.randomUUID();
    try {
      const res = await handler(req, ctx);
      res.headers.set("X-Request-Id", requestId);
      return res;
    } catch (err) {
      return toErrorResponse(err, requestId);
    }
  };
}

export function toErrorResponse(err: unknown, requestId: string) {
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          requestId,
        },
      },
      { status: 422, headers: { "X-Request-Id": requestId } },
    );
  }
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details, requestId } },
      { status: err.status, headers: { "X-Request-Id": requestId } },
    );
  }
  // Unknown error: log server-side only, never leak message or stack to the client.
  console.error(`[${requestId}] Unhandled error`, err);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong", requestId } },
    { status: 500, headers: { "X-Request-Id": requestId } },
  );
}
