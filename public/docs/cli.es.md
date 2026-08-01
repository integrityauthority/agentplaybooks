# CLI y plugins de editor

La CLI de AgentPlaybooks (`@agentplaybooks/cli`, binario `agentplaybooks` o
`apb`) mantiene tu configuración de agentes — archivos de instrucciones,
Agent Skills y definiciones de servidores MCP — sana, consistente entre
herramientas de codificación con IA y compartible como playbook alojado. Es
un paquete Node.js (>= 20) sin dependencias, ubicado en
[`packages/cli`](https://github.com/integrityauthority/agentplaybooks/tree/main/packages/cli).

## Doctor: audita tu configuración de agentes

```bash
apb doctor .            # informe de salud legible
apb doctor . --json     # salida estable procesable por máquinas
apb doctor . --strict   # código de salida 2 con hallazgos high/critical (CI)
```

Doctor es de solo lectura y solo local. Descubre archivos `AGENTS.md`,
`CLAUDE.md`, `.cursorrules`, `SKILL.md` y configuraciones MCP en las carpetas
de plataforma, e informa:

- Violaciones de la especificación de Agent Skills (name/description ausentes)
- Credenciales probablemente incrustadas (nunca imprime valores, solo líneas)
- URLs MCP `http://` inseguras fuera de localhost
- Skills o servidores MCP homónimos con definiciones divergentes (drift)
- Una puntuación de salud determinista de 0 a 100

## Sync: un playbook, todos los agentes

```bash
apb sync .              # solo plan — muestra lo que se escribiría
apb sync . --apply      # escribe el manifiesto y los archivos faltantes
```

Sync normaliza lo encontrado en el manifiesto canónico `agentplaybook.json`
y luego genera los archivos que faltan en cada destino de despliegue
habilitado:

| Destino | Skills | Servidores MCP |
|---|---|---|
| `claude` — Claude Code / Claude Cowork | `.claude/skills/<nombre>/SKILL.md` | `.mcp.json` |
| `cursor` — Cursor | `.cursor/skills/<nombre>/SKILL.md` | `.cursor/mcp.json` |
| `codex` — ChatGPT / OpenAI Codex | `.codex/skills/<nombre>/SKILL.md` | `.codex/config.toml` |
| `antigravity` — Google Antigravity | `.agents/skills/<nombre>/SKILL.md` | — (config. global) |
| `hermes` — Nous Hermes Agent | `~/.hermes/skills/<nombre>/SKILL.md` | — (`config.yaml` global) |

Las plataformas detectadas se habilitan automáticamente; `antigravity` y
`hermes` son opcionales — añade una entrada a `spec.targets` en
`agentplaybook.json`:

```json
{ "id": "codex", "type": "codex", "enabled": true, "config": {} }
```

Reglas de seguridad:

- Todo es solo un plan salvo que pases `--apply` explícitamente.
- Las definiciones homónimas con contenido distinto son **conflictos**: se
  informan y se omiten, nunca se sobrescriben.
- Los archivos modificados se respaldan antes en `.agentplaybooks/backups/`.
- Los valores secretos nunca entran en el manifiesto — solo referencias de
  entorno.

## Sincronización remota: comparte playbooks con tu equipo

```bash
export AGENTPLAYBOOKS_API_KEY=<tu-user-api-key>
apb login               # verifica y guarda la clave (~/.agentplaybooks, 0600)
apb playbooks           # lista los playbooks accesibles

apb pull <guid> --apply # descarga skills a .agents/skills/
apb push --apply        # sube skills locales + manifiesto
```

`pull` escribe los skills remotos en el almacén portátil `.agents/skills/` y
vincula el proyecto mediante `.agentplaybooks/remote.json`; un posterior
`apb sync --apply` los propaga a todos los destinos habilitados. `push` sube
los skills y el manifiesto al playbook vinculado (o a uno nuevo) — nunca sube
valores secretos y se niega a subir contenido que parezca contener
credenciales incrustadas. Para despliegues self-hosted usa `--url=<base>` o
`AGENTPLAYBOOKS_URL`.

## Plugin para Claude Code y Claude Cowork

El paquete de la CLI es a la vez un plugin de Claude Code con el skill
`agentplaybooks` y los comandos `/agentplaybooks:doctor`, `:sync`, `:pull`,
`:push`:

```text
/plugin marketplace add integrityauthority/agentplaybooks
/plugin install agentplaybooks@agentplaybooks
```

Tras instalarlo, pídele a Claude cosas como «audita mi configuración de
agentes» o «haz que mis skills de Claude estén disponibles en Cursor y
ChatGPT» — el skill conoce el flujo seguro (primero plan, apply tras tu
aprobación).

## Otras plataformas

- **ChatGPT / Codex**: los skills van a `.codex/skills/` y los servidores MCP
  a `.codex/config.toml` — la CLI de Codex y el agente de codificación de
  ChatGPT los detectan automáticamente.
- **Google Antigravity**: lee los skills del proyecto desde `.agents/skills/`,
  exactamente el almacén portátil de AgentPlaybooks — un playbook descargado
  queda listo para Antigravity sin pasos extra.
- **Hermes Agent**: no tiene almacén por proyecto, así que el adaptador
  escribe en `~/.hermes/skills/` (visible como ruta home en el plan); Hermes
  además lee las instrucciones `AGENTS.md` de forma nativa.
- **Cursor**: skills en `.cursor/skills/`, servidores MCP en
  `.cursor/mcp.json`.
