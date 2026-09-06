import { watch, watchFile, unwatchFile, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';

export interface WatchOptions {
  debounceMs?: number;
  onTrigger: () => Promise<void> | void;
  onError?: (err: Error) => void;
}

export interface WatcherHandle {
  close: () => void;
}

/**
 * Watches a file with debouncing on rapid file system events.
 */
export function watchFileDebounced(
  filePath: string,
  options: WatchOptions,
): WatcherHandle {
  const debounceMs = options.debounceMs ?? 200;
  const absPath = resolve(filePath);
  const dirPath = dirname(absPath);
  const targetBase = basename(absPath);
  let timer: NodeJS.Timeout | undefined;
  let isClosed = false;

  const run = (): void => {
    if (isClosed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        await options.onTrigger();
      } catch (err) {
        if (options.onError) {
          options.onError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }, debounceMs);
  };

  // Watch directory to catch atomic file replaces as well as direct writes
  let dirWatcher: ReturnType<typeof watch> | undefined;
  try {
    if (existsSync(dirPath)) {
      dirWatcher = watch(dirPath, (_eventType, filename) => {
        if (!filename || filename === targetBase) {
          run();
        }
      });
    }
  } catch {
    // fallback if dir watch fails
  }

  // Also watch file directly
  let fileWatcher: ReturnType<typeof watch> | undefined;
  try {
    if (existsSync(absPath)) {
      fileWatcher = watch(absPath, () => {
        run();
      });
    }
  } catch {
    // fallback
  }

  // watchFile as polling backup
  try {
    if (existsSync(absPath)) {
      watchFile(absPath, { interval: 50 }, () => {
        run();
      });
    }
  } catch {
    // fallback
  }

  return {
    close() {
      isClosed = true;
      if (timer) clearTimeout(timer);
      try {
        dirWatcher?.close();
      } catch {}
      try {
        fileWatcher?.close();
      } catch {}
      try {
        unwatchFile(absPath);
      } catch {}
    },
  };
}
