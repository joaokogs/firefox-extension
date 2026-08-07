import type { AppData, Workspace } from '@shared/types';
import { DEFAULT_WALLPAPERS } from '@shared/types/constants';

export function mergeWorkspaces(local: Workspace[], remote: Workspace[]): Workspace[] {
  const map = new Map<string, Workspace>();

  for (const workspace of local) {
    map.set(workspace.id, workspace);
  }

  for (const workspace of remote) {
    const existing = map.get(workspace.id);
    if (!existing) {
      map.set(workspace.id, workspace);
      continue;
    }
    map.set(workspace.id, mergeWorkspace(existing, workspace));
  }

  return Array.from(map.values()).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

function mergeWorkspace(local: Workspace, remote: Workspace): Workspace {
  return local.updatedAt > remote.updatedAt ? local : remote;
}

export function mergeAppData(local: AppData, remote: AppData): AppData {
  const mergedWorkspaces = mergeWorkspaces(local.workspaces, remote.workspaces);

  const settings = {
    ...local.settings,
    ...remote.settings,
    wallpaper: local.settings.wallpaper ?? DEFAULT_WALLPAPERS[0],
    uploadedBackgrounds: local.settings.uploadedBackgrounds,
  };

  const localInstalledAt = local.installedAt ?? Number.MAX_SAFE_INTEGER;
  const remoteInstalledAt = remote.installedAt ?? Number.MAX_SAFE_INTEGER;
  const minInstalledAt = Math.min(localInstalledAt, remoteInstalledAt);

  return {
    workspaces: mergedWorkspaces,
    settings,
    installedAt: minInstalledAt === Number.MAX_SAFE_INTEGER ? Date.now() : minInstalledAt,
  };
}

export function purgeConfirmedDeletedWorkspaces(data: AppData, confirmedIds: Set<string>): AppData {
  if (confirmedIds.size === 0) return data;

  const workspaces = data.workspaces.filter(
    (workspace) => !workspace.deletedAt || !confirmedIds.has(workspace.id),
  );

  if (workspaces.length === data.workspaces.length) return data;

  const visible = workspaces.filter((workspace) => !workspace.deletedAt);
  const lastBoardId = data.settings.lastBoardId && visible.some((workspace) => workspace.id === data.settings.lastBoardId)
    ? data.settings.lastBoardId
    : visible[0]?.id;

  return {
    ...data,
    workspaces,
    settings: { ...data.settings, lastBoardId },
  };
}
