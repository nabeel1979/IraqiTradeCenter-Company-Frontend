import { X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ColorSwatch } from '@/components/inventory/ColorSwatch';
import type { StandardColor } from '@/lib/inventory/standardColors';

interface StandardColorPickerDialogProps {
  open: boolean;
  title?: string;
  colors: StandardColor[];
  onClose: () => void;
  onSelect: (color: StandardColor) => void;
}

export function StandardColorPickerDialog({
  open,
  title = 'اختر لوناً',
  colors,
  onClose,
  onSelect,
}: StandardColorPickerDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-lg max-h-[85vh] flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between py-3 px-4 shrink-0">
          <CardTitle className="text-base">{title}</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="px-4 pb-4 overflow-y-auto">
          {colors.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">لا توجد ألوان متاحة في القائمة</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {colors.map(c => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => onSelect(c)}
                  className="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm hover:bg-muted transition-colors text-right"
                >
                  <ColorSwatch hex={c.hex} size="md" />
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium truncate">{c.nameAr}</span>
                    <span className="block text-[10px] text-muted-foreground truncate">{c.nameEn}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
