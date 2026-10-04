import { REACTION_TOPIC } from '@classroom/protocol';
import { RoomEvent, type RemoteParticipant, type Room } from 'livekit-client';
import { useCallback, useEffect, useState } from 'react';
import { nameOf } from './participants';

export const QUICK_REACTIONS = ['👍', '👏', '❤️', '😂', '😮', '🎉', '🤔', '🙌'];
const encoder = new TextEncoder();
const decoder = new TextDecoder();

interface Floating {
  id: number;
  emoji: string;
  name: string;
  x: number;
}
let nextId = 1;

/** Emoji reactions that float up over the stage for everyone. */
export function useReactions(room: Room) {
  const [items, setItems] = useState<Floating[]>([]);
  const show = useCallback((emoji: string, name: string) => {
    if (!QUICK_REACTIONS.includes(emoji)) return;
    const id = nextId++;
    setItems((list) => [...list.slice(-20), { id, emoji, name, x: 10 + Math.random() * 30 }]);
    setTimeout(() => setItems((list) => list.filter((i) => i.id !== id)), 4000);
  }, []);

  useEffect(() => {
    const onData = (payload: Uint8Array, p?: RemoteParticipant, _k?: unknown, topic?: string) => {
      if (topic !== REACTION_TOPIC || !p) return;
      try {
        show(JSON.parse(decoder.decode(payload)).emoji, nameOf(p));
      } catch {
        /* ignore */
      }
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => void room.off(RoomEvent.DataReceived, onData);
  }, [room, show]);

  const send = (emoji: string) => {
    show(emoji, nameOf(room.localParticipant));
    room.localParticipant.publishData(encoder.encode(JSON.stringify({ emoji })), { reliable: false, topic: REACTION_TOPIC }).catch(() => undefined);
  };
  return { items, send };
}

export function ReactionLayer({ items }: { items: Floating[] }) {
  return (
    <div className="reaction-layer" aria-hidden>
      {items.map((i) => (
        <div key={i.id} className="floating-reaction" style={{ insetInlineStart: `${i.x}%` }}>
          <span className="floating-emoji">{i.emoji}</span>
          <span className="floating-name">{i.name}</span>
        </div>
      ))}
    </div>
  );
}
