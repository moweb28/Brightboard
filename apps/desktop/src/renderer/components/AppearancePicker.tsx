import { Laptop, Moon, Sun } from 'lucide-react';
import { SCENES, useSettings, useT, type Scene } from '../lib/settings';
import { Segmented } from './ui';

const SCENE_SWATCH: Record<Scene, [string, string]> = {
  sunrise: ['#4f46e5', '#ffc83d'],
  ocean: ['#0284c7', '#2dd4bf'],
  forest: ['#059669', '#a3e635'],
  blossom: ['#db2777', '#fdba74'],
  midnight: ['#7c3aed', '#22d3ee'],
};

export function ThemePicker() {
  const t = useT();
  const { settings, set } = useSettings();
  return (
    <Segmented
      label={t.settings.themeMode}
      value={settings.theme}
      onChange={(v) => set('theme', v)}
      options={[
        { value: 'light', label: t.settings.light, icon: Sun },
        { value: 'dark', label: t.settings.dark, icon: Moon },
        { value: 'system', label: t.settings.system, icon: Laptop },
      ]}
    />
  );
}

export function ScenePicker() {
  const t = useT();
  const { settings, set } = useSettings();
  return (
    <div className="scene-grid" role="radiogroup" aria-label={t.settings.scene}>
      {SCENES.map((s) => (
        <button key={s} role="radio" aria-checked={settings.scene === s} className={`scene-card ${settings.scene === s ? 'is-active' : ''}`} onClick={() => set('scene', s)}>
          <span className="scene-swatch" style={{ background: `linear-gradient(135deg, ${SCENE_SWATCH[s][0]} 55%, ${SCENE_SWATCH[s][1]} 55%)` }} />
          <span>{t.settings.scenes[s]}</span>
        </button>
      ))}
    </div>
  );
}

export function LanguagePicker() {
  const { settings, set, t } = useSettings();
  return (
    <Segmented
      label={t.settings.language}
      value={settings.lang}
      onChange={(v) => set('lang', v)}
      options={[
        { value: 'en', label: 'English' },
        { value: 'ar', label: 'العربية' },
      ]}
    />
  );
}
