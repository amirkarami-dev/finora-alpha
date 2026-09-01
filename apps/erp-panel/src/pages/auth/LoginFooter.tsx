import type { CSSProperties } from 'react';
import { Typography, theme } from 'antd';
import { useTranslation } from 'react-i18next';
import { COMPANY } from '@/config/constants';

const { Text } = Typography;

/**
 * The corporate site's footer, cut down to what a login page can honestly show.
 *
 * <p>
 * metal-uae.com carries three columns, the middle one an index of the site. That column is
 * dropped here rather than reproduced: every route behind this page needs a session, so a list of
 * links would be a list of redirects back to the form the reader is already looking at. What
 * survives is the part that means something to someone who has not signed in — whose desk this
 * is, and how to reach it.
 * </p>
 */
export function LoginFooter() {
  const { t } = useTranslation();
  const { token } = theme.useToken();

  const linkStyle: CSSProperties = {
    color: token.colorTextTertiary,
    fontSize: 12.5,
    textDecoration: 'none',
  };

  return (
    <div
      style={{
        width: '100%',
        maxWidth: 400,
        marginInline: 'auto',
        paddingTop: 18,
        borderTop: `1px solid ${token.colorSplit}`,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
      }}
    >
      <Text type="secondary" style={{ fontSize: 12.5 }}>
        © {new Date().getFullYear()} {COMPANY.legalName}
      </Text>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <a href={COMPANY.siteUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>
          {COMPANY.siteLabel}
        </a>
        <a href={`mailto:${COMPANY.email}`} style={linkStyle}>
          {t('footer.contact')}
        </a>
      </div>
    </div>
  );
}
