import { browser } from '@shared/browser';
import type { SyncOperation, SyncAction, SyncEntity, OutboxState, DeadLetterEntry } from './types';
import { notifyStorageFailure } from '@shared/storage';

const OUTBOX_KEY_PREFIX = 'syncOutbox';
const DEAD_LETTER_MIN_ATTEMPTS = 3;
const DEAD_LETTER_MIN_AGE_MS = 60 * 60 * 1000;

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
      return {
        deviceId: saved.deviceId ?? '',
        nextSequence: saved.nextSequence ?? 0,
        operations: saved.operations,
        lastKnownRevision: saved.lastKnownRevision ?? 0,
        deadLetters: Array.isArray(saved.deadLetters) ? saved.deadLetters : [],
        committedOpIds: Array.isArray(saved.committedOpIds) ? saved.committedOpIds : [],
      };
    }
  } catch { /* storage not available yet */ }
  return { deviceId: '', nextSequence: 0, operations: [], lastKnownRevision: 0, deadLetters: [], committedOpIds: [] };
}

async function saveOutboxRaw(state: OutboxState, owner?: string): Promise<boolean> {
  try {
    const key = makeKey(owner);
    await browser.storage.local.set({ [key]: state });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[outbox] Failed to save:', message);
    try { notifyStorageFailure(`outbox: ${message}`); } catch { /* guard */ }
    return false;
  }
}

function findLastIndex(ops: SyncOperation[], action: SyncAction): number {
  for (let i = ops.length - 1; i >= 0; i--) {
    if (ops[i].action === action) return i;
  }
  return -1;
}

function mergePatchPayloads(patches: SyncOperation[]): unknown {
  const lastPayload = patches[patches.length - 1]?.payload;
  if (Array.isArray(lastPayload)) return lastPayload;

  const merged: Record<string, unknown> = {};
  for (const p of patches) {
    if (p.payload && typeof p.payload === 'object' && !Array.isArray(p.payload)) {
      Object.assign(merged, p.payload as Record<string, unknown>);
    }
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
    const saved = await saveOutboxRaw(state, owner);
    if (!saved) {
      throw new Error(`[outbox] Failed to persist operation ${op.opId} for entity ${entity}:${entityId}`);
    }
  });
}

export async function claimAndMergeOutbox(userId: string): Promise<void> {
  await withOutboxLock(async () => {
    const unowned = await loadOutboxRaw(undefined);
    if (unowned.operations.length === 0) return;

    const owned = await loadOutboxRaw(userId);

    const ownedOpIds = new Set(owned.operations.map((op) => op.opId));
    let nextSeq = Math.max(owned.nextSequence, unowned.nextSequence);

    const freshOps = unowned.operations.filter((op) => !ownedOpIds.has(op.opId));

    const merged = [...owned.operations, ...freshOps];
    const compacted = compactOperations(merged);
    const revision = Math.max(unowned.lastKnownRevision, owned.lastKnownRevision);

    const seenDeadIds = new Set<string>();
    const mergedDeadLetters = [
      ...(owned.deadLetters ?? []).filter((d) => {
        if (seenDeadIds.has(d.op.opId)) return false;
        seenDeadIds.add(d.op.opId);
        return true;
      }),
      ...(unowned.deadLetters ?? []).filter((d) => {
        if (seenDeadIds.has(d.op.opId)) return false;
        seenDeadIds.add(d.op.opId);
        return true;
      }),
    ];

    const mergedCommitted = Array.from(
      new Set([...(owned.committedOpIds ?? []), ...(unowned.committedOpIds ?? [])]),
    );

    const ownedSaved = await saveOutboxRaw(
      {
        deviceId: owned.deviceId || unowned.deviceId,
        nextSequence: nextSeq,
        operations: compacted,
        lastKnownRevision: revision,
        deadLetters: mergedDeadLetters,
        committedOpIds: mergedCommitted,
      },
      userId,
    );

    if (!ownedSaved) {
      throw new Error('[outbox] Failed to save merged outbox for owner');
    }

    const unownedCleared = await saveOutboxRaw(
      { deviceId: '', nextSequence: 0, operations: [], lastKnownRevision: 0, deadLetters: [], committedOpIds: [] },
      undefined,
    );

    if (!unownedCleared) {
      console.error('[outbox] Failed to clear unowned outbox after merge — operations already merged into owned');
    }
  });
}

const committedInMemory = new Set<string>();

export function markOperationsCommitted(opIds: Set<string>, owner?: string): void {
  for (const id of opIds) committedInMemory.add(id);

  withOutboxLock(async () => {
    const state = await loadOutboxRaw(owner);
    const existing = new Set(state.committedOpIds ?? []);
    for (const id of opIds) existing.add(id);
    state.committedOpIds = Array.from(existing);
    await saveOutboxRaw(state, owner);
  }).catch((err) => {
    console.error('[outbox] Failed to persist committed opIds:', err);
  });
}

export async function getPendingOperations(owner?: string): Promise<SyncOperation[]> {
  const state = await loadOutboxRaw(owner);
  const persistedCommitted = new Set(state.committedOpIds ?? []);
  return state.operations.filter(
    (op) => !committedInMemory.has(op.opId) && !persistedCommitted.has(op.opId),
  );
}

export async function getPendingCount(owner?: string): Promise<number> {
  const state = await loadOutboxRaw(owner);
  const persistedCommitted = new Set(state.committedOpIds ?? []);
  let count = 0;
  for (const op of state.operations) {
    if (!committedInMemory.has(op.opId) && !persistedCommitted.has(op.opId)) {
      count++;
    }
  }
  return count;
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
    state.committedOpIds = (state.committedOpIds ?? []).filter((id) => !opIds.has(id));
    const saved = await saveOutboxRaw(state, owner);
    if (!saved) {
      throw new Error('[outbox] Failed to persist ack');
    }
    for (const id of opIds) committedInMemory.delete(id);
  });
}

export async function updateLastKnownRevision(revision: number, owner?: string): Promise<void> {
  await withOutboxLock(async () => {
    const state = await loadOutboxRaw(owner);
    state.lastKnownRevision = revision;
    state.operations = state.operations.map((op) => ({ ...op, baseRevision: revision }));
    const saved = await saveOutboxRaw(state, owner);
    if (!saved) {
      throw new Error('[outbox] Failed to persist revision update');
    }
  });
}

export async function hasPendingOperations(owner?: string): Promise<boolean> {
  const state = await loadOutboxRaw(owner);
  const persistedCommitted = new Set(state.committedOpIds ?? []);
  return state.operations.some(
    (op) => !committedInMemory.has(op.opId) && !persistedCommitted.has(op.opId),
  );
}

export async function classifyDeadLetters(unappliedOps: SyncOperation[], owner?: string): Promise<void> {
  if (unappliedOps.length === 0) return;

  await withOutboxLock(async () => {
    const state = await loadOutboxRaw(owner);
    const now = Date.now();
    const deadLetters = state.deadLetters ?? [];
    const existingDeadIds = new Set(deadLetters.map((d) => d.op.opId));
    let changed = false;
    const newDead: DeadLetterEntry[] = [];

    for (const op of unappliedOps) {
      const attempts = (op.failedAttempts ?? 0) + 1;
      const firstFailed = op.firstFailedAt ?? now;
      const lastFailed = now;

      const updatedOp: SyncOperation = {
        ...op,
        failedAttempts: attempts,
        firstFailedAt: firstFailed,
        lastFailedAt: lastFailed,
      };

      const age = now - firstFailed;
      const qualifies = attempts >= DEAD_LETTER_MIN_ATTEMPTS && age >= DEAD_LETTER_MIN_AGE_MS;

      if (qualifies || existingDeadIds.has(op.opId)) {
        if (!existingDeadIds.has(op.opId)) {
          newDead.push({
            op: updatedOp,
            owner: owner ?? 'unknown',
            reason: `Operation failed ${attempts} times over ${Math.round(age / 1000)}s: ${op.entity}/${op.entityId}/${op.action}`,
            timestamp: now,
          });
        }
        state.operations = state.operations.filter((o) => o.opId !== op.opId);
        changed = true;
      } else {
        const idx = state.operations.findIndex((o) => o.opId === op.opId);
        if (idx >= 0) {
          state.operations[idx] = updatedOp;
          changed = true;
        }
      }
    }

    if (newDead.length > 0) {
      state.deadLetters = [...deadLetters, ...newDead];
      changed = true;
    }

    if (changed) {
      const saved = await saveOutboxRaw(state, owner);
      if (!saved) {
        throw new Error('[outbox] Failed to persist dead-letter classification');
      }
    }
  });
}

export async function requeueDeadLetters(owner?: string): Promise<number> {
  let requeued = 0;

  await withOutboxLock(async () => {
    const state = await loadOutboxRaw(owner);
    const deadLetters = state.deadLetters ?? [];
    if (deadLetters.length === 0) return;

    const reactivated: SyncOperation[] = deadLetters.map((entry) => {
      const { failedAttempts, firstFailedAt, lastFailedAt, ...clean } = entry.op;
      return clean;
    });

    state.operations = compactOperations([...state.operations, ...reactivated]);
    state.deadLetters = [];
    requeued = reactivated.length;

    const saved = await saveOutboxRaw(state, owner);
    if (!saved) {
      throw new Error('[outbox] Failed to persist dead-letter requeue');
    }
  });

  return requeued;
}

export async function getDeadLetters(owner?: string): Promise<DeadLetterEntry[]> {
  const state = await loadOutboxRaw(owner);
  return state.deadLetters ?? [];
}

export async function getDeadLetterCount(owner?: string): Promise<number> {
  const state = await loadOutboxRaw(owner);
  return state.deadLetters?.length ?? 0;
}

export function clearCommittedInMemory(): void {
  committedInMemory.clear();
}

export { getDeviceId };
