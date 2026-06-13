import { useTranslation } from 'react-i18next';

/** Static glass "app preview" shown in the hero. Pure CSS — no theme coupling. */
export function HeroPreview() {
  const { t } = useTranslation();
  const bars = [42, 58, 50, 72, 64, 88, 76, 95, 82, 70, 90, 100];

  const tile = (label: string, value: string, delta: string, up = true) => (
    <div
      className="glass"
      style={{ padding: 14, borderRadius: 14, flex: 1, minWidth: 0 }}
    >
      <div style={{ color: 'rgba(234,244,240,0.65)', fontSize: 12 }}>{label}</div>
      <div style={{ color: '#fff', fontSize: 20, fontWeight: 800, marginTop: 4 }}>{value}</div>
      <div style={{ color: up ? '#e0a36b' : '#ff8585', fontSize: 12, marginTop: 2 }}>
        {up ? '▲' : '▼'} {delta}
      </div>
    </div>
  );

  return (
    <div
      className="glass fade-in-up"
      style={{
        borderRadius: 22,
        padding: 22,
        boxShadow: '0 40px 80px -30px rgba(0,0,0,0.55)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ color: '#fff', fontWeight: 700 }}>{t('dashboard.title')}</div>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: '#f3dcc4',
            fontSize: 12,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#e0a36b' }} /> live
        </span>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
        {tile(t('dashboard.kpiOutstanding'), '$1.92M', '4.2%', false)}
        {tile(t('dashboard.kpiCollected'), '$9.97M', '12.6%', true)}
      </div>

      <div
        className="glass"
        style={{ borderRadius: 16, padding: '18px 16px 12px', marginBottom: 16 }}
      >
        <div style={{ color: 'rgba(234,244,240,0.65)', fontSize: 12, marginBottom: 12 }}>
          {t('dashboard.cashflowTitle')}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 96 }}>
          {bars.map((h, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: `${h}%`,
                borderRadius: 4,
                background:
                  i === bars.length - 1
                    ? 'linear-gradient(180deg,#e0a36b,#b87333)'
                    : 'rgba(110,231,255,0.35)',
              }}
            />
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'conic-gradient(#e0a36b 0 84%, rgba(255,255,255,0.12) 84% 100%)',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: '50%',
              background: 'rgba(6,26,21,0.85)',
              display: 'grid',
              placeItems: 'center',
              color: '#fff',
              fontWeight: 800,
              fontSize: 15,
            }}
          >
            84%
          </div>
        </div>
        <div>
          <div style={{ color: '#fff', fontWeight: 700 }}>{t('dashboard.kpiCollectionRate')}</div>
          <div style={{ color: 'rgba(234,244,240,0.65)', fontSize: 13 }}>
            {t('dashboard.collected')} · {t('common.last12Months')}
          </div>
        </div>
      </div>
    </div>
  );
}
