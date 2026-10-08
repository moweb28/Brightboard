/** Remembers the newest version of each board element we've sent or received, so we only send what changed. */
export class VersionTracker {
  private versions = new Map<string, number>();

  unsent<T extends { id: string; version: number }>(elements: readonly T[]): T[] {
    return elements.filter((e) => (this.versions.get(e.id) ?? -1) < e.version);
  }

  mark(elements: readonly { id: string; version: number }[]) {
    for (const e of elements) {
      if ((this.versions.get(e.id) ?? -1) < e.version) this.versions.set(e.id, e.version);
    }
  }
}

/** Packets on the `board` text stream. Scene/update carry Excalidraw elements; files carry pictures. */
export const BOARD_TOPIC = 'board';
export type BoardPacket =
  | { type: 'update'; elements: unknown[] }
  | { type: 'scene'; elements: unknown[] }
  | { type: 'file'; file: { id: string; mimeType: string; dataURL: string; created: number } };
