import { sha256 } from 'js-sha256';

/**
 * SHA256 hash of a text string — pure JS, works on web + native
 */
export function hashText(content: string): string {
  return sha256(content);
}

/**
 * SHA256 hash of a file URI — hashes the URI + timestamp as identifier
 * (file reading not available on web, so we use URI as stable key)
 */
export async function hashFile(fileUri: string): Promise<string> {
  try {
    // On native, try to read as base64 via dynamic import
    const FileSystem = await import('expo-file-system');
    const base64 = await (FileSystem as any).readAsStringAsync(fileUri, {
      encoding: 'base64',
    });
    return sha256(base64);
  } catch {
    return sha256(fileUri);
  }
}

export async function hashContent(
  content: string,
  isFile: boolean = false
): Promise<string> {
  if (isFile) return hashFile(content);
  return hashText(content);
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}
