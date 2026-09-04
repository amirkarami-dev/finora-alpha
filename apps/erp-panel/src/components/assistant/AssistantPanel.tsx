import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Drawer, Grid, Input, Space, Tooltip, Typography, theme } from 'antd';
import { AudioOutlined, ClearOutlined, CloseOutlined, SendOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAssistantStore } from '@/store/useAssistantStore';
import { AssistantMessage } from './AssistantMessage';
import { SparklesIcon } from './SparklesIcon';
import { useRecorder } from './useRecorder';

const { Text, Title } = Typography;

export function AssistantPanel() {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const open = useAssistantStore((s) => s.open);
  const setOpen = useAssistantStore((s) => s.setOpen);
  const messages = useAssistantStore((s) => s.messages);
  const pending = useAssistantStore((s) => s.pending);
  const error = useAssistantStore((s) => s.error);
  const ask = useAssistantStore((s) => s.ask);
  const askVoice = useAssistantStore((s) => s.askVoice);
  const newChat = useAssistantStore((s) => s.newChat);
  const [draft, setDraft] = useState('');
  const [micError, setMicError] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const recorder = useRecorder(
    (blob) => { void askVoice(blob); },
    () => setMicError(true),
  );

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, pending]);

  const send = () => {
    const text = draft.trim();
    if (!text || pending) return;
    setDraft('');
    void ask(text);
  };

  const glass = {
    background: `color-mix(in srgb, ${token.colorBgElevated} 86%, transparent)`,
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  } as const;

  return (
    <Drawer
      open={open}
      onClose={() => setOpen(false)}
      width={screens.md ? 420 : '100%'}
      placement={document.documentElement.dir === 'rtl' ? 'left' : 'right'}
      closable={false}
      mask={false}
      styles={{
        body: { padding: 0, display: 'flex', flexDirection: 'column' },
        header: { display: 'none' },
        wrapper: { boxShadow: '0 24px 64px -24px rgba(0,0,0,0.45)' },
        content: { borderInlineStart: `1px solid ${token.colorBorderSecondary}` },
      }}
      aria-label={t('assistant.title')}
    >
      <div style={glass}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBlockEnd: `1px solid ${token.colorBorderSecondary}` }}>
          <span style={{ color: token.colorPrimary, display: 'inline-flex' }}><SparklesIcon size={20} /></span>
          <Title level={5} style={{ margin: 0, flex: 1 }}>{t('assistant.title')}</Title>
          <Tooltip title={t('assistant.newChat')}>
            <Button type="text" icon={<ClearOutlined />} aria-label={t('assistant.newChat')} onClick={newChat} disabled={pending || messages.length === 0} style={{ minWidth: 44, minHeight: 44 }} />
          </Tooltip>
          <Button type="text" icon={<CloseOutlined />} aria-label={t('common.close')} onClick={() => setOpen(false)} style={{ minWidth: 44, minHeight: 44 }} />
        </div>

        {/* messages */}
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 16 }} aria-live="polite">
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', paddingBlock: 32 }}>
              <span style={{ color: token.colorPrimary, display: 'inline-flex' }}><SparklesIcon size={40} /></span>
              <Title level={5} style={{ marginBlock: '12px 4px' }}>{t('assistant.emptyTitle')}</Title>
              <Text type="secondary">{t('assistant.emptyHint')}</Text>
              <Space direction="vertical" style={{ marginBlockStart: 20, width: '100%' }} size={8}>
                {(['example1', 'example2', 'example3'] as const).map((key) => (
                  <Button key={key} block onClick={() => setDraft(t(`assistant.${key}`))} style={{ textAlign: 'start', whiteSpace: 'normal', height: 'auto', padding: '8px 12px' }}>
                    {t(`assistant.${key}`)}
                  </Button>
                ))}
              </Space>
            </div>
          )}
          {messages.map((m) => <AssistantMessage key={m.id} message={m} />)}
          {pending && (
            <Text type="secondary" style={{ fontSize: 12 }}>{recorder.recording ? t('assistant.listening') : t('assistant.thinking')}</Text>
          )}
          {(error || micError) && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBlockStart: 8 }}
              message={t(micError ? 'assistant.micBlocked' : error!)}
              closable
              onClose={() => setMicError(false)}
            />
          )}
        </div>

        {/* composer */}
        <div style={{ padding: 12, borderBlockStart: `1px solid ${token.colorBorderSecondary}` }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <Input.TextArea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onPressEnter={(e) => { if (!e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={t('assistant.placeholder')}
              autoSize={{ minRows: 1, maxRows: 4 }}
              disabled={pending}
              aria-label={t('assistant.placeholder')}
            />
            {recorder.supported && (
              <Tooltip title={recorder.recording ? t('assistant.stop') : t('assistant.record')}>
                <Button
                  shape="circle"
                  size="large"
                  className={recorder.recording ? 'assistant-recording' : undefined}
                  type={recorder.recording ? 'primary' : 'default'}
                  danger={recorder.recording}
                  icon={<AudioOutlined />}
                  aria-label={recorder.recording ? t('assistant.stop') : t('assistant.record')}
                  aria-pressed={recorder.recording}
                  disabled={pending}
                  onClick={() => (recorder.recording ? recorder.stop() : void recorder.start())}
                  style={{ width: 44, height: 44 }}
                />
              </Tooltip>
            )}
            <Button shape="circle" size="large" type="primary" icon={<SendOutlined />} aria-label={t('assistant.send')} onClick={send} disabled={pending || !draft.trim()} style={{ width: 44, height: 44 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBlockStart: 6 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>{t('assistant.readOnly')}</Text>
            {recorder.recording && <Text type="danger" style={{ fontSize: 11 }}>{t('assistant.recording')} · {recorder.seconds}s</Text>}
          </div>
        </div>
      </div>
    </Drawer>
  );
}
