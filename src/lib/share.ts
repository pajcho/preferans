// Deljenje linka partije = GitHub Pages URL (čist domen).
// Root → početni OG; /o/KOD (preko 404.html) → OG poziva (og-invite slika + generički tekst).
// Za pun dinamički OG po partiji postoji Worker ruta /o/KOD (workers/src/invite.ts) —
// koristi je custom domen ako se ikad postavi.
export function inviteShareLink(code: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/o/${code}`;
}

/** Native share na mobilnom, inače copy u clipboard. */
export async function shareInvite(code: string): Promise<'shared' | 'copied' | 'failed'> {
  const link = inviteShareLink(code);
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Prefa', text: 'Hajde na partiju prefe!', url: link });
      return 'shared';
    } catch {
      /* korisnik otkazao ili share nije uspeo — padni na copy */
    }
  }
  try {
    await navigator.clipboard.writeText(link);
    return 'copied';
  } catch {
    return 'failed';
  }
}
