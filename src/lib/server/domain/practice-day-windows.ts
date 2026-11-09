const formatters = new Map<string, Intl.DateTimeFormat>();

/** UTC bounds of local calendar days, including DST and fractional offsets. */
export function practiceDayWindows(from: Date, to: Date, timeZone: string) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    if (formatters.size >= 100) formatters.delete(formatters.keys().next().value!);
    formatters.set(timeZone, formatter);
  }
  const fields = (instant: number) => Object.fromEntries(formatter!.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
  const key = (instant: number) => { const p = fields(instant); return `${p.year}-${p.month}-${p.day}`; };
  const midnight = (date: string) => {
    const target = Date.parse(`${date}T00:00:00Z`);
    let instant = target;
    for (let i = 0; i < 4; i++) {
      const p = fields(instant);
      const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
      const next = instant + target - local;
      if (next === instant) return instant;
      instant = next;
    }
    // Some time zones skip midnight. Find the first existing instant of the day.
    let low = target - 36 * 3600_000, high = target + 36 * 3600_000;
    while (high - low > 1) { const middle = Math.floor((low + high) / 2); if (key(middle) < date) low = middle; else high = middle; }
    return high;
  };
  const windows = [];
  const last = key(to.getTime());
  for (let date = key(from.getTime()); date <= last;) {
    const next = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    windows.push({ date, start: new Date(midnight(date)).toISOString(), end: new Date(midnight(next)).toISOString() });
    date = next;
  }
  return windows;
}
