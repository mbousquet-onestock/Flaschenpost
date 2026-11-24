import React, { useMemo, useState } from 'react';
import { Dataset, OrchestrationConfig } from '../types';
import { GroupedResult, simulate, SimulationResult } from '../services/simulation';
import { OsAlert, OsBadge, OsButton, OsIcon } from './os';
import { money, num, t } from '../services/i18n';
import { carrierLabel, DeliveryIssue } from '../services/delivery';

const eur = (n: number) => money(n);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const MODE_LABEL: Record<string, string> = { cheapest_price: 'Cheapest purchase price', cheapest_price_franco: 'Price and Franco optimisation' };

interface ResultsVisualizationProps {
  strategyName: string;
  config: OrchestrationConfig;
  data: Dataset;
  onNext: () => void;
  launching?: boolean;
}

type SupplierGroup = {
  supplierId: string;
  supplierName: string;
  items: GroupedResult[];
  goods: number;
  shipping: number;
  total: number;
  units: number;
  franco: number | null;
  reached: boolean;
  blocked: boolean;
};

function groupBySupplier(sim: SimulationResult, config: OrchestrationConfig): SupplierGroup[] {
  const map = new Map<string, GroupedResult[]>();
  sim.results.forEach((r) => map.set(r.supplierId, [...(map.get(r.supplierId) ?? []), r]));
  return [...map.entries()].map(([supplierId, items]) => {
    const goods = items.reduce((s, i) => s + i.totalAmount, 0);
    const shipping = items.reduce((s, i) => s + (i.shippingFee || 0), 0);
    const reached = items[0].francoReached;
    return {
      supplierId,
      supplierName: items[0].supplierName,
      items,
      goods,
      shipping,
      total: goods + shipping,
      units: items.reduce((s, i) => s + i.totalQuantity, 0),
      franco: items[0].franco,
      reached,
      blocked: !reached && config.blockIfFrancoNotMet,
    };
  });
}

async function exportResults(groups: SupplierGroup[], strategyName: string) {
  const X = await import('xlsx');
  const rows: (string | number)[][] = [['supplier_id', 'supplier_name', 'sku', 'item_name', 'quantity', 'unit_price', 'amount', 'franco_status', 'orders']];
  groups.forEach((g) => {
    const status = g.blocked ? 'blocked' : g.reached ? 'reached' : 'below_franco';
    g.items.forEach((i) =>
      rows.push([g.supplierId, g.supplierName, i.sku, i.productName, i.totalQuantity, i.unitPrice, Math.round(i.totalAmount * 100) / 100, status,
        [...new Set(i.orderLines.map((l) => l.orderId))].join(', ')]),
    );
    if (g.shipping) rows.push([g.supplierId, g.supplierName, '', 'shipping_fee', '', '', g.shipping, status, '']);
  });
  const ws = X.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 16 }, { wch: 28 }, { wch: 20 }, { wch: 36 }, { wch: 9 }, { wch: 11 }, { wch: 12 }, { wch: 13 }, { wch: 40 }];
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, 'Purchase lines');
  X.writeFile(wb, `${(strategyName || 'simulation').replace(/[^\w-]+/g, '_')}.xlsx`, { compression: true });
}

/** Franco status, progress bar towards the franco and amounts of a supplier. */
const SupplierHeader: React.FC<{ g: SupplierGroup; sim: SimulationResult; open: boolean; onToggle: () => void }> = ({ g, sim, open, onToggle }) => {
  const ship = sim.shipping[g.supplierId];
  const shipDetail = !ship
    ? ''
    : ship.mode === 'fixed'
      ? t('Fixed fee per order')
      : ship.mode === 'weight'
        ? t('{rate} / kg × {kg} kg', { rate: eur(ship.rate), kg: num(ship.basis) })
        : ship.mode === 'quantity'
          ? t('{rate} / unit × {units} units', { rate: eur(ship.rate), units: num(ship.basis) })
          : t('No shipping fee defined for this supplier');
  const ratio = g.franco ? Math.min(1, g.goods / g.franco) : 1;
  const status = g.blocked ? (
    <OsBadge text={t('Blocked')} color="red" icon="close" />
  ) : g.franco === null ? (
    <OsBadge text={t('No franco defined')} color="grey" />
  ) : g.reached ? (
    <OsBadge text={t('Franco reached')} color="green" icon="check" />
  ) : (
    <OsBadge text={t('Below Franco')} color="orange" />
  );

  return (
    <div className="res-head">
      <div className="res-head-main">
        <div className="os-row" style={{ gap: 8 }}>
          <OsButton kind="tertiary" round icon={open ? 'chevron-down' : 'chevron-right'} aria-expanded={open}
            aria-label={open ? t('Hide the items') : t('Show the items')} title={open ? t('Hide the items') : t('Show the items')} onClick={onToggle} />
          <h3 className="os-title-s" style={{ margin: 0 }}>{g.supplierName}</h3>
          {status}
        </div>
        <span className="os-label-s t-secondary">
          {t('{lines} item(s) · {units} unit(s)', { lines: g.items.length, units: num(g.units) })}
        </span>
        {g.franco !== null && (
          <div className="res-franco">
            <div className={`res-bar${g.reached ? ' ok' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}>
              <span style={{ width: `${ratio * 100}%` }} />
            </div>
            <span className="os-body-s t-secondary">
              {g.reached
                ? t('Franco {amount} reached', { amount: eur(g.franco) })
                : t('{missing} missing to reach the franco of {amount}', { missing: eur(g.franco - g.goods), amount: eur(g.franco) })}
            </span>
          </div>
        )}
      </div>
      <dl className="res-amounts">
        <dt>{t('Goods')}</dt>
        <dd className="t-num">{eur(g.goods)}</dd>
        {ship && (
          <>
            <dt>
              <span className="os-row t-orange" style={{ gap: 4, flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                <OsIcon icon="truck" size="xs" />
                {t('Shipping fee')}
              </span>
              <span className="os-body-s t-secondary">{shipDetail}</span>
            </dt>
            <dd className="t-num">{ship.mode ? eur(g.shipping) : t('Not defined')}</dd>
          </>
        )}
        <dt className="total">{t('Total')}</dt>
        <dd className="total t-num">{g.blocked ? <s>{eur(g.total)}</s> : eur(g.total)}</dd>
      </dl>
      {ship && ship.missingWeights.length > 0 && (
        <span className="os-body-s t-orange res-note">
          {t('No weight for {skus}: counted as 0 kg', { skus: ship.missingWeights.slice(0, 5).join(', ') + (ship.missingWeights.length > 5 ? '…' : '') })}
        </span>
      )}
    </div>
  );
};

/** Orders whose planned carrier is forbidden for some items (delivery restrictions), with the proposal for each. */
const DeliveryIssues: React.FC<{ issues: DeliveryIssue[] }> = ({ issues }) => {
  const [open, setOpen] = useState(issues.length <= 10);
  const counts = {
    switch: issues.filter((i) => i.proposal.type === 'switch').length,
    split: issues.filter((i) => i.proposal.type === 'split').length,
    none: issues.filter((i) => i.proposal.type === 'none').length,
  };
  return (
    <section className="os-card flush" aria-label={t('Delivery restrictions')}>
      <div className="res-head">
        <div className="res-head-main">
          <div className="os-row" style={{ gap: 8 }}>
            <OsButton kind="tertiary" round icon={open ? 'chevron-down' : 'chevron-right'} aria-expanded={open}
              aria-label={open ? t('Hide the items') : t('Show the items')} onClick={() => setOpen(!open)} />
            <h3 className="os-title-s" style={{ margin: 0 }}>{t('Delivery restrictions')}</h3>
            <OsBadge text={t('{count} order(s)', { count: issues.length })} color={counts.none ? 'red' : 'orange'} icon="warning-outline" />
          </div>
          <span className="os-label-s t-secondary">
            {t('The planned carrier of these orders is forbidden for some of their items.')}{' '}
            {t('{switch} with another carrier, {split} in several parcels, {none} without an allowed carrier.', counts)}
          </span>
        </div>
      </div>
      {open && (
        <div className="os-table-wrap">
          <table className="os-table">
            <thead>
              <tr>
                <th>{t('Customer order')}</th>
                <th>{t('Planned carrier')}</th>
                <th>{t('Forbidden items')}</th>
                <th>{t('Proposal')}</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((i) => (
                <tr key={i.orderId}>
                  <td className="os-body-l">{i.orderId}</td>
                  <td><span className="t-red">{carrierLabel(i.planned)}</span></td>
                  <td>
                    {i.items.filter((x) => x.forbidden).map((x) => (
                      <div key={x.sku} title={t('Restriction {ids}', { ids: x.restrictionIds.join(', ') })}>{x.sku}</div>
                    ))}
                  </td>
                  <td>
                    {i.proposal.type === 'switch' && (
                      <OsBadge text={t('Ship the whole order with {carrier}', { carrier: carrierLabel(i.proposal.carrier) })} color="green" icon="truck" />
                    )}
                    {i.proposal.type !== 'switch' && (
                      <div className="os-col" style={{ gap: 4 }}>
                        {i.proposal.parcels.map((p, n) => (
                          <span key={n} className="os-body-s">
                            <OsBadge text={t('Parcel {n}', { n: n + 1 })} color="blue" secondary /> {carrierLabel(p.carrier)} : {p.skus.join(', ')}
                          </span>
                        ))}
                        {i.proposal.type === 'none' && (
                          <OsBadge text={t('No allowed carrier for {skus}', { skus: i.proposal.skus.join(', ') })} color="red" icon="close" />
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export const ResultsVisualization: React.FC<ResultsVisualizationProps> = ({ strategyName, config, data, onNext, launching }) => {
  const sim = useMemo(() => simulate(data, config), [data, config]);
  const groups = useMemo(() => groupBySupplier(sim, config), [sim, config]);
  const { results, totalPurchaseAmount } = sim;
  const fulfillmentRate = pct(sim.matchedLines, sim.totalLines);
  const pricedRate = pct(sim.skuCount - sim.unpricedSkus.length, sim.skuCount);
  const ordered = groups.filter((g) => !g.blocked);
  const shippingTotal = ordered.reduce((s, g) => s + g.shipping, 0);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setClosed((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const allClosed = groups.length > 0 && groups.every((g) => closed.has(g.supplierId));

  return (
    <div className="os-col">
      <div className="os-card os-col" style={{ gap: 16 }}>
        <div className="os-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 className="os-title-m" style={{ margin: 0 }}>{t('Consolidated purchase orders')}</h2>
            <p className="os-label-s t-secondary" style={{ margin: '4px 0 0' }}>
              {t(MODE_LABEL[config.consolidationMode] ?? config.consolidationMode)}
              {config.blockIfFrancoNotMet ? ` · ${t('Blocking mode')}` : ''}
            </p>
          </div>
          <OsButton kind="secondary" icon="download" disabled={!results.length} onClick={() => exportResults(groups, strategyName)}>{t('Export XLSX')}</OsButton>
        </div>
        <div className="res-kpis">
          <div className="os-kpi main"><span className="l">{t('Total purchase')}</span><span className="v">{eur(totalPurchaseAmount)}</span>
            {shippingTotal > 0 && <span className="os-body-s t-secondary">{t('incl. {amount} shipping', { amount: eur(shippingTotal) })}</span>}
          </div>
          <div className="os-kpi"><span className="l">{t('Suppliers')}</span><span className="v">{ordered.length}{ordered.length !== groups.length ? ` / ${groups.length}` : ''}</span></div>
          <div className="os-kpi"><span className="l">{t('Orders')}</span><span className="v">{sim.matchedOrders}</span></div>
          <div className="os-kpi"><span className="l">{t('Matched order lines ({rate} %)', { rate: fulfillmentRate })}</span><span className="v">{sim.matchedLines}</span></div>
          <div className="os-kpi"><span className="l">{t('Priced SKUs ({rate} %)', { rate: pricedRate })}</span><span className="v">{sim.skuCount - sim.unpricedSkus.length} / {sim.skuCount}</span></div>
        </div>
        {config.consolidationMode === 'cheapest_price_franco' &&
          (sim.reassigned === 0 ? (
            <OsAlert>{t('Franco optimisation: the cheapest unit prices are already the lowest total.')}</OsAlert>
          ) : config.blockIfFrancoNotMet ? (
            <OsAlert color="green">{t('Franco optimisation: {count} SKU(s) moved to another supplier to reach the francos.', { count: sim.reassigned })}</OsAlert>
          ) : (
            <OsAlert color="green">
              {t('Franco optimisation: {count} SKU(s) moved to another supplier, saving {amount} compared with the cheapest unit prices ({baseline}).', {
                count: sim.reassigned,
                amount: eur(sim.baselineAmount - totalPurchaseAmount),
                baseline: eur(sim.baselineAmount),
              })}
            </OsAlert>
          ))}
        {sim.unpricedSkus.length > 0 && (
          <OsAlert color="orange">
            {t('{count} SKU(s) have no supplier price and are left out: {skus}', { count: sim.unpricedSkus.length, skus: sim.unpricedSkus.slice(0, 8).join(', ') })}
            {sim.unpricedSkus.length > 8 ? '…' : ''}
          </OsAlert>
        )}
        {data.truncated && <OsAlert color="orange">{t('Only the first 2,000 orders were loaded.')}</OsAlert>}
        {config.blockIfFrancoNotMet && groups.some((g) => g.blocked) && (
          <OsAlert color="orange">{t('Blocking mode is active: orders whose supplier does not reach the Franco are excluded.')}</OsAlert>
        )}
      </div>

      {sim.deliveryIssues.length > 0 && <DeliveryIssues issues={sim.deliveryIssues} />}

      {results.length === 0 && <div className="os-card os-empty">{t('No order matches the selected criteria.')}</div>}

      {groups.length > 1 && (
        <div className="os-row" style={{ justifyContent: 'flex-end' }}>
          <OsButton kind="tertiary" color="brand" icon={allClosed ? 'chevron-down' : 'chevron-right'}
            onClick={() => setClosed(allClosed ? new Set() : new Set(groups.map((g) => g.supplierId)))}>
            {allClosed ? t('Expand all') : t('Collapse all')}
          </OsButton>
        </div>
      )}
      {groups.map((g) => (
        <section key={g.supplierId} className={`os-card flush res-supplier${g.blocked ? ' blocked' : ''}`} aria-label={g.supplierName}>
          <SupplierHeader g={g} sim={sim} open={!closed.has(g.supplierId)} onToggle={() => toggle(g.supplierId)} />
          {!closed.has(g.supplierId) && <div className="os-table-wrap">
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t('Item')}</th>
                  <th className="r">{t('Quantity')}</th>
                  <th className="r">{t('Unit price')}</th>
                  <th className="r">{t('Amount')}</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((r) => (
                  <tr key={r.sku}>
                    <td>
                      <div className="res-item">
                        <span className="os-body-l" title={r.productName}>{r.productName}</span>
                        <span className="os-body-s t-secondary">{r.sku}</span>
                      </div>
                      {r.cheapest && (
                        <span className="os-badge secondary" style={{ marginTop: 4 }}
                          title={t('Cheapest: {supplier} at {price}, moved for the franco', { supplier: r.cheapest.supplierName, price: eur(r.cheapest.unitPrice) })}>
                          {t('Moved for the franco · cheapest {price} at {supplier}', { price: eur(r.cheapest.unitPrice), supplier: r.cheapest.supplierName })}
                        </span>
                      )}
                    </td>
                    <td className="r t-num">{num(r.totalQuantity)}</td>
                    <td className="r t-num">{eur(r.unitPrice)}</td>
                    <td className="r t-num">{eur(r.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </section>
      ))}

      <div className="os-card os-row" style={{ justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h3 className="os-title-s" style={{ margin: 0 }}>{t('Finalise orchestration')}</h3>
          <p className="os-label-s t-secondary" style={{ margin: '4px 0 0' }}>
            {strategyName ? `${strategyName} · ` : ''}{t('{orders} orders · {lines} order lines ({rate} %) · {purchase} purchase lines', { orders: sim.matchedOrders, lines: sim.matchedLines, rate: fulfillmentRate, purchase: results.length })}
          </p>
        </div>
        <OsButton icon="play" onClick={onNext} disabled={launching}>{launching ? t('Launching…') : t('Launch')}</OsButton>
      </div>
    </div>
  );
};
