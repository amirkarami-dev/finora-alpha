import { useRef } from 'react';
import { Button, Card } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';
import { useTabParam } from '@/hooks/useTabParam';
import { ChargeCategoriesTab, type ChargeCategoriesTabHandle } from './ChargeCategoriesTab';
import { CostCentresTab, type CostCentresTabHandle } from './CostCentresTab';

const TAB_KEYS = ['expenseCategories', 'revenueCategories', 'costCentres'] as const;
type TabKey = (typeof TAB_KEYS)[number];

/** One page, three tabs: Expense categories, Revenue categories, Cost centres (design spec
 *  §6/§9 Phase 2) — `WarehousePage.tsx`'s `useTabParam` + Card `tabList` idiom. Cost Centres
 *  moved here verbatim from the deleted `pages/costCentres/` module; the two category tabs
 *  share one `ChargeCategoriesTab` implementation parameterised by direction. */
export default function BaseInfoPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useTabParam(TAB_KEYS, 'expenseCategories');

  const expenseTabRef = useRef<ChargeCategoriesTabHandle>(null);
  const revenueTabRef = useRef<ChargeCategoriesTabHandle>(null);
  const costCentresTabRef = useRef<CostCentresTabHandle>(null);

  const handleNew = () => {
    if (tab === 'expenseCategories') expenseTabRef.current?.openCreate();
    else if (tab === 'revenueCategories') revenueTabRef.current?.openCreate();
    else costCentresTabRef.current?.openCreate();
  };

  return (
    <div className="fade-in">
      <PageHeader
        title={t('baseInfo.title')}
        subtitle={t('baseInfo.subtitle')}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleNew}>
            {tab === 'costCentres' ? t('costCentres.newCostCentre') : t('chargeCategories.newCategory')}
          </Button>
        }
      />

      <Card
        variant="borderless"
        styles={{ body: { padding: 16 } }}
        tabList={[
          { key: 'expenseCategories', label: t('baseInfo.tabExpenseCategories') },
          { key: 'revenueCategories', label: t('baseInfo.tabRevenueCategories') },
          { key: 'costCentres', label: t('baseInfo.tabCostCentres') },
        ]}
        activeTabKey={tab}
        onTabChange={(key) => setTab(key as TabKey)}
      >
        {tab === 'expenseCategories' && <ChargeCategoriesTab ref={expenseTabRef} direction="EXPENSE" />}
        {tab === 'revenueCategories' && <ChargeCategoriesTab ref={revenueTabRef} direction="REVENUE" />}
        {tab === 'costCentres' && <CostCentresTab ref={costCentresTabRef} />}
      </Card>
    </div>
  );
}
