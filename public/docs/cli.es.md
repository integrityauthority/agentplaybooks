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
apb sync .                       # solo plan — muestra lo que se escribiría
apb sync . --apply               # escribe el manifiesto y los archivos faltantes
apb sync . --target=codex        # habilita además un destino que el proyecto no tiene
```

Sync normaliza lo encontrado en el manifiesto canónico `agentplaybook.json`
y luego genera los archivos que faltan en cada destino de despliegue
habilitado:

| Destino | Skills | Servidores MCP | Instrucciones |
|---|---|---|---|
| `claude` — Claude Code / Claude Cowork | `.claude/skills/<nombre>/SKILL.md` | `.mcp.json` | `CLAUDE.md` que importa `AGENTS.md` |
| `cursor` — Cursor | `.cursor/skills/<nombre>/SKILL.md` | `.cursor/mcp.json` | — |
| `codex` — ChatGPT / OpenAI Codex | `.codex/skills/<nombre>/SKILL.md` | `.codex/config.toml` | lee `AGENTS.md` de forma nativa |
| `antigravity` — Google Antigravity | `.agents/skills/<nombre>/SKILL.md` | — (config. global) | — |
| `hermes` — Nous Hermes Agent | `~/.hermes/skills/<nombre>/SKILL.md` | — (`config.yaml` global) | lee `AGENTS.md` de forma nativa |

Las plataformas detectadas se habilitan automáticamente; `antigravity` y
`hermes` son opcionales — añade una entrada a `spec.targets` en
`agentplaybook.json`:

```json
{ "id": "codex", "type": "codex", "enabled": true, "config": {} }
```

Reglas de seguridad:

- Todo es solo un plan salvo que pases `--apply` explícitamente.
- Las definiciones homónimas con contenido distinto son **conflictos**: se
  informan y se omiten, nunca se sobrescriben. Resuelve la divergencia y
  vuelve a ejecutar.
- Los archivos modificados se respaldan antes en `.agentplaybooks/backups/`.
- Los valores secretos nunca entran en el manifiesto — solo referencias de
  entorno.
- Los finales de línea se normalizan (CRLF se trata como LF), así el mismo
  skill tiene el mismo digest en Windows, macOS y Linux. Un equipo con
  plataformas mixtas nunca ve divergencias fantasma por el checkout.

## Sincronización remota: comparte playbooks con tu equipo

```bash
export AGENTPLAYBOOKS_API_KEY=<tu-user-api-key>
apb login               # verifica y guarda la clave (~/.agentplaybooks, 0600)
apb playbooks           # lista los playbooks accesibles

apb pull <guid> --apply # descarga skills a .agents/skills/
apb push --apply        # sube skills locales + manifiesto
```

Las instrucciones, los skills, los servidores MCP y el manifiesto viajan en
ambas direcciones:

- **Local → alojado** (`push`): el archivo de instrucciones del proyecto, los
  skills y las definiciones de servidores MCP
  encontrados en cualquier carpeta de plataforma, más el manifiesto canónico,
  se suben al playbook vinculado (o a uno nuevo). `AGENTS.md` manda cuando hay
  varios archivos de instrucciones en la raíz del proyecto; si esos archivos de
  la raíz se contradicen entre sí, es un conflicto, y los archivos de
  instrucciones anidados se quedan en local porque su alcance es un
  subdirectorio, no el proyecto. Los archivos locales tienen
  la autoridad sobre la conexión en sí (command, args, env, url, headers); los
  ajustes de federación que solo existen en el lado alojado — timeouts,
  autenticación, acceso, listas curadas de herramientas, descripciones — se
  preservan, no se sobrescriben. Las entradas remotas que ya no existen en
  local quedan intactas.
- **Alojado → local** (`pull` + `sync --apply`): las instrucciones del playbook
  llegan a `AGENTS.md`, los skills remotos a
  `.agents/skills/` y los servidores MCP remotos a `.agents/mcp.json` — el
  almacén portátil — y el proyecto se vincula mediante
  `.agentplaybooks/remote.json`. El sync posterior reparte ambos a todos los
  destinos de plataforma habilitados, sea cual sea el editor de tu compañero.

Claude Code lee `CLAUDE.md` y no lee `AGENTS.md`, pero sí admite importaciones
con `@`. Así que el destino `claude` no copia tus instrucciones: escribe un
`CLAUDE.md` que contiene `@AGENTS.md`. Una única fuente de verdad, nada que
pueda divergir. Si ya tienes un `CLAUDE.md` sin esa importación, `sync` te lo
informa en lugar de reescribir tu archivo.

En una máquina recién estrenada el almacén portátil es lo único que hay en
disco, y no es un destino de despliegue — así que no se escribiría nada.
Habilita las herramientas que tengas:

```bash
apb pull <guid> --apply
apb sync --target=claude,codex --apply
```

`sync` también lista las herramientas de agente que detecta para tu usuario
cuando no hay ningún destino habilitado, así sabes qué pasarle.

Los servidores de federación OpenAPI son una capacidad exclusiva del lado
alojado, sin equivalente en los clientes locales; `pull` los informa en lugar
de escribir una configuración a medio traducir. Los valores secretos no se
mueven en ninguna dirección — ver más abajo. Para despliegues self-hosted usa
`--url=<base>` o `AGENTPLAYBOOKS_URL`.

## Secretos: el playbook lleva el contrato, no la credencial

Un playbook declara qué credenciales necesita; los valores se quedan donde
corresponde. `sync` recopila en `spec.secrets` todas las referencias de
entorno que encuentra en tu configuración MCP (`${VAR}`, `$VAR`, `env:VAR`):

```json
"secrets": [
  { "name": "DEPLOY_API_KEY", "ref": "env:DEPLOY_API_KEY", "required": true }
]
```

Eso hace que el playbook sea portátil y autodescriptivo: quien lo descargue
sabe exactamente qué variables definir, sin que nadie transmita nunca una
clave. Si editas una entrada — apuntándola a un vault o marcándola como
opcional — tu versión se preserva en el siguiente sync. Los valores de
credenciales literales nunca se escriben en el manifiesto ni se suben;
`doctor` los señala y `push` se niega a ejecutarse hasta que se reemplacen por
referencias.

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
