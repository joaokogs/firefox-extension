import { browser } from '@shared/browser';
import type { SyncOperation, SyncAction, SyncEntity, OutboxState } from './types';

const OUTBOX_KEY_PREFIX = 'syncOutbox';

let outboxMutex: Promise<void> = Promise.resolve();

function withOutboxLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = outboxMutex;
  let release: () => void;
  outboxMutex = new Promise<void>((resolve) => {
    release = resolve;
  });
  return prev.then(fn).finally(() => release!());
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function makeKey(owner?: string): string {
  return owner ? `${OUTBOX_KEY_PREFIX}:${owner}` : `${OUTBOX_KEY_PREFIX}:unowned`;
}

let cachedDeviceId: string | null = null;
let currentOwner: string | undefined;

export function setOutboxOwner(owner: string | undefined): void {
  currentOwner = owner;
}

async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    const result = await browser.storage.local.get('syncDeviceId');
    const saved = result['syncDeviceId'] as string | undefined;
    if (saved) {
      cachedDeviceId = saved;
      return saved;
    }
  } catch { /* storage not available yet */ }
  const id = `dev-${generateId()}`;
  cachedDeviceId = id;
  try {
    await browser.storage.local.set({ syncDeviceId: id });
  } catch { /* best effort */ }
  return id;
}

async function loadOutboxRaw(owner?: string): Promise<OutboxState> {
  try {
    const key = makeKey(owner);
    const result = await browser.storage.local.get(key);
    const saved = result[key] as OutboxState | undefined;
    if (saved && Array.isArray(saved.operations)) {
      return saved;
    }
  } catch { /* storage not available yet */ }
  return { deviceId: '', nextSequence: 0, operations: [], lastKnownRevision: 0 };
}

async function saveOutboxRaw(state: OutboxState, owner?: string): Promise<void> {
  try {
    const key = makeKey(owner);
    await browser.storage.local.set({ [key]: state });
  } catch (err) {
    console.error('[outbox] Failed to save:', err);
  }
}

function findLastIndex(ops: SyncOperation[], action: SyncAction): number {
  for (let i = ops.length - 1; i >= 0; i--) {
    if (ops[i].action === action) return i;
  }
  return -1;
}

function mergePatchPayloads(patches: SyncOperation[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const p of patches) {
    Object.assign(merged, p.payload as Record<string, unknown>);
  }
  return merged;
}

function compactOperations(operations: SyncOperation[]): SyncOperation[] {
  const byEntity = new Map<string, SyncOperation[]>();

  for (const op of operations) {
    const key = `${op.entity}:${op.entityId}`;
    if (!byEntity.has(key)) byEntity.set(key, []);
    byEntity.get(key)!.push(op);
  }

  const result: SyncOperation[] = [];

  for (const [, ops] of byEntity) {
    const sorted = [...ops].sort((a, b) => a.createdAt - b.createdAt);

    const lastDeleteIdx = findLastIndex(sorted, 'delete');
    if (lastDeleteIdx >= 0 && lastDeleteIdx === sorted.length - 1) {
      result.push(sorted[lastDeleteIdx]);
      continue;
    }

    const startIdx = lastDeleteIdx >= 0 ? lastDeleteIdx + 1 : 0;
    const afterDelete = sorted.slice(startIdx);
    if (afterDelete.length === 0) continue;

    const lastPutIdx = findLastIndex(afterDelete, 'put');

    if (lastPutIdx >= 0) {
      const putOp = afterDelete[lastPutIdx];
      result.push(putOp);

      const afterPut = afterDelete.slice(lastPutIdx + 1);
      const patchesAfterPut = afterPut.filter((o) => o.action === 'patch');
      const moveAfterPut = afterPut.filter((o) => o.action === 'move').pop();

      if (patchesAfterPut.length > 0) {
        const lastPatch = patchesAfterPut[patchesAfterPut.length - 1];
        result.push({ ...lastPatch, payload: mergePatchPayloads(patchesAfterPut) });
      }

      if (moveAfterPut) {
        result.push(moveAfterPut);
      }
    } else {
      const patches = afterDelete.filter((o) => o.action === 'patch');
      const move = afterDelete.filter((o) => o.action === 'move').pop();

      if (patches.length > 0) {
        const lastPatch = patches[patches.length - 1];
        result.push({ ...lastPatch, payload: mergePatchPayloads(patches) });
      }

      if (move) {
        result.push(move);
      }
    }
  }

  return result.sort((a, b) => a.createdAt - b.createdAt);
}

export async function recordOperation(
  entity: SyncEntity,
  entityId: string,
  action: SyncAction,
  payload: unknown,
): Promise<void> {
  await withOutboxLock(async () => {
    const owner = currentOwner;
    const state = await loadOutboxRaw(owner);
    const deviceId = await getDeviceId();
    const sequence = state.nextSequence++;

    const op: SyncOperation = {
      opId: `${deviceId}-${sequence}`,
      baseRevision: state.lastKnownRevision,
      entity,
      entityId,
      action,
      payload,
      createdAt: Date.now(),
    };

    state.operations.push(op);
    state.operations = compactOperations(state.operations);
    await saveOutboxRaw(state, owner);
  });
}

export async function claimAndMergeOutbox(userId: string): Promise<void> {
  await withOutboxLock(async () => {
    const unowned = await loadOutboxRaw(undefined);
    if (unowned.operations.length === 0) return;

    const owned = await loadOutboxRaw(userId);

    const ownedOpIds = new Set(owned.operations.map((op) => op.opId));
    const deviceId = await getDeviceId();
    let nextSeq = Math.max(owned.nextSequence, unowned.nextSequence);

    for (const op of unowned.operations) {
      if (ownedOpIds.has(op.opId) || op.opId.startsWith('dev-')) {
        op.opId = `${deviceId}-${nextSeq++}`;
      }
    }

    const merged = [...owned.operations, ...unowned.operations];
    const compacted = compactOperations(merged);
    const revision = Math.max(unowned.lastKnownRevision, owned.lastKnownRevision);

    await saveOutboxRaw(
      { deviceId: '', nextSequence: 0, operations: [], lastKnownRevision: 0 },
      undefined,
    );

    await saveOutboxRaw(
      {
        deviceId: owned.deviceId || unowned.deviceId,
        nextSequence: nextSeq,
        operations: compacted,
        lastKnownRevision: revision,
      },
      userId,
    );
  });
}

export async function getPendingOperations(owner?: string): Promise<SyncOperation[]> {
  const state = await loadOutboxRaw(owner);
  return state.operations;
}

export async function getPendingCount(owner?: string): Promise<number> {
  const state = await loadOutboxRaw(owner);
  return state.operations.length;
}

export async function getLastKnownRevision(owner?: string): Promise<number> {
  const state = await loadOutboxRaw(owner);
  return state.lastKnownRevision;
}

export async function ackOperations(opIds: Set<string>, newRevision: number, owner?: string): Promise<void> {
  await withOutboxLock(async () => {
    const state = await loadOutboxRaw(owner);
    state.operations = state.operations.filter((op) => !opIds.has(op.opId));
    state.lastKnownRevision = newRevision;
    await saveOutboxRaw(state, owner);
  });
}

export async function updateLastKnownRevision(revision: number, owner?: string): Promise<void> {
  await withOutboxLock(async () => {
    const state = await loadOutboxRaw(owner);
    state.lastKnownRevision = revision;
    state.operations = state.operations.map((op) => ({ ...op, baseRevision: revision }));
    await saveOutboxRaw(state, owner);
  });
}

export async function hasPendingOperations(owner?: string): Promise<boolean> {
  const state = await loadOutboxRaw(owner);
  return state.operations.length > 0;
}

export { getDeviceId };
