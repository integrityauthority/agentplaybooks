# CLI & Editor-Plugins

Die AgentPlaybooks-CLI (`@agentplaybooks/cli`, Binary `agentplaybooks` oder
`apb`) hält Ihre Agent-Konfiguration — Anweisungsdateien, Agent Skills und
MCP-Server-Definitionen — gesund, konsistent über alle KI-Coding-Tools hinweg
und teilbar als gehostetes Playbook. Es ist ein Node.js-Paket (>= 20) ohne
Abhängigkeiten und liegt in
[`packages/cli`](https://github.com/integrityauthority/agentplaybooks/tree/main/packages/cli).

## Doctor: Agent-Konfiguration prüfen

```bash
apb doctor .            # menschenlesbarer Gesundheitsbericht
apb doctor . --json     # stabile maschinenlesbare Ausgabe
apb doctor . --strict   # Exit-Code 2 bei High/Critical-Befunden (CI)
```

Doctor ist rein lesend und arbeitet nur lokal. Er entdeckt `AGENTS.md`,
`CLAUDE.md`, `.cursorrules`, `SKILL.md`-Dateien und MCP-Konfigurationen in
den Plattformordnern und meldet:

- Verstöße gegen die Agent-Skills-Spezifikation (fehlender Name/Beschreibung)
- Wahrscheinlich hartkodierte Zugangsdaten (nie Werte, nur Zeilennummern)
- Unsichere `http://`-MCP-URLs außerhalb von localhost
- Gleichnamige Skills oder MCP-Server mit abweichenden Definitionen (Drift)
- Einen deterministischen Gesundheitswert von 0–100

## Sync: ein Playbook, jeder Agent

```bash
apb sync .              # nur Plan — zeigt, was geschrieben würde
apb sync . --apply      # Manifest und fehlende Plattformdateien schreiben
```

Sync normalisiert die gefundene Konfiguration in das kanonische
`agentplaybook.json`-Manifest und erzeugt anschließend die Dateien, die den
aktivierten Deployment-Zielen fehlen:

| Ziel | Skills | MCP-Server |
|---|---|---|
| `claude` — Claude Code / Claude Cowork | `.claude/skills/<name>/SKILL.md` | `.mcp.json` |
| `cursor` — Cursor | `.cursor/skills/<name>/SKILL.md` | `.cursor/mcp.json` |
| `codex` — ChatGPT / OpenAI Codex | `.codex/skills/<name>/SKILL.md` | `.codex/config.toml` |
| `antigravity` — Google Antigravity | `.agents/skills/<name>/SKILL.md` | — (globale Konfig.) |
| `hermes` — Nous Hermes Agent | `~/.hermes/skills/<name>/SKILL.md` | — (globale `config.yaml`) |

Erkannte Plattformen werden automatisch aktiviert; `antigravity` und `hermes`
sind Opt-in — fügen Sie einen Eintrag zu `spec.targets` im
`agentplaybook.json` hinzu:

```json
{ "id": "codex", "type": "codex", "enabled": true, "config": {} }
```

Sicherheitsregeln:

- Ohne explizites `--apply` bleibt alles ein Plan.
- Gleichnamige Definitionen mit unterschiedlichem Inhalt sind **Konflikte**:
  Sie werden gemeldet und übersprungen, nie überschrieben.
- Geänderte Dateien werden zuerst unter `.agentplaybooks/backups/` gesichert.
- Geheimniswerte gelangen nie in das Manifest — nur Umgebungsreferenzen.

## Remote-Sync: Playbooks im Team teilen

```bash
export AGENTPLAYBOOKS_API_KEY=<ihr-user-api-key>
apb login               # Schlüssel prüfen und speichern (~/.agentplaybooks, 0600)
apb playbooks           # zugängliche Playbooks auflisten

apb pull <guid> --apply # Skills nach .agents/skills/ herunterladen
apb push --apply        # lokale Skills + Manifest hochladen
```

`pull` schreibt Remote-Skills in den portablen `.agents/skills/`-Speicher und
verknüpft das Projekt über `.agentplaybooks/remote.json`; ein anschließendes
`apb sync --apply` verteilt sie auf alle aktivierten Plattformziele. `push`
lädt Skills und Manifest in das verknüpfte (oder ein neues) Playbook hoch —
es lädt nie Geheimniswerte hoch und verweigert Inhalte, die hartkodierte
Zugangsdaten zu enthalten scheinen. Für Self-Hosting nutzen Sie
`--url=<base>` oder `AGENTPLAYBOOKS_URL`.

## Claude-Code- & Claude-Cowork-Plugin

Das CLI-Paket ist zugleich ein Claude-Code-Plugin mit dem
`agentplaybooks`-Skill und den Befehlen `/agentplaybooks:doctor`, `:sync`,
`:pull`, `:push`:

```text
/plugin marketplace add integrityauthority/agentplaybooks
/plugin install agentplaybooks@agentplaybooks
```

Nach der Installation können Sie Claude z. B. bitten: „prüfe meine
Agent-Konfiguration“ oder „mach meine Claude-Skills in Cursor und ChatGPT
verfügbar“ — der Skill kennt den sicheren Ablauf (erst planen, nach Freigabe
anwenden).

## Weitere Plattformen

- **ChatGPT / Codex**: Skills landen in `.codex/skills/`, MCP-Server in
  `.codex/config.toml` — die Codex-CLI und der Coding-Agent von ChatGPT
  übernehmen sie automatisch.
- **Google Antigravity**: liest Projekt-Skills aus `.agents/skills/` — genau
  dem portablen Speicher von AgentPlaybooks; ein gezogenes Playbook ist ohne
  Zusatzschritt Antigravity-bereit.
- **Hermes Agent**: hat keinen projektbezogenen Speicher, daher schreibt der
  Adapter nach `~/.hermes/skills/` (im Plan als Home-Pfad sichtbar); Hermes
  liest zudem `AGENTS.md`-Anweisungen nativ.
- **Cursor**: Skills in `.cursor/skills/`, MCP-Server in `.cursor/mcp.json`.
