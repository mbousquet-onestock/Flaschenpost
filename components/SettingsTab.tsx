// Settings tab, invisible until hovered (or opened with ?settings in the URL):
//  - data source: static (sample data) or dynamic (OneStock API), saved per environment + site ID;
//  - environment connection: environment, site ID, API user and password (token requested with POST /login);
//  - data retrieved: order line statuses, supplier stock point type.
import React, { useEffect, useState } from 'react';
import type { Settings } from '../types';
import type { HostContext } from '../services/context';
import { DataMode, siteSettings, staticSource } from '../services/dataSource';
import { ApiError, getAdminKey, setAdminKey } from '../services/api';
import { OsAlert, OsBadge, OsButton, OsField, OsIcon, OsTag } from './os';
import { dateTime, t } from '../services/i18n';

const fmt = (iso: string | null) => (iso ? dateTime(new Date(iso)) : '—');

const MODES: { value: DataMode; title: string; text: string }[] = [
  { value: 'static', title: 'Static', text: 'Sample orders, items and suppliers. Prices and statuses are kept in this browser.' },
  { value: 'dynamic', title: 'Dynamic', text: 'Orders, items and suppliers from the OneStock API of the environment below. Settings and prices saved in the database.' },
];

export const SettingsTab: React.FC<{
  context: HostContext | null;
  mode: DataMode;
  onModeChange: (mode: DataMode) => void;
  onContextChange: (ctx: { env: string; siteId: string }) => void;
  onSaved: () => void;
}> = ({ context, mode, onModeChange, onContextChange, onSaved }) => {
  const fromHost = context?.source === 'url' || context?.source === 'host';
  const site = context ? siteSettings(context) : null;

  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiAvailable, setApiAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const [adminKey, setKey] = useState(getAdminKey());
  const [selectedMode, setSelectedMode] = useState<DataMode>(mode);
  const [env, setEnv] = useState(context?.env ?? 'qualif');
  const urlSite = new URLSearchParams(window.location.search).get('site_id') ?? '';
  const [siteId, setSiteId] = useState(context?.siteId ?? urlSite);
  const [apiUser, setApiUser] = useState('');
  const [password, setPassword] = useState('');
  const [statuses, setStatuses] = useState<string[]>([]);
  const [newStatus, setNewStatus] = useState('');
  const [supplierType, setSupplierType] = useState('supplier');
  const [launchStatus, setLaunchStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (site) {
      try {
        const s = await site.get();
        setSettings(s);
        setApiAvailable(true);
        setApiUser(s.apiUser);
        setSupplierType(s.supplierType);
        if (selectedMode === 'dynamic') {
          setStatuses(s.lineStatuses);
          setLaunchStatus(s.launchStatus ?? '');
        }
      } catch (e) {
        setApiAvailable(false);
        setSettings(null);
        if (selectedMode === 'dynamic') setError(t('Database unavailable: {error}', { error: (e as Error).message }));
      }
    }
    if (selectedMode === 'static') {
      const st = await staticSource.getSettings();
      setStatuses(st.lineStatuses);
      setLaunchStatus(st.launchStatus ?? '');
    }
  };

  useEffect(() => {
    setEnv(context?.env ?? 'qualif');
    setSiteId(context?.siteId ?? urlSite);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, selectedMode]);

  const run = async (fn: () => Promise<unknown>, done: string) => {
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

  const saveMode = () =>
    run(async () => {
      if (selectedMode === 'dynamic' && !context) throw new Error(t('Enter the environment and the site ID first.'));
      if (site) {
        try {
          await site.save({ dataMode: selectedMode });
        } catch (e) {
          // Static mode still works without the database (static deployment).
          if (selectedMode === 'dynamic' || (e instanceof ApiError && e.status === 403)) throw e;
        }
      }
      onModeChange(selectedMode);
    }, selectedMode === 'dynamic' ? t('Dynamic data source saved for this site.') : t('Static data source saved.'));

  const saveContext = () => {
    const e = env.trim().toLowerCase();
    const s = siteId.trim().toLowerCase();
    if (!/^[a-z0-9-]{1,20}$/.test(e)) return setError(t('Invalid environment.'));
    if (!/^[a-z0-9_-]{1,32}$/.test(s)) return setError(t('Invalid site ID, e.g. c00.'));
    setError(null);
    setNotice(t('Environment saved in this browser.'));
    onContextChange({ env: e, siteId: s });
  };

  const addStatus = () => {
    const s = newStatus.trim();
    if (s && !statuses.includes(s)) setStatuses([...statuses, s]);
    setNewStatus('');
  };

  const saveData = () =>
    run(
      () =>
        selectedMode === 'dynamic' && site
          ? site.save({ lineStatuses: statuses, supplierType: supplierType.trim() || 'supplier', launchStatus: launchStatus.trim() })
          : staticSource.saveSettings({ lineStatuses: statuses, launchStatus: launchStatus.trim() }),
      t('Settings saved.'),
    );

  return (
    <div className="os-col">
      {error && <OsAlert color="red">{error}</OsAlert>}
      {notice && <OsAlert color="green">{notice}</OsAlert>}

      {needsKey && (
        <section className="os-card os-col">
          <h3 className="os-title-s" style={{ margin: 0 }}>{t('Settings key')}</h3>
          <p className="os-label-s t-secondary" style={{ margin: 0 }}>{t('This deployment protects the settings with a key (SETTINGS_ADMIN_KEY).')}</p>
          <div className="os-row" style={{ alignItems: 'flex-end' }}>
            <OsField label={t('Key')} htmlFor="st-key">
              <input id="st-key" type="password" className="os-input" style={{ width: 280 }} value={adminKey} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
            </OsField>
            <OsButton kind="secondary" onClick={() => { setAdminKey(adminKey); setNeedsKey(false); setError(null); }}>{t('Use key')}</OsButton>
          </div>
        </section>
      )}

      <section className="os-card os-col" style={{ gap: 16 }}>
        <div className="os-row" style={{ justifyContent: 'space-between' }}>
          <h3 className="os-title-s" style={{ margin: 0 }}>{t('Data source')}</h3>
          <OsBadge text={mode === 'dynamic' ? t('Dynamic in use') : t('Static in use')} color={mode === 'dynamic' ? 'primary' : 'grey'} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 8 }} role="radiogroup" aria-label={t('Data source')}>
          {MODES.map((m) => {
            const on = selectedMode === m.value;
            return (
              <button key={m.value} type="button" role="radio" aria-checked={on} className={`os-choice${on ? ' on' : ''}`} onClick={() => setSelectedMode(m.value)}>
                <span className="act"><OsIcon icon={on ? 'radio-button-checked' : 'radio-button-unchecked'} /></span>
                <span>
                  <span className={`os-label-l${on ? ' t-brand' : ''}`} style={{ display: 'block' }}>{t(m.title)}</span>
                  <span className="os-label-s t-secondary">{t(m.text)}</span>
                </span>
              </button>
            );
          })}
        </div>
        {selectedMode === 'dynamic' && !apiAvailable && context && (
          <OsAlert color="orange">{t('The database of this deployment is not reachable: the dynamic source needs DATABASE_URL and CREDENTIALS_KEY on Vercel.')}</OsAlert>
        )}
        <div className="os-row" style={{ justifyContent: 'flex-end' }}>
          <OsButton icon="save" disabled={busy || selectedMode === mode} onClick={saveMode}>{t('Apply data source')}</OsButton>
        </div>
      </section>

      <section className="os-card os-col" style={{ gap: 16 }}>
        <div className="os-row" style={{ justifyContent: 'space-between' }}>
          <h3 className="os-title-s" style={{ margin: 0 }}>{t('Environment connection')}</h3>
          {settings?.connected ? <OsBadge text={t('Connected')} color="green" icon="check" /> : <OsBadge text={t('Not connected')} color="grey" />}
        </div>

        <div className="os-form">
          <OsField label={t('Environment')} htmlFor="st-env" hint={fromHost ? t('From the OneStock API URL') : t('qualif, prod…')}>
            <input id="st-env" className="os-input" list="st-envs" value={env} disabled={fromHost} onChange={(e) => setEnv(e.target.value)} />
            <datalist id="st-envs"><option value="qualif" /><option value="prod" /></datalist>
          </OsField>
          <OsField label={t('Site ID')} htmlFor="st-site" hint={fromHost ? t('Provided by OneStock') : t('e.g. c00')}>
            <input id="st-site" className="os-input" value={siteId} disabled={fromHost} placeholder={t('c00')} onChange={(e) => setSiteId(e.target.value)} />
          </OsField>
          {!fromHost && (
            <div><OsButton kind="secondary" icon="save" onClick={saveContext}>{t('Save environment')}</OsButton></div>
          )}
        </div>

        {context ? (
          <>
            <form
              className="os-form"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => site!.testConnection(apiUser.trim(), password || undefined), t('Connection succeeded. Credentials saved for this environment and site.'));
              }}
            >
              <OsField label={t('API user')} htmlFor="st-user">
                <input id="st-user" className="os-input" autoComplete="username" value={apiUser} onChange={(e) => setApiUser(e.target.value)} required />
              </OsField>
              <OsField label={t('Password')} htmlFor="st-pwd" hint={settings?.hasPassword ? t('A password is saved. Leave empty to keep it.') : undefined}>
                <input id="st-pwd" type="password" className="os-input" autoComplete="current-password" value={password} placeholder={settings?.hasPassword ? '••••••••' : ''}
                  onChange={(e) => setPassword(e.target.value)} required={!settings?.hasPassword} />
              </OsField>
              <div><OsButton type="submit" icon="check" disabled={busy}>{t('Test and save connection')}</OsButton></div>
            </form>
            <p className="os-hint" style={{ margin: 0 }}>
              {t('Last token: {date}. The token is requested with POST /login and kept server side; the password is stored encrypted and never sent back to the browser.', { date: fmt(settings?.tokenAt ?? null) })}
            </p>
          </>
        ) : (
          <OsAlert>{t('Enter and save the environment and the site ID to set the API credentials.')}</OsAlert>
        )}
      </section>

      <section className="os-card os-col" style={{ gap: 16 }}>
        <h3 className="os-title-s" style={{ margin: 0 }}>{selectedMode === 'static' ? t('Data retrieved (static data)') : t('Data retrieved')}</h3>
        <OsField label={t('Order line statuses to retrieve')} htmlFor="st-status"
          hint={selectedMode === 'dynamic' ? t('OneStock line item states, e.g. new, out_of_stock. Only lines in these states are loaded.') : t('Statuses of the sample order lines.')}>
          <div className="os-row">
            {statuses.map((s) => (
              <OsTag key={s} color="grey" onClose={() => setStatuses(statuses.filter((x) => x !== s))}>{s}</OsTag>
            ))}
            <input id="st-status" className="os-input" style={{ width: 200 }} placeholder={t('Add a status')} value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStatus(); } }} />
            <OsButton kind="secondary" icon="add" onClick={addStatus} disabled={!newStatus.trim()}>{t('Add')}</OsButton>
          </div>
        </OsField>
        <OsField label={t('Order line status after launch')} htmlFor="st-launch"
          hint={t('When a strategy is launched, its order lines move to this status (e.g. supplier_ordered). Empty: the statuses do not change.')}>
          <input id="st-launch" className="os-input" style={{ maxWidth: 280 }} placeholder={t('No change')} value={launchStatus} onChange={(e) => setLaunchStatus(e.target.value)} />
        </OsField>
        {selectedMode === 'dynamic' && (
          <OsField label={t('Supplier stock point type')} htmlFor="st-type" hint={t('Value of the "endpoint_type" classification that identifies supplier stock points.')}>
            <input id="st-type" className="os-input" style={{ maxWidth: 280 }} value={supplierType} onChange={(e) => setSupplierType(e.target.value)} />
          </OsField>
        )}
        <div className="os-row" style={{ justifyContent: 'flex-end' }}>
          <OsButton icon="save" disabled={busy || !statuses.length || (selectedMode === 'dynamic' && !context)} onClick={saveData}>{t('Save settings')}</OsButton>
        </div>
      </section>
    </div>
  );
};
