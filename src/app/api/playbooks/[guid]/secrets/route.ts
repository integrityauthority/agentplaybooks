/**
 * The secrets API is one Hono app (`./app.ts`) whose routes sit at several
 * paths. Next matches a `route.ts` against its exact path only, so each of
 * those paths needs a file here that hands the request to the same app —
 * `audit/`, `proxy/`, `reveal/[name]/`, `[name]/`. Without them the request
 * falls through to the `/api/[[...route]]` catch-all, which knows nothing about
 * secrets and answers 404: that is what `reveal`, rotate, delete and `proxy`
 * were doing before those files existed.
 */
import { handle } from "hono/vercel";
import { app } from "./app";

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const DELETE = handle(app);
