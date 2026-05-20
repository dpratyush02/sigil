/**
 * Web storage — pure localStorage, zero native modules.
 */
export const Storage = {
  async getItem(key: string): Promise<string | null> {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  async setItem(key: string, value: string): Promise<void> {
    try { localStorage.setItem(key, value); } catch {}
  },
  async removeItem(key: string): Promise<void> {
    try { localStorage.removeItem(key); } catch {}
  },
};
