import { Typography, theme } from 'antd';
import { AudioOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { UiMessage } from '@/store/useAssistantStore';

const { Text } = Typography;

/** One bubble. Assistant text is markdown (bold, lists, tables); links into the app become router links. */
export function AssistantMessage({ message }: { message: UiMessage }) {
  const { token } = theme.useToken();
  const { t } = useTranslation();
  const mine = message.role === 'user';
  return (
    <div
      className="assistant-message"
      style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBlockEnd: 10 }}
    >
      <div
        style={{
          maxWidth: '88%',
          padding: '10px 14px',
          borderRadius: 16,
          borderEndEndRadius: mine ? 4 : 16,
          borderEndStartRadius: mine ? 16 : 4,
          background: mine ? token.colorPrimary : token.colorFillSecondary,
          color: mine ? token.colorWhite : token.colorText,
          fontSize: 14,
          lineHeight: 1.5,
          overflowWrap: 'anywhere',
        }}
      >
        {message.kind === 'voice' && (
          <Text style={{ color: 'inherit', opacity: 0.8, fontSize: 12, display: 'block', marginBlockEnd: 4 }}>
            <AudioOutlined /> {t('assistant.voiceNote')}
          </Text>
        )}
        {mine ? (
          message.text
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: 'p', h2: 'p', h3: 'p',
              a: ({ href, children }) =>
                href && href.startsWith('/app/') ? (
                  <Link to={href} style={{ color: token.colorPrimary, textDecoration: 'underline' }}>{children}</Link>
                ) : (
                  <span>{children}</span>
                ),
              table: ({ children }) => (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>{children}</table>
                </div>
              ),
              th: ({ children }) => <th style={{ textAlign: 'start', padding: '2px 8px', borderBlockEnd: `1px solid ${token.colorBorder}` }}>{children}</th>,
              td: ({ children }) => <td style={{ padding: '2px 8px' }}>{children}</td>,
              p: ({ children }) => <p style={{ margin: '0 0 6px' }}>{children}</p>,
            }}
          >
            {linkify(message.text, t('assistant.open'))}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}

/** Turns the model's plain "Open: /app/customers/cust-1" line into a markdown link with the app's label. */
function linkify(text: string, label: string): string {
  return text.replace(/^(Open:)\s*(\/app\/\S+)\s*$/gim, (_m, _prefix, path) => `[${label}](${path})`);
}
