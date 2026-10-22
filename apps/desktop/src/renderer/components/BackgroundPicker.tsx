import { ImagePlus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { addCustomBackground, backgroundImage, backgroundsSupported, BUILT_IN_BACKGROUNDS, customBackgrounds, MAX_CUSTOM_BACKGROUNDS, removeCustomBackground } from '../lib/effects';
import { useSettings, useT } from '../lib/settings';

/** Camera backgrounds like Zoom's: none, blur, pictures, and your own pictures (kept on this computer). */
export function BackgroundPicker({ compact }: { compact?: boolean }) {
  const t = useT();
  const { settings, set } = useSettings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [custom, setCustom] = useState(customBackgrounds);
  if (!backgroundsSupported()) return <p className="muted small">{t.settings.backgroundUnsupported}</p>;

  const pick = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const bg = await addCustomBackground(file).catch(() => null);
    setCustom(customBackgrounds());
    if (bg) set('background', bg);
  };
  const remove = (bg: string) => {
    removeCustomBackground(bg);
    setCustom(customBackgrounds());
    if (settings.background === bg) set('background', 'none');
  };
  const label = (bg: string) => (t.settings.backgrounds as Record<string, string>)[bg] ?? t.settings.yourPicture;
  const option = (bg: string, removable = false) => {
    const image = backgroundImage(bg);
    return (
      <div key={bg} className="bg-cell">
        <button role="radio" aria-checked={settings.background === bg} className={`bg-option ${settings.background === bg ? 'is-active' : ''}`} onClick={() => set('background', bg)} title={label(bg)}>
          <span className={`bg-thumb bg-thumb-${bg}`} style={image ? { backgroundImage: `url(${image})` } : undefined} />
          {!compact && <span className="small">{label(bg)}</span>}
        </button>
        {removable && (
          <button className="bg-remove" onClick={() => remove(bg)} aria-label={t.settings.removePicture} title={t.settings.removePicture}>
            <X size={12} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className={`bg-grid ${compact ? 'bg-grid-compact' : ''}`} role="radiogroup" aria-label={t.settings.background}>
      {BUILT_IN_BACKGROUNDS.map((bg) => option(bg))}
      {custom.map((c) => option(`custom:${c.id}`, true))}
      {custom.length < MAX_CUSTOM_BACKGROUNDS && (
        <div className="bg-cell">
          <button className="bg-option bg-add" onClick={() => fileRef.current?.click()} title={t.settings.addPicture}>
            <span className="bg-thumb">
              <ImagePlus size={20} />
            </span>
            {!compact && <span className="small">{t.settings.addPicture}</span>}
          </button>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files).finally(() => (e.target.value = ''))} />
    </div>
  );
}
