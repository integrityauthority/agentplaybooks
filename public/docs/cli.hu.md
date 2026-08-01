# CLI és szerkesztő-pluginok

Az AgentPlaybooks CLI (`@agentplaybooks/cli`, bináris: `agentplaybooks` vagy
`apb`) az ügynök-konfigurációt — utasításfájlokat, Agent Skilleket és MCP-
szerver definíciókat — tartja egészségesen, konzisztensen az AI-kódoló
eszközök között, és megoszthatóvá teszi hosztolt playbookként. Zéró
függőségű Node.js (>= 20) csomag, helye:
[`packages/cli`](https://github.com/integrityauthority/agentplaybooks/tree/main/packages/cli).

## Doctor: az ügynök-konfiguráció auditja

```bash
apb doctor .            # ember által olvasható állapotjelentés
apb doctor . --json     # stabil, géppel feldolgozható kimenet
apb doctor . --strict   # 2-es kilépési kód high/critical találatnál (CI)
```

A doctor csak olvas, és csak lokálisan dolgozik. Felderíti az `AGENTS.md`,
`CLAUDE.md`, `.cursorrules`, `SKILL.md` fájlokat és az MCP-konfigokat a
platformmappákban, és jelenti:

- Agent Skills specifikációsértéseket (hiányzó name/description, rossz nevek)
- Valószínűleg beégetett hitelesítőadatokat (értéket sosem ír ki, csak sorszámot)
- Nem biztonságos, localhoston kívüli `http://` MCP URL-eket
- Azonos nevű, de platformonként eltérő definíciójú skilleket/MCP-szervereket
- Determinisztikus 0–100 közötti egészségpontszámot

## Sync: egy playbook, minden ügynök

```bash
apb sync .              # csak terv — megmutatja, mi íródna
apb sync . --apply      # manifest és hiányzó platformfájlok megírása
```

A sync a talált konfigurációt a kanonikus `agentplaybook.json` manifestbe
normalizálja, majd legenerálja az engedélyezett deployment targetekről
hiányzó fájlokat:

| Target | Skillek | MCP-szerverek |
|---|---|---|
| `claude` — Claude Code / Claude Cowork | `.claude/skills/<név>/SKILL.md` | `.mcp.json` |
| `cursor` — Cursor | `.cursor/skills/<név>/SKILL.md` | `.cursor/mcp.json` |
| `codex` — ChatGPT / OpenAI Codex | `.codex/skills/<név>/SKILL.md` | `.codex/config.toml` |
| `antigravity` — Google Antigravity | `.agents/skills/<név>/SKILL.md` | — (globális konfig) |
| `hermes` — Nous Hermes Agent | `~/.hermes/skills/<név>/SKILL.md` | — (globális `config.yaml`) |

A felismert platformok automatikusan engedélyezettek; az `antigravity` és a
`hermes` opt-in — vegyél fel egy bejegyzést az `agentplaybook.json`
`spec.targets` listájába:

```json
{ "id": "codex", "type": "codex", "enabled": true, "config": {} }
```

Biztonsági szabályok:

- `--apply` nélkül minden csak terv.
- Az azonos nevű, de eltérő tartalmú definíciók **konfliktusok**: jelentve és
  kihagyva — soha nincs felülírás. Oldd fel az eltérést, majd futtasd újra.
- A módosuló fájlokról előbb backup készül a `.agentplaybooks/backups/` alá.
- Secret-értékek sosem kerülnek a manifestbe — csak környezeti hivatkozások.
- A sorvégek normalizálva vannak (a CRLF LF-ként számít), így ugyanannak a
  skillnek Windowson, macOS-en és Linuxon is ugyanaz a digestje. Egy vegyes
  platformú csapat nem lát fantom-driftet egy checkout-különbség miatt.

## Távoli szinkron: playbook-megosztás a csapattal

```bash
export AGENTPLAYBOOKS_API_KEY=<sajat-user-api-kulcs>
apb login               # kulcs ellenőrzése és tárolása (~/.agentplaybooks, 0600)
apb playbooks           # a kulccsal elérhető playbookok listája

apb pull <guid> --apply # skillek letöltése a .agents/skills/ tárba
apb push --apply        # lokális skillek + manifest feltöltése
```

A round-trip mindkét irányban működik:

- **Lokális → hosztolt** (`push`): a bármelyik platformmappában megtalált
  skillek és a kanonikus manifest felkerülnek a linkelt (vagy egy új)
  playbookba. A lokálisan már nem létező távoli skilleket nem bántja,
  secret-értéket sosem tölt fel, és megtagadja az olyan tartalom feltöltését,
  ami beégetett hitelesítőadatnak tűnik.
- **Hosztolt → lokális** (`pull` + `sync --apply`): a távoli skillek a
  hordozható `.agents/skills/` tárba kerülnek, a projekt pedig a
  `.agentplaybooks/remote.json`-nal linkelődik; az ezt követő sync minden
  engedélyezett platform-targetre szétteríti őket — bármelyik szerkesztőt is
  használja a csapattársad.

Self-hosted telepítéshez használd a `--url=<base>` kapcsolót vagy az
`AGENTPLAYBOOKS_URL` változót.

Hatókör ebben a kiadásban: a távoli `push`/`pull` a skilleket és a manifestet
fedi le. Az MCP-szerver definíciók a lokális platformfájlok között
szinkronizálódnak (`.mcp.json`, `.cursor/mcp.json`, `.codex/config.toml`), de
a hosztolt playbook MCP-szerver listájába még nem íródnak be, és onnan még
nem is olvasódnak.

## Claude Code és Claude Cowork plugin

A CLI-csomag egyben Claude Code plugin is: `agentplaybooks` skillel és
`/agentplaybooks:doctor`, `:sync`, `:pull`, `:push` parancsokkal:

```text
/plugin marketplace add integrityauthority/agentplaybooks
/plugin install agentplaybooks@agentplaybooks
```

Telepítés után kérdezd Claude-ot például így: „auditáld az
ügynök-konfigomat”, vagy „tedd elérhetővé a Claude-skilljeimet Cursorban és
ChatGPT-ben” — a skill ismeri a biztonságos munkamenetet (előbb terv, csak
jóváhagyás után apply).

## További platformok

- **ChatGPT / Codex**: a skillek a `.codex/skills/`-be, az MCP-szerverek a
  `.codex/config.toml`-ba kerülnek — a Codex CLI és a ChatGPT kódoló ügynöke
  automatikusan felveszi őket.
- **Google Antigravity**: a projektszintű skilleket a `.agents/skills/`-ből
  olvassa, ami pontosan az AgentPlaybooks hordozható tára — egy lehúzott
  playbook külön lépés nélkül Antigravity-kész.
- **Hermes Agent**: nincs projektszintű tára, ezért az adapter a
  `~/.hermes/skills/`-be ír (a tervben home-útvonalként jelenik meg); a
  Hermes az `AGENTS.md` utasításokat natívan is olvassa.
- **Cursor**: skillek a `.cursor/skills/`-ben, MCP-szerverek a
  `.cursor/mcp.json`-ban.
