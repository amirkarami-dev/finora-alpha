import { useEffect, useState } from 'react';
import { Alert } from 'antd';
import { useTranslation } from 'react-i18next';
import { getSyncState, onSyncStateChange, type SyncState } from '@/services/snapshot';

/**
 * Says so when an edit has not reached the server.
 *
 * <p>
 * This was built when most of the application still wrote only to the browser, and the whole-
 * dataset push was those features' one route to the database. They all have their own endpoints
 * now, so the only thing that still uses that push is the demo-data pair in Settings — which
 * production deliberately switches off. That is what the permanent notice says now.
 * </p>
 *
 * <p>
 * The transient one still earns its place: an edit that cannot reach the server is worth saying
 * out loud, whatever the reason, rather than letting the screen claim it saved.
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
