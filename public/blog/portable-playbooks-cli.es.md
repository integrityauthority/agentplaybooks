---
title: Un playbook, todos los agentes — adaptadores CLI, sincronización remota y el plugin de Claude Code
description: La CLI de AgentPlaybooks ahora sincroniza tus skills y configuración MCP entre Claude Code, Cursor, ChatGPT/Codex, Google Antigravity y Hermes Agent — y se distribuye como un plugin de Claude Code que instalas con un solo comando.
date: 2026-08-01
author: Mate Benyovszky
---

# Un playbook, todos los agentes

Tu configuración de agentes está dispersa. Los skills viven en
`.claude/skills/`, tus servidores MCP en `.mcp.json`, una copia ligeramente
distinta en `.cursor/mcp.json`, las instrucciones en `AGENTS.md` — y cada
nueva herramienta de codificación con IA añade otra carpeta. Mantener todo
eso consistente a mano es exactamente el tipo de tarea que los agentes
debían eliminar.

Desde hoy, la CLI de AgentPlaybooks cierra ese círculo. `agentplaybooks sync`
genera los archivos de plataforma que faltan en cada destino habilitado,
`pull`/`push` conectan tu proyecto local con un playbook alojado, y toda la
CLI es a la vez un **plugin de Claude Code** — así tu agente puede ejecutar
el flujo por ti.

## Cinco plataformas, un comando

`apb sync` normaliza lo que encuentra en el manifiesto canónico
`agentplaybook.json` y luego rellena los huecos por destino:

| Destino | Skills | Servidores MCP |
|---|---|---|
| Claude Code / Cowork | `.claude/skills/` | `.mcp.json` |
| Cursor | `.cursor/skills/` | `.cursor/mcp.json` |
| ChatGPT / OpenAI Codex | `.codex/skills/` | `.codex/config.toml` |
| Google Antigravity | `.agents/skills/` | — |
| Nous Hermes Agent | `~/.hermes/skills/` | — |

Escribe un skill una vez en Claude Code, ejecuta `apb sync --apply`, y
aparecerá también en Cursor, Codex y Antigravity — incluidas tus
definiciones de servidores MCP, traducidas automáticamente entre JSON y el
formato TOML de Codex.

Un buen detalle: Google Antigravity lee los skills del proyecto desde
`.agents/skills/`, exactamente el almacén portátil de AgentPlaybooks.
Descarga un playbook y estará listo para Antigravity sin pasos adicionales.

## Seguro por defecto

El motor de sincronización mantiene las garantías de nuestro diseño
original:

- **Primero el plan.** Nada se escribe ni se sube sin un `--apply`
  explícito.
- **Sin sobrescrituras silenciosas.** Las definiciones homónimas con
  contenido distinto son conflictos — se informan y se omiten hasta que
  resuelvas la divergencia.
- **Copias de seguridad.** Todo archivo modificado se copia antes a
  `.agentplaybooks/backups/`.
- **Sin fugas de secretos.** Los valores secretos nunca entran en el
  manifiesto, y `push` se niega a subir contenido que parezca contener
  credenciales incrustadas.

## Playbooks de equipo: pull y push

```bash
apb login                 # guarda tu user API key (apb_...)
apb push --apply          # sube skills + manifiesto a un playbook alojado
apb pull <guid> --apply   # tus compañeros lo descargan en sus proyectos
```

`pull` deposita los skills en el almacén portátil `.agents/skills/`; un
`sync --apply` posterior los reparte a cada plataforma que use tu compañero —
aunque sea un editor distinto al tuyo. Esa es la idea: **la unidad portátil
es el playbook, no la herramienta**.

## Instálalo como plugin de Claude Code

El paquete de la CLI es en sí mismo un plugin de Claude Code / Claude Cowork,
con el skill `agentplaybooks` y comandos slash:

```text
/plugin marketplace add integrityauthority/agentplaybooks
/plugin install agentplaybooks@agentplaybooks
```

Después solo pide: «audita mi configuración de agentes», «haz que mis skills
de Claude estén disponibles en ChatGPT y Cursor», o ejecuta
`/agentplaybooks:doctor`. El skill conoce el flujo seguro — planifica,
muestra el diff y aplica solo tras tu aprobación.

## Empieza ya

```bash
git clone https://github.com/integrityauthority/agentplaybooks
node agentplaybooks/packages/cli/bin/agentplaybooks.js doctor .
```

Lee la guía completa en la [documentación de CLI y plugins de editor](/docs/cli)
— y cuéntanos qué adaptador de plataforma quieres a continuación: ROS 2 ya
está en la [hoja de ruta](/docs/roadmap).
