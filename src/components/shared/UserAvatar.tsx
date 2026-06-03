import { cn } from '@/lib/utils';

const SIZE_CLASS = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-14 w-14 text-base',
  lg: 'h-20 w-20 text-xl',
} as const;

interface UserAvatarProps {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
}

export function UserAvatar({ name, src, size = 'md', className }: UserAvatarProps) {
  const label = name.trim() || '?';
  const initial = label.charAt(0).toUpperCase();

  if (src) {
    return (
      <img
        src={src}
        alt={label}
        className={cn('rounded-full object-cover ring-2 ring-primary/20', SIZE_CLASS[size], className)}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-primary/15 font-semibold text-primary ring-2 ring-primary/20',
        SIZE_CLASS[size],
        className,
      )}
      aria-hidden
    >
      {initial}
    </div>
  );
}
