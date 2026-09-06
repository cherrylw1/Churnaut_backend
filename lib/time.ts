export function getPreviousUtcWeekRange(now = new Date()) {
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  const currentWeekStart = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysSinceMonday
  ));
  const previousWeekStart = new Date(currentWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000);

  return {
    periodStart: previousWeekStart.toISOString(),
    periodEnd: currentWeekStart.toISOString(),
    weekStart: previousWeekStart.toISOString().slice(0, 10),
  };
}
