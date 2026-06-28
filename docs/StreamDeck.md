# ARC Director on Stream Deck

Run the whole show from a Stream Deck. Every director action (acts, beats,
moments, storm/FX, NPCs, and per-person audience cues) is now an HTTP endpoint,
so a Stream Deck key just opens a URL — **no plugin required** on macOS or
Windows.

The on-screen director panels are hidden by default to free screen space. Press
**H** (or click the "🎛 HUD" pill, bottom-left) to peek at them.

---

## 1. One-time server setup

The control endpoints are guarded by a shared token and served on a localhost
HTTP port (so tools don't have to trust the self-signed HTTPS cert).

Add to your `.env`:

```bash
STREAM_DECK_TOKEN=choose-a-long-random-string
ADMIT_HTTP_PORT=8080
```

Restart the backend. You should see:

```
🎟️  Stream Deck admit endpoint on http://localhost:8080/lobby/admit (localhost only)
```

> The HTTP port binds to `127.0.0.1` only — it is never exposed off your machine.
> The token lives in the query string of localhost-only URLs.

### Open the auto-generated control sheet

Visit **`http://localhost:8080/director/streamdeck`** in a browser.

This page lists **every** button as a ready-to-paste URL with your token already
filled in, plus a **Copy** button for each. Connected audience members show up
automatically under "Select Target". Keep this page open while you build your
Stream Deck — refresh it whenever audience members join.

---

## 2. How a Stream Deck button works (the no-plugin way)

For each action:

1. Drag **System ▸ Website** onto a key.
2. **URL** = paste a URL from the control sheet
   (e.g. `http://localhost:8080/director/cue/stormStart?token=…`).
3. **Title** = a short label (e.g. "Storm").
4. ✅ **Check "Access in background"** — this is the important part. It fires the
   request silently instead of opening a browser window.

That's it. Tap the key → the cue fires for everyone in the scene.

> **Want button feedback / custom headers?** Install **API Ninja** (by BarRaider)
> from the Elgato Marketplace ▸ Developer Tools, set Request Type = GET, paste the
> same URL. It can show the JSON response on the key. (The built-in Website action
> is enough for everything here.)

---

## 3. Recommended layout (profiles · folders · pages)

Stream Deck has three organizing tools:

- **Profile** — a whole blueprint. Make one called **"ARC Director"** and set it
  as default. Switch to it only when running a show.
- **Folder** — a key that opens a sub-layout (with a Back key). Best for grouping
  by *workflow stage*.
- **Page** — swipe between pages of the current layout for your highest-frequency
  keys.

### Suggested "ARC Director" profile

**Home page (highest-frequency keys):**

| Key | Action |
|-----|--------|
| Activate Level | `/director/activate` |
| Start Act 1 | `/director/act/ACT_1_STORM_ROAD?mode=instant` |
| Moment: Full Arrival | `/director/moment/act1_full_arrival` |
| Storm Start | `/director/cue/stormStart` |
| Thunder | `/director/cue/thunderClose` |
| Lightning | `/director/cue/lightning` |
| 📁 Beats | folder |
| 📁 FX | folder |
| 📁 NPCs | folder |
| 📁 Audience | folder |
| 🟢 CALM / RESET | `/director/calm` (keep this on every page) |

**📁 Beats folder** — `act1_storm_builds`, `act1_wolves_closing`,
`act1_guard_appears`, `act1_gate_opens`, `act1_enter_commune` + Back.

**📁 FX folder** — all `/director/cue/...` (wolves, branch snap, scream, gate
light, blackout, rain up, church bell) + Back.

**📁 NPCs folder** — Open Gate, Approach, Warn, Enable/Disable Conversation,
AI→Human, Human→AI, End Scene + Back.

**📁 Audience folder** — this is the personalized layer (see next section).

> Tip: set folders to **Auto Exit** (returns to home after a few seconds) so you
> never get stuck deep in a menu mid-show. Give each folder a distinct icon.

---

## 4. Personalized audience cues (the unique part)

Stream Deck keys are static, but private cues need a *target*. So you **select a
target once**, then fire cues that apply to whoever is selected.

Lay out the **Audience folder** as two pages:

**Page 1 — Select Target:**

| Key | URL |
|-----|-----|
| All Audience | `/director/target/audience` |
| Random | `/director/target/random` |
| Person 1 | `/director/target/slot/1` |
| Person 2 | `/director/target/slot/2` |
| Person 3 | `/director/target/slot/3` |
| Person 4 | `/director/target/slot/4` |

Slots are assigned in a stable order to connected audience members. Check the
control sheet (or `GET /director/audience`) to see who is in each slot.

**Page 2 — Fire (applies to current target):**

| Key | URL |
|-----|-----|
| Whisper | `/director/audience/cue/whisper` |
| Child Laugh | `/director/audience/cue/childLaugh` |
| Heartbeat | `/director/audience/cue/heartbeat` |
| Heartbeat Stop | `/director/audience/cue/heartbeatStop` |
| Wolf Behind | `/director/audience/cue/wolfBehind` |
| Reduce Fear | `/director/audience/cue/reduceFear` |
| Increase Tension | `/director/audience/cue/increaseTension` |
| Silence For Them | `/director/audience/cue/silence` |

**Flow:** tap *Person 2* → tap *Whisper* → only Person 2 hears the whisper.

> A great trick: use a Stream Deck **Multi Action** to combine "select target +
> fire cue" into one key (e.g. "Whisper → Person 1"). Add a tiny delay between the
> two steps.

---

## 5. Full endpoint reference

Base (local): `http://localhost:8080` · append `?token=YOUR_TOKEN` to every
control URL (discovery URLs need no token).

### Discovery (no token)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/director/streamdeck` | HTML control sheet (copy URLs) |
| GET | `/director/audience` | JSON roster + current target |
| GET | `/director/cues` | valid show-cue ids |
| GET | `/director/events` | escape-room event ids |

### Control (token required; GET or POST)
| Path | Action |
|------|--------|
| `/director/activate` | Admit players / start experience |
| `/director/act/:sceneId?mode=instant\|assemble` | Scene transition |
| `/director/beat/:beatId` | Start a cue-engine beat |
| `/director/moment/:momentId` | Start a cue-engine moment |
| `/director/cue/:cueId` | Storm/visual cue to everyone |
| `/director/npc/:npcId/:cue` | NPC cue (e.g. `guard1/OPEN_GATE`) |
| `/director/target/:type[/:value]` | Select audience target |
| `/director/audience/cue/:cueId` | Private cue → current target |
| `/director/calm` | **Calm / Reset** (stop all private cues) |
| `/director/event/:eventId` | Escape-room scripted event |

**Scene IDs:** `PRE_SHOW`, `ACT_1_STORM_ROAD`
**Beat IDs:** `act1_storm_builds`, `act1_wolves_closing`, `act1_guard_appears`,
`act1_gate_opens`, `act1_enter_commune`
**Moment IDs:** `act1_full_arrival`
**Show cues:** `thunder`, `lightning`, `rainUp`, `gateLight`, `blackout`,
`stormStart`, `stormStop`, `thunderDistant`, `thunderClose`, `wolfLeft`,
`wolfRight`, `wolfBehind`, `werewolfCircle`, `branchSnap`, `distantScream`,
`churchBell`
**NPC ids:** `guard1`, `guard2`, `sheriff`, `little_girl`, `cult_member`
**NPC cues:** `APPROACH`, `STOP`, `WATCH`, `QUESTION`, `WARN`, `REASSURE`,
`DEFLECT`, `OPEN_GATE`, `CALL_SHEPHERD`, `ESCALATE`, `END_SCENE`,
`ENABLE_CONVERSATION`, `DISABLE_CONVERSATION`, `TRANSFER_TO_HUMAN`,
`TRANSFER_TO_AI`
**Target types:** `audience`, `everyone`, `random`, `slot/N`, `name/X`, `id/X`
**Audience cues:** `whisper`, `childLaugh`, `heartbeat`, `heartbeatStop`,
`wolfBehind`, `reduceFear`, `increaseTension`, `silence`

---

## 6. Notes & limits

- **Audience targeting needs real connected audience clients.** The dev mock
  members (`mock-1…`) live only in the director's browser, so Stream Deck
  audience cues won't reach them — use the on-screen Audience panel (press **H**)
  to audition mocks in single-browser dev.
- **Safety:** `/director/calm` and `Silence For Them` are always one tap away;
  keep Calm/Reset on every page. Private volume is capped server-side.
- **Security:** the control port is localhost-only and token-gated. Don't forward
  the port or commit your token.
- **Remote operator?** If the director runs Stream Deck on a different machine,
  point the URLs at the server's LAN IP and expose the HTTP port carefully (or
  tunnel it). The token is your only guard, so make it long.
