import { useState, useEffect } from 'preact/hooks';
import type { Widget, WidgetType } from '@shared/types';
import { createWidget } from '@shared/storage';
import { X, ExternalLink, LayoutGrid, Clock, CloudSun, CheckSquare } from 'lucide-preact';
import type { LucideIcon } from 'lucide-preact';
import { CityAutocomplete } from './CityAutocomplete';

const WIDGET_TYPES: { type: WidgetType; label: string; icon: LucideIcon }[] = [
  { type: 'links', label: 'Links', icon: ExternalLink },
  { type: 'calendar', label: 'Calendário', icon: LayoutGrid },
  { type: 'clock', label: 'Relógio', icon: Clock },
  { type: 'weather', label: 'Clima', icon: CloudSun },
  { type: 'todo', label: 'Bloco de Notas', icon: CheckSquare }
];

interface WidgetEditorProps {
  widget?: Widget | null;
  initialColumn?: number;
  linksOnly?: boolean;
  onSave: (widget: Widget) => void;
  onClose: () => void;
}

export function WidgetEditor({ widget, initialColumn = 0, linksOnly = false, onSave, onClose }: WidgetEditorProps) {
  const isEdit = !!widget;
  const [type, setType] = useState<WidgetType>(widget?.type || 'links');
  const [title, setTitle] = useState(widget?.title || '');
  const [colSpan, setColSpan] = useState(widget?.colSpan || 1);
  const [col, setCol] = useState(widget?.col ?? initialColumn);
  const [height, setHeight] = useState<number | ''>(widget?.height ?? '');
  const [city, setCity] = useState((widget?.type === 'weather' && widget.city) || '');
  const [timezone, setTimezone] = useState((widget?.type === 'clock' && widget.timezone) || '');
  const [label, setLabel] = useState((widget?.type === 'clock' && widget.label) || '');

  useEffect(() => {
    if (type !== 'weather') return;
    let cancelled = false;
    (async () => {
      if (!navigator.geolocation) return;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 8000,
            maximumAge: 600000
          });
        });
        if (cancelled) return;
        const detected = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        if (!cancelled && detected) setCity(detected);
      } catch {
        // geolocation falhou, mantém cidade salva ou padrão
      }
    })();
    return () => { cancelled = true; };
  }, [type]);

  const handleSave = () => {
    const base: Widget = widget ?? createWidget(type, title);
    const updated: Widget = {
      ...base,
      title: title.trim() || base.title,
      colSpan: Math.min(Math.max(Number(colSpan) || 1, 1), 2),
      col: Math.max(Number(col) || 0, 0),
      height: height !== '' ? Math.max(Number(height), 120) : undefined
    } as Widget;

    if (updated.type === 'weather') {
      (updated as typeof updated & { city: string }).city = city.trim() || 'New York';
    }
    if (updated.type === 'clock') {
      (updated as typeof updated & { timezone?: string; label?: string }).timezone = timezone.trim() || undefined;
      (updated as typeof updated & { timezone?: string; label?: string }).label = label.trim() || undefined;
    }
    onSave(updated);
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true">
      <div className="modal modal--wide">
        <div className="modal__header">
          <h2>{isEdit ? 'Editar widget' : linksOnly ? 'Novo bloco de links' : 'Novo widget'}</h2>
          <button className="modal__close" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="widget-editor">
          {!isEdit && !linksOnly && (
            <div className="widget-editor__section">
              <label className="widget-editor__label">Tipo</label>
              <div className="widget-editor__types">
                {WIDGET_TYPES.map((t) => (
                  <button
                    key={t.type}
                    type="button"
                    className={`widget-editor__type ${type === t.type ? 'widget-editor__type--active' : ''}`}
                    onClick={() => setType(t.type)}
                  >
                    <t.icon size={18} strokeWidth={2} />
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="widget-editor__row">
            {(linksOnly || (isEdit && (type === 'links' || type === 'todo'))) && (
              <label className="widget-editor__field">
                <span>Título</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle((e.target as HTMLInputElement).value)}
                  placeholder="Ex: Trabalho"
                />
              </label>
            )}
            {!linksOnly && (
              <label className="widget-editor__field widget-editor__field--small">
                <span>Largura</span>
                <select value={colSpan} onChange={(e) => setColSpan(Number((e.target as HTMLSelectElement).value))}>
                  <option value={1}>1 coluna</option>
                  <option value={2}>2 colunas</option>
                </select>
              </label>
            )}
            {isEdit && (
              <>
                <label className="widget-editor__field widget-editor__field--small">
                  <span>Coluna</span>
                  <input
                    type="number"
                    value={col}
                    onChange={(e) => setCol(Math.max(Number((e.target as HTMLInputElement).value) || 0, 0))}
                    min={0}
                  />
                </label>
                {(widget?.type === 'links' || widget?.type === 'todo') && (
                  <label className="widget-editor__field widget-editor__field--small">
                    <span>Altura (px)</span>
                    <input
                      type="number"
                      value={height}
                      onChange={(e) => {
                        const val = (e.target as HTMLInputElement).value;
                        setHeight(val === '' ? '' : Number(val));
                      }}
                      placeholder="Auto"
                      min={120}
                    />
                  </label>
                )}
              </>
            )}
          </div>

          {type === 'weather' && (
            <label className="widget-editor__field">
              <span>Cidade</span>
              <CityAutocomplete
                value={city}
                onChange={setCity}
                placeholder="Ex: São Paulo"
                id="widget-editor-city"
              />
            </label>
          )}

          {type === 'clock' && (
            <div className="widget-editor__row">
              <label className="widget-editor__field">
                <span>Timezone (opcional)</span>
                <input
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone((e.target as HTMLInputElement).value)}
                  placeholder="Ex: America/New_York"
                />
              </label>
              <label className="widget-editor__field">
                <span>Label (opcional)</span>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel((e.target as HTMLInputElement).value)}
                  placeholder="Ex: Wed Jun 17"
                />
              </label>
            </div>
          )}

        </div>

        <div className="modal__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn--primary" onClick={handleSave}>
            Salvar widget
          </button>
        </div>
      </div>
    </div>
  );
}

async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=pt`
    );
    if (!response.ok) return null;
    const data = await response.json();
    return data.city || data.locality || data.principalSubdivision || null;
  } catch {
    return null;
  }
}
