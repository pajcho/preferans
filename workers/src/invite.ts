// Javna OG stranica za deljeni link partije (/o/KOD na Worker origin-u).
// Crawler-i (WhatsApp/Viber/Messenger/Slack/X…) čitaju OG meta tagove;
// ljudi se odmah preusmere na SPA (GitHub Pages) na tu partiju.
import type { PublicGameMeta } from '../../src/protocol/messages.ts';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]);
}

function appBaseUrl(env: Env): string {
  return (env.APP_BASE_URL || 'https://pajcho.github.io/preferans').replace(/\/$/, '');
}

interface OgFields {
  title: string;
  description: string;
}

/** OG naslov/opis iz javnog meta-a partije. */
function ogFor(meta: PublicGameMeta): OgFields {
  const inviter = meta.createdByName;
  const code = meta.code;
  if (meta.status === 'lobby') {
    const seats =
      meta.openSeats <= 0
        ? 'sto je popunjen'
        : meta.openSeats === 1
          ? 'još 1 mesto slobodno'
          : `još ${meta.openSeats} mesta slobodno`;
    return {
      title: `${inviter} te zove na prefu`,
      description: `Partija u troje · kod ${code} · bule ${meta.startingBule} · ${seats}. Klikni da uđeš.`,
    };
  }
  if (meta.status === 'active') {
    return {
      title: `Partija prefe u toku · ${code}`,
      description: `${inviter} i ekipa igraju prefu. Uđi da gledaš ili nastaviš svoju partiju.`,
    };
  }
  return {
    title: `Prefa — partija ${code}`,
    description: 'Ova partija je završena. Napravi novu partiju prefe u troje — besplatno.',
  };
}

function page(fields: OgFields, ogImage: string, target: string): string {
  const t = esc(fields.title);
  const d = esc(fields.description);
  const img = esc(ogImage);
  const url = esc(target);
  return `<!doctype html>
<html lang="sr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="${url}">
<meta name="robots" content="noindex,follow">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Prefa">
<meta property="og:locale" content="sr_RS">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:image" content="${img}">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${img}">
<meta http-equiv="refresh" content="0; url=${url}">
<script>location.replace(${JSON.stringify(target)})</script>
<style>
  html,body{height:100%}
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0f5132;color:#fffdf4;display:grid;place-items:center;text-align:center;padding:24px}
  a{color:#f3de33;font-weight:700}
</style>
</head>
<body>
<div>
<p style="font-size:22px;font-weight:800;margin:0 0 8px">${t}</p>
<p style="opacity:.85;margin:0 0 20px">Otvaram Prefu…</p>
<p><a href="${url}">Uđi u partiju →</a></p>
</div>
</body>
</html>`;
}

export async function renderInvitePage(env: Env, code: string): Promise<Response> {
  const appUrl = appBaseUrl(env);
  const target = `${appUrl}/o/${code}`;
  // posebna (statička) slika za poziv — isti dizajn, CTA „Priključi se partiji"
  const ogImage = `${appUrl}/og-invite.png`;

  // podrazumevani (generički) OG ako DO ne odgovori / partija ne postoji
  let fields: OgFields = {
    title: 'Prefa — preferans online u troje',
    description: `Pridruži se partiji prefe (kod ${code}). Igra u troje, srpska pravila, besplatno.`,
  };
  try {
    const res = await env.GAME_ROOM.getByName(code).publicMeta();
    if (res.ok) fields = ogFor(res.value);
  } catch {
    /* DO nedostupan → generički OG */
  }

  return new Response(page(fields, ogImage, target), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // kratak cache: preview ostaje relativno svež (broj mesta/status se menja)
      'Cache-Control': 'public, max-age=120',
    },
  });
}
