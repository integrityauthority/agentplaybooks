/**
 * The original audit path. Both it and /api/playbooks/:guid/audit are served by
 * the same handler — see that app for why.
 */
import { handle } from "hono/vercel";
import { app } from "@/app/api/playbooks/[guid]/audit/app";

export const GET = handle(app);
