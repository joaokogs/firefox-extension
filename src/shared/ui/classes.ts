export const uiFieldClass = 'flex flex-col gap-1.5';

export const uiLabelClass = 'text-xs font-semibold text-ui-text-secondary';

export const uiInputClass = 'min-h-10 w-full rounded-md border border-ui-border bg-ui-background px-3 text-sm text-ui-text outline-none transition-colors placeholder:text-ui-text-muted/80 hover:border-ui-accent-text/70 focus:border-ui-accent-text focus:ring-2 focus:ring-ui-accent-text/20 disabled:cursor-not-allowed disabled:opacity-50';

export const uiSelectClass = `${uiInputClass} cursor-pointer`;

export const uiButtonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-transparent px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent-text disabled:cursor-not-allowed disabled:opacity-50';

export const uiButtonPrimaryClass = `${uiButtonClass} bg-ui-accent text-white shadow-[0_4px_12px_rgba(15,23,42,0.16)] hover:bg-ui-accent-hover`;

export const uiButtonSecondaryClass = `${uiButtonClass} border-ui-border bg-ui-surface-muted text-ui-text-secondary hover:bg-ui-surface-raised hover:text-ui-text`;

export const uiButtonDangerClass = `${uiButtonClass} border-ui-danger/25 bg-ui-danger/10 text-ui-danger hover:border-ui-danger/40 hover:bg-ui-danger/15 hover:text-ui-danger-hover`;

export const uiIconButtonClass = 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-ui-border-subtle bg-ui-surface-muted text-ui-text-muted transition-colors hover:border-ui-border hover:bg-ui-surface-raised hover:text-ui-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent-text disabled:cursor-not-allowed disabled:opacity-50';

export const uiSwitchLabelClass = 'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center';

export const uiSwitchInputClass = 'peer sr-only';

export const uiSwitchTrackClass = 'absolute inset-0 rounded-full bg-ui-toggle-off transition-colors peer-checked:bg-ui-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ui-accent-text peer-disabled:opacity-50 after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:after:translate-x-5';
