import type { McpTool } from "@/lib/supabase/types";

/** Account lifecycle tools. Playbook-scoped tools live in playbook-tools.ts. */
export const ACCOUNT_TOOLS: McpTool[] = [
  {
    name: "list_playbooks",
    description: "List playbooks owned by or shared with the authenticated user, including access role and content counts.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "create_playbook",
    description: "Create a new playbook. A playbook is a container for personas (AI personalities), skills (capabilities), and memory (persistent storage).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name of the playbook" },
        description: { type: "string", description: "Description of what the playbook is for" },
        visibility: { type: "string", enum: ["public", "private", "unlisted"], description: "Visibility of the playbook", default: "private" },
        tags: { type: "array", items: { type: "string" }, description: "Discovery and organization tags" },
        persona_name: { type: "string", description: "Initial persona name" },
        persona_system_prompt: { type: "string", description: "Initial persona/system prompt" },
        persona_metadata: { type: "object", description: "Initial persona metadata" },
        instructions: { type: "string", description: "Always-on project instructions (the AGENTS.md / CLAUDE.md content). Separate from the persona: the persona is who the agent is, these are the rules of this project." },
      },
      required: ["name"],
    },
  },
  {
    name: "get_playbook",
    description: "Get a playbook with its singleton persona, skills, connected MCP servers, and memory.",
    inputSchema: {
      type: "object",
      properties: {
        playbook_id: { type: "string", description: "UUID of the playbook" },
      },
      required: ["playbook_id"],
    },
  },
  {
    name: "delete_playbook",
    description: "Delete a playbook and all its contents (personas, skills, memory, API keys). This action cannot be undone!",
    inputSchema: {
      type: "object",
      properties: {
        playbook_id: { type: "string", description: "UUID of the playbook to delete" },
      },
      required: ["playbook_id"],
    },
  },
  {
    name: "create_persona",
    description: "Set the singleton persona (AI identity and system prompt) for a playbook. Backward-compatible alias for updating persona fields.",
    inputSchema: {
      type: "object",
      properties: {
        playbook_id: { type: "string", description: "UUID of the playbook" },
        name: { type: "string", description: "Name of the persona" },
        system_prompt: { type: "string", description: "The system prompt that defines this persona's behavior" },
        metadata: { type: "object", description: "Optional metadata" },
      },
      required: ["playbook_id", "name", "system_prompt"],
    },
  },
  {
    name: "update_persona",
    description: "Update a persona's name, system prompt, or metadata.",
    inputSchema: {
      type: "object",
      properties: {
        playbook_id: { type: "string", description: "UUID of the playbook" },
        persona_id: { type: "string", description: "UUID of the persona" },
        name: { type: "string", description: "New name" },
        system_prompt: { type: "string", description: "New system prompt" },
        metadata: { type: "object", description: "New metadata" },
      },
      required: ["playbook_id", "persona_id"],
    },
  },
  {
    name: "delete_persona",
    description: "Reset the singleton persona to the default assistant. The playbook always retains one logical persona.",
    inputSchema: {
      type: "object",
      properties: {
        playbook_id: { type: "string", description: "UUID of the playbook" },
        persona_id: { type: "string", description: "UUID of the persona to delete" },
      },
      required: ["playbook_id", "persona_id"],
    },
  },
];
