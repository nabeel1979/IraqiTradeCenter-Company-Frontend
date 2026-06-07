import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { branchesApi } from '@/lib/api/branches';
import { usePermissions } from '@/lib/auth/usePermissions';
import { useAuthStore } from '@/lib/auth/auth-store';
import { PERMS } from '@/lib/auth/permissions';

export function useBranchContext() {
  const { can, isSuper } = usePermissions();
  const branchIds = useAuthStore(s => s.branchIds);
  const userDefaultBranchId = useAuthStore(s => s.defaultBranchId);

  const branchesQuery = useQuery({
    queryKey: ['branches', 'active'],
    queryFn: () => branchesApi.getAll(true),
    staleTime: 5 * 60_000,
  });

  const allBranches = branchesQuery.data?.data ?? [];
  const mainBranch = allBranches.find(b => b.isMain) ?? allBranches[0] ?? null;
  const viewAll = isSuper || can(PERMS.Branches.Branches.ViewAll);

  const allowedBranches = useMemo(() => {
    if (viewAll) return allBranches;
    if (branchIds.length > 0) return allBranches.filter(b => branchIds.includes(b.id));
    if (userDefaultBranchId) return allBranches.filter(b => b.id === userDefaultBranchId);
    if (mainBranch) return [mainBranch];
    return allBranches;
  }, [allBranches, branchIds, userDefaultBranchId, viewAll, mainBranch]);

  const defaultBranchId = userDefaultBranchId ?? mainBranch?.id ?? null;

  return {
    allBranches,
    branches: allowedBranches,
    hasBranches: allBranches.length > 0,
    mainBranchId: mainBranch?.id ?? null,
    defaultBranchId,
    requiresBranch: allBranches.length > 0,
    isLoading: branchesQuery.isLoading,
    viewAll,
  };
}

/** يُعيّن الفرع الرئيسي/الافتراضي عند فتح النموذج. */
export function useDefaultBranchId(
  value: number | null,
  onChange: (id: number) => void,
) {
  const { defaultBranchId, hasBranches } = useBranchContext();

  useEffect(() => {
    if (hasBranches && value == null && defaultBranchId != null) {
      onChange(defaultBranchId);
    }
  }, [hasBranches, defaultBranchId, value, onChange]);
}
