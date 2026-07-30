import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../../_shared/auth";
import {
  createPlaybook,
  listAccessiblePlaybooks,
} from "@/lib/db/repositories/playbooks";

export async function GET(request: NextRequest) {
  const user = await requireAuth(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await listAccessiblePlaybooks(user.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await requireAuth(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== "string" || body.name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const requestedVisibility = body.visibility
    ?? (typeof body.is_public === "boolean"
      ? body.is_public ? "public" : "private"
      : "private");

  if (!["public", "private", "unlisted"].includes(requestedVisibility)) {
    return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });
  }

  try {
    const playbook = await createPlaybook(user.id, {
      name: body.name.trim(),
      description: typeof body.description === "string"
        ? body.description
        : null,
      visibility: requestedVisibility,
      config: body.config && typeof body.config === "object"
        ? body.config
        : {},
    });
    return NextResponse.json(playbook, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
