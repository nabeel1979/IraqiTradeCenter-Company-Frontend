import { cn } from '@/lib/utils';

interface ColorSwatchProps {
  hex?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  title?: string;
}

const SIZES = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-7 w-7' };

export function ColorSwatch({ hex, size = 'md', className, title }: ColorSwatchProps) {
  const bg = hex && /^#[0-9A-Fa-f]{3,8}$/.test(hex) ? hex : '#E5E7EB';
  const isLight = bg.toUpperCase() === '#FFFFFF' || bg.toUpperCase() === '#FFF';
  return (
    <span
      title={title}
      className={cn(
        'inline-block shrink-0 rounded-full border shadow-sm',
        isLight ? 'border-gray-300' : 'border-black/10',
        SIZES[size],
        className,
      )}
      style={{ backgroundColor: bg }}
    />
  );
}
