import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  X, CreditCard, FileText, Info, Upload, Download, Trash2, Snowflake, Sun,
  Loader2, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { storeWalletsApi, type WalletDocument } from '@/lib/api/storeWallets';
import { extractApiError } from '@/lib/utils';
import { formatMoney } from '@/pages/parent-store/WalletsPage';

interface Props {
  walletId: string;
  onClose: (changed: boolean) => void;
}

type Tab = 'details' | 'documents';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function WalletCardDialog({ walletId, onClose }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('details');
  const [changed, setChanged] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: card, isLoading } = useQuery({
    queryKey: ['wallet-card', walletId],
    queryFn: () => storeWalletsApi.card(walletId),
  });

  const statusMut = useMutation({
    mutationFn: (active: boolean) => storeWalletsApi.setStatus(walletId, active),
    onSuccess: (res) => {
      if (res.success === false) { toast.error(res.message ?? t('common.error')); return; }
      toast.success(res.message ?? t('wallets.opDone'));
      setChanged(true);
      qc.invalidateQueries({ queryKey: ['wallet-card', walletId] });
    },
    onError: (e) => toast.error(extractApiError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: () => storeWalletsApi.remove(walletId),
    onSuccess: (res) => {
      if (res.success === false) { toast.error(res.message ?? t('common.error')); return; }
      toast.success(res.message ?? t('wallets.card.deleted'));
      onClose(true);
    },
    onError: (e) => toast.error(extractApiError(e)),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => onClose(changed)}>
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            <div>
              <div className="font-semibold">{t('wallets.card.title')}</div>
              {card && <div className="text-xs text-muted-foreground">{card.userName}</div>}
            </div>
          </div>
          <button type="button" onClick={() => onClose(changed)} className="rounded-md p-1 text-muted-foreground hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-3">
          <TabBtn active={tab === 'details'} onClick={() => setTab('details')} icon={<Info className="h-4 w-4" />}>
            {t('wallets.card.details')}
          </TabBtn>
          <TabBtn active={tab === 'documents'} onClick={() => setTab('documents')} icon={<FileText className="h-4 w-4" />}>
            {t('wallets.card.documents')}
          </TabBtn>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading || !card ? (
            <div className="flex justify-center py-12"><LoadingSpinner className="h-8 w-8" /></div>
          ) : tab === 'details' ? (
            <DetailsTab card={card} />
          ) : (
            <DocumentsTab walletId={walletId} />
          )}
        </div>

        {/* Footer: freeze/unfreeze + delete */}
        {card && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-3">
            <Button
              variant={card.isActive ? 'outline' : 'default'}
              size="sm"
              disabled={statusMut.isPending}
              onClick={() => statusMut.mutate(!card.isActive)}
            >
              {card.isActive
                ? <><Snowflake className="h-4 w-4" />{t('wallets.card.freeze')}</>
                : <><Sun className="h-4 w-4" />{t('wallets.card.unfreeze')}</>}
            </Button>

            {!confirmDelete ? (
              <Button
                variant="destructive"
                size="sm"
                disabled={!card.canDelete}
                title={card.canDelete ? undefined : t('wallets.card.deleteBlocked')}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-4 w-4" />{t('wallets.card.delete')}
              </Button>
            ) : (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-2 py-1">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-xs text-destructive">{t('wallets.card.confirmDelete')}</span>
                <Button variant="destructive" size="sm" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate()}>
                  {deleteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.yes')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>{t('common.no')}</Button>
              </div>
            )}

            <div className="ms-auto">
              <Button variant="ghost" size="sm" onClick={() => onClose(changed)}>{t('common.close')}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors ${
        active ? 'border-primary font-semibold text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon}{children}
    </button>
  );
}

function DetailsTab({ card }: { card: NonNullable<Awaited<ReturnType<typeof storeWalletsApi.card>>> }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
        <div>
          <div className="text-xs text-muted-foreground">{t('wallets.currentBalance')}</div>
          <div className="text-lg font-bold tabular-nums" dir="ltr">{formatMoney(card.balance)} {card.currency}</div>
        </div>
        <Badge variant={card.isActive ? 'success' : 'destructive'}>
          {card.isActive ? t('wallets.active') : t('wallets.inactive')}
        </Badge>
      </div>

      <dl className="divide-y rounded-lg border text-sm">
        <Row label={t('wallets.col.owner')} value={card.userName} />
        <Row label={t('wallets.card.userCode')} value={card.userCode} mono />
        {card.phone && <Row label={t('wallets.card.phone')} value={card.phone} mono />}
        {card.email && <Row label={t('wallets.card.email')} value={card.email} />}
        <Row label={t('wallets.col.type')} value={card.walletTypeName} />
        <Row label={t('wallets.col.account')} value={card.accountCode} mono />
        <Row label={t('wallets.card.txCount')} value={String(card.transactionCount)} />
        <Row label={t('wallets.card.createdAt')} value={new Date(card.createdAt).toLocaleString()} />
      </dl>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? 'font-mono text-xs' : 'font-medium'} dir={mono ? 'ltr' : 'auto'}>{value}</span>
    </div>
  );
}

function DocumentsTab({ walletId }: { walletId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const { data: docs, isLoading } = useQuery({
    queryKey: ['wallet-docs', walletId],
    queryFn: () => storeWalletsApi.documents.list(walletId),
  });

  const uploadMut = useMutation({
    mutationFn: (file: File) => storeWalletsApi.documents.upload(walletId, file, { onProgress: setProgress }),
    onSuccess: () => {
      toast.success(t('wallets.card.uploaded'));
      qc.invalidateQueries({ queryKey: ['wallet-docs', walletId] });
    },
    onError: (e) => toast.error(extractApiError(e)),
    onSettled: () => setProgress(null),
  });

  const deleteMut = useMutation({
    mutationFn: (docId: string) => storeWalletsApi.documents.remove(walletId, docId),
    onSuccess: () => {
      toast.success(t('wallets.card.docDeleted'));
      setConfirmId(null);
      qc.invalidateQueries({ queryKey: ['wallet-docs', walletId] });
    },
    onError: (e) => toast.error(extractApiError(e)),
  });

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMut.mutate(file);
    e.target.value = '';
  };

  const download = async (doc: WalletDocument) => {
    try { await storeWalletsApi.documents.download(walletId, doc); }
    catch (err) { toast.error(extractApiError(err)); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{t('wallets.card.docsHint')}</p>
        <input ref={fileRef} type="file" className="hidden" onChange={onPick} />
        <Button size="sm" disabled={uploadMut.isPending} onClick={() => fileRef.current?.click()}>
          {uploadMut.isPending
            ? <><Loader2 className="h-4 w-4 animate-spin" />{progress !== null ? `${progress}%` : ''}</>
            : <><Upload className="h-4 w-4" />{t('wallets.card.upload')}</>}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><LoadingSpinner className="h-6 w-6" /></div>
      ) : !docs || docs.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          {t('wallets.card.noDocs')}
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-3 py-2">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium" dir="auto">{d.displayName}</div>
                <div className="text-[11px] text-muted-foreground">
                  {formatBytes(d.sizeBytes)} • {new Date(d.createdAt).toLocaleDateString()}
                  {d.uploadedBy ? ` • ${d.uploadedBy}` : ''}
                </div>
              </div>
              <button type="button" title={t('common.download')} onClick={() => download(d)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                <Download className="h-4 w-4" />
              </button>
              {confirmId === d.id ? (
                <div className="flex items-center gap-1">
                  <Button variant="destructive" size="sm" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate(d.id)}>
                    {deleteMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('common.yes')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setConfirmId(null)}>{t('common.no')}</Button>
                </div>
              ) : (
                <button type="button" title={t('common.delete')} onClick={() => setConfirmId(d.id)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
