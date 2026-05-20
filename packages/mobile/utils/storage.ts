/**
 * TypeScript barrel for platform-specific storage.
 * Metro resolves storage.native.ts / storage.web.ts at runtime.
 * This file gives tsc a type surface to check against.
 */

// Re-export from native implementation for TS resolution
export { Storage } from './storage.native';
