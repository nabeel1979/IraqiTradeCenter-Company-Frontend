import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';
import { extractApiError } from '@/lib/utils';

export interface InventorySoftDeleteTarget {
  id: number;
  label: string;
  note?: string;
}

export function useInventorySoftDelete(opts: {
  deleteFn: (id: number) => Promise<unknown>;
  invalidateKeys?: readonly unknown[][];
  note?: string;
}) {
  const { can } = usePermissions();
  const canDelete = can(PERMS.Inventory.Items.Delete);
  const qc = useQueryClient();
  const [target, setTarget] = useState<InventorySoftDeleteTarget | null>(null);

  const deleteMut = useMutation({
    mutationFn: (t: InventorySoftDeleteTarget) => opts.deleteFn(t.id),
    onSuccess: (_data, t) => {
      toast.success(`تم نقل «${t.label}» إلى سلة المهملات`);
      opts.invalidateKeys?.forEach(k => qc.invalidateQueries({ queryKey: k }));
      qc.invalidateQueries({ queryKey: ['trash-all'] });
      setTarget(null);
    },
    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'فشل النقل إلى سلة المهملات'),
  });

  return {
    canDelete,
    target,
    defaultNote: opts.note,
    requestDelete: (t: InventorySoftDeleteTarget) => {
      deleteMut.reset();
      setTarget({ ...t, note: t.note ?? opts.note });
    },
    closeDelete: () => {
      setTarget(null);
      deleteMut.reset();
    },
    confirmDelete: () => target && deleteMut.mutate(target),
    isDeleting: deleteMut.isPending,
    deleteError: deleteMut.isError ? (extractApiError(deleteMut.error) ?? 'فشل النقل إلى سلة المهملات') : null,
  };
}
