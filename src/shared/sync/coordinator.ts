import { browser } from '@shared/browser';

const COORDINATION_KEY = 'syncCoordination';
const LOCK_TTL_MS = 60_000;
export const MIN_SYNC_INTERVAL_MS = 30_000;

const INSTANCE_ID = `sync-${Date.now()}-${Math.random().toString(36).slice(2)}`;

interface SyncLock {
  owner: string;
  expiresAt: number;
}

interface SyncCoordinationEntry {
  lastSyncAt?: number;
  lock?: SyncLock;
}

type SyncCoordination = Record<string, SyncCoordinationEntry>;

export interface SyncLease {
  complete(): Promise<void>;
  release(): Promise<void>;
}

async function readCoordination(): Promise<SyncCoordination> {
  const result = await browser.storage.local.get(COORDINATION_KEY);
  const value = result[COORDINATION_KEY];
  return value && typeof value === 'object' ? value as SyncCoordination : {};
}

async function writeCoordination(value: SyncCoordination): Promise<void> {
  await browser.storage.local.set({ [COORDINATION_KEY]: value });
}

export async function acquireSyncLease(userId: string, force = false): Promise<SyncLease | null> {
  const now = Date.now();
  const coordination = await readCoordination();
  const current = coordination[userId] ?? {};

  if (!force && current.lastSyncAt && now - current.lastSyncAt < MIN_SYNC_INTERVAL_MS) {
    return null;
  }

  if (current.lock && current.lock.owner !== INSTANCE_ID && current.lock.expiresAt > now) {
    return null;
  }

  const next: SyncCoordination = {
    ...coordination,
    [userId]: {
      ...current,
      lock: { owner: INSTANCE_ID, expiresAt: now + LOCK_TTL_MS },
    },
  };

  await writeCoordination(next);

  // Confirm that this tab still owns the lock after the shared write.
  const verified = await readCoordination();
  if (verified[userId]?.lock?.owner !== INSTANCE_ID) return null;

  let completed = false;
  let released = false;

  return {
    async complete() {
      if (completed || released) return;
      completed = true;
      const latest = await readCoordination();
      if (latest[userId]?.lock?.owner !== INSTANCE_ID) return;
      await writeCoordination({
        ...latest,
        [userId]: {
          ...latest[userId],
          lastSyncAt: Date.now(),
        },
      });
    },
    async release() {
      if (released) return;
      released = true;
      const latest = await readCoordination();
      if (latest[userId]?.lock?.owner !== INSTANCE_ID) return;
      const entry = { ...latest[userId] };
      delete entry.lock;
      await writeCoordination({
        ...latest,
        [userId]: entry,
      });
    },
  };
}
