import { NAME_TAG_STYLES, useSettings, useT } from '../lib/settings';

/** How names show on video tiles, with a small preview of each style. */
export function NameTagPicker() {
  const t = useT();
  const { settings, set } = useSettings();
  return (
    <div className="field">
      <span className="field-label">{t.settings.nameTags}</span>
      <div className="nametag-grid" role="radiogroup" aria-label={t.settings.nameTags}>
        {NAME_TAG_STYLES.map((style) => (
          <button key={style} role="radio" aria-checked={settings.nameTags === style} className={`nametag-option ${settings.nameTags === style ? 'is-active' : ''}`} onClick={() => set('nameTags', style)} type="button">
            <span className={`nametag-preview names-${style}`}>
              <span className="nametag-avatar">O</span>
              <span className="tile-label">
                <span>Omar</span>
              </span>
            </span>
            <span className="small">{t.settings.nameTagStyles[style]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
