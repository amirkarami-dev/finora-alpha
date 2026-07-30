import { useRef } from 'react';
import { Button, Card } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/common/PageHeader';
import { useTabParam } from '@/hooks/useTabParam';
import { ChargeCategoriesTab, type ChargeCategoriesTabHandle } from './ChargeCategoriesTab';
import { CostCentresTab, type CostCentresTabHandle } from './CostCentresTab';
import { GoodsTab, type GoodsTabHandle } from './GoodsTab';

const TAB_KEYS = ['goods', 'expenseCategories', 'revenueCategories', 'costCentres'] as const;
type TabKey = (typeof TAB_KEYS)[number];

/** New-button label per tab — a lookup, not an if/else chain, so adding a fifth tab is one
 *  entry here and one in `NEW_HANDLERS` below rather than another branch to forget. */
const NEW_LABEL_KEY: Record<TabKey, string> = {
  goods: 'goods.newGood',
  expenseCategories: 'chargeCategories.newCategory',
  revenueCategories: 'chargeCategories.newCategory',
  costCentres: 'costCentres.newCostCentre',
};

/** One page, four tabs: Goods, Expense categories, Revenue categories, Cost centres (design
 *  spec §6/§9 Phase 2) — `WarehousePage.tsx`'s `useTabParam` + Card `tabList` idiom. Cost
 *  Centres moved here verbatim from the deleted `pages/costCentres/` module; the two category
 *  tabs share one `ChargeCategoriesTab` implementation parameterised by direction.
 *
 *  Goods leads because it is the list users touch most — it feeds the contract goods form's
 *  autocomplete via `getProductNames`. It is deliberately NOT the default tab, though: that
 *  would change where existing `/app/base-info` links land. */
export default function BaseInfoPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useTabParam(TAB_KEYS, 'expenseCategories');

  const goodsTabRef = useRef<GoodsTabHandle>(null);
  const expenseTabRef = useRef<ChargeCategoriesTabHandle>(null);
  const revenueTabRef = useRef<ChargeCategoriesTabHandle>(null);
  const costCentresTabRef = useRef<CostCentresTabHandle>(null);

  const handleNew = () => {
    if (tab === 'goods') goodsTabRef.current?.openCreate();
    else if (tab === 'expenseCategories') expenseTabRef.current?.openCreate();
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
            {t(NEW_LABEL_KEY[tab])}
          </Button>
        }
      />

      <Card
        variant="borderless"
        styles={{ body: { padding: 16 } }}
        tabList={[
          { key: 'goods', label: t('baseInfo.tabGoods') },
          { key: 'expenseCategories', label: t('baseInfo.tabExpenseCategories') },
          { key: 'revenueCategories', label: t('baseInfo.tabRevenueCategories') },
          { key: 'costCentres', label: t('baseInfo.tabCostCentres') },
        ]}
        activeTabKey={tab}
        onTabChange={(key) => setTab(key as TabKey)}
      >
        {tab === 'goods' && <GoodsTab ref={goodsTabRef} />}
        {tab === 'expenseCategories' && <ChargeCategoriesTab ref={expenseTabRef} direction="EXPENSE" />}
        {tab === 'revenueCategories' && <ChargeCategoriesTab ref={revenueTabRef} direction="REVENUE" />}
        {tab === 'costCentres' && <CostCentresTab ref={costCentresTabRef} />}
      </Card>
    </div>
  );
}
