export function formatWorkedMinutes(totalMinutes: number | null | undefined) {
  if (totalMinutes === null || totalMinutes === undefined || totalMinutes < 0) {
    return '-';
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);

  return `${hours} hrs ${minutes} mins`;
}
