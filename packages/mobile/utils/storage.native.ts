/**
 * Native storage — AsyncStorage with in-memory fallback.
 * If AsyncStorage native module is null (Expo Go SDK mismatch), falls back to RAM.
 */

// In-memory fallback
const mem: Record<string, string> = {};

let AS: any = null;
function getAS() {
  if (AS) return AS;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-async-storage/async-storage');
    const candidate = mod?.default ?? mod;
    // If native module is null the lib throws on first call, not on require
    AS = candidate;
  } catch {
    AS = null;
  }
  return AS;
}

export const Storage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const as = getAS();
      if (as) return await as.getItem(key);
    } catch {}
    return mem[key] ?? null;
  },

  async setItem(key: string, value: string): Promise<void> {
    mem[key] = value;
    try {
      const as = getAS();
      if (as) await as.setItem(key, value);
    } catch {}
  },

  async removeItem(key: string): Promise<void> {
    delete mem[key];
    try {
      const as = getAS();
      if (as) await as.removeItem(key);
    } catch {}
  },
};
