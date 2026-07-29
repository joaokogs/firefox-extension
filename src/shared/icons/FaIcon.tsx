import { getFaIconDef } from './IconMap';

interface FaIconProps {
  name: string;
  size?: number;
}

export function FaIcon({ name, size = 20 }: FaIconProps) {
  const def = getFaIconDef(name);
  if (!def) return null;

  const prefix = def.prefix === 'fab' ? 'fa-brands' : def.prefix === 'far' ? 'fa-regular' : 'fa-solid';

  return (
    <i
      class={`${prefix} ${def.iconName}`}
      style={{ fontSize: size, width: size, textAlign: 'center', lineHeight: 1 }}
    />
  );
}
