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
apb sync .                       # csak terv — megmutatja, mi íródna
apb sync . --apply               # manifest és hiányzó platformfájlok megírása
apb sync . --target=codex        # a projektben még nem használt target bekapcsolása
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

A skillek, az MCP-szerverek és a manifest mindkét irányban utaznak:

- **Lokális → hosztolt** (`push`): a bármelyik platformmappában megtalált
  skillek és MCP-szerver definíciók, valamint a kanonikus manifest felkerülnek
  a linkelt (vagy egy új) playbookba. Magára a kapcsolatra (command, args, env,
  url, headers) a lokális fájlok az irányadóak; a csak a hosztolt oldalon létező
  federációs beállítások — timeoutok, auth, hozzáférés, kurált eszközlisták,
  leírások — megmaradnak, nem íródnak felül. A lokálisan már nem létező távoli
  bejegyzéseket nem bántja.
- **Hosztolt → lokális** (`pull` + `sync --apply`): a távoli skillek a
  `.agents/skills/`, a távoli MCP-szerverek pedig a `.agents/mcp.json` fájlba
  kerülnek — vagyis a hordozható tárba —, a projekt pedig a
  `.agentplaybooks/remote.json`-nal linkelődik. Az ezt követő sync mindkettőt
  szétteríti minden engedélyezett platform-targetre — bármelyik szerkesztőt is
  használja a csapattársad.

Egy friss gépen a hordozható tár az egyetlen dolog, ami a lemezen van, és az
nem deployment target — így önmagában semmi nem íródna ki. Kapcsold be azokat
az eszközöket, amiket használsz:

```bash
apb pull <guid> --apply
apb sync --target=claude,codex --apply
```

Ha egyetlen target sincs engedélyezve, a `sync` ki is listázza, milyen
ügynök-eszközöket talált a felhasználódnál, hogy tudd, mit adj át.

Az OpenAPI-federációs szerverek csak a hosztolt oldalon léteznek, lokális
kliensmegfelelőjük nincs; a `pull` ezeket jelenti, nem félig lefordított
konfigot ír a helyükre. Secret-értékek egyik irányban sem mozdulnak — lásd
lentebb. Self-hosted telepítéshez használd a `--url=<base>` kapcsolót vagy az
`AGENTPLAYBOOKS_URL` változót.

## Secretek: a playbook a szerződést hordozza, nem a hitelesítőadatot

A playbook kimondja, milyen hitelesítőadatokra van szüksége; az értékek ott
maradnak, ahol lenniük kell. A `sync` az MCP-konfigurációban talált minden
környezeti hivatkozást (`${VAR}`, `$VAR`, `env:VAR`) összegyűjt a
`spec.secrets` alá:

```json
"secrets": [
  { "name": "DEPLOY_API_KEY", "ref": "env:DEPLOY_API_KEY", "required": true }
]
```

Ezzel a playbook hordozható és önleíró lesz: aki lehúzza, pontosan tudja,
mely változókat kell beállítania — anélkül, hogy bárki bárhová elküldött volna
egy kulcsot. Ha módosítasz egy bejegyzést — például egy vaultra mutatsz vele,
vagy opcionálisra állítod —, a te verziód megmarad a következő sync után is.
Literál hitelesítőadatok sosem íródnak a manifestbe és sosem kerülnek fel: a
`doctor` megjelöli őket, a `push` pedig megtagadja a futást, amíg nem cserélted
le őket hivatkozásra.

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
