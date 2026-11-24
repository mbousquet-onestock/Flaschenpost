// Stock test: stock of items per stock location with a OneStock stock query (GET /stock_export, with details),
// to understand why a stock location has no available stock: raw stock − buffers − reservations − dispositions.
import React, { useMemo, useState } from 'react';
import type { Dataset, ItemRef, StockCheckLine, StockCheckResult } from '../types';
import { carrierLabel, forbiddenFor } from '../services/delivery';
import { featureLookup } from '../services/simulation';
import type { DataSource } from '../services/dataSource';
import { dateTime, num, t } from '../services/i18n';
import { OsAlert, OsBadge, OsButton, OsField, OsLoading } from './os';

const HISTORY_KEY = 'wave-orchestrator.stock-requests';

function readHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as string[];
  } catch {
    return [];
  }
}

function remember(name: string) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify([name, ...readHistory().filter((x) => x !== name)].slice(0, 10)));
  } catch {
    /* storage unavailable */
  }
}

const split = (s: string) => [...new Set(s.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];

/** "20 − 20 (buffer) − 0 (reservations) = 0" */
function explain(s: StockCheckLine): string | null {
  if (s.rawStock === null) return null;
  const parts = [num(s.rawStock)];
  const buffer = s.buffers.reduce((n, b) => n + b.applied, 0);
  const reserved = (s.endpointReservation ?? 0) + (s.globalReservation ?? 0);
  const disposed = s.dispositions.reduce((n, d) => n + d.quantity, 0);
  if (buffer) parts.push(`− ${num(buffer)} ${t('buffer')}`);
  if (reserved) parts.push(`− ${num(reserved)} ${t('reserved')}`);
  if (disposed) parts.push(`− ${num(disposed)} ${t('dispositions')}`);
  return `${parts.join(' ')} = ${num(s.quantity)}`;
}

export const StockTestTab: React.FC<{ source: DataSource; items: ItemRef[]; data: Dataset | null }> = ({ source, items, data }) => {
  const restrictions = data?.deliveryRestrictions ?? [];
  const [features, setFeatures] = useState<Record<string, Record<string, string[]>>>({});
  const [requestName, setRequestName] = useState(() => readHistory()[0] ?? '');
  const [itemText, setItemText] = useState('');
  const [endpointText, setEndpointText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StockCheckResult | null>(null);
  const history = readHistory();
  const itemName = useMemo(() => new Map(items.map((i) => [i.id, i.name])), [items]);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const itemIds = split(itemText);
      const [r, f] = await Promise.all([
        source.stockCheck(requestName.trim(), itemIds, split(endpointText)),
        source.itemFeatures(itemIds, [...new Set(restrictions.flatMap((x) => Object.keys(x.itemFilter)))]).catch(() => ({})),
      ]);
      remember(requestName.trim());
      setFeatures(f);
      setResult(r);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Delivery restrictions of an item: features from OneStock, else those known from the loaded orders.
  const lookup = useMemo(() => {
    const base = data ? featureLookup(data) : (sku: string, f: string) => (f === 'sku' ? [sku] : []);
    return (sku: string, f: string) => (features[sku]?.[f]?.length ? features[sku][f] : base(sku, f));
  }, [data, features]);
  const deliveryLine = (itemId: string) => {
    if (!restrictions.length) return null;
    const hits = forbiddenFor(itemId, restrictions, lookup);
    if (!hits.length) return <span className="os-body-s t-green">{t('No delivery restriction for this item.')}</span>;
    return (
      <span className="os-row" style={{ gap: 4 }}>
        <span className="os-body-s t-secondary">{t('Forbidden carriers:')}</span>
        {hits.map((h, i) => {
          const r = restrictions.find((x) => x.id === h.restrictionId)!;
          const why = Object.entries(r.itemFilter).map(([f, cs]) => cs.map((c) => `${f} ${c.op} ${Array.isArray(c.value) ? c.value.join('|') : c.value}`).join(', ')).join(' ; ');
          return <span key={i} title={t('Restriction {ids}', { ids: `${r.id} (${why})` })}><OsBadge text={carrierLabel(h.carrier)} color="red" secondary /></span>;
        })}
      </span>
    );
  };

  // Results grouped by item, stock locations sorted by available quantity.
  const byItem = useMemo(() => {
    const m = new Map<string, StockCheckLine[]>();
    (result?.stocks ?? []).forEach((s) => m.set(s.itemId ?? '—', [...(m.get(s.itemId ?? '—') ?? []), s]));
    m.forEach((list) => list.sort((a, b) => b.quantity - a.quantity));
    return [...m.entries()];
  }, [result]);
  const asked = split(itemText);
  const missing = result ? asked.filter((id) => !byItem.some(([itemId]) => itemId === id)) : [];

  return (
    <div className="os-col">
      <form className="os-card os-col" style={{ gap: 12 }} onSubmit={run}>
        <div>
          <h2 className="os-title-m" style={{ margin: 0 }}>{t('Stock test')}</h2>
          <p className="os-label-s t-secondary" style={{ margin: '4px 0 0' }}>
            {t('Stock of items per stock location with a OneStock stock query, and the detail of the calculation (raw stock, buffers, reservations, dispositions).')}
          </p>
        </div>
        {source.mode !== 'dynamic' && <OsAlert color="orange">{t('The stock test is only available with the dynamic data source.')}</OsAlert>}
        <div className="os-form">
          <OsField label={t('Stock query (request_name)')} htmlFor="st-req" hint={t('Name of the stock query in OneStock, e.g. the one used by the delivery promise.')}>
            <input id="st-req" className="os-input" list="st-req-list" value={requestName} onChange={(e) => setRequestName(e.target.value)} required />
            <datalist id="st-req-list">{history.map((h) => <option key={h} value={h} />)}</datalist>
          </OsField>
          <OsField label={t('Items')} htmlFor="st-items" hint={t('One or more IDs, separated by commas or spaces (50 max).')}>
            <input id="st-items" className="os-input" list="st-item-list" value={itemText} onChange={(e) => setItemText(e.target.value)} required />
            <datalist id="st-item-list">{items.slice(0, 500).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</datalist>
          </OsField>
          <OsField label={t('Stock locations (optional)')} htmlFor="st-eps" hint={t('Empty: every stock location of the query.')}>
            <input id="st-eps" className="os-input" value={endpointText} placeholder="store_paris_2, warehouse_lyon" onChange={(e) => setEndpointText(e.target.value)} />
          </OsField>
          <div><OsButton type="submit" icon="search" disabled={busy || source.mode !== 'dynamic'}>{t('Test the stock')}</OsButton></div>
        </div>
      </form>

      {busy && <OsLoading text={t('Reading the stock')} />}
      {error && <OsAlert color="red">{error}</OsAlert>}
      {result && !result.withDetails && (
        <OsAlert color="orange">{t('OneStock did not return the calculation details for this request: only the available quantities are shown.')}</OsAlert>
      )}
      {result && missing.length > 0 && (
        <OsAlert color="orange">{t('No stock line for {items} with this query: no stock location of the query holds these items.', { items: missing.join(', ') })}</OsAlert>
      )}

      {byItem.map(([itemId, lines]) => {
        const total = lines.reduce((n, l) => n + l.quantity, 0);
        return (
          <section key={itemId} className="os-card flush" aria-label={itemId}>
            <div className="res-head">
              <div className="res-head-main">
                <h3 className="os-title-s" style={{ margin: 0 }}>{itemName.get(itemId) ?? itemId}</h3>
                <span className="os-body-s t-secondary">{itemId} · {t('Query {name}', { name: result!.requestName })}</span>
                {deliveryLine(itemId)}
              </div>
              <dl className="res-amounts"><dt className="total">{t('Available')}</dt><dd className="total t-num">{num(total)}</dd></dl>
            </div>
            <div className="os-table-wrap">
              <table className="os-table">
                <thead>
                  <tr>
                    <th>{t('Stock location')}</th>
                    <th>{t('Stock type')}</th>
                    <th className="r">{t('Raw stock')}</th>
                    <th className="r">{t('Buffer')}</th>
                    <th className="r">{t('Reserved')}</th>
                    <th className="r">{t('Dispositions')}</th>
                    <th className="r">{t('Available')}</th>
                    <th>{t('Calculation')}</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((s, i) => {
                    const buffer = s.buffers.reduce((n, b) => n + b.applied, 0);
                    const reserved = (s.endpointReservation ?? 0) + (s.globalReservation ?? 0);
                    const disposed = s.dispositions.reduce((n, d) => n + d.quantity, 0);
                    return (
                      <tr key={`${s.endpointId}-${s.type}-${i}`}>
                        <td>
                          <div className="res-item">
                            <span className="os-body-l">{(s.endpointId && result!.endpointNames[s.endpointId]) || s.endpointId || t('All stock locations')}</span>
                            {s.endpointId && result!.endpointNames[s.endpointId] && <span className="os-body-s t-secondary">{s.endpointId}</span>}
                          </div>
                        </td>
                        <td>
                          {s.type ?? '—'}
                          {s.etaStart ? <div className="os-body-s t-secondary">{t('ETA {date}', { date: dateTime(new Date(s.etaStart * 1000)) })}</div> : null}
                        </td>
                        <td className="r t-num">{s.rawStock === null ? '—' : num(s.rawStock)}</td>
                        <td className="r t-num" title={s.buffers.map((b) => `${b.level}${b.type ? ` (${b.type})` : ''}: ${b.applied}`).join('\n') || undefined}>
                          {s.rawStock === null ? '—' : buffer ? <span className="t-orange">{num(buffer)}</span> : 0}
                        </td>
                        <td className="r t-num" title={s.rawStock === null ? undefined : `${t('Stock location')}: ${s.endpointReservation ?? 0} · ${t('Global')}: ${s.globalReservation ?? 0}`}>
                          {s.rawStock === null ? '—' : reserved ? <span className="t-orange">{num(reserved)}</span> : 0}
                        </td>
                        <td className="r t-num" title={s.dispositions.map((d) => `${d.name}: ${d.quantity}`).join('\n') || undefined}>
                          {s.rawStock === null ? '—' : disposed ? <span className="t-orange">{num(disposed)}</span> : 0}
                        </td>
                        <td className="r">
                          <OsBadge text={num(s.quantity)} color={s.quantity > 0 ? 'green' : 'red'} />
                        </td>
                        <td className="os-body-s t-secondary">{explain(s) ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
};
