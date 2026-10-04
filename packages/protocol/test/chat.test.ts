import { describe, expect, it } from 'vitest';
import { applyChatPacket, linkify, type ChatState } from '../src/chat';

const empty: ChatState = { messages: [] };
const msg = (id: string, ts: number, text = 'hi') => ({ type: 'msg' as const, msg: { id, ts, text } });

describe('chat reducer', () => {
  it('adds messages with sender from the transport, sorted by time', () => {
    let s = applyChatPacket(empty, msg('b', 2), 'u-1', 'Sara');
    s = applyChatPacket(s, msg('a', 1), 'u-2', 'Ali');
    expect(s.messages.map((m) => m.id)).toEqual(['a', 'b']);
    expect(s.messages[1]).toMatchObject({ from: 'u-1', fromName: 'Sara', reactions: {} });
  });

  it('ignores duplicates and blank messages', () => {
    let s = applyChatPacket(empty, msg('a', 1), 'u-1', 'Sara');
    s = applyChatPacket(s, msg('a', 1), 'u-1', 'Sara');
    s = applyChatPacket(s, msg('c', 3, '   '), 'u-1', 'Sara');
    expect(s.messages).toHaveLength(1);
  });

  it('toggles reactions per person and drops empty ones', () => {
    let s = applyChatPacket(empty, msg('a', 1), 'u-1', 'Sara');
    s = applyChatPacket(s, { type: 'react', msgId: 'a', emoji: '👍', on: true }, 'u-2', 'Ali');
    s = applyChatPacket(s, { type: 'react', msgId: 'a', emoji: '👍', on: true }, 'u-2', 'Ali');
    expect(s.messages[0].reactions['👍']).toEqual(['u-2']);
    s = applyChatPacket(s, { type: 'react', msgId: 'a', emoji: '👍', on: false }, 'u-2', 'Ali');
    expect(s.messages[0].reactions).toEqual({});
  });

  it('rejects unknown reaction emoji', () => {
    let s = applyChatPacket(empty, msg('a', 1), 'u-1', 'Sara');
    s = applyChatPacket(s, { type: 'react', msgId: 'a', emoji: '<b>', on: true }, 'u-2', 'Ali');
    expect(s.messages[0].reactions).toEqual({});
  });

  it('merges history without duplicates', () => {
    let s = applyChatPacket(empty, msg('b', 2), 'u-1', 'Sara');
    const old = { id: 'a', from: 'u-3', fromName: 'T', text: 'old', ts: 1, reactions: {} };
    const dupe = { ...s.messages[0] };
    s = applyChatPacket(s, { type: 'history', messages: [old, dupe] }, 'u-3', 'T');
    expect(s.messages.map((m) => m.id)).toEqual(['a', 'b']);
  });
});

describe('linkify', () => {
  it('finds http(s) links and trims trailing punctuation', () => {
    expect(linkify('see https://x.com/a. ok')).toEqual([{ text: 'see ' }, { text: 'https://x.com/a', href: 'https://x.com/a' }, { text: '. ok' }]);
  });
  it('leaves other schemes as text', () => {
    expect(linkify('javascript:alert(1)')).toEqual([{ text: 'javascript:alert(1)' }]);
  });
});
