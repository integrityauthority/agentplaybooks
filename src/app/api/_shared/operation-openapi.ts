import type { McpTool } from "@/lib/supabase/types";

export function operationPathsFromTools(
  tools: McpTool[],
  pathForTool: (tool: McpTool) => string,
  securityScheme = "bearerAuth",
): Record<string, unknown> {
  return Object.fromEntries(tools.map((tool) => [
    pathForTool(tool),
    {
      post: {
        operationId: tool.name,
        summary: tool.description || tool.name,
        description: tool.description,
        security: [{ [securityScheme]: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: tool.inputSchema || { type: "object", properties: {} },
            },
          },
        },
        responses: {
          "200": {
            description: "Operation completed",
            content: {
              "application/json": {
                schema: {},
              },
            },
          },
          "400": { description: "Invalid operation arguments" },
          "401": { description: "Authentication required" },
          "403": { description: "Insufficient permission or playbook access" },
          "404": { description: "Playbook or resource not found" },
        },
        "x-mcp-tool": tool.name,
      },
    },
  ]));
}
