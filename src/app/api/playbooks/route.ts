import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../_shared/auth";
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

    const body = await request.json();
    const { name, description, is_public, visibility, config } = body;

    if (!name) {
        return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Determine visibility
    let visibilityValue = visibility;
    if (!visibilityValue && is_public !== undefined) {
        visibilityValue = is_public ? 'public' : 'private';
    }
    if (!visibilityValue) visibilityValue = 'private';

    if (!["public", "private", "unlisted"].includes(visibilityValue)) {
        return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });
    }

    try {
        const data = await createPlaybook(user.id, {
            name,
            description: description || null,
            visibility: visibilityValue,
            config: config || {},
        });
        return NextResponse.json(data, { status: 201 });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Database error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
