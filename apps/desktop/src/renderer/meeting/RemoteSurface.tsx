import { isStopCombo, type MouseButtonName, type RemoteInput } from '@classroom/protocol';
import { MousePointer2, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useT } from '../lib/settings';

const BUTTONS: Record<number, MouseButtonName> = { 0: 'left', 1: 'middle', 2: 'right' };

/**
 * Transparent layer over a guest's shared screen. While active, the host's pointer and keyboard
 * events are turned into normalized remote-input events and sent to that guest.
 */
export function RemoteSurface({ name, send, onRelease }: { name: string; send: (e: RemoteInput) => void; onRelease: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const held = useRef(new Set<string>());
  const pendingMove = useRef<{ x: number; y: number } | null>(null);

  // Map a pointer position to 0–1 coordinates of the actual video picture (object-fit: contain leaves bars).
  const toNormalized = (clientX: number, clientY: number) => {
    const video = ref.current?.parentElement?.querySelector('video');
    const box = (video ?? ref.current)?.getBoundingClientRect();
    if (!box) return null;
    // Before the first frame arrives there is no picture size yet; treat the whole box as the screen.
    const scale = video?.videoWidth ? Math.min(box.width / video.videoWidth, box.height / video.videoHeight) : 0;
    const w = scale ? video!.videoWidth * scale : box.width;
    const h = scale ? video!.videoHeight * scale : box.height;
    if (w < 1 || h < 1) return null;
    const x = (clientX - (box.left + (box.width - w) / 2)) / w;
    const y = (clientY - (box.top + (box.height - h) / 2)) / h;
    if (x < 0 || y < 0 || x > 1 || y > 1) return null;
    return { x, y };
  };

  useEffect(() => {
    ref.current?.focus();
    // Coalesce pointer moves to ~60 per second (a timer, so it keeps working when the window isn't painting).
    const timer = setInterval(() => {
      if (pendingMove.current) {
        send({ k: 'move', ...pendingMove.current });
        pendingMove.current = null;
      }
    }, 16);
    const heldKeys = held.current;
    return () => {
      clearInterval(timer);
      for (const code of heldKeys) send({ k: 'keyup', code });
      heldKeys.clear();
    };
  }, [send]);

  const releaseKeys = () => {
    for (const code of held.current) send({ k: 'keyup', code });
    held.current.clear();
  };

  return (
    <div
      ref={ref}
      className="remote-surface"
      tabIndex={0}
      aria-label={t.remote.controlling(name)}
      onPointerMove={(e) => {
        const p = toNormalized(e.clientX, e.clientY);
        if (p) pendingMove.current = p;
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        ref.current?.focus();
        ref.current?.setPointerCapture(e.pointerId);
        const p = toNormalized(e.clientX, e.clientY);
        if (p && BUTTONS[e.button]) send({ k: 'down', b: BUTTONS[e.button], ...p });
      }}
      onPointerUp={(e) => {
        const p = toNormalized(e.clientX, e.clientY) ?? pendingMove.current ?? { x: 0.5, y: 0.5 };
        if (BUTTONS[e.button]) send({ k: 'up', b: BUTTONS[e.button], ...p });
      }}
      onWheel={(e) => {
        const lines = (d: number) => (d === 0 ? 0 : Math.sign(d) * Math.max(1, Math.min(20, Math.round(Math.abs(d) / 40))));
        send({ k: 'wheel', dx: lines(e.deltaX), dy: lines(e.deltaY) });
      }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat) return; // the guest's OS repeats held keys itself
        if (isStopCombo(e.nativeEvent.code, held.current)) return;
        held.current.add(e.nativeEvent.code);
        send({ k: 'keydown', code: e.nativeEvent.code });
      }}
      onKeyUp={(e) => {
        e.preventDefault();
        if (held.current.delete(e.nativeEvent.code)) send({ k: 'keyup', code: e.nativeEvent.code });
      }}
      onBlur={releaseKeys}
    >
      <div className="remote-bar" onPointerDown={(e) => e.stopPropagation()}>
        <MousePointer2 size={15} />
        <span>
          <strong>{t.remote.controlling(name)}</strong>
          <span className="remote-hint">{t.remote.controllingHint}</span>
        </span>
        <button className="remote-release" onClick={onRelease}>
          <X size={14} /> {t.remote.release}
        </button>
      </div>
    </div>
  );
}
