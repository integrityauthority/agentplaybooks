import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  sql,
} from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { generateGuid } from "@/lib/utils";

export type PlaybookAccessRole = "owner" | "editor";

export type PlaybookListItem = typeof schema.playbooks.$inferSelect & {
  skill_count: number;
  mcp_server_count: number;
  memory_count: number;
  current_user_role: PlaybookAccessRole;
};

const playbookListSelection = {
  ...getTableColumns(schema.playbooks),
  skill_count: sql<number>`(
    select cast(count(*) as int)
    from ${schema.skills}
    where ${schema.skills.playbook_id} = ${schema.playbooks.id}
  )`,
  mcp_server_count: sql<number>`(
    select cast(count(*) as int)
    from ${schema.mcpServers}
    where ${schema.mcpServers.playbook_id} = ${schema.playbooks.id}
  )`,
  memory_count: sql<number>`(
    select cast(count(*) as int)
    from ${schema.memories}
    where ${schema.memories.playbook_id} = ${schema.playbooks.id}
  )`,
};

export async function listAccessiblePlaybooks(
  userId: string,
): Promise<PlaybookListItem[]> {
  const db = getDb();
  const owned = await db
    .select(playbookListSelection)
    .from(schema.playbooks)
    .where(eq(schema.playbooks.user_id, userId))
    .orderBy(desc(schema.playbooks.updated_at));

  const memberships = await db
    .select({ playbook_id: schema.playbookCollaborators.playbook_id })
    .from(schema.playbookCollaborators)
    .where(and(
      eq(schema.playbookCollaborators.user_id, userId),
      isNotNull(schema.playbookCollaborators.accepted_at),
    ));

  const sharedIds = memberships.map(({ playbook_id }) => playbook_id);
  const shared = sharedIds.length === 0
    ? []
    : await db
      .select(playbookListSelection)
      .from(schema.playbooks)
      .where(inArray(schema.playbooks.id, sharedIds))
      .orderBy(desc(schema.playbooks.updated_at));

  return [
    ...owned.map((playbook) => ({
      ...playbook,
      current_user_role: "owner" as const,
    })),
    ...shared.map((playbook) => ({
      ...playbook,
      current_user_role: "editor" as const,
    })),
  ].sort(
    (left, right) =>
      right.updated_at.getTime() - left.updated_at.getTime(),
  );
}

export type CreatePlaybookInput = {
  name: string;
  description?: string | null;
  visibility?: "public" | "private" | "unlisted";
  config?: Record<string, unknown>;
};

export async function createPlaybook(
  userId: string,
  input: CreatePlaybookInput,
) {
  const db = getDb();
  const id = crypto.randomUUID();

  await db.insert(schema.playbooks).values({
    id,
    user_id: userId,
    guid: generateGuid(),
    name: input.name,
    description: input.description || null,
    visibility: input.visibility || "private",
    config: input.config || {},
  });

  const [created] = await db
    .select()
    .from(schema.playbooks)
    .where(eq(schema.playbooks.id, id))
    .limit(1);

  if (!created) {
    throw new Error("Created playbook could not be read back.");
  }

  return created;
}
