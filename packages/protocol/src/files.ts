/** Safe, readable file names for recordings and transcripts: "<space title> 2026-10-07 14-05". */
export function sessionFileName(title: string, startedAt: Date, ext: string) {
  const clean = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .replace(/[. ]+$/, '');
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${startedAt.getFullYear()}-${pad(startedAt.getMonth() + 1)}-${pad(startedAt.getDate())} ${pad(startedAt.getHours())}-${pad(startedAt.getMinutes())}`;
  return `${clean || 'Brightboard'} ${stamp}.${ext}`;
}
