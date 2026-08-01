import { describe, expect, it } from "vitest";
import { normalizeRegistryServer } from "./mcp-registry";

describe("normalizeRegistryServer", () => {
  it("maps a streamable HTTP server and keeps secret headers as placeholders", () => {
    const server = normalizeRegistryServer({
      server: {
        name: "ai.example/search",
        title: "Example Search",
        description: "Search the web",
        version: "1.2.3",
        remotes: [{
          type: "streamable-http",
          url: "https://example.ai/mcp",
          headers: [{ name: "Authorization", isSecret: true, isRequired: true }],
        }],
      },
      _meta: {
        "io.modelcontextprotocol.registry/official": { isLatest: true },
      },
    });

    expect(server).toMatchObject({
      registry_id: "ai.example/search@1.2.3",
      qualified_name: "ai.example/search",
      name: "Example Search",
      transport_type: "http",
      installable: true,
      transport_config: {
        url: "https://example.ai/mcp",
        headers: { Authorization: "${AUTHORIZATION}" },
      },
    });
  });

  it("maps npm stdio packages to a portable command", () => {
    const server = normalizeRegistryServer({
      server: {
        name: "io.github.example/files",
        version: "2.0.0",
        packages: [{
          registryType: "npm",
          identifier: "@example/files-mcp",
          transport: { type: "stdio" },
          runtimeArguments: [{ value: "-y" }],
          packageArguments: [{ name: "ROOT", isRequired: true }],
          environmentVariables: [{ name: "TOKEN", isSecret: true, isRequired: true }],
        }],
      },
    });

    expect(server).toMatchObject({
      transport_type: "stdio",
      transport_config: {
        command: "npx",
        args: ["-y", "@example/files-mcp", "${ROOT}"],
        env: { TOKEN: "${TOKEN}" },
      },
    });
  });

  it("marks entries without a supported transport as unavailable", () => {
    expect(normalizeRegistryServer({
      server: { name: "ai.example/unsupported", version: "1.0.0" },
    })).toMatchObject({ installable: false, transport_type: null });
  });
});
