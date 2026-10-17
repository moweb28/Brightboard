export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

/** Works in Node and the browser. The alphabet has 32 chars, so byte % 32 is unbiased. */
export function generateRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  return Array.from(bytes, (b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join('');
}

/** Uppercases and strips spaces/dashes. Returns null if the result is not a valid code. */
export function normalizeRoomCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

export function formatRoomCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

/** Accepts a pasted invite link (`…/j/CODE`), an app link (`brightboard://join/CODE`) or a bare code. */
export function extractRoomCode(input: string): string | null {
  const fromLink = input.match(/(?:\/j\/|:\/\/join\/)([A-Za-z0-9-]+)/);
  return normalizeRoomCode(fromLink ? fromLink[1] : input);
}
