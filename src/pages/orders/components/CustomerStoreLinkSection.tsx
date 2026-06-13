import { useEffect, useState } from 'react';

import { useNavigate } from 'react-router-dom';

import { useTranslation } from 'react-i18next';

import { useMutation } from '@tanstack/react-query';

import { toast } from 'sonner';

import { UserCheck, Link2, UserPlus, Users, Building2, CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { Input } from '@/components/ui/input';

import { customersApi } from '@/lib/api/customers';

import { cn } from '@/lib/utils';

import type { IncomingOrderDto } from '@/types/api';

import { CustomerCategoryPickDialog } from '@/pages/orders/components/CustomerCategoryPickDialog';

import { LinkExistingPartyDialog } from '@/pages/orders/components/LinkExistingPartyDialog';

import { getFinancialManagementPath } from '@/pages/financial-management/routes';

import { writeFmFocus } from '@/pages/financial-management/fmFocus';



interface Props {

  order: IncomingOrderDto;

  onLinked: () => void;

}



function buildContactPrefill(order: IncomingOrderDto) {

  const addressParts = [

    order.storeUserCountry,

    order.storeUserCity,

    order.storeUserAddress,

    order.storeUserDetailedAddress,

  ].filter(Boolean);

  const phone = order.storeUserContactPhone || order.storeUserPhone || '';

  return {

    nameAr: order.storeUserFullName || order.customerName || '',

    phone,

    mobile: order.storeUserContactPhone && order.storeUserContactPhone !== order.storeUserPhone

      ? (order.storeUserPhone ?? '')

      : undefined,

    email: order.storeUserEmail || '',

    address: addressParts.join(' — '),

    contactPerson: order.storeUserFullName || order.customerName || '',

    showInStore: true,

    storeUserCode: order.customerStoreUserCode || '',

    initialTab: 'store' as const,

    linkStoreCustomerId: order.customerId,

  };

}



export function CustomerStoreLinkSection({ order, onLinked }: Props) {

  const { t } = useTranslation();

  const navigate = useNavigate();

  const [storeUserCode, setStoreUserCode] = useState(order.customerStoreUserCode ?? '');

  const [pickCategoryFor, setPickCategoryFor] = useState<'new' | 'existing' | null>(null);

  const [linkCategoryId, setLinkCategoryId] = useState<number | null>(null);

  const [showLinkParty, setShowLinkParty] = useState(false);



  const isLinkedToFinancialParty = order.customerLinkedToFinancialParty === true;

  const needsLink = !isLinkedToFinancialParty;



  useEffect(() => {

    setStoreUserCode(order.customerStoreUserCode ?? '');

  }, [order.customerStoreUserCode, order.customerId, order.customerLinkedToFinancialParty]);



  const mut = useMutation({

    mutationFn: () => customersApi.update(order.customerId, {

      isActive: true,

      storeUserCode: storeUserCode.trim() || undefined,

    }),

    onSuccess: () => {

      toast.success(t('orders.activateSuccess'));

      onLinked();

    },

    onError: (err: unknown) => {

      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;

      toast.error(msg ?? t('common.error'));

    },

  });



  const handleQuickActivate = () => {

    if (!storeUserCode.trim()) {

      toast.error(t('orders.storeUserCodeRequired'));

      return;

    }

    mut.mutate();

  };



  const openNewParty = (categoryId: number) => {

    setPickCategoryFor(null);

    writeFmFocus({

      mode: 'add',

      kind: 'Customer',

      categoryId,

      prefill: buildContactPrefill({ ...order, customerStoreUserCode: storeUserCode.trim() }),

    });

    navigate(getFinancialManagementPath('Customer'));

  };



  const openExistingParty = (partyId: number) => {

    setShowLinkParty(false);

    writeFmFocus({

      mode: 'edit',

      kind: 'Customer',

      partyId,

      prefill: {

        showInStore: true,

        storeUserCode: storeUserCode.trim(),

        initialTab: 'store',

        linkStoreCustomerId: order.customerId,

      },

    });

    navigate(getFinancialManagementPath('Customer'));

  };



  if (isLinkedToFinancialParty) {

    return (

      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">

        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">

          <CheckCircle2 className="h-4 w-4 shrink-0" />

          {t('orders.linkedToFinancialParty')}

        </div>

        <div className="space-y-1 text-sm">

          <p className="font-semibold">{order.financialPartyName ?? order.customerName ?? '—'}</p>

          {order.financialAccountCode && (

            <p className="flex items-center gap-1.5 text-muted-foreground">

              <Building2 className="h-3.5 w-3.5" />

              <span>{t('orders.financialAccount')}:</span>

              <span className="font-mono font-medium text-foreground" dir="ltr">{order.financialAccountCode}</span>

            </p>

          )}

          {order.customerStoreUserCode && (

            <p className="text-xs text-muted-foreground">

              {t('orders.storeUserCode')}:{' '}

              <span className="font-mono text-foreground" dir="ltr">{order.customerStoreUserCode}</span>

            </p>

          )}

        </div>

      </div>

    );

  }



  return (

    <>

      <div

        className={cn(

          'mt-3 rounded-xl border p-3',

          needsLink

            ? 'border-red-200 bg-red-50/60 dark:border-red-900/40 dark:bg-red-950/20'

            : 'border-border bg-background',

        )}

      >

        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">

          <div className="min-w-0 flex-1">

            <p className="text-xs text-muted-foreground">{t('orders.customer')}</p>

            <p className={cn('font-semibold', needsLink && 'text-red-600 dark:text-red-400')}>

              {order.customerName ?? '—'}

              {order.customerCode && (

                <span className="ms-2 font-mono text-xs text-muted-foreground">{order.customerCode}</span>

              )}

            </p>

            {needsLink && (

              <p className="text-xs text-red-600 dark:text-red-400">{t('orders.customerInactive')}</p>

            )}

          </div>

          {order.customerStoreUserCode && (

            <span className="rounded-md bg-muted px-2 py-1 font-mono text-xs" dir="ltr">

              {order.customerStoreUserCode}

            </span>

          )}

        </div>



        <div className="flex flex-col gap-3">

          <div>

            <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">

              <Link2 className="h-3.5 w-3.5 text-primary" />

              {t('orders.storeUserCode')}

            </label>

            <Input

              value={storeUserCode}

              onChange={(e) => setStoreUserCode(e.target.value.toUpperCase())}

              placeholder={t('orders.storeUserCodePlaceholder')}

              className="font-mono"

              dir="ltr"

            />

            <p className="mt-1 text-xs text-muted-foreground">{t('orders.storeUserCodeHint')}</p>

          </div>



          {(order.storeUserPhone || order.storeUserEmail) && (

            <div className="rounded-lg border bg-muted/30 p-2.5 text-xs">

              <p className="mb-1 font-medium text-muted-foreground">{t('orders.storeUserContact')}</p>

              {order.storeUserFullName && <p>{order.storeUserFullName}</p>}

              {order.storeUserPhone && <p dir="ltr">{order.storeUserPhone}</p>}

              {order.storeUserEmail && <p dir="ltr">{order.storeUserEmail}</p>}

              {(order.storeUserCity || order.storeUserAddress) && (

                <p>{[order.storeUserCity, order.storeUserAddress].filter(Boolean).join(' — ')}</p>

              )}

            </div>

          )}



          <div className="flex flex-wrap gap-2">

            <Button

              type="button"

              variant={needsLink ? 'default' : 'outline'}

              size="sm"

              className={cn('gap-1', needsLink && 'bg-red-600 hover:bg-red-700')}

              disabled={mut.isPending}

              onClick={handleQuickActivate}

            >

              <UserCheck className="h-4 w-4" />

              {mut.isPending ? t('common.loading') : t('orders.activateNow')}

            </Button>

            <Button

              type="button"

              variant="outline"

              size="sm"

              className="gap-1"

              onClick={() => setPickCategoryFor('new')}

            >

              <UserPlus className="h-4 w-4" />

              {t('orders.newCustomerCard')}

            </Button>

            <Button

              type="button"

              variant="outline"

              size="sm"

              className="gap-1"

              onClick={() => setPickCategoryFor('existing')}

            >

              <Users className="h-4 w-4" />

              {t('orders.linkExistingParty')}

            </Button>

          </div>

        </div>

      </div>



      <CustomerCategoryPickDialog

        open={pickCategoryFor === 'new'}

        kind="Customer"

        title={t('orders.pickCustomerCategory')}

        description={t('orders.pickCustomerCategoryDesc')}

        onOpenChange={(open) => !open && setPickCategoryFor(null)}

        onConfirm={openNewParty}

      />



      <CustomerCategoryPickDialog

        open={pickCategoryFor === 'existing'}

        kind="Customer"

        title={t('orders.pickCustomerCategory')}

        description={t('orders.pickCustomerCategoryForLink')}

        onOpenChange={(open) => !open && setPickCategoryFor(null)}

        onConfirm={(categoryId) => {

          setPickCategoryFor(null);

          setLinkCategoryId(categoryId);

          setShowLinkParty(true);

        }}

      />



      {linkCategoryId != null && (

        <LinkExistingPartyDialog

          open={showLinkParty}

          kind="Customer"

          categoryId={linkCategoryId}

          storeUserCode={storeUserCode.trim()}

          onOpenChange={setShowLinkParty}

          onConfirm={openExistingParty}

        />

      )}

    </>

  );

}


