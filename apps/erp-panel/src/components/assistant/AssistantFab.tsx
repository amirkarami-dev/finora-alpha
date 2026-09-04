import { Tooltip } from 'antd';
import { useTranslation } from 'react-i18next';
import { useAssistantStore } from '@/store/useAssistantStore';
import { BRAND } from '@/config/constants';
import { SparklesIcon } from './SparklesIcon';

let fabButton: HTMLButtonElement | null = null;

/** Returns focus to the floating button, e.g. after the assistant drawer closes. No-op if the
 *  button is not currently mounted (panel hidden, or a role without the `assistant` permission).
 *  Deliberately a plain function export alongside the component, not a separate file, so the
 *  drawer can call it without importing a whole module just for one line. */
// eslint-disable-next-line react-refresh/only-export-components
export function focusFab() {
  fabButton?.focus();
}

/** The floating "ask the assistant" button. Hidden while the panel is open. */
export function AssistantFab() {
  const { t } = useTranslation();
  const open = useAssistantStore((s) => s.open);
  const setOpen = useAssistantStore((s) => s.setOpen);
  if (open) return null;
  return (
    <Tooltip title={t('assistant.openButton')} placement="left">
      <button
        ref={(el) => {
          fabButton = el;
        }}
        type="button"
        className="assistant-fab"
        aria-label={t('assistant.openButton')}
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          insetInlineEnd: 24,
          insetBlockEnd: 24,
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: 'none',
          cursor: 'pointer',
          color: '#fff',
          background: `linear-gradient(135deg, ${BRAND.primary}, ${BRAND.accent})`,
          display: 'grid',
          placeItems: 'center',
          zIndex: 1000,
        }}
      >
        <SparklesIcon size={26} />
      </button>
    </Tooltip>
  );
}
