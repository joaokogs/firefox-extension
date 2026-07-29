import { getLucideIcon } from './IconMap';
import { FaIcon } from './FaIcon';

interface AnyIconProps {
  name: string;
  size?: number;
}

export function AnyIcon({ name, size = 20 }: AnyIconProps) {
  if (name.startsWith('fa:') || name.startsWith('fab:') || name.startsWith('far:')) {
    return <FaIcon name={name} size={size} />;
  }

  const IconComponent = getLucideIcon(name);
  if (!IconComponent) return null;
  return <IconComponent size={size} strokeWidth={2} />;
}

export { getLucideIcon, getFaIconDef, ICON_PICKER_LIST } from './IconMap';
