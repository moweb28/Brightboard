import { NAME_TAG_STYLES, useSettings, useT } from '../lib/settings';
import { Segmented } from './ui';

/** How names show on video tiles (a small one-row choice). */
export function NameTagPicker() {
  const t = useT();
  const { settings, set } = useSettings();
  return (
    <div className="field">
      <span className="field-label">{t.settings.nameTags}</span>
      <Segmented label={t.settings.nameTags} value={settings.nameTags} onChange={(v) => set('nameTags', v)} options={NAME_TAG_STYLES.map((s) => ({ value: s, label: t.settings.nameTagStyles[s] }))} />
    </div>
  );
}
