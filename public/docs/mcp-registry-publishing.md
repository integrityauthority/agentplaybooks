# Publish AgentPlaybooks to the Official MCP Registry

AgentPlaybooks exposes a remote Streamable HTTP MCP server at:

```text
https://agentplaybooks.ai/api/mcp/manage
```

The registry metadata is stored in the repository root as `server.json`. The
entry uses the custom-domain namespace `ai.agentplaybooks/agentplaybooks` and
is authenticated using a public proof file served from `agentplaybooks.ai`.

## Before publishing

Deploy the current `main` branch and verify the public endpoint:

```powershell
$body = @{
  jsonrpc = "2.0"
  id = 1
  method = "initialize"
  params = @{
    protocolVersion = "2025-11-25"
    capabilities = @{}
    clientInfo = @{ name = "registry-check"; version = "1.0.0" }
  }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Uri "https://agentplaybooks.ai/api/mcp/manage" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
```

Tool execution requires an AgentPlaybooks user API key in the
`Authorization: Bearer apb_live_...` header. Discovery and initialization do
not require a key.

## Publish

Generate an Ed25519 key pair locally and publish the generated public proof at
`https://agentplaybooks.ai/.well-known/mcp-registry-auth`. Keep the private
key outside the repository. Then authenticate and publish from the repository
root:

```powershell
mcp-publisher login http --domain agentplaybooks.ai --private-key <private-key-hex>
mcp-publisher publish
```

Publishing is an external release operation: review `server.json`, deploy the
matching server version and public proof file, and only then run `publish`.

Verify the result:

```powershell
Invoke-RestMethod "https://registry.modelcontextprotocol.io/v0.1/servers?search=ai.agentplaybooks/agentplaybooks&version=latest"
```

Do not commit the private key. The proof file contains only the corresponding
public key and is safe to deploy.
