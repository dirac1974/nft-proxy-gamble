// No clipboard package is installed, so use RN core's (deprecated but still shipped)
// Clipboard module lazily and fail soft if it's ever removed.
interface ClipboardLike {
  getString: () => Promise<string>;
  setString: (s: string) => void;
}

function getClipboard(): ClipboardLike | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rn = require("react-native") as { Clipboard?: ClipboardLike };
    return rn.Clipboard ?? null;
  } catch {
    return null;
  }
}

export const clipboardAvailable = (): boolean => getClipboard() !== null;

export function copyText(text: string): boolean {
  const cb = getClipboard();
  if (!cb) return false;
  try {
    cb.setString(text);
    return true;
  } catch {
    return false;
  }
}

export async function pasteText(): Promise<string | null> {
  const cb = getClipboard();
  if (!cb) return null;
  try {
    return await cb.getString();
  } catch {
    return null;
  }
}
