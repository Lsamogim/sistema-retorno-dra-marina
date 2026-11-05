// Datas no fuso da clínica. Módulo puro (sem acesso ao banco) para poder ser testado isoladamente.

// A clínica opera no horário de Brasília. O servidor na nuvem roda em UTC, então
// "hoje" precisa ser calculado explicitamente no fuso da clínica (senão, após 21h,
// o sistema já consideraria o dia seguinte).
const CLINIC_TIMEZONE = process.env.CLINIC_TIMEZONE || 'America/Sao_Paulo';
const clinicDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CLINIC_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function getLocalTodayIso(now = new Date()) {
  // en-CA formata como AAAA-MM-DD
  return clinicDateFormatter.format(now);
}

export function addDaysIso(isoDate, days) {
  const dt = new Date(`${isoDate}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + Number(days));
  return dt.toISOString().slice(0, 10);
}

export function diffDaysIso(targetIso, baseIso) {
  const a = new Date(`${targetIso}T12:00:00Z`).getTime();
  const b = new Date(`${baseIso}T12:00:00Z`).getTime();
  return Math.round((a - b) / 86400000);
}
