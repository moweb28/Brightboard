import { explainMeasurement, measureElement, resizeFor, roundMeasure, type MeasureKey, type MeasureRow, type Measurement } from '@classroom/protocol';
import { CaptureUpdateAction, newElementWith } from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { Grid3x3, Ruler, Tag, X } from 'lucide-react';
import { useState } from 'react';
import type { Dict } from '../../lib/i18n';
import { MEASURE_UNITS, type MeasureUnit } from '../../lib/settings';

type Api = ExcalidrawImperativeAPI;
type El = ReturnType<Api['getSceneElements']>[number];

interface Props {
  t: Dict;
  api: Api;
  /** Bumped by the board whenever the scene or selection changes, so the numbers stay live. */
  tick: number;
  unit: MeasureUnit;
  scale: number;
  grid: boolean;
  labels: boolean;
  onToggleLabels(): void;
  onUnit(u: MeasureUnit): void;
  onScale(px: number): void;
  onToggleGrid(): void;
  onClose(): void;
}

const fmt = (n: number) => String(roundMeasure(n));
const explained = (m: Measurement) => explainMeasurement(m);

/** Side panel: lengths, area and perimeter of the selected shapes, in the chosen unit. */
export function MeasurePanel({ t, api, tick, unit, scale, grid, labels, onToggleLabels, onUnit, onScale, onToggleGrid, onClose }: Props) {
  void tick; // re-render trigger
  const m = t.board.measure;
  const selected = api.getAppState().selectedElementIds;
  const items = api
    .getSceneElements()
    .filter((e) => selected[e.id])
    .map((el) => ({ el, m: measureElement(el as never, scale) }))
    .filter((x): x is { el: El; m: NonNullable<typeof x.m> } => !!x.m)
    .slice(0, 4);
  const unitLabel = m.units[unit];

  const edit = (el: El, key: MeasureKey, value: number) => {
    const size = resizeFor(el as never, key, value, scale);
    if (!size) return;
    const patch: Record<string, unknown> = {};
    if (size.width !== undefined) patch.width = size.width;
    if (size.height !== undefined) patch.height = size.height;
    if (size.factor !== undefined && 'points' in el) {
      patch.points = (el.points as readonly [number, number][]).map(([x, y]) => [x * size.factor!, y * size.factor!]);
      patch.width = el.width * size.factor;
      patch.height = el.height * size.factor;
    }
    api.updateScene({ elements: api.getSceneElementsIncludingDeleted().map((e) => (e.id === el.id ? newElementWith(e, patch as never) : e)), captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  };

  const valueText = (r: MeasureRow) => {
    const suffix = r.dim === 0 ? '°' : r.dim === 2 ? ` ${unitLabel}²` : ` ${unitLabel}`;
    return Array.isArray(r.value) ? r.value.map((v) => fmt(v) + (r.dim === 0 ? '°' : '')).join(r.dim === 0 ? ', ' : ' · ') + (r.dim === 0 ? '' : ` ${unitLabel}`) : fmt(r.value) + suffix;
  };

  return (
    <aside className="measure" aria-label={m.title}>
      <header className="measure-head">
        <Ruler size={16} />
        <strong>{m.title}</strong>
        <button className="measure-close" onClick={onClose} aria-label={t.common.close}>
          <X size={16} />
        </button>
      </header>

      <div className="measure-settings">
        <label>
          <span>{m.unit}</span>
          <select value={unit} onChange={(e) => onUnit(e.target.value as MeasureUnit)}>
            {MEASURE_UNITS.map((u) => (
              <option key={u} value={u}>
                {m.unitNames[u]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{m.scale(unitLabel)}</span>
          <input type="number" min={2} max={400} step={1} value={scale} onChange={(e) => Number(e.target.value) >= 2 && onScale(Math.min(400, Number(e.target.value)))} />
        </label>
        <button className={`measure-grid ${grid ? 'is-on' : ''}`} onClick={onToggleGrid} aria-pressed={grid}>
          <Grid3x3 size={15} /> {grid ? m.gridOn(unitLabel) : m.gridOff}
        </button>
        <button className={`measure-grid ${labels ? 'is-on' : ''}`} onClick={onToggleLabels} aria-pressed={labels}>
          <Tag size={15} /> {m.labels}
        </button>
      </div>

      {items.length === 0 ? (
        <p className="measure-hint">{m.hint}</p>
      ) : (
        items.map(({ el, m: res }) => (
          <section key={el.id} className="measure-item">
            <p className="measure-kind">{m.kinds[res.kind]}</p>
            <dl>
              {/* Area and perimeter get their own worked-out cards below when we can explain them. */}
              {res.rows.filter((r) => !(explained(res).length && (r.key === 'area' || r.key === 'perimeter'))).map((r) => (
                <div key={r.key} className="measure-row">
                  <dt>{m.rows[r.key]}</dt>
                  <dd>
                    {r.editable && typeof r.value === 'number' ? (
                      <NumberEdit key={`${el.id}:${r.key}:${fmt(r.value)}`} value={roundMeasure(r.value)} suffix={unitLabel} onCommit={(v) => edit(el, r.key, v)} />
                    ) : (
                      valueText(r)
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            {explained(res).map((x) => (
              <div key={x.key} className="measure-calc">
                <p className="calc-title">{x.key === 'area' ? m.rows.area : x.symbol === 'C' ? m.circumference : m.rows.perimeter}</p>
                <p className="calc-formula">
                  {x.symbol} = {x.formula}
                </p>
                <p className="calc-result">
                  {x.numbers !== '—' && <>= {x.numbers} </>}
                  {x.approx ? '≈' : '='} <strong>{fmt(x.value)} {unitLabel}{x.dim === 2 ? '²' : ''}</strong>
                </p>
              </div>
            ))}
          </section>
        ))
      )}
    </aside>
  );
}

/** A number you can type; applies on Enter or when you click away. */
function NumberEdit({ value, suffix, onCommit }: { value: number; suffix: string; onCommit(v: number): void }) {
  const [text, setText] = useState(String(value));
  const commit = () => {
    const v = Number(text.replace(',', '.'));
    if (v > 0 && v !== value) onCommit(v);
    else setText(String(value));
  };
  return (
    <span className="measure-edit">
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation(); // typing digits must not switch board tools
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setText(String(value));
        }}
      />
      {suffix}
    </span>
  );
}
