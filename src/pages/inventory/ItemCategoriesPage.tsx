import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, X, Save, FolderTree, ChevronDown, ChevronLeft, ChevronRight,
  Tags, ListCollapse, ListTree, EyeOff, Package,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { EmptyState } from '@/components/shared/EmptyState';
import {
  inventoryApi,
  type CategoryTreeItemDto,
  type ItemCategoryFlatDto,
  type UpsertCategoryPayload,
} from '@/lib/api/inventory';
import { extractApiError, cn } from '@/lib/utils';
import { useLocale } from '@/lib/i18n';
import { generateCategoryCode } from '@/lib/unitCode';
import { SoftDeleteConfirmDialog } from '@/components/shared/SoftDeleteConfirmDialog';
import { useInventorySoftDelete } from '@/components/inventory/useInventorySoftDelete';

const EMPTY: UpsertCategoryPayload = { code: '', nameAr: '', nameEn: '', parentId: null, isActive: true };

type CategoryTreeNode = ItemCategoryFlatDto & { children: CategoryTreeNode[] };

function buildCategoryTree(flat: ItemCategoryFlatDto[]): CategoryTreeNode[] {
  const map = new Map<number, CategoryTreeNode>();
  for (const r of flat) map.set(r.id, { ...r, children: [] });
  const roots: CategoryTreeNode[] = [];
  for (const r of flat) {
    const node = map.get(r.id)!;
    if (r.parentId != null && map.has(r.parentId)) map.get(r.parentId)!.children.push(node);
    else roots.push(node);
  }
  const sortNodes = (nodes: CategoryTreeNode[]) => {
    nodes.sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'));
    nodes.forEach(n => sortNodes(n.children));
  };
  sortNodes(roots);
  return roots;
}

function findCategoryById(tree: CategoryTreeNode[], id: number): CategoryTreeNode | null {
  for (const node of tree) {
    if (node.id === id) return node;
    if (node.children.length) {
      const found = findCategoryById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function categorySearchHaystack(code: string, nameAr: string, nameEn?: string | null): string {
  return `${code} ${nameAr} ${nameEn ?? ''}`.toLowerCase().replace(/\s+/g, ' ').trim();
}

function collectDescendantIds(id: number, flat: ItemCategoryFlatDto[]): Set<number> {
  const byParent = new Map<number, number[]>();
  for (const r of flat) {
    if (r.parentId != null) {
      const list = byParent.get(r.parentId) ?? [];
      list.push(r.id);
      byParent.set(r.parentId, list);
    }
  }
  const out = new Set<number>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    out.add(cur);
    for (const child of byParent.get(cur) ?? []) stack.push(child);
  }
  return out;
}

function ParentTreeOptions({
  nodes, depth, excludeIds, disabledIds,
}: {
  nodes: CategoryTreeNode[];
  depth: number;
  excludeIds: Set<number>;
  disabledIds: Set<number>;
}) {
  return (
    <>
      {nodes.map(node => {
        if (excludeIds.has(node.id)) return null;
        const disabled = disabledIds.has(node.id);
        const prefix = depth > 0 ? `${'— '.repeat(depth)}` : '';
        return (
          <span key={node.id}>
            <option value={node.id} disabled={disabled}>
              {prefix}{node.nameAr}{disabled ? ' (مستخدم في مواد)' : ''}
            </option>
            {node.children.length > 0 && (
              <ParentTreeOptions
                nodes={node.children}
                depth={depth + 1}
                excludeIds={excludeIds}
                disabledIds={disabledIds}
              />
            )}
          </span>
        );
      })}
    </>
  );
}

function itemSearchHaystack(code: string, nameAr: string): string {
  return `${code} ${nameAr}`.toLowerCase().replace(/\s+/g, ' ').trim();
}

function AddSubCategoryMenu({
  node,
  onAddChild,
  onAddItem,
  onClose,
}: {
  node: CategoryTreeNode;
  onAddChild: (parentId: number) => void;
  onAddItem: (categoryId: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const canAddCategory = !node.hasItems && !node.hasChildren;

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute end-0 top-[calc(100%+4px)] z-50 min-w-[10.5rem] overflow-hidden rounded-md border border-border bg-popover p-1 text-sm shadow-lg"
    >
      <button
        type="button"
        disabled={!canAddCategory}
        title={!canAddCategory ? 'لا يمكن إضافة صنف فرعي لصنف مرتبط بمواد' : undefined}
        className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-start hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
        onClick={() => { if (canAddCategory) { onAddChild(node.id); onClose(); } }}
      >
        <Tags className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        إضافة صنف
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-start hover:bg-accent"
        onClick={() => { onAddItem(node.id); onClose(); }}
      >
        <Package className="h-3.5 w-3.5 shrink-0 text-primary" />
        إضافة مادة
      </button>
    </div>
  );
}

function ItemTreeNode({
  item,
  depth,
  search,
  isSearchHit,
}: {
  item: CategoryTreeItemDto;
  depth: number;
  search: string;
  isSearchHit: boolean;
}) {
  const { isRtl } = useLocale();
  const inactive = !item.isActive;
  const q = search.trim().toLowerCase();
  const matches = !q || itemSearchHaystack(item.code, item.nameAr).includes(q);
  if (!matches) return null;

  return (
    <Link
      to={`/inventory/${item.id}`}
      className={cn(
        'group flex items-center gap-2 rounded-md py-1.5 pl-2 pr-3 text-sm hover:bg-accent/40',
        isRtl ? 'border-r-2 border-transparent' : 'border-l-2 border-transparent',
        inactive && 'opacity-60 saturate-50',
        isSearchHit && 'bg-primary/10 ring-1 ring-primary/40',
      )}
      style={isRtl
        ? { paddingRight: `${0.75 + depth * 1.25}rem` }
        : { paddingLeft: `${0.75 + depth * 1.25}rem` }}
    >
      <Package className="h-4 w-4 shrink-0 text-primary/70" />
      <span className={cn('num-display text-xs text-muted-foreground', inactive && 'line-through')}>
        {item.code}
      </span>
      <span className={cn('flex-1', inactive && 'line-through')}>{item.nameAr}</span>
      <span className="hidden rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary md:inline">
        مادة
      </span>
      <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

function CategoryNode({
  node,
  depth = 0,
  search,
  expanded,
  onToggle,
  onAddChild,
  onAddItem,
  onEdit,
  onDelete,
  hasDeletePermission,
  itemsByCategory,
  openMenuId,
  onOpenMenu,
  onCloseMenu,
  forceShowAll = false,
}: {
  node: CategoryTreeNode;
  depth?: number;
  search: string;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onAddChild: (parentId: number) => void;
  onAddItem: (categoryId: number) => void;
  onEdit: (row: ItemCategoryFlatDto) => void;
  onDelete: (id: number, label: string) => void;
  hasDeletePermission: boolean;
  itemsByCategory: Map<number, CategoryTreeItemDto[]>;
  openMenuId: number | null;
  onOpenMenu: (id: number) => void;
  onCloseMenu: () => void;
  forceShowAll?: boolean;
}) {
  const { isRtl } = useLocale();
  const open = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  const categoryItems = itemsByCategory.get(node.id) ?? [];
  const hasItemsInTree = categoryItems.length > 0;
  const inactive = !node.isActive;
  const isLeafSubCategory = depth > 0 && !hasChildren;

  const q = search.trim().toLowerCase();
  const matchesSelf = !q || categorySearchHaystack(node.code, node.nameAr, node.nameEn).includes(q);

  const itemMatches = (items: CategoryTreeItemDto[]): boolean => {
    if (!q) return false;
    return items.some(i => itemSearchHaystack(i.code, i.nameAr).includes(q));
  };

  const childMatches = (n: CategoryTreeNode): boolean => {
    if (!q) return true;
    if (categorySearchHaystack(n.code, n.nameAr, n.nameEn).includes(q)) return true;
    if (itemMatches(itemsByCategory.get(n.id) ?? [])) return true;
    return n.children.some(childMatches);
  };

  const visible = forceShowAll || matchesSelf || childMatches(node) || itemMatches(categoryItems);
  if (!visible) return null;

  const childForceShowAll = forceShowAll || (!!q && matchesSelf);
  const expandedForSearch = !!q && !forceShowAll && (childMatches(node) || itemMatches(categoryItems));
  const showChildren = open || expandedForSearch || forceShowAll;
  const isSearchHit = !!q && categorySearchHaystack(node.code, node.nameAr, node.nameEn).includes(q);

  const canDelete = hasDeletePermission && !node.hasChildren && !node.hasItems;
  const showExpandControl = hasChildren || hasItemsInTree;
  const showAddMenu = isLeafSubCategory;
  const showDirectAddChild = !isLeafSubCategory && !node.hasItems;

  return (
    <div>
      <div
        className={cn(
          'group relative flex items-center gap-2 rounded-md py-2 pl-2 pr-3 text-sm hover:bg-accent/40',
          isRtl ? 'border-r-2 border-transparent' : 'border-l-2 border-transparent',
          depth === 0 && (isRtl
            ? 'border-r-primary/40 bg-secondary/30 font-semibold'
            : 'border-l-primary/40 bg-secondary/30 font-semibold'),
          inactive && 'opacity-60 saturate-50',
          isSearchHit && 'bg-primary/10 ring-1 ring-primary/40',
        )}
        style={isRtl
          ? { paddingRight: `${0.75 + depth * 1.25}rem` }
          : { paddingLeft: `${0.75 + depth * 1.25}rem` }}
      >
        {showExpandControl ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            className="text-muted-foreground hover:text-foreground"
          >
            {open
              ? <ChevronDown className="h-4 w-4" />
              : isRtl
                ? <ChevronLeft className="h-4 w-4" />
                : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <Tags className="h-4 w-4 text-emerald-500" />
        )}

        <span className={cn('num-display text-xs text-muted-foreground', inactive && 'line-through')}>
          {node.code}
        </span>
        <span className={cn('flex-1', hasChildren && 'font-medium', inactive && 'line-through')}>
          {node.nameAr}
        </span>

        {inactive && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500"
            title="صنف موقوف"
          >
            <EyeOff className="h-3 w-3" />
            موقوف
          </span>
        )}

        {node.hasItems && (
          <span className="inline-flex shrink-0 items-center rounded-full border border-orange-500/40 bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-400">
            مستخدم في مواد
          </span>
        )}

        <span className="hidden text-[10px] text-muted-foreground md:inline">
          L{node.level}
        </span>

        {depth === 0 && (
          <span className="hidden rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary md:inline">
            {hasChildren ? 'صنف رئيسي' : 'صنف'}
          </span>
        )}

        {!hasChildren && depth > 0 && (
          <span className="hidden rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500 md:inline">
            فرعي
          </span>
        )}

        <div className="relative flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {(showAddMenu || showDirectAddChild) && (
            <>
              <button
                type="button"
                onClick={() => showAddMenu ? onOpenMenu(node.id) : onAddChild(node.id)}
                className="rounded p-1 hover:bg-primary/20 hover:text-primary"
                title={showAddMenu ? 'إضافة صنف أو مادة' : 'إضافة صنف فرعي'}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              {showAddMenu && openMenuId === node.id && (
                <AddSubCategoryMenu
                  node={node}
                  onAddChild={onAddChild}
                  onAddItem={onAddItem}
                  onClose={onCloseMenu}
                />
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => onEdit(node)}
            className="rounded p-1 hover:bg-blue-500/20 hover:text-blue-400"
            title="تعديل"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={() => onDelete(node.id, node.nameAr)}
              className="rounded p-1 hover:bg-destructive/20 hover:text-destructive"
              title="حذف"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {(hasChildren || hasItemsInTree) && showChildren && (
        <div>
          {node.children.map(child => (
            <CategoryNode
              key={child.id}
              node={child}
              depth={depth + 1}
              search={search}
              expanded={expanded}
              onToggle={onToggle}
              onAddChild={onAddChild}
              onAddItem={onAddItem}
              onEdit={onEdit}
              onDelete={onDelete}
              hasDeletePermission={hasDeletePermission}
              itemsByCategory={itemsByCategory}
              openMenuId={openMenuId}
              onOpenMenu={onOpenMenu}
              onCloseMenu={onCloseMenu}
              forceShowAll={childForceShowAll}
            />
          ))}
          {categoryItems.map(item => (
            <ItemTreeNode
              key={`item-${item.id}`}
              item={item}
              depth={depth + 1}
              search={search}
              isSearchHit={!!q && itemSearchHaystack(item.code, item.nameAr).includes(q)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ItemCategoriesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ItemCategoryFlatDto | null>(null);
  const [form, setForm] = useState<UpsertCategoryPayload>(EMPTY);

  const autoCode = useMemo(
    () => generateCategoryCode(form.nameEn ?? '', form.nameAr),
    [form.nameEn, form.nameAr],
  );

  const { data: treeData, isLoading, isError } = useQuery({
    queryKey: ['item-categories-manage'],
    queryFn: () => inventoryApi.listCategoriesManage(),
  });

  const rows = treeData?.categories ?? [];
  const treeItems = treeData?.items ?? [];

  const itemsByCategory = useMemo(() => {
    const map = new Map<number, CategoryTreeItemDto[]>();
    for (const item of treeItems) {
      const list = map.get(item.categoryId) ?? [];
      list.push(item);
      map.set(item.categoryId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'));
    }
    return map;
  }, [treeItems]);

  const tree = useMemo(() => buildCategoryTree(rows), [rows]);

  const excludeParentIds = useMemo(() => {
    if (!editing) return new Set<number>();
    return collectDescendantIds(editing.id, rows);
  }, [editing, rows]);

  const disabledParentIds = useMemo(
    () => new Set(rows.filter(r => r.hasItems).map(r => r.id)),
    [rows],
  );

  const stats = useMemo(() => {
    let total = 0;
    let inactive = 0;
    let withItems = 0;
    for (const r of rows) {
      total++;
      if (!r.isActive) inactive++;
      if (r.hasItems) withItems++;
    }
    return { total, roots: tree.length, inactive, withItems, itemCount: treeItems.length };
  }, [rows, tree.length, treeItems.length]);

  const toggle = useCallback((id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  const expandAll = useCallback(() => {
    const all = new Set<number>();
    const walk = (n: CategoryTreeNode) => {
      if (n.children.length > 0 || (itemsByCategory.get(n.id)?.length ?? 0) > 0) all.add(n.id);
      n.children.forEach(walk);
    };
    tree.forEach(walk);
    setExpanded(all);
  }, [tree, itemsByCategory]);

  const saveMut = useMutation({
    mutationFn: () => {
      const payload: UpsertCategoryPayload = {
        ...form,
        code: editing ? form.code : '',
      };
      return editing
        ? inventoryApi.updateCategoryManage(editing.id, payload)
        : inventoryApi.createCategoryManage(payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'تم تحديث الصنف' : 'تم إضافة الصنف');
      qc.invalidateQueries({ queryKey: ['item-categories-manage'] });
      qc.invalidateQueries({ queryKey: ['item-categories'] });
      closeDialog();
    },
    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'فشل الحفظ'),
  });

  const {
    canDelete: hasDeletePermission,
    target: deleteTarget,
    requestDelete,
    closeDelete,
    confirmDelete,
    isDeleting,
    deleteError,
  } = useInventorySoftDelete({
    deleteFn: id => inventoryApi.deleteCategoryManage(id),
    invalidateKeys: [['item-categories-manage'], ['item-categories']],
    note: 'لا يمكن حذف صنف له أصناف فرعية أو مواد مرتبطة.',
  });

  function openAddItem(categoryId: number) {
    navigate(`/inventory/new?categoryId=${categoryId}`);
  }

  function closeMenu() {
    setOpenMenuId(null);
  }

  function openCreate(parentId: number | null = null) {
    setEditing(null);
    setForm({ ...EMPTY, parentId });
    setOpen(true);
    if (parentId != null) {
      setExpanded(prev => {
        if (prev.has(parentId)) return prev;
        const next = new Set(prev);
        next.add(parentId);
        return next;
      });
    }
  }

  function openEdit(row: ItemCategoryFlatDto) {
    setEditing(row);
    setForm({
      code: row.code,
      nameAr: row.nameAr,
      nameEn: row.nameEn ?? '',
      parentId: row.parentId,
      isActive: row.isActive,
    });
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    setEditing(null);
    setForm(EMPTY);
  }

  function updateName(field: 'nameAr' | 'nameEn', value: string) {
    setForm(f => {
      const next = { ...f, [field]: value };
      if (!editing) next.code = generateCategoryCode(next.nameEn ?? '', next.nameAr);
      return next;
    });
  }

  if (isLoading) return <LoadingSpinner text="جاري تحميل أصناف المواد..." />;
  if (isError) {
    return (
      <EmptyState
        icon={FolderTree}
        title="تعذّر تحميل الأصناف"
        description="تحقق من الاتصال وحاول مرة أخرى"
      />
    );
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <FolderTree className="h-5 w-5 text-primary" />
                أصناف المواد
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {stats.total} صنف · {stats.roots} مجموعة رئيسية
                {stats.itemCount > 0 && ` · ${stats.itemCount} مادة`}
                {stats.withItems > 0 && ` · ${stats.withItems} صنف مرتبط بمواد`}
                {stats.inactive > 0 && (
                  <>
                    {' · '}
                    <span className="text-amber-500">{stats.inactive} موقوف</span>
                  </>
                )}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                الأصناف الرئيسية للتجميع فقط. المواد تُربط بالأصناف الفرعية (الأبناء).
              </p>
            </div>
            <Button onClick={() => openCreate()} size="sm" className="shrink-0">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">إضافة صنف رئيسي</span>
              <span className="sm:hidden">صنف جديد</span>
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Input
                placeholder="ابحث بالرمز أو الاسم..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={collapseAll}
              title="طي الكل"
              className="shrink-0"
            >
              <ListCollapse className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={expandAll}
              title="توسيع الكل"
              className="shrink-0"
            >
              <ListTree className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {tree.length === 0 ? (
            <EmptyState
              icon={FolderTree}
              title="لا توجد أصناف"
              description="أضف أول صنف رئيسي للبدء"
              action={
                <Button onClick={() => openCreate()} size="sm">
                  <Plus className="h-4 w-4" />
                  إضافة صنف رئيسي
                </Button>
              }
            />
          ) : (
            <div className="space-y-1">
              {tree.map(node => (
                <CategoryNode
                  key={node.id}
                  node={node}
                  depth={0}
                  search={search}
                  expanded={expanded}
                  onToggle={toggle}
                  onAddChild={parentId => openCreate(parentId)}
                  onAddItem={openAddItem}
                  onEdit={openEdit}
                  onDelete={(id, label) => requestDelete({ id, label })}
                  hasDeletePermission={hasDeletePermission}
                  itemsByCategory={itemsByCategory}
                  openMenuId={openMenuId}
                  onOpenMenu={setOpenMenuId}
                  onCloseMenu={closeMenu}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={closeDialog} />
          <Card className="relative w-full max-w-md">
            <CardHeader className="flex flex-row items-center justify-between border-b">
              <CardTitle className="text-base">{editing ? 'تعديل الصنف' : 'صنف جديد'}</CardTitle>
              <Button variant="ghost" size="icon" onClick={closeDialog}><X className="h-4 w-4" /></Button>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {form.parentId != null && !editing && (() => {
                const parent = findCategoryById(tree, form.parentId);
                if (!parent) return null;
                return (
                  <div className="rounded-md border border-border bg-secondary/30 p-2.5 text-[11px]">
                    <span className="text-muted-foreground">تحت الصنف: </span>
                    <span className="font-medium">{parent.nameAr}</span>
                  </div>
                );
              })()}
              <div className="space-y-1">
                <Label>الاسم (عربي) *</Label>
                <Input value={form.nameAr} onChange={e => updateName('nameAr', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>الاسم (إنجليزي)</Label>
                <Input dir="ltr" placeholder="Electronics, Food, Clothing..."
                  value={form.nameEn ?? ''} onChange={e => updateName('nameEn', e.target.value)} />
                <p className="text-[10px] text-muted-foreground">يُفضّل الإنجليزي لتوليد رمز واضح</p>
              </div>
              <div className="space-y-1">
                <Label>رمز الصنف</Label>
                <Input
                  dir="ltr"
                  readOnly
                  className="font-mono uppercase bg-muted"
                  value={editing ? form.code : (autoCode || '—')}
                  placeholder="يُولَّد تلقائياً"
                />
                <p className="text-[10px] text-muted-foreground">
                  {editing ? 'الرمز ثابت بعد الإنشاء' : 'يُولَّد تلقائياً من الاسم عند الحفظ'}
                </p>
              </div>
              {!form.parentId && (
                <div className="space-y-1">
                  <Label>الصنف الأب</Label>
                  <select className="flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
                    value={form.parentId ?? ''}
                    onChange={e => setForm(f => ({ ...f, parentId: e.target.value ? Number(e.target.value) : null }))}>
                    <option value="">— صنف رئيسي (بدون أب) —</option>
                    <ParentTreeOptions
                      nodes={tree}
                      depth={0}
                      excludeIds={excludeParentIds}
                      disabledIds={disabledParentIds}
                    />
                  </select>
                </div>
              )}
              {editing && (
                <div className="space-y-1">
                  <Label>الصنف الأب</Label>
                  <select className="flex h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
                    value={form.parentId ?? ''}
                    onChange={e => setForm(f => ({ ...f, parentId: e.target.value ? Number(e.target.value) : null }))}>
                    <option value="">— صنف رئيسي (بدون أب) —</option>
                    <ParentTreeOptions
                      nodes={tree}
                      depth={0}
                      excludeIds={excludeParentIds}
                      disabledIds={disabledParentIds}
                    />
                  </select>
                  {form.parentId != null && disabledParentIds.has(form.parentId) && (
                    <p className="text-xs text-destructive">هذا الصنف مستخدم في مواد ولا يمكن إضافة أبناء له</p>
                  )}
                </div>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
                نشط
              </label>
              <Button className="w-full" disabled={saveMut.isPending || (form.parentId != null && disabledParentIds.has(form.parentId))} onClick={() => {
                if (!form.nameAr.trim()) { toast.error('الاسم مطلوب'); return; }
                saveMut.mutate();
              }}>
                <Save className="h-4 w-4" />حفظ
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <SoftDeleteConfirmDialog
        open={!!deleteTarget}
        label={deleteTarget?.label ?? ''}
        note={deleteTarget?.note}
        loading={isDeleting}
        error={deleteError}
        onConfirm={confirmDelete}
        onClose={closeDelete}
      />
    </div>
  );
}
