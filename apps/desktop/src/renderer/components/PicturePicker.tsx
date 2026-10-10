import { ImagePlus, Trash2 } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { useT } from '../lib/settings';
import { Button } from './ui';

const SIZE = 256;

/** Center-crops an image file to a square and shrinks it to a small WebP, so it's light enough to share in calls. */
export async function squarePicture(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  canvas.getContext('2d')!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  return canvas.toDataURL('image/webp', 0.85);
}

/** A preview (avatar or space icon) with Upload / Remove buttons. */
export function PicturePicker({ preview, value, onChange }: { preview: ReactNode; value: string | null; onChange: (picture: string | null) => void }) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [failed, setFailed] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setFailed(false);
    try {
      onChange(await squarePicture(file));
    } catch {
      setFailed(true);
    }
  };

  return (
    <div className="picture-picker">
      {preview}
      <div className="stack picture-actions">
        <div className="row-wrap">
          <Button type="button" variant="secondary" size="sm" icon={ImagePlus} onClick={() => input.current?.click()}>
            {value ? t.picture.change : t.picture.upload}
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" icon={Trash2} onClick={() => onChange(null)}>
              {t.picture.remove}
            </Button>
          )}
        </div>
        <span className={failed ? 'error small' : 'muted small'}>{failed ? t.picture.failed : t.picture.hint}</span>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
