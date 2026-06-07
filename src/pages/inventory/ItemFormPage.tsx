import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowRight, Save, Package, Layers, ImageIcon, Warehouse, Coins,
  Plus, Youtube, Globe, Hash, Upload, X, ExternalLink, Trash2,
  ChevronLeft, ChevronRight, ZoomIn, SlidersHorizontal, Palette, Ruler, Building2, List,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { cn, extractApiError } from '@/lib/utils';
import {
  inventoryApi,
  type ItemCategoryDto,
  type ItemDetailDto,
  type ItemUnitPayload,
  type UpsertItemPayload,
} from '@/lib/api/inventory';
import { ItemImageThumb } from '@/components/inventory/ItemImageThumb';
import { ItemImageViewerDialog } from '@/components/inventory/ItemImageViewerDialog';
import { ItemCategoryTreeSelect, findCategoryLabel } from '@/components/inventory/ItemCategoryTreeSelect';
import { SearchableCountrySelect } from '@/components/inventory/SearchableCountrySelect';
import { ItemUnitsSection, unitLabel } from '@/components/inventory/ItemUnitsSection';
import { ItemPricesSection } from '@/components/inventory/ItemPricesSection';
import { SoftDeleteConfirmDialog } from '@/components/shared/SoftDeleteConfirmDialog';
import { usePermissions } from '@/lib/auth/usePermissions';
import { PERMS } from '@/lib/auth/permissions';
import { ColorSwatch } from '@/components/inventory/ColorSwatch';
import { StandardColorPickerDialog } from '@/components/inventory/StandardColorPickerDialog';
import { getAvailableStandardColors, matchColorToStandard, type StandardColor } from '@/lib/inventory/standardColors';

import { youTubeEmbedUrl, normalizeYouTubeUrl } from '@/lib/youtube';

const COMPACT_HEADER = 'flex flex-col space-y-0 py-2 px-3 pb-1';
const COMPACT_CONTENT = 'px-3 pb-3 pt-0';

type Tab = 'basic' | 'specs' | 'colors' | 'units' | 'prices' | 'media' | 'stock';

const TAB_KEYS: Tab[] = ['basic', 'specs', 'colors', 'units', 'prices', 'media', 'stock'];

function parseTab(raw: string | null): Tab {
  return TAB_KEYS.includes(raw as Tab) ? (raw as Tab) : 'basic';
}

function flattenLeafChildCategories(cats: ItemCategoryDto[], prefix = ''): { id: number; label: string }[] {
  const out: { id: number; label: string }[] = [];
  for (const c of cats) {
    const label = prefix ? `${prefix} › ${c.nameAr}` : c.nameAr;
    const hasChildren = (c.children?.length ?? 0) > 0;
    if (!hasChildren && c.parentId != null) out.push({ id: c.id, label });
    if (hasChildren) out.push(...flattenLeafChildCategories(c.children, label));
  }
  return out;
}

function resolveDefaultUnitId(units: { id: number; isDefault?: boolean }[]): number {
  return units.find(u => u.isDefault)?.id ?? units[0].id;
}

function buildDefaultUnits(baseUnitId: number): ItemUnitPayload[] {
  return [{
    unitOfMeasureId: baseUnitId,
    sortOrder: 0,
    conversionFactor: 1,
    unitBarcode: '',
    isBase: true,
    prices: [],
  }];
}

function detailToForm(d: ItemDetailDto): UpsertItemPayload {
  return {
    id: d.id,
    code: d.code,
    barcode: d.barcode,
    nameAr: d.nameAr,
    nameEn: d.nameEn,
    description: d.description,
    categoryId: d.categoryId,
    originCountryId: d.originCountryId,
    productCode: d.productCode,
    model: d.model,
    colorIds: d.colorIds ?? d.colors?.map(c => c.id) ?? [],
    size: d.size,
    cpmVolume: d.cpmVolume,
    cpmUnitOfMeasureId: d.cpmUnitOfMeasureId,
    manufacturer: d.manufacturer,
    youTubeUrl: normalizeYouTubeUrl(d.youTubeUrl),
    trackSerialNumbers: d.trackSerialNumbers,
    isActive: d.isActive,
    isAvailableForSale: d.isAvailableForSale,
    showInStore: d.showInStore ?? false,
    minimumStockLevel: d.minimumStockLevel,
    maximumStockLevel: d.maximumStockLevel,
    openingStock: 0,
    units: d.units.map(u => ({
      unitOfMeasureId: u.unitOfMeasureId,
      sortOrder: u.sortOrder,
      conversionFactor: u.conversionFactor,
      unitBarcode: u.unitBarcode,
      isBase: u.isBase,
      prices: u.prices.map(p => ({
        currency: p.currency,
        priceType: p.priceType,
        amount: p.amount,
      })),
    })),
    serialNumbers: d.serialNumbers.map(s => s.serialNumber),
  };
}

/** لقطة ثابتة لمقارنة التغييرات — تُفعِّل زر الحفظ فوراً عند أي تعديل في أي تبويب */
function serializeItemForm(f: UpsertItemPayload): string {
  const colorIds = [...(f.colorIds ?? [])].sort((a, b) => a - b);
  const serialNumbers = [...(f.serialNumbers ?? [])];
  const units = [...(f.units ?? [])]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(u => ({
      ...u,
      prices: [...(u.prices ?? [])].sort((a, b) =>
        `${a.currency}-${a.priceType}`.localeCompare(`${b.currency}-${b.priceType}`)),
    }));
  return JSON.stringify({
    ...f,
    id: undefined,
    code: (f.code ?? '').trim(),
    nameEn: f.nameEn ?? '',
    description: f.description ?? '',
    productCode: f.productCode ?? '',
    model: f.model ?? '',
    size: f.size ?? '',
    manufacturer: f.manufacturer ?? '',
    barcode: f.barcode ?? '',
    youTubeUrl: f.youTubeUrl ?? '',
    openingStock: 0,
    colorIds,
    serialNumbers,
    units,
  });
}

export function ItemFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>(() => parseTab(searchParams.get('tab')));
  const [form, setForm] = useState<UpsertItemPayload | null>(null);
  const [serialInput, setSerialInput] = useState('');
  const mainImgRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const [viewerImageId, setViewerImageId] = useState<number | null>(null);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [sessionHiddenColorKeys, setSessionHiddenColorKeys] = useState<Set<string>>(new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const formInitRef = useRef<string | null>(null);
  const baselineRef = useRef('');
  const { can } = usePermissions();
  const canDelete = can(PERMS.Inventory.Items.Delete);
  const canSave = isEdit ? can(PERMS.Inventory.Items.Update) : can(PERMS.Inventory.Items.Create);

  const switchTab = (next: Tab) => {
    setTab(next);
    setSearchParams(prev => {
      const p = new URLSearchParams(prev);
      p.set('tab', next);
      return p;
    }, { replace: true });
  };

  useEffect(() => {
    const urlTab = parseTab(searchParams.get('tab'));
    setTab(prev => (prev === urlTab ? prev : urlTab));
  }, [searchParams]);

  const { data: units = [], isLoading: unitsLoading } = useQuery({
    queryKey: ['item-units'],
    queryFn: () => inventoryApi.getUnits(),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['item-categories'],
    queryFn: () => inventoryApi.getCategories(),
  });

  const { data: countries = [] } = useQuery({
    queryKey: ['item-countries'],
    queryFn: () => inventoryApi.getCountries(),
  });

  const { data: colorsManage = [] } = useQuery({
    queryKey: ['item-colors-manage'],
    queryFn: () => inventoryApi.listColorsManage(),
  });

  const { data: generatedCode } = useQuery({
    queryKey: ['item-generate-code'],
    queryFn: () => inventoryApi.generateCode(),
    enabled: !isEdit,
  });

  const { data: item, isLoading: itemLoading } = useQuery({
    queryKey: ['item', id],
    queryFn: () => inventoryApi.get(Number(id)),
    enabled: isEdit,
  });

  const { data: images = [], refetch: refetchImages } = useQuery({
    queryKey: ['item-images', id],
    queryFn: () => inventoryApi.listImages(Number(id)),
    enabled: isEdit,
  });

  useEffect(() => {
    const key = isEdit ? `edit-${id}` : 'new';
    const presetCategoryId = !isEdit
      ? (() => {
          const raw = searchParams.get('categoryId');
          if (!raw) return null;
          const n = Number(raw);
          return Number.isFinite(n) && n > 0 ? n : null;
        })()
      : null;
    if (isEdit && item) {
      if (formInitRef.current !== key) {
        formInitRef.current = key;
        const next = detailToForm(item);
        baselineRef.current = serializeItemForm(next);
        setForm(next);
      }
    } else if (!isEdit && units.length && generatedCode && formInitRef.current !== key) {
      formInitRef.current = key;
      baselineRef.current = '';
      setForm({
        code: generatedCode,
        barcode: '', nameAr: '', nameEn: '', description: '',
        categoryId: presetCategoryId, originCountryId: null, productCode: '',
        model: '', colorIds: [], size: '', cpmVolume: null, cpmUnitOfMeasureId: null, manufacturer: '',
        youTubeUrl: '', trackSerialNumbers: false, isActive: true, isAvailableForSale: true, showInStore: false,
        minimumStockLevel: 0, maximumStockLevel: 0, openingStock: 0,
        units: buildDefaultUnits(resolveDefaultUnitId(units)),
        serialNumbers: [],
      });
    }
  }, [isEdit, item, id, units, generatedCode, searchParams]);

  const isDirty = useMemo(() => {
    if (!form) return false;
    if (!isEdit) return true;
    return serializeItemForm(form) !== baselineRef.current;
  }, [form, isEdit]);

  const categoryOptions = useMemo(() => {
    const opts = flattenLeafChildCategories(categories);
    if (form?.categoryId && !opts.some(o => o.id === form.categoryId)) {
      const legacy = findCategoryLabel(categories, form.categoryId);
      if (legacy) opts.unshift({ id: form.categoryId, label: `${legacy} (يُفضّل اختيار صنف فرعي)` });
    }
    return opts;
  }, [categories, form?.categoryId]);

  const selectableColors = useMemo(() => {
    const selected = new Set(form?.colorIds ?? []);
    return colorsManage.filter(c => c.isActive || selected.has(c.id));
  }, [colorsManage, form?.colorIds]);

  const colorById = useMemo(() => {
    const map = new Map<number, { id: number; nameAr: string; nameEn?: string | null; hexCode?: string | null; code?: string }>();
    for (const c of colorsManage) map.set(c.id, c);
    for (const c of item?.colors ?? []) {
      if (!map.has(c.id)) map.set(c.id, c);
    }
    return map;
  }, [colorsManage, item?.colors]);

  const selectedColors = useMemo(
    () => (form?.colorIds ?? [])
      .map(id => colorById.get(id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c)),
    [form?.colorIds, colorById],
  );

  const availableStandardColors = useMemo(
    () => getAvailableStandardColors([...colorsManage, ...selectedColors], sessionHiddenColorKeys),
    [colorsManage, selectedColors, sessionHiddenColorKeys],
  );

  const toggleColor = (colorId: number) => {
    setForm(f => {
      if (!f) return f;
      const set = new Set(f.colorIds ?? []);
      if (set.has(colorId)) set.delete(colorId);
      else set.add(colorId);
      return { ...f, colorIds: Array.from(set) };
    });
  };

  const pickStandardColorMut = useMutation({
    mutationFn: async (std: StandardColor) => {
      let existing = colorsManage.find(c => matchColorToStandard(c)?.key === std.key);
      if (!existing) {
        existing = await inventoryApi.createColorManage({
          code: '',
          nameAr: std.nameAr,
          nameEn: std.nameEn,
          hexCode: std.hex,
          isActive: true,
        });
      }
      return { existing, std };
    },
    onSuccess: ({ existing, std }) => {
      setForm(f => {
        if (!f) return f;
        const ids = new Set(f.colorIds ?? []);
        ids.add(existing.id);
        return { ...f, colorIds: Array.from(ids) };
      });
      setSessionHiddenColorKeys(prev => new Set(prev).add(std.key));
      setColorPickerOpen(false);
      qc.invalidateQueries({ queryKey: ['item-colors-manage'] });
      qc.invalidateQueries({ queryKey: ['item-colors'] });
    },
    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'فشل إضافة اللون'),
  });

  const saveMut = useMutation({
    mutationFn: (payload: UpsertItemPayload) => inventoryApi.upsert(payload),
    onSuccess: (saved) => {
      toast.success(isEdit ? 'تم تحديث المادة' : 'تم إنشاء المادة');
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['item-categories-manage'] });
      if (!isEdit) {
        navigate(`/inventory/${saved.id}`, { replace: true });
      } else {
        const next = detailToForm(saved);
        baselineRef.current = serializeItemForm(next);
        setForm(next);
        qc.invalidateQueries({ queryKey: ['item', id] });
      }
    },
    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'فشل حفظ المادة'),
  });

  const deleteMut = useMutation({
    mutationFn: () => inventoryApi.delete(Number(id)),
    onSuccess: () => {
      toast.success('تم نقل المادة إلى سلة المهملات');
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['trash-all'] });
      setDeleteOpen(false);
      navigate('/inventory', { replace: true });
    },
    onError: (e: unknown) => toast.error(extractApiError(e) ?? 'فشل النقل إلى سلة المهملات'),
  });

  const unitHeaders = useMemo(
    () => (form?.units ?? []).map(u => unitLabel(units, u.unitOfMeasureId)),
    [form?.units, units],
  );

  const uploadImage = async (file: File, isPrimary: boolean) => {
    const itemId = isEdit ? Number(id) : saveMut.data?.id;
    if (!itemId) {
      toast.error('احفظ المادة أولاً قبل رفع الصور');
      return;
    }
    try {
      await inventoryApi.uploadImage(itemId, file, { isPrimary });
      toast.success(isPrimary ? 'تم رفع الصورة الرئيسية' : 'تمت إضافة الصورة للألبوم');
      refetchImages();
    } catch {
      toast.error('فشل رفع الصورة');
    }
  };

  const uploadAlbumBatch = async (files: FileList | File[]) => {
    const itemId = isEdit ? Number(id) : saveMut.data?.id;
    if (!itemId) {
      toast.error('احفظ المادة أولاً قبل رفع الصور');
      return;
    }
    const list = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (list.length === 0) return;

    const remaining = 6 - albumImages.length;
    const batch = list.slice(0, remaining);
    if (batch.length < list.length) {
      toast.warning(`تم اختيار ${list.length} صورة — يُسمح بـ ${remaining} فقط`);
    }

    setUploadingImages(true);
    try {
      if (batch.length === 1) {
        await inventoryApi.uploadImage(itemId, batch[0], { isPrimary: false });
      } else {
        await inventoryApi.uploadImagesBatch(itemId, batch);
      }
      toast.success(`تم رفع ${batch.length} صورة`);
      refetchImages();
    } catch {
      toast.error('فشل رفع الصور');
    } finally {
      setUploadingImages(false);
    }
  };

  const moveAlbumImage = async (imageId: number, direction: -1 | 1) => {
    const itemId = Number(id);
    try {
      await inventoryApi.moveImage(itemId, imageId, direction);
      refetchImages();
    } catch {
      toast.error('تعذّر تحريك الصورة');
    }
  };

  const handleSave = () => {
    if (!form) return;
    if (!form.nameAr.trim()) {
      toast.error('اسم المادة مطلوب');
      return;
    }
    if (form.cpmVolume != null && form.cpmVolume > 0 && !form.cpmUnitOfMeasureId) {
      toast.error('يجب تحديد وحدة قياس للحجم CPM');
      switchTab('specs');
      return;
    }
    const payload = isEdit
      ? { ...form, code: form.code?.trim() || null, indexId: null }
      : { ...form, code: null, indexId: null };
    saveMut.mutate(payload);
  };

  if ((isEdit && itemLoading) || unitsLoading || (!isEdit && !generatedCode) || !form) {
    return <LoadingSpinner text="جارٍ التحميل..." />;
  }

  const primaryImage = images.find(i => i.isPrimary);
  const albumImages = images.filter(i => !i.isPrimary).sort((a, b) => a.displayOrder - b.displayOrder);
  const albumImageIds = albumImages.map(i => i.id);
  const youTubePreviewUrl = youTubeEmbedUrl(form?.youTubeUrl ?? '');
  const itemIdForMedia = isEdit ? Number(id) : 0;

  const tabs: { key: Tab; label: string; icon: typeof Package; badge?: number }[] = [
    { key: 'basic', label: 'بطاقة المادة', icon: Package },
    { key: 'specs', label: 'المواصفات', icon: SlidersHorizontal },
    { key: 'colors', label: 'الألوان', icon: Palette, badge: form.colorIds?.length || undefined },
    { key: 'units', label: 'الوحدات', icon: Layers },
    { key: 'prices', label: 'أسعار البيع', icon: Coins },
    { key: 'media', label: 'الصور والوسائط', icon: ImageIcon },
    { key: 'stock', label: 'المخزون والتسلسل', icon: Warehouse },
  ];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-1 pb-1">
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => navigate('/inventory')}>
          <ArrowRight className="h-4 w-4" />
          العودة للقائمة
        </Button>
        <h1 className="text-lg font-bold flex-1 leading-tight">
          {isEdit ? `تعديل: ${form.nameAr || item?.nameAr}` : 'إضافة مادة جديدة'}
        </h1>
        {isEdit && canDelete && (
          <Button
            variant="outline"
            className="text-destructive border-destructive/40 hover:bg-destructive/10"
            disabled={deleteMut.isPending}
            onClick={() => { deleteMut.reset(); setDeleteOpen(true); }}
          >
            <Trash2 className="h-4 w-4" />
            {deleteMut.isPending ? 'جارٍ النقل...' : 'حذف'}
          </Button>
        )}
        <Button
          onClick={handleSave}
          variant={isEdit && !isDirty ? 'secondary' : 'default'}
          disabled={saveMut.isPending || !canSave || (isEdit && !isDirty)}
          title={
            !canSave
              ? 'ليس لديك صلاحية الحفظ'
              : isEdit && !isDirty
                ? 'لا توجد تغييرات للحفظ'
                : undefined
          }
        >
          <Save className="h-4 w-4" />
          {saveMut.isPending ? 'جارٍ الحفظ...' : 'حفظ'}
        </Button>
      </div>

      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap gap-0 border-b bg-background/95 pb-0 pt-0 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        {tabs.map(t => (
          <button key={t.key} type="button" onClick={() => switchTab(t.key)}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-1 text-xs sm:text-sm transition-colors',
              tab === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
            )}>
            <t.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <Badge variant="outline" className="h-5 min-w-5 px-1 text-[10px]">{t.badge}</Badge>
            )}
          </button>
        ))}
      </div>

      {tab === 'basic' && (
        <Card className="shadow-sm">
          <CardHeader className={COMPACT_HEADER}>
            <CardTitle className="text-sm">بطاقة المادة</CardTitle>
          </CardHeader>
          <CardContent className={cn(COMPACT_CONTENT, 'grid grid-cols-1 sm:grid-cols-3 gap-x-3 gap-y-2')}>
            <div className="space-y-1">
              <Label className="flex items-center gap-1"><Hash className="h-3.5 w-3.5" />رمز المادة</Label>
              <Input
                dir="ltr"
                className={cn('font-mono h-9', !isEdit && 'bg-muted')}
                readOnly={!isEdit}
                value={form.code ?? ''}
                onChange={e => isEdit && setForm(f => f ? { ...f, code: e.target.value } : f)}
              />
              {!isEdit && <p className="text-[10px] text-muted-foreground">يُولَّد تلقائياً — يمكن تعديله بعد الحفظ</p>}
            </div>
            <Field icon={Hash} label="رمز المنتج (SKU)" value={form.productCode ?? ''}
              onChange={v => setForm(f => f ? { ...f, productCode: v } : f)} mono />

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label>صنف المادة</Label>
                <Link to="/inventory/categories" target="_blank" className="text-xs text-primary flex items-center gap-0.5 hover:underline">
                  إدارة<ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              <ItemCategoryTreeSelect
                categories={categories}
                value={form.categoryId}
                onChange={id => setForm(f => f ? { ...f, categoryId: id } : f)}
              />
              {categoryOptions.length === 0 && (
                <p className="text-[10px] text-muted-foreground">أضف أصنافاً فرعية من إدارة الأصناف</p>
              )}
              {form.categoryId != null && !categoryOptions.some(o => o.id === form.categoryId) && (
                <p className="text-[10px] text-amber-700">الصنف الحالي قديم — اختر صنفاً فرعياً نهائياً عند الحفظ</p>
              )}
            </div>

            <div className="sm:col-span-3 border-t pt-3 space-y-2.5">
              <div className="space-y-1">
                <Label>اسم المادة (عربي) *</Label>
                <Input className="h-9" value={form.nameAr} onChange={e => setForm(f => f ? { ...f, nameAr: e.target.value } : f)} />
              </div>
              <div className="space-y-1">
                <Label>اسم المادة (إنجليزي)</Label>
                <Input dir="ltr" className="h-9" value={form.nameEn ?? ''} onChange={e => setForm(f => f ? { ...f, nameEn: e.target.value } : f)} />
              </div>
            </div>

            <div className="sm:col-span-3 space-y-1">
              <Label>الوصف</Label>
              <textarea rows={2} className="w-full rounded-md border bg-background px-3 py-1.5 text-sm resize-y min-h-[52px]"
                value={form.description ?? ''} onChange={e => setForm(f => f ? { ...f, description: e.target.value } : f)} />
            </div>

            {selectedColors.length > 0 && (
              <div className="sm:col-span-3 border-t pt-3 space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <Palette className="h-3.5 w-3.5" />
                  الألوان
                </Label>
                <div className="flex flex-wrap gap-2">
                  {selectedColors.map(c => (
                    <span
                      key={c.id}
                      className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-xs"
                    >
                      <ColorSwatch hex={c.hexCode ?? matchColorToStandard(c)?.hex} size="sm" title={c.nameAr} />
                      <span>{c.nameAr}{c.nameEn ? ` · ${c.nameEn}` : ''}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="sm:col-span-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t pt-3">
              <Toggle label="نشطة" checked={form.isActive} onChange={v => setForm(f => f ? { ...f, isActive: v } : f)} />
              <Toggle label="متاحة للبيع" checked={form.isAvailableForSale} onChange={v => setForm(f => f ? { ...f, isAvailableForSale: v } : f)} />
              <Toggle label="إظهار في المتجر" checked={form.showInStore} onChange={v => setForm(f => f ? { ...f, showInStore: v } : f)} />
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'specs' && (
        <Card>
          <CardHeader className={COMPACT_HEADER}><CardTitle className="text-sm">المواصفات</CardTitle></CardHeader>
          <CardContent className={cn(COMPACT_CONTENT, 'grid gap-2 sm:grid-cols-2')}>
            <div className="space-y-1 sm:col-span-1">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" />بلد المنشأ</Label>
                <Link to="/settings/countries" target="_blank" className="text-xs text-primary flex items-center gap-0.5 hover:underline">
                  إدارة<ExternalLink className="h-3 w-3" />
                </Link>
              </div>
              <SearchableCountrySelect
                countries={countries}
                value={form.originCountryId}
                onChange={id => setForm(f => f ? { ...f, originCountryId: id } : f)}
              />
            </div>

            <div className="space-y-1 sm:col-span-1">
              <Label>الموديل</Label>
              <Input
                value={form.model ?? ''}
                onChange={e => setForm(f => f ? { ...f, model: e.target.value } : f)}
                placeholder="رقم أو اسم الموديل"
              />
            </div>

            <div className="space-y-1 sm:col-span-1">
              <Label>القياس</Label>
              <Input
                value={form.size ?? ''}
                onChange={e => setForm(f => f ? { ...f, size: e.target.value } : f)}
                placeholder="مثال: XL، 42، 10×20"
              />
            </div>

            <div className="space-y-1 sm:col-span-1">
              <Label className="flex items-center gap-1"><Ruler className="h-3.5 w-3.5" />الحجم CPM</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={0}
                  step="any"
                  dir="ltr"
                  className="flex-1"
                  value={form.cpmVolume ?? ''}
                  onChange={e => {
                    const raw = e.target.value;
                    const num = raw === '' ? null : Number(raw);
                    setForm(f => f ? {
                      ...f,
                      cpmVolume: num != null && Number.isFinite(num) ? num : null,
                      cpmUnitOfMeasureId: num != null && num > 0 ? f.cpmUnitOfMeasureId : null,
                    } : f);
                  }}
                  placeholder="0"
                />
                <select
                  className="w-36 rounded-md border bg-background px-2 py-2 text-sm shrink-0"
                  value={form.cpmUnitOfMeasureId ?? ''}
                  disabled={!form.cpmVolume || form.cpmVolume <= 0}
                  onChange={e => {
                    const v = e.target.value;
                    setForm(f => f ? { ...f, cpmUnitOfMeasureId: v ? Number(v) : null } : f);
                  }}
                >
                  <option value="">الوحدة</option>
                  {units.map(u => (
                    <option key={u.id} value={u.id}>{u.nameAr}</option>
                  ))}
                </select>
              </div>
              <p className="text-[10px] text-muted-foreground">اختر وحدة القياس المرتبطة بالحجم CPM</p>
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />الشركة الصانعة</Label>
              <Input
                value={form.manufacturer ?? ''}
                onChange={e => setForm(f => f ? { ...f, manufacturer: e.target.value } : f)}
                placeholder="اسم الشركة المصنّعة"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'colors' && (
        <Card>
          <CardHeader className={cn(COMPACT_HEADER, 'flex-row items-center justify-between')}>
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Palette className="h-3.5 w-3.5 text-primary" />
              الألوان
            </CardTitle>
            <Link to="/inventory/colors" target="_blank" className="text-xs text-primary flex items-center gap-0.5 hover:underline">
              إدارة<ExternalLink className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className={cn(COMPACT_CONTENT, 'space-y-3')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">اختر لوناً واحداً أو أكثر للمادة</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setColorPickerOpen(true)}
                disabled={availableStandardColors.length === 0 || pickStandardColorMut.isPending}
              >
                <List className="h-3.5 w-3.5" />
                اختر من قائمة الألوان
              </Button>
            </div>
            {selectableColors.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center border rounded-lg border-dashed">
                لا توجد ألوان — استخدم قائمة الألوان أو أضف ألواناً من صفحة الإدارة
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {selectableColors.map(c => {
                  const selected = (form.colorIds ?? []).includes(c.id);
                  const hex = c.hexCode ?? matchColorToStandard(c)?.hex;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleColor(c.id)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                        selected
                          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                          : 'border-border bg-background hover:bg-muted',
                        !c.isActive && 'opacity-70',
                      )}
                    >
                      <ColorSwatch hex={hex} size="sm" />
                      {c.nameAr}{c.nameEn ? ` · ${c.nameEn}` : ''}
                      {!c.isActive && ' (موقوف)'}
                    </button>
                  );
                })}
              </div>
            )}
            {(form.colorIds?.length ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground">
                تم اختيار {form.colorIds!.length} {form.colorIds!.length === 1 ? 'لون' : 'ألوان'}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'units' && (
        <Card>
          <CardHeader className={COMPACT_HEADER}><CardTitle className="text-sm">وحدات مرتبطة</CardTitle></CardHeader>
          <CardContent className={COMPACT_CONTENT}>
            <ItemUnitsSection
              formUnits={form.units}
              measureUnits={units}
              onChange={next => setForm(f => f ? { ...f, units: next } : f)}
            />
          </CardContent>
        </Card>
      )}

      {tab === 'prices' && (
        <Card>
          <CardContent className="p-3">
            <ItemPricesSection
              formUnits={form.units}
              unitHeaders={unitHeaders}
              onChange={next => setForm(f => f ? { ...f, units: next } : f)}
            />
          </CardContent>
        </Card>
      )}

      {tab === 'media' && (
        <div className="space-y-4">
          {!isEdit && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              احفظ المادة أولاً ثم عد لرفع الصور.
            </div>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">الصورة الرئيسية</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap items-start gap-4">
              {primaryImage && itemIdForMedia > 0 && (
                <div className="relative group">
                  <ItemImageThumb
                    itemId={itemIdForMedia}
                    imageId={primaryImage.id}
                    className="h-32 w-32 rounded-lg border"
                    onClick={() => setViewerImageId(primaryImage.id)}
                  />
                  <button type="button"
                    className="absolute bottom-1 left-1 hidden group-hover:flex items-center gap-0.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white"
                    onClick={() => setViewerImageId(primaryImage.id)}>
                    <ZoomIn className="h-3 w-3" /> تكبير
                  </button>
                </div>
              )}
              <div>
                <input ref={mainImgRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f, true); e.target.value = ''; }} />
                <Button type="button" variant="outline" onClick={() => mainImgRef.current?.click()}>
                  <Upload className="h-4 w-4" /> رفع صورة رئيسية
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">ألبوم الصور (6 كحد أقصى)</CardTitle>
              <div className="flex items-center gap-2">
                {albumImages.length > 0 && (
                  <Button type="button" variant="outline" size="sm"
                    onClick={() => setViewerImageId(albumImages[0].id)}>
                    <ZoomIn className="h-4 w-4" /> تصفح الألبوم
                  </Button>
                )}
                <Badge variant="outline">{albumImages.length}/6</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3 mb-4">
                {albumImages.map((img, idx) => (
                  <div key={img.id} className="relative group flex flex-col items-center gap-1">
                    <ItemImageThumb
                      itemId={itemIdForMedia}
                      imageId={img.id}
                      className="h-20 w-20 rounded-lg border"
                      onClick={() => setViewerImageId(img.id)}
                    />
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6"
                        disabled={idx === 0} title="تقديم"
                        onClick={() => moveAlbumImage(img.id, -1)}>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6"
                        disabled={idx === albumImages.length - 1} title="تأخير"
                        onClick={() => moveAlbumImage(img.id, 1)}>
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-6 w-6"
                        title="تكبير" onClick={() => setViewerImageId(img.id)}>
                        <ZoomIn className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <button type="button"
                      className="absolute -top-1 -left-1 hidden group-hover:flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white"
                      onClick={async () => {
                        await inventoryApi.deleteImage(itemIdForMedia, img.id);
                        refetchImages();
                      }}>
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
              {albumImages.length < 6 && (
                <>
                  <input ref={albumRef} type="file" accept="image/*" multiple className="hidden"
                    onChange={e => {
                      if (e.target.files?.length) uploadAlbumBatch(e.target.files);
                      e.target.value = '';
                    }} />
                  <Button type="button" variant="outline" size="sm" disabled={uploadingImages}
                    onClick={() => albumRef.current?.click()}>
                    <Plus className="h-4 w-4" />
                    {uploadingImages ? 'جاري الرفع...' : 'إضافة صور للألبوم (متعدد)'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {viewerImageId != null && itemIdForMedia > 0 && (
            <ItemImageViewerDialog
              open
              itemId={itemIdForMedia}
              imageId={viewerImageId}
              imageIds={albumImageIds.includes(viewerImageId) ? albumImageIds : undefined}
              onImageIdChange={id => setViewerImageId(id)}
              title={form.nameAr}
              onClose={() => setViewerImageId(null)}
            />
          )}

          <Card>
            <CardHeader className="py-3 pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Youtube className="h-4 w-4 text-red-600" />
                رابط يوتيوب
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 pb-4">
              <div className="flex flex-wrap gap-2">
                <Input dir="ltr" placeholder="https://youtube.com/watch?v=..."
                  className="h-9 flex-1 min-w-[200px] font-mono text-sm"
                  value={form.youTubeUrl ?? ''}
                  onChange={e => setForm(f => f ? { ...f, youTubeUrl: e.target.value } : f)}
                  onPaste={e => {
                    e.preventDefault();
                    const text = normalizeYouTubeUrl(e.clipboardData.getData('text'));
                    if (text) setForm(f => f ? { ...f, youTubeUrl: text } : f);
                  }} />
                {form.youTubeUrl?.trim() && (
                  <Button type="button" variant="outline" size="sm" className="text-destructive border-destructive/40"
                    onClick={() => setForm(f => f ? { ...f, youTubeUrl: '' } : f)}>
                    <Trash2 className="h-4 w-4" /> حذف
                  </Button>
                )}
              </div>
              {form.youTubeUrl?.trim() && !youTubePreviewUrl && (
                <p className="text-xs text-muted-foreground">رابط يوتيوب غير صالح — استخدم صيغة watch أو youtu.be</p>
              )}
              {youTubePreviewUrl && (
                <div className="rounded-lg overflow-hidden border bg-black aspect-video max-w-2xl max-h-64">
                  <iframe
                    src={youTubePreviewUrl}
                    title="معاينة فيديو يوتيوب"
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'stock' && (
        <Card>
          <CardHeader><CardTitle className="text-base">المخزون والأرقام التسلسلية</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>الحد الأدنى للمخزون</Label>
                <Input type="number" min={0} dir="ltr" value={form.minimumStockLevel}
                  onChange={e => setForm(f => f ? { ...f, minimumStockLevel: parseFloat(e.target.value) || 0 } : f)} />
              </div>
              <div className="space-y-1">
                <Label>الحد الأقصى للمخزون</Label>
                <Input type="number" min={0} dir="ltr" value={form.maximumStockLevel}
                  onChange={e => setForm(f => f ? { ...f, maximumStockLevel: parseFloat(e.target.value) || 0 } : f)} />
              </div>
              {!isEdit && (
                <div className="space-y-1">
                  <Label>رصيد افتتاحي</Label>
                  <Input type="number" min={0} dir="ltr" value={form.openingStock}
                    onChange={e => setForm(f => f ? { ...f, openingStock: parseFloat(e.target.value) || 0 } : f)} />
                </div>
              )}
              {isEdit && item && (
                <div className="space-y-1">
                  <Label>الرصيد الحالي</Label>
                  <Input readOnly dir="ltr" value={item.stockBaseQuantity} className="bg-muted" />
                </div>
              )}
            </div>

            <Toggle label="تتبع الأرقام التسلسلية" checked={form.trackSerialNumbers}
              onChange={v => setForm(f => f ? { ...f, trackSerialNumbers: v } : f)} />

            {form.trackSerialNumbers && (
              <div className="space-y-2">
                <Label>الأرقام التسلسلية</Label>
                <div className="flex gap-2">
                  <Input dir="ltr" placeholder="أدخل الرقم التسلسلي" value={serialInput}
                    onChange={e => setSerialInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && serialInput.trim()) {
                        setForm(f => f ? { ...f, serialNumbers: [...(f.serialNumbers ?? []), serialInput.trim()] } : f);
                        setSerialInput('');
                      }
                    }} />
                  <Button type="button" variant="outline" onClick={() => {
                    if (!serialInput.trim()) return;
                    setForm(f => f ? { ...f, serialNumbers: [...(f.serialNumbers ?? []), serialInput.trim()] } : f);
                    setSerialInput('');
                  }}>إضافة</Button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(form.serialNumbers ?? []).map((sn, i) => (
                    <Badge key={i} variant="outline" className="font-mono gap-1">
                      {sn}
                      <button type="button" onClick={() => setForm(f => f ? {
                        ...f, serialNumbers: (f.serialNumbers ?? []).filter((_, j) => j !== i),
                      } : f)}><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <StandardColorPickerDialog
        open={colorPickerOpen}
        title="اختر لوناً للمادة"
        colors={availableStandardColors}
        onClose={() => setColorPickerOpen(false)}
        onSelect={std => pickStandardColorMut.mutate(std)}
      />

      <SoftDeleteConfirmDialog
        open={deleteOpen}
        title="نقل المادة إلى سلة المهملات"
        label={`${form?.nameAr || item?.nameAr || 'المادة'}${form?.code || item?.code ? ` (${form?.code || item?.code})` : ''}`}
        note="سيتم نقل المادة إلى سلة المهملات ويمكن استعادتها لاحقاً. لا يمكن الحذف إذا كان للمادة رصيد مخزون."
        loading={deleteMut.isPending}
        error={deleteMut.isError ? (extractApiError(deleteMut.error) ?? null) : null}
        onConfirm={() => deleteMut.mutate()}
        onClose={() => { setDeleteOpen(false); deleteMut.reset(); }}
      />
    </div>
  );
}

function Field({ icon: Icon, label, value, onChange, mono }: {
  icon: typeof Hash; label: string; value: string; onChange: (v: string) => void; mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="flex items-center gap-1"><Icon className="h-3.5 w-3.5" />{label}</Label>
      <Input dir={mono ? 'ltr' : undefined} className={mono ? 'font-mono' : undefined}
        value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-sm">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-primary" />
      {label}
    </label>
  );
}
