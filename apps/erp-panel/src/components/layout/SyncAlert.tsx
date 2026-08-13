import { useEffect, useState } from 'react';
import { Alert } from 'antd';
import { useTranslation } from 'react-i18next';
import { getSyncState, onSyncStateChange, type SyncState } from '@/services/snapshot';

/**
 * Says so when an edit has not reached the server.
 *
 * <p>
 * Several features — payments, cheques, expenses, revenues, claims, transfers, warehouse
 * documents — still have no endpoint of their own. Their only route to the database is a
 * background push of the whole dataset, and on this deployment that route is disabled. The push
 * used to fail silently on the reasoning that the edit was safe in localStorage and the next
 * push would carry it; that reasoning holds for a hiccup and not for a permanent refusal, where
 * there is no next push that succeeds and the screen says "Saved" to a number that exists in one
 * browser.
 * </p>
 *
 * <p>
 * A banner rather than a toast per failure: the condition persists, so it should be visible for
 * as long as it is true rather than for four seconds after each keystroke.
 * </p>
 */
export function SyncAlert() {
  const { t } = useTranslation();
  const [state, setState] = useState<SyncState>(getSyncState);

  useEffect(() => onSyncStateChange(setState), []);

  if (state.kind === 'ok') return null;

  const refused = state.kind === 'refused';

  return (
    <Alert
      type={refused ? 'error' : 'warning'}
      showIcon
      banner
      message={refused ? t('sync.refusedTitle') : t('sync.failingTitle')}
      description={refused ? t('sync.refusedBody') : t('sync.failingBody')}
      style={{ marginBottom: 16 }}
    />
  );
}
