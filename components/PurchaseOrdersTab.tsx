// Supplier purchase orders created by launching strategies: list, detail and Excel export.
import React, { useEffect, useState } from 'react';
import type { PurchaseOrder } from '../types';
import type { DataSource } from '../services/dataSource';
import { dateTime, money, num, t } from '../services/i18n';
import { OsAlert, OsBadge, OsButton, OsLoading } from './os';

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
              {(orders ?? []).map((o) => {
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
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
