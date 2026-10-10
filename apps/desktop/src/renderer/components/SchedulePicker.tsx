import type { Schedule } from '@classroom/protocol';
import { weekdayName, weekOrder } from '../lib/format';
import { useSettings, useT } from '../lib/settings';

const LENGTHS = [30, 45, 60, 90, 120];

/** Pick the days of the week, a start time and a length. No days selected = no schedule. */
export function SchedulePicker({ value, onChange }: { value: Schedule | null; onChange: (s: Schedule | null) => void }) {
  const t = useT();
  const { settings } = useSettings();
  const current = value ?? { days: [], time: '10:00', minutes: 60 };
  const update = (patch: Partial<Schedule>) => {
    const next = { ...current, ...patch };
    onChange(next.days.length ? next : null);
  };
  const toggleDay = (d: number) => update({ days: current.days.includes(d) ? current.days.filter((x) => x !== d) : [...current.days, d].sort() });

  return (
    <fieldset className="schedule-picker">
      <legend className="field-label">{t.spaceForm.schedule}</legend>
      <div className="day-row" role="group" aria-label={t.spaceForm.days}>
        {weekOrder(settings.lang).map((d) => (
          <button key={d} type="button" className="day-chip" aria-pressed={current.days.includes(d)} onClick={() => toggleDay(d)} title={weekdayName(d, settings.lang, 'long')}>
            {weekdayName(d, settings.lang)}
          </button>
        ))}
      </div>
      <div className="schedule-times" aria-disabled={!current.days.length}>
        <label className="field">
          <span className="field-label">{t.spaceForm.startsAt}</span>
          <input type="time" value={current.time} onChange={(e) => e.target.value && update({ time: e.target.value })} disabled={!current.days.length} />
        </label>
        <label className="field">
          <span className="field-label">{t.spaceForm.length}</span>
          <select value={current.minutes} onChange={(e) => update({ minutes: Number(e.target.value) })} disabled={!current.days.length}>
            {LENGTHS.map((m) => (
              <option key={m} value={m}>
                {t.space.minutes(m)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <span className="muted small">{current.days.length ? t.spaceForm.scheduleOn : t.spaceForm.scheduleOff}</span>
    </fieldset>
  );
}
