/**
 * Local day and week keys for Homework Hub.
 * The day starts at 5:00 a.m. in the browser's local timezone.
 * Before 5:00 a.m., it is still the previous day.
 * The week starts Monday at that same 5:00 a.m.
 */
(function (global) {
  "use strict";

  const CUTOVER_HOUR = 5;

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function ymd(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  /** Local calendar date, moved back one day when the clock is before 5:00 a.m. */
  function shiftedDate(now) {
    const d = now instanceof Date ? new Date(now.getTime()) : new Date();
    if (d.getHours() < CUTOVER_HOUR) d.setDate(d.getDate() - 1);
    return d;
  }

  /** YYYY-MM-DD for the local day that began at 5:00 a.m. */
  function dayKey(now) {
    return ymd(shiftedDate(now));
  }

  /** YYYY-MM-DD of the Monday that began this local week at 5:00 a.m. */
  function weekKey(now) {
    const d = shiftedDate(now);
    const sinceMonday = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - sinceMonday);
    return ymd(d);
  }

  /**
   * Day-of-year index for the 5:00 a.m. local date (Jan 1 = 1).
   * Same count the situation and scripture lists already used, with the new cutover.
   */
  function dayOfYear(now) {
    const d = shiftedDate(now);
    const start = new Date(d.getFullYear(), 0, 0);
    const cur = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.round((cur.getTime() - start.getTime()) / 86400000);
  }

  global.HwLocalPeriod = {
    CUTOVER_HOUR: CUTOVER_HOUR,
    dayKey: dayKey,
    weekKey: weekKey,
    dayOfYear: dayOfYear,
  };
})(window);
