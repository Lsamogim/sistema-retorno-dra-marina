const TZ = 'America/Sao_Paulo';
const longFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });

const fromIso = (iso) => new Date(`${iso}T12:00:00Z`);

/** "quinta, 5 de novembro" */
export function formatLongDate(iso) {
  if (!iso) return '';
  return longFmt
    .format(fromIso(iso))
    .replace('-feira', '')
    .replace(/^(\p{L}+),?\s/u, '$1, ');
}

/** "05/11/2026" */
export function formatShortDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function todayIso(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
