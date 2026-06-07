/** يستخرج معرّف فيديو يوتيوب من روابط watch / youtu.be / embed / shorts */
export function extractYouTubeVideoId(url: string): string | null {
  const raw = url.trim();
  if (!raw) return null;

  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    const host = u.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0];
      return id.length >= 11 ? id.slice(0, 11) : id || null;
    }

    if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
      const v = u.searchParams.get('v');
      if (v) return v.slice(0, 11);

      const parts = u.pathname.split('/').filter(Boolean);
      const embedIdx = parts.indexOf('embed');
      if (embedIdx >= 0 && parts[embedIdx + 1]) return parts[embedIdx + 1].slice(0, 11);

      const shortsIdx = parts.indexOf('shorts');
      if (shortsIdx >= 0 && parts[shortsIdx + 1]) return parts[shortsIdx + 1].slice(0, 11);
    }
  } catch {
    // fallback regex
    const m = raw.match(/(?:v=|\/embed\/|youtu\.be\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
    return m?.[1] ?? null;
  }

  return null;
}

export function youTubeEmbedUrl(url: string): string | null {
  const id = extractYouTubeVideoId(url);
  return id ? `https://www.youtube-nocookie.com/embed/${id}?rel=0` : null;
}

/** يُرجع رابطاً نظيفاً أو سلسلة فارغة إن لم يُستخرج معرّف */
export function normalizeYouTubeUrl(url: string | null | undefined): string {
  if (!url?.trim()) return '';
  const id = extractYouTubeVideoId(url);
  return id ? `https://youtu.be/${id}` : url.trim();
}
