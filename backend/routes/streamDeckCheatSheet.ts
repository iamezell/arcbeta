import { AudienceMemberInfo } from '../show/audienceTarget';

interface CheatSheetOpts {
  base: string;
  token: string;
  roster: AudienceMemberInfo[];
  joinUrl?: string;
  joinScreenUrl?: string;
  showCode?: string;
}

interface Btn {
  label: string;
  path: string;
}

interface Group {
  title: string;
  note?: string;
  buttons: Btn[];
}

/**
 * Renders a self-documenting control sheet. Every row is a ready-to-paste URL
 * (token included) for a Stream Deck "Website" action (Access in background = on).
 * Served on the localhost HTTP port only.
 */
export function renderStreamDeckCheatSheet(opts: CheatSheetOpts): string {
  const { base, token, roster, joinUrl, joinScreenUrl, showCode } = opts;

  const groups: Group[] = [
    {
      title: 'Show Flow',
      buttons: [
        { label: 'Activate Level', path: '/director/activate' },
        { label: 'Start Act 1 (instant)', path: '/director/act/ACT_1_STORM_ROAD?mode=instant' },
        { label: 'Start Act 1 (assemble)', path: '/director/act/ACT_1_STORM_ROAD?mode=assemble' },
        { label: 'Pre-Show', path: '/director/act/PRE_SHOW' },
        { label: 'Moment: Full Arrival', path: '/director/moment/act1_full_arrival' },
        { label: 'Beat: Storm Builds', path: '/director/beat/act1_storm_builds' },
        { label: 'Beat: Wolves Closing', path: '/director/beat/act1_wolves_closing' },
        { label: 'Beat: Guard Appears', path: '/director/beat/act1_guard_appears' },
        { label: 'Beat: Gate Opens', path: '/director/beat/act1_gate_opens' },
        { label: 'Beat: Enter Commune', path: '/director/beat/act1_enter_commune' },
      ],
    },
    {
      title: 'Storm & FX (everyone)',
      note: 'These broadcast to all clients via showCue.',
      buttons: [
        { label: 'Storm Start', path: '/director/cue/stormStart' },
        { label: 'Storm Stop', path: '/director/cue/stormStop' },
        { label: 'Thunder Distant', path: '/director/cue/thunderDistant' },
        { label: 'Thunder Close', path: '/director/cue/thunderClose' },
        { label: 'Lightning', path: '/director/cue/lightning' },
        { label: 'Thunder (visual)', path: '/director/cue/thunder' },
        { label: 'Rain Up', path: '/director/cue/rainUp' },
        { label: 'Gate Light', path: '/director/cue/gateLight' },
        { label: 'Blackout', path: '/director/cue/blackout' },
        { label: 'Wolf Left', path: '/director/cue/wolfLeft' },
        { label: 'Wolf Right', path: '/director/cue/wolfRight' },
        { label: 'Wolf Behind', path: '/director/cue/wolfBehind' },
        { label: 'Werewolf Circle', path: '/director/cue/werewolfCircle' },
        { label: 'Branch Snap', path: '/director/cue/branchSnap' },
        { label: 'Distant Scream', path: '/director/cue/distantScream' },
        { label: 'Church Bell', path: '/director/cue/churchBell' },
      ],
    },
    {
      title: 'NPCs',
      note: 'guard1, guard2, sheriff, little_girl, cult_member',
      buttons: [
        { label: 'Guard1: Open Gate', path: '/director/npc/guard1/OPEN_GATE' },
        { label: 'Guard1: Approach', path: '/director/npc/guard1/APPROACH' },
        { label: 'Guard1: Warn', path: '/director/npc/guard1/WARN' },
        { label: 'Guard1: Enable Conversation', path: '/director/npc/guard1/ENABLE_CONVERSATION' },
        { label: 'Guard1: Disable Conversation', path: '/director/npc/guard1/DISABLE_CONVERSATION' },
        { label: 'Guard1: AI → Human', path: '/director/npc/guard1/TRANSFER_TO_HUMAN' },
        { label: 'Guard1: Human → AI', path: '/director/npc/guard1/TRANSFER_TO_AI' },
        { label: 'Sheriff: Escalate', path: '/director/npc/sheriff/ESCALATE' },
        { label: 'End Scene', path: '/director/npc/guard1/END_SCENE' },
      ],
    },
    {
      title: 'Audience — Select Target',
      note: 'Pick WHO private cues apply to, then fire a cue below.',
      buttons: [
        { label: 'Target: All Audience', path: '/director/target/audience' },
        { label: 'Target: Everyone', path: '/director/target/everyone' },
        { label: 'Target: Random', path: '/director/target/random' },
        { label: 'Target: Slot 1', path: '/director/target/slot/1' },
        { label: 'Target: Slot 2', path: '/director/target/slot/2' },
        { label: 'Target: Slot 3', path: '/director/target/slot/3' },
        { label: 'Target: Slot 4', path: '/director/target/slot/4' },
        ...roster.map((m) => ({
          label: `Target: ${m.name} (slot ${m.slot})`,
          path: `/director/target/id/${m.socketId}`,
        })),
      ],
    },
    {
      title: 'Audience — Private Cues (current target)',
      buttons: [
        { label: 'Whisper', path: '/director/audience/cue/whisper' },
        { label: 'Child Laugh', path: '/director/audience/cue/childLaugh' },
        { label: 'Heartbeat (start)', path: '/director/audience/cue/heartbeat' },
        { label: 'Heartbeat (stop)', path: '/director/audience/cue/heartbeatStop' },
        { label: 'Wolf Behind', path: '/director/audience/cue/wolfBehind' },
        { label: 'Reduce Fear', path: '/director/audience/cue/reduceFear' },
        { label: 'Increase Tension', path: '/director/audience/cue/increaseTension' },
        { label: 'Silence For Them', path: '/director/audience/cue/silence' },
      ],
    },
    {
      title: 'SAFETY',
      buttons: [{ label: 'CALM / RESET (all)', path: '/director/calm' }],
    },
  ];

  const tokenQuery = (path: string): string => {
    const sep = path.includes('?') ? '&' : '?';
    return token ? `${base}${path}${sep}token=${encodeURIComponent(token)}` : `${base}${path}`;
  };

  const sections = groups
    .map((g) => {
      const rows = g.buttons
        .map((b) => {
          const url = tokenQuery(b.path);
          return `<tr>
            <td class="lbl">${esc(b.label)}</td>
            <td class="url"><code>${esc(url)}</code></td>
            <td><button class="copy" data-url="${esc(url)}">Copy</button></td>
          </tr>`;
        })
        .join('');
      return `<section>
        <h2>${esc(g.title)}</h2>
        ${g.note ? `<p class="note">${esc(g.note)}</p>` : ''}
        <table>${rows}</table>
      </section>`;
    })
    .join('');

  const tokenWarning = token
    ? ''
    : `<p class="warn">⚠️ STREAM_DECK_TOKEN is not set — URLs below have no token and will return 503. Set it in your .env and restart.</p>`;

  const slotRows =
    roster.length > 0
      ? roster
          .map(
            (m) =>
              `<tr><td class="lbl">Slot ${m.slot}</td><td class="url"><code>${esc(m.name)}</code></td><td></td></tr>`
          )
          .join('')
      : `<tr><td class="lbl">—</td><td class="url"><code>no audience connected</code></td><td></td></tr>`;

  const joinSection = joinUrl
    ? `<section>
        <h2>Join / Rehearsal</h2>
        <p class="note">Audience scan this QR (or open the host "Scan to Join" screen on a big display).
          Show code: <strong>${esc(showCode || '')}</strong></p>
        <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;">
          <img src="${esc(joinUrl)}" style="display:none" />
          <img alt="Join QR" style="width:160px;background:#fff;border-radius:10px;padding:8px"
               src="/director/qr.svg?url=${encodeURIComponent(joinUrl)}" />
          <table style="flex:1;min-width:280px;">
            <tr><td class="lbl">Join URL</td><td class="url"><code>${esc(joinUrl)}</code></td>
              <td><button class="copy" data-url="${esc(joinUrl)}">Copy</button></td></tr>
            ${joinScreenUrl ? `<tr><td class="lbl">Host screen</td><td class="url"><code>${esc(joinScreenUrl)}</code></td>
              <td><button class="copy" data-url="${esc(joinScreenUrl)}">Copy</button></td></tr>` : ''}
          </table>
        </div>
        <h2 style="margin-top:18px;">Audience Slots</h2>
        <table>${slotRows}</table>
      </section>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ARC Director — Stream Deck Control Sheet</title>
<style>
  body { font: 14px -apple-system, Segoe UI, sans-serif; background: #0e1016; color: #e8f0ff; margin: 0; padding: 24px; }
  h1 { color: #9fd0ff; margin: 0 0 4px; }
  .sub { opacity: 0.6; margin: 0 0 20px; }
  .warn { background: #4a2020; border: 1px solid #a55; padding: 10px 14px; border-radius: 8px; }
  section { margin-bottom: 26px; }
  h2 { color: #ffcf8f; border-bottom: 1px solid #2a3142; padding-bottom: 6px; }
  .note { opacity: 0.6; margin: 4px 0 10px; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 5px 8px; border-bottom: 1px solid #1b202c; vertical-align: middle; }
  td.lbl { font-weight: 600; white-space: nowrap; }
  td.url code { font-size: 11px; color: #8fe7c0; word-break: break-all; }
  button.copy { background: #233048; color: #cfe2ff; border: 0; border-radius: 5px; padding: 5px 10px; cursor: pointer; }
  button.copy:hover { background: #2e3e5c; }
  button.copy.done { background: #2a7d5c; }
  .how { background: #141925; border: 1px solid #243; border-radius: 10px; padding: 14px 18px; margin-bottom: 24px; }
  .how code { color: #ffd9a0; }
</style></head>
<body>
  <h1>ARC Director · Stream Deck Control Sheet</h1>
  <p class="sub">Base: <code>${esc(base)}</code></p>
  ${tokenWarning}
  <div class="how">
    <strong>How to use:</strong> In the Stream Deck app, add a <em>System ▸ Website</em> action to a key,
    paste a URL below into <em>URL</em>, and CHECK <strong>“Access in background”</strong> (this fires the
    request silently, no browser window). Refresh this page to see connected audience members appear under
    <em>Select Target</em>.
  </div>
  ${joinSection}
  ${sections}
  <script>
    document.querySelectorAll('button.copy').forEach((b) => {
      b.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(b.dataset.url); b.textContent = 'Copied'; b.classList.add('done');
          setTimeout(() => { b.textContent = 'Copy'; b.classList.remove('done'); }, 1200); } catch (e) {}
      });
    });
  </script>
</body></html>`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  );
}
