import { getVietnamNow } from '$lib/components/lunar/lunar-week';

export function sameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}

/** One local timer per midnight; foreground refresh handles Android background suspension. */
export function watchCalendarDay(onChange: (today: Date, yesterday: Date) => void, now = getVietnamNow) {
  let disposed = false;
  let previous = now();
  let timer: ReturnType<typeof setTimeout>;
  function refresh() {
    if (disposed) return;
    clearTimeout(timer);
    const current = now();
    if (!sameCalendarDay(current, previous)) {
      const old = previous; previous = current;
      onChange(current, old);
    }
    // Owner có thể dọn listener ngay trong callback; không dựng lại timer sau khi đã dừng.
    if (disposed) return;
    const elapsed = ((current.getHours()*60+current.getMinutes())*60+current.getSeconds())*1000+current.getMilliseconds();
    timer = setTimeout(refresh, 86400000-elapsed+100);
  }
  function onVisible() { if (!document.hidden) refresh(); }
  refresh();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', refresh);
  return () => { disposed = true;clearTimeout(timer);document.removeEventListener('visibilitychange', onVisible);window.removeEventListener('focus', refresh); };
}
