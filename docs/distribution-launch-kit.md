# AgentPlaybooks Distribution Launch Kit

## Core message

**Your agents remain yours.** AgentPlaybooks is a vendor-neutral, portable home
for skills, MCP servers, personas, project instructions, and memory. Keep one
source of truth in sync while switching platforms, using several platforms at
once, or self-hosting.

## Short description

AgentPlaybooks keeps your AI agent setup portable and in sync across Claude,
ChatGPT, Cursor, Codex, Gemini, local models, and future platforms. Store
skills, MCP servers, personas, instructions, and memory in one vendor-neutral
playbook, so your agents are not locked to a single vendor.

## MCP directory description

AgentPlaybooks is a vendor-neutral management MCP server for portable AI agent
playbooks. Keep Agent Skills, MCP server definitions, personas, project
instructions, and memory in one source of truth, then use or synchronize the
same setup across Claude, ChatGPT, Cursor, Codex, Gemini, local models, and
other MCP-compatible platforms. Self-hostable and designed to avoid vendor
lock-in.

Official MCP Registry: https://registry.modelcontextprotocol.io/v0.1/servers?search=ai.agentplaybooks%2Fagentplaybooks&version=latest

Remote endpoint: https://agentplaybooks.ai/api/mcp/manage

Repository: https://github.com/matebenyovszky/agentplaybooks

## Reddit: r/mcp

**Title:** I built a vendor-neutral home for agent skills, MCP servers, personas and memory

**Body:**

Disclosure: I’m the maker of AgentPlaybooks.

I kept running into the same problem: every AI platform stores agent skills,
tool configuration, project instructions, and memory differently. Switching
from one platform to another—or using several at the same time—meant rebuilding
the same setup and slowly accumulating drift.

AgentPlaybooks is my attempt at a vendor-neutral source of truth for agent
configuration. It stores:

- Agent Skills and reusable instructions
- MCP servers, tools, and resources
- Personas and project instructions
- Persistent agent memory
- Public, private, and unlisted playbooks

The important part is the portability: your agents and their setup remain
yours. You can switch vendors, work across multiple platforms, or self-host
without losing the skills and tools you have built up.

The management MCP server is now published in the Official MCP Registry:

https://registry.modelcontextprotocol.io/v0.1/servers?search=ai.agentplaybooks%2Fagentplaybooks&version=latest

MCP endpoint:

https://agentplaybooks.ai/api/mcp/manage

I’d especially like feedback on whether “playbook” is a useful abstraction for
portable agent configuration, and which platform or export format should be
next.

## Product Hunt

**Name:** AgentPlaybooks

**Tagline:** Your agents. Your skills. Any platform.

**Description:** AgentPlaybooks is a vendor-neutral home for AI agent skills, MCP servers, personas, instructions and memory. Keep one portable setup in sync across Claude, ChatGPT, Cursor, Codex, Gemini, local models and future platforms.

## Hacker News

**Title:** Show HN: AgentPlaybooks – a vendor-neutral home for portable agent skills and MCP configs

Use this only when a directly testable public demo is available. Focus the
opening comment on the engineering problem: every agent platform has its own
configuration format, while the playbook remains the portable source of truth.

## Agent Skills directories

Every public skill should include a standards-compliant `SKILL.md` with a
lowercase hyphenated `name` and a specific `description` that says what the
skill does and when an agent should use it. Keep the vendor-neutral portability
message in the surrounding README, not in every skill's metadata.

## Posting rules

- Disclose that AgentPlaybooks is our project.
- Lead with one concrete workflow, not a list of every feature.
- Do not ask for upvotes or manufacture engagement.
- Do not paste API keys or imply that a secret is required in public.
- Do not publish identical copy to several communities on the same day.
