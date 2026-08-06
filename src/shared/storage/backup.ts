import type { AppData, Board, ThemeConfig, TopWidgetConfig, Widget } from '@shared/types';
import { t } from '@shared/i18n';
import { generateId, getDefaultData } from '@shared/types/defaults';

export interface TemplateWidgetPosition {
  column: number;
  row: number;
}

export interface TemplateTheme {
  primaryColor: string;
  boardColor: string;
  boardOpacity: number;
  boardBlur: number;
}

interface TemplateWidgetBase {
  title: string;
  colSpan: number;
  height?: number;
  position: TemplateWidgetPosition;
}

export type TemplateWidget =
  | (TemplateWidgetBase & { type: 'links'; items: { title: string; url: string; icon?: string }[] })
  | (TemplateWidgetBase & { type: 'calendar' })
  | (TemplateWidgetBase & { type: 'clock'; timezone?: string; label?: string })
  | (TemplateWidgetBase & { type: 'weather'; city?: string })
  | (TemplateWidgetBase & { type: 'todo'; items: { text: string; done: boolean }[] });

export interface TemplateBoard {
  title: string;
  widgets: TemplateWidget[];
}

export interface TemplateData {
  format: 'prismi-template';
  version: 4;
  columns: number;
  headerWidgets?: TopWidgetConfig[];
  theme: TemplateTheme;
  boards: TemplateBoard[];
}

export interface ImportResult {
  data: AppData;
  theme?: TemplateTheme;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getWidgetPositions(widgets: Widget[], targetColumns: number): TemplateWidgetPosition[] {
  const sourceColumns = Math.max(
    1,
    ...widgets.map((widget) => widget.layoutColumns ?? 0),
    ...widgets
      .filter((widget) => widget.layoutColumns === undefined)
      .map((widget) => (widget.col ?? 0) + 1)
  );
  const nextRows = new Map<number, number>();
  const positions = new Map<number, TemplateWidgetPosition>();

  widgets
    .map((widget, index) => ({
      index,
      column: clamp(widget.col ?? 0, 0, sourceColumns - 1),
      row: Math.max(0, widget.order)
    }))
    .sort((a, b) => a.column - b.column || a.row - b.row || a.index - b.index)
    .forEach(({ index, column: sourceColumn }) => {
      const column = sourceColumns === 1
        ? 0
        : Math.round(sourceColumn * (targetColumns - 1) / (sourceColumns - 1));
      const row = nextRows.get(column) ?? 0;
      nextRows.set(column, row + 1);
      positions.set(index, {
        column: clamp(column, 0, targetColumns - 1),
        row
      });
    });

  return widgets.map((_, index) => positions.get(index) ?? { column: 0, row: index });
}

function serializeWidget(widget: Widget, position: TemplateWidgetPosition): TemplateWidget {
  const base = {
    type: widget.type,
    title: widget.title,
    colSpan: widget.colSpan,
    ...(widget.height !== undefined ? { height: widget.height } : {}),
    position
  };

  switch (widget.type) {
    case 'links':
      return {
        ...base,
        type: 'links',
        items: widget.items.map(({ title, url, icon }) => ({ title, url, ...(icon ? { icon } : {}) }))
      };
    case 'calendar':
      return { ...base, type: 'calendar' };
    case 'clock':
      return {
        ...base,
        type: 'clock',
        ...(widget.timezone ? { timezone: widget.timezone } : {}),
        ...(widget.label ? { label: widget.label } : {})
      };
    case 'weather':
      return { ...base, type: 'weather', ...(widget.city ? { city: widget.city } : {}) };
    case 'todo':
      return {
        ...base,
        type: 'todo',
        items: widget.items.map(({ text, done }) => ({ text, done }))
      };
  }
}

export function createTemplate(data: AppData, theme: Pick<ThemeConfig, 'primaryColor' | 'boardColor' | 'boardOpacity' | 'boardBlur'>): TemplateData {
  const columns = getCurrentColumnCount();
  return {
    format: 'prismi-template',
    version: 4,
    columns,
    headerWidgets: data.settings.topWidgets ?? [],
    theme: {
      primaryColor: theme.primaryColor,
      boardColor: theme.boardColor,
      boardOpacity: theme.boardOpacity,
      boardBlur: theme.boardBlur
    },
    boards: data.boards.map((board) => {
      const positions = getWidgetPositions(board.widgets, columns);
      return {
        title: board.title,
        widgets: board.widgets.map((widget, index) => serializeWidget(widget, positions[index]))
      };
    })
  };
}

export function exportData(data: AppData, theme: Pick<ThemeConfig, 'primaryColor' | 'boardColor' | 'boardOpacity' | 'boardBlur'>): void {
  const blob = new Blob([JSON.stringify(createTemplate(data, theme), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `prismi-template-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function getCurrentColumnCount(): number {
  const grid = typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('.widgets-grid');
  const width = grid?.clientWidth ?? (typeof window === 'undefined' ? 1920 : window.innerWidth);
  if (width >= 1920) return 6;
  if (width >= 1600) return 5;
  if (width >= 1280) return 4;
  if (width >= 900) return 3;
  if (width >= 480) return 2;
  return 1;
}

function deserializeWidget(widget: TemplateWidget, position: TemplateWidgetPosition, columns: number): Widget {
  const now = Date.now();
  const base = {
    id: generateId('widget'),
    title: widget.title,
    colSpan: widget.colSpan,
    order: position.row,
    ...(widget.height !== undefined ? { height: widget.height } : {}),
    col: position.column,
    layoutColumns: columns
  };

  switch (widget.type) {
    case 'links':
      return {
        ...base,
        type: 'links',
        items: widget.items.map((item) => ({
          id: generateId('link'),
          title: item.title,
          url: item.url,
          createdAt: now,
          updatedAt: now,
          ...(item.icon ? { icon: item.icon } : {})
        }))
      };
    case 'calendar':
      return { ...base, type: 'calendar' };
    case 'clock':
      return {
        ...base,
        type: 'clock',
        ...(widget.timezone ? { timezone: widget.timezone } : {}),
        ...(widget.label ? { label: widget.label } : {})
      };
    case 'weather':
      return { ...base, type: 'weather', ...(widget.city ? { city: widget.city } : {}) };
    case 'todo':
      return {
        ...base,
        type: 'todo',
        items: widget.items.map((item) => ({ id: generateId('todo'), text: item.text, done: item.done, createdAt: now, updatedAt: now }))
      };
  }
}

function isTemplateData(value: unknown): value is TemplateData {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TemplateData>;
  return candidate.format === 'prismi-template' && candidate.version === 4 && Number.isInteger(candidate.columns) && candidate.columns !== undefined && candidate.columns > 0 && Array.isArray(candidate.boards) && !!candidate.theme;
}

function importTemplate(template: TemplateData): ImportResult {
  const now = Date.now();
  const boards: Board[] = template.boards.map((board, index) => {
    return {
      id: generateId(`board-${index}`),
      title: board.title,
      widgets: board.widgets.map((widget) => deserializeWidget(widget, widget.position, template.columns)),
      createdAt: now,
      updatedAt: now
    };
  });
  const defaults = getDefaultData();
  const importedBoards = boards.length > 0 ? boards : defaults.boards;

  return {
    data: {
      boards: importedBoards,
      settings: {
        ...defaults.settings,
        themeConfig: template.theme,
        topWidgets: template.headerWidgets ?? defaults.settings.topWidgets,
        lastBoardId: importedBoards[0].id
      },
      installedAt: now
    },
    theme: template.theme
  };
}

export function importData(file: File): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (isTemplateData(parsed)) {
          resolve(importTemplate(parsed));
          return;
        }
        if (!parsed.boards || !Array.isArray(parsed.boards) || !parsed.settings) {
          reject(new Error(t('storage.invalidFileFormat')));
          return;
        }
        resolve({ data: parsed as AppData });
      } catch {
        reject(new Error(t('storage.invalidFileParse')));
      }
    };
    reader.onerror = () => reject(new Error(t('storage.errorReadingFile')));
    reader.readAsText(file);
  });
}
