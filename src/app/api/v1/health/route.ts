import { ok, route } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export const GET = route(async () => ok({ status: "ok", time: new Date().toISOString() }));
