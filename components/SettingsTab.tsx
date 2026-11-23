// Hidden settings tab: OneStock connection (user / password → POST /login token) and the order line
// statuses to retrieve, saved per environment + site_id. Shown with ?settings in the URL or Ctrl+Shift+S.
import React, { useEffect, useState } from 'react';
import type { Settings } from '../types';
import type { DataSource } from '../services/dataSource';
import { ApiError, getAdminKey, setAdminKey } from '../services/api';
import { OsAlert, OsBadge, OsButton, OsField, OsLoading, OsTag } from './os';

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export const SettingsTab: React.FC<{ source: DataSource; onSaved: () => void }> = ({ source, onSaved }) => {
  const dynamic = source.mode === 'dynamic';
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const [adminKey, setKey] = useState(getAdminKey());
  const [apiUser, setApiUser] = useState('');
  const [password, setPassword] = useState('');
  const [statuses, setStatuses] = useState<string[]>([]);
  const [newStatus, setNewStatus] = useState('');
  const [supplierType, setSupplierType] = useState('supplier');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const s = await source.getSettings();
      setSettings(s);
      setApiUser(s.apiUser);
      setStatuses(s.lineStatuses);
      setSupplierType(s.supplierType);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(done);
      setPassword('');
      await load();
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setNeedsKey(true);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addStatus = () => {
    const s = newStatus.trim();
    if (s && !statuses.includes(s)) setStatuses([...statuses, s]);
    setNewStatus('');
  };

  if (!settings && !error) return <OsLoading text="Loading settings" />;

  return (
    <div className="os-col">
      {error && <OsAlert color="red">{error}</OsAlert>}
      {notice && <OsAlert color="green">{notice}</OsAlert>}

      {dynamic && needsKey && (
        <section className="os-card os-col">
          <h3 className="os-title-s" style={{ margin: 0 }}>Settings key</h3>
          <p className="os-label-s t-secondary" style={{ margin: 0 }}>This deployment protects the settings with a key (SETTINGS_ADMIN_KEY).</p>
          <div className="os-row" style={{ alignItems: 'flex-end' }}>
            <OsField label="Key" htmlFor="st-key">
              <input id="st-key" type="password" className="os-input" style={{ width: 280 }} value={adminKey} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
            </OsField>
            <OsButton kind="secondary" onClick={() => { setAdminKey(adminKey); setNeedsKey(false); setError(null); }}>Use key</OsButton>
          </div>
        </section>
      )}

      {dynamic ? (
        <section className="os-card os-col" style={{ gap: 16 }}>
          <div className="os-row" style={{ justifyContent: 'space-between' }}>
            <h3 className="os-title-s" style={{ margin: 0 }}>OneStock connection</h3>
            {settings?.connected ? <OsBadge text="Connected" color="green" icon="check" /> : <OsBadge text="Not connected" color="grey" />}
          </div>
          <dl className="os-kv" style={{ margin: 0 }}>
            <dt>Environment</dt><dd>{source.context?.env}</dd>
            <dt>Site ID</dt><dd>{source.context?.siteId}</dd>
            <dt>Last token</dt><dd>{fmt(settings?.tokenAt ?? null)}</dd>
          </dl>
          <form
            className="os-form"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => source.testConnection(apiUser.trim(), password || undefined), 'Connection succeeded. Credentials saved for this site.');
            }}
          >
            <OsField label="API user" htmlFor="st-user">
              <input id="st-user" className="os-input" autoComplete="username" value={apiUser} onChange={(e) => setApiUser(e.target.value)} required />
            </OsField>
            <OsField label="Password" htmlFor="st-pwd" hint={settings?.hasPassword ? 'A password is saved. Leave empty to keep it.' : undefined}>
              <input id="st-pwd" type="password" className="os-input" autoComplete="current-password" value={password} placeholder={settings?.hasPassword ? '••••••••' : ''}
                onChange={(e) => setPassword(e.target.value)} required={!settings?.hasPassword} />
            </OsField>
            <div><OsButton type="submit" icon="check" disabled={busy}>Test and save connection</OsButton></div>
          </form>
          <p className="os-hint" style={{ margin: 0 }}>
            The token is requested with POST /login and stored server side; the password is stored encrypted and never sent back to the browser.
          </p>
        </section>
      ) : (
        <OsAlert>Static data version: orders, items and suppliers are sample data. The OneStock connection is only available in the dynamic version.</OsAlert>
      )}

      <section className="os-card os-col" style={{ gap: 16 }}>
        <h3 className="os-title-s" style={{ margin: 0 }}>Data retrieved</h3>
        <OsField label="Order line statuses to retrieve" htmlFor="st-status"
          hint={dynamic ? 'OneStock line item states, e.g. new, out_of_stock. Only lines in these states are loaded.' : 'Statuses of the sample order lines.'}>
          <div className="os-row">
            {statuses.map((s) => (
              <OsTag key={s} color="grey" onClose={() => setStatuses(statuses.filter((x) => x !== s))}>{s}</OsTag>
            ))}
            <input id="st-status" className="os-input" style={{ width: 200 }} placeholder="Add a status" value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStatus(); } }} />
            <OsButton kind="secondary" icon="add" onClick={addStatus} disabled={!newStatus.trim()}>Add</OsButton>
          </div>
        </OsField>
        {dynamic && (
          <OsField label="Supplier stock point type" htmlFor="st-type" hint='Value of the "endpoint_type" classification that identifies supplier stock points.'>
            <input id="st-type" className="os-input" style={{ maxWidth: 280 }} value={supplierType} onChange={(e) => setSupplierType(e.target.value)} />
          </OsField>
        )}
        <div className="os-row" style={{ justifyContent: 'flex-end' }}>
          <OsButton icon="save" disabled={busy || !statuses.length}
            onClick={() => run(() => source.saveSettings({ lineStatuses: statuses, ...(dynamic ? { supplierType: supplierType.trim() || 'supplier' } : {}) }), 'Settings saved.')}>
            Save settings
          </OsButton>
        </div>
      </section>
    </div>
  );
};
