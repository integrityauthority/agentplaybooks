import { describe, expect, it } from "vitest";
import {
  PLAYBOOK_TOOLS,
  projectPlaybookToolsForUser,
} from "@/app/api/_shared/playbook-tools";
import { operationPathsFromTools } from "@/app/api/_shared/operation-openapi";

function schema(toolName: string, tools = PLAYBOOK_TOOLS) {
  const tool = tools.find((candidate) => candidate.name === toolName);
  expect(tool, `${toolName} should be registered`).toBeDefined();
  return tool!.inputSchema as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

describe("playbook operation projections", () => {
  it("publishes the full playbook surface from one canonical catalog", () => {
    const names = PLAYBOOK_TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(expect.arrayContaining([
      "create_skill",
      "write_memory",
      "create_run",
      "write_canvas",
      "create_mcp_server",
      "call_connected_tool",
      "store_secret",
    ]));
  });

  it("binds playbook identity in the direct route and lifts it in the user control plane", () => {
    const projected = projectPlaybookToolsForUser();
    expect(projected.map((tool) => tool.name)).toEqual(PLAYBOOK_TOOLS.map((tool) => tool.name));

    for (const tool of projected) {
      const projectedSchema = tool.inputSchema as {
        properties?: Record<string, unknown>;
        required?: string[];
      };
      expect(projectedSchema.properties).toHaveProperty("playbook_id");
      expect(projectedSchema.required).toContain("playbook_id");
    }

    for (const tool of PLAYBOOK_TOOLS) {
      expect((tool.inputSchema?.properties as Record<string, unknown> | undefined)?.playbook_id).toBeUndefined();
    }
  });

  it("requires workflow-run identity for individual canvas documents", () => {
    expect(schema("read_canvas").required).toEqual(expect.arrayContaining(["run_id", "slug"]));
    expect(schema("write_canvas").required).toEqual(expect.arrayContaining(["run_id", "slug", "name", "content"]));
    expect(schema("patch_canvas_section").required).toContain("run_id");
  });

  it("generates OpenAPI operation paths from the same catalog", () => {
    const paths = operationPathsFromTools(
      PLAYBOOK_TOOLS,
      (tool) => `/playbooks/demo/operations/${tool.name}`,
      "apiKey",
    );
    expect(Object.keys(paths)).toHaveLength(PLAYBOOK_TOOLS.length);
    expect(paths).toHaveProperty("/playbooks/demo/operations/create_run");
    expect(paths).toHaveProperty("/playbooks/demo/operations/store_secret");
  });
});
