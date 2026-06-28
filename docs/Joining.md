# Joining ARC (local rehearsal)

No more `ifconfig`. ARC auto-detects the Mac's LAN address and shows a QR code.

## Host flow

1. Start the server. The console prints the join URL, e.g.
   ```
   📲 Audience join:  https://10.11.1.204/join?show=STORM
   🖥️  Host screen:    https://10.11.1.204/join-screen
   ```
2. Open **`/join-screen`** on the host laptop (or a big display). It shows a **QR
   code**, the **join URL**, the **show code**, and a live **Connected** list
   with audience **slot numbers**. Buttons: **Copy URL** and **Refresh network info**.
3. Audience **scan the QR** on their phone/headset → land on **`/join`**.

## Audience flow (`/join`)

- Big buttons, minimal typing. **⚡ Quick Join as Audience** generates a name
  (e.g. "Audience 42") and drops them straight in — ideal for Quest/headsets.
- Or type a name and pick a role (Audience / Actor / Host / Director). "Host"
  maps to the Director role.
- Tapping Join routes them to the live scene (`/scene`) on the current show code.
  Phones see a one-time notice that movement may be limited.

## Slots & Stream Deck

Audience members auto-fill **Slot 1, 2, 3…** (stable order). The same slots show
on `/join-screen`, on the Stream Deck control sheet (`/director/streamdeck`), and
are what Stream Deck targeting buttons (`/director/target/slot/1`) point at — so
you can fire private cues at a specific person.

## Endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /join-screen` | none | Host "Scan to Join" display |
| `GET /join?show=STORM` | none | Audience mobile join page |
| `GET /director/network-info` | none | `{ localIps, recommendedIp, hostname, frontendPort, backendPort, joinUrl, fallback }` |
| `GET /director/participants` | none | Connected participants + audience slots + device type |
| `GET /director/qr.svg?url=…` | none | QR code (SVG) for any URL |

## Notes

- **HTTPS cert:** the server uses a self-signed cert, so phones show a "Not
  Secure" warning the first time — tap **Advanced → Proceed**. (A secure context
  is required for mic/WebXR, so HTTPS is intentional.)
- **Same Wi-Fi:** phones must be on the same network as the Mac. If the console
  says "No LAN IP detected", connect to Wi-Fi and reload `/join-screen`.
- **`.local` hostname:** offered as an alternate on the join screen when
  available, but the LAN IP + QR is the reliable path.
- **Show code:** defaults to `STORM` (override with `SHOW_CODE` env). Participants
  are tagged with the code; the structure is ready for multiple shows later.
- **Security:** audience join needs no token; director *control* endpoints still
  require `STREAM_DECK_TOKEN`. The join page only forwards into the scene — it
  exposes no director controls.
