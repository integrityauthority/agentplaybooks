import { handle } from "hono/vercel";
import { app } from "../app";

export const PUT = handle(app);
export const DELETE = handle(app);
