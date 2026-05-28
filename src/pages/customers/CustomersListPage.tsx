import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Construction } from 'lucide-react';

export function CustomersListPage() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('customers.title')}</CardTitle>
        <CardDescription>{t('common.underConstruction')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center py-16 text-center">
        <Construction className="mb-3 h-10 w-10 text-primary/60" />
        <p className="text-sm text-muted-foreground">
          {t('common.underConstructionDesc')}
        </p>
      </CardContent>
    </Card>
  );
}
