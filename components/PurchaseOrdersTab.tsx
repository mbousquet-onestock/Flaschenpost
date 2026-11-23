// Supplier purchase orders created by launching strategies: list, detail and Excel export.
import React, { useEffect, useMemo, useState } from 'react';
import type { PurchaseOrder } from '../types';
import type { DataSource } from '../services/dataSource';
import { dateTime, money, num, t } from '../services/i18n';
import { OsAlert, OsBadge, OsButton, OsField, OsLoading } from './os';

const pad = (n: number) => String(n).padStart(2, '0');
/** Local calendar day (YYYY-MM-DD) of an ISO date, to compare with date inputs. */
const day = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const norm = (s: string) => s.trim().toLowerCase();

type Filters = { supplier: string; item: string; order: string; from: string; to: string };
const NO_FILTER: Filters = { supplier: '', item: '', order: '', from: '', to: '' };

async function exportOrder(o: PurchaseOrder) {
  const X = await import('xlsx');
  const sheet = X.utils.aoa_to_sheet([
    [t('Purchase order'), o.id],
    [t('Supplier'), `${o.supplierName} (${o.supplierId})`],
    [t('Date'), dateTime(new Date(o.createdAt))],
    [t('Strategy'), o.strategyName ?? ''],
    [],
    ['sku', 'item_name', 'quantity', 'unit_price', 'amount', 'orders'],
    ...o.lines.map((l) => [l.sku, l.productName ?? '', l.quantity, l.unitPrice, l.amount, [...new Set(l.orderLines.map((x) => x.orderId))].join(', ')]),
    [],
    [t('Goods amount'), '', '', '', o.goodsAmount],
    [t('Shipping fee'), '', '', '', o.shippingFee],
    [t('Total'), '', '', '', o.total],
  ]);
  sheet['!cols'] = [{ wch: 22 }, { wch: 36 }, { wch: 10 }, { wch: 11 }, { wch: 12 }, { wch: 40 }];
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, sheet, 'Purchase order');
  X.writeFile(wb, `${o.id}.xlsx`, { compression: true });
}

const StatusBadge: React.FC<{ o: PurchaseOrder }> = ({ o }) => {
  const u = o.statusUpdate;
  if (!u) return <OsBadge text={t('No status change')} color="grey" />;
  const total = u.updated + u.failed.length;
  if (!u.failed.length) return <OsBadge text={t('{count} line(s) set to {status}', { count: u.updated, status: u.target })} color="green" icon="check" />;
  return <OsBadge text={t('{failed} of {total} line(s) not updated', { failed: u.failed.length, total })} color={u.updated ? 'orange' : 'red'} icon="warning-outline" />;
};

export const PurchaseOrdersTab: React.FC<{ source: DataSource; notice?: string | null }> = ({ source, notice }) => {
  const [orders, setOrders] = useState<PurchaseOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [f, setF] = useState<Filters>(NO_FILTER);

  const suppliers = useMemo(
    () => [...new Map((orders ?? []).map((o) => [o.supplierId, o.supplierName])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [orders],
  );

  /** Purchase orders matching every filter: supplier, item (SKU or name), customer order, creation date range. */
  const shown = useMemo(() => {
    const item = norm(f.item);
    const order = norm(f.order);
    return (orders ?? []).filter((o) => {
      if (f.supplier && o.supplierId !== f.supplier) return false;
      if (f.from && day(o.createdAt) < f.from) return false;
      if (f.to && day(o.createdAt) > f.to) return false;
      if (item && !o.lines.some((l) => norm(l.sku).includes(item) || norm(l.productName ?? '').includes(item))) return false;
      if (order && !o.lines.some((l) => l.orderLines.some((x) => norm(x.orderId).includes(order)))) return false;
      return true;
    });
  }, [orders, f]);
  const filtered = Object.values(f).some(Boolean);

  useEffect(() => {
    source.listPurchaseOrders().then(setOrders, (e: Error) => setError(e.message));
  }, [source]);

  if (!orders && !error) return <OsLoading text={t('Loading supplier orders')} />;

  return (
    <div className="os-col">
      {notice && <OsAlert color="green">{notice}</OsAlert>}
      {error && <OsAlert color="red">{error}</OsAlert>}
      <div className="os-card flush">
        <div className="os-card-head">
          <div>
            <h2 className="os-title-m" style={{ margin: 0 }}>{t('Supplier orders')}</h2>
            <p className="os-label-s t-secondary" style={{ margin: '4px 0 0' }}>{t('Purchase orders created when strategies are launched, one per supplier.')}</p>
          </div>
        </div>
        <div className="os-row" style={{ alignItems: 'flex-end', gap: 12, padding: 16, borderBottom: '1px solid var(--border-primary)' }} role="search">
          <OsField label={t('Supplier')} htmlFor="po-supplier">
            <select id="po-supplier" className="os-input" style={{ width: 220 }} value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })}>
              <option value="">{t('All suppliers')}</option>
              {suppliers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </OsField>
          <OsField label={t('Item')} htmlFor="po-item">
            <input id="po-item" className="os-input" style={{ width: 200 }} placeholder={t('SKU or name')} value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })} />
          </OsField>
          <OsField label={t('Customer order')} htmlFor="po-order">
            <input id="po-order" className="os-input" style={{ width: 180 }} placeholder={t('Order ID')} value={f.order} onChange={(e) => setF({ ...f, order: e.target.value })} />
          </OsField>
          <OsField label={t('From')} htmlFor="po-from">
            <input id="po-from" type="date" className="os-input" style={{ width: 160 }} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
          </OsField>
          <OsField label={t('To')} htmlFor="po-to">
            <input id="po-to" type="date" className="os-input" style={{ width: 160 }} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
          </OsField>
          {filtered && <OsButton kind="tertiary" color="brand" icon="close" onClick={() => setF(NO_FILTER)}>{t('Clear filters')}</OsButton>}
          <span className="os-label-s t-secondary" style={{ marginLeft: 'auto', paddingBottom: 8 }}>
            {t('{shown} of {total} order(s)', { shown: shown.length, total: orders?.length ?? 0 })}
          </span>
        </div>
        <div className="os-table-wrap">
          <table className="os-table">
            <thead>
              <tr>
                <th style={{ width: 48 }} aria-label={t('Details')} />
                <th>{t('Purchase order')}</th>
                <th>{t('Date')}</th>
                <th>{t('Supplier')}</th>
                <th>{t('Strategy')}</th>
                <th className="r">{t('Quantity')}</th>
                <th className="r">{t('Total')}</th>
                <th>{t('Order lines')}</th>
                <th className="r" aria-label={t('Actions')} />
              </tr>
            </thead>
            <tbody>
              {shown.map((o) => {
                const expanded = open === o.id;
                return (
                  <React.Fragment key={o.id}>
                    <tr>
                      <td>
                        <OsButton kind="tertiary" round icon={expanded ? 'chevron-down' : 'chevron-right'} aria-expanded={expanded}
                          aria-label={t('Details')} onClick={() => setOpen(expanded ? null : o.id)} />
                      </td>
                      <td className="os-body-l" style={{ whiteSpace: 'nowrap' }}>{o.id}</td>
                      <td className="t-num" style={{ whiteSpace: 'nowrap' }}>{dateTime(new Date(o.createdAt))}</td>
                      <td>{o.supplierName}</td>
                      <td>{o.strategyName ?? '—'}</td>
                      <td className="r t-num">{num(o.lines.reduce((n, l) => n + l.quantity, 0))}</td>
                      <td className="r t-num">{money(o.total)}</td>
                      <td><StatusBadge o={o} /></td>
                      <td className="r">
                        <OsButton kind="tertiary" round icon="download" title={t('Export')} aria-label={t('Export')} onClick={() => exportOrder(o)} />
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="detail">
                        <td colSpan={9}>
                          <div className="os-card flush">
                            <table className="os-table">
                              <thead>
                                <tr>
                                  <th>{t('SKU / Product')}</th>
                                  <th>{t('Orders')}</th>
                                  <th className="r">{t('Quantity')}</th>
                                  <th className="r">{t('Unit price')}</th>
                                  <th className="r">{t('Total amount')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {o.lines.map((l) => (
                                  <tr key={l.sku}>
                                    <td>
                                      <div className="os-body-m">{l.sku}</div>
                                      <div>{l.productName}</div>
                                    </td>
                                    <td className="os-body-s">{[...new Set(l.orderLines.map((x) => x.orderId))].join(', ')}</td>
                                    <td className="r t-num">{num(l.quantity)}</td>
                                    <td className="r t-num">{money(l.unitPrice)}</td>
                                    <td className="r t-num">{money(l.amount)}</td>
                                  </tr>
                                ))}
                                <tr className="subtotal">
                                  <td colSpan={4}>{t('Shipping fee')}</td>
                                  <td className="r t-num">{money(o.shippingFee)}</td>
                                </tr>
                                <tr className="subtotal">
                                  <td colSpan={4}>{t('Total')}</td>
                                  <td className="r t-num">{money(o.total)}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                          {o.statusUpdate && o.statusUpdate.failed.length > 0 && (
                            <div style={{ marginTop: 12 }}>
                              <OsAlert color="red">
                                {t('Order lines not moved to {status}:', { status: o.statusUpdate.target })}
                                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                                  {o.statusUpdate.failed.slice(0, 20).map((f) => (
                                    <li key={f.lineId}>{f.orderId} / {f.lineId}: {f.error}</li>
                                  ))}
                                </ul>
                              </OsAlert>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {orders && orders.length === 0 && (
                <tr><td colSpan={9} className="os-empty">{t('No supplier order yet. Launch a strategy to create them.')}</td></tr>
              )}
              {orders && orders.length > 0 && shown.length === 0 && (
                <tr><td colSpan={9} className="os-empty">{t('No supplier order matches the filters.')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
