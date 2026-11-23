import React, { useMemo } from 'react';
import { Dataset, OrchestrationConfig } from '../types';
import { GroupedResult, simulate } from '../services/simulation';
import { OsAlert, OsBadge, OsButton, OsIcon } from './os';

const eur = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'EUR' });
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const MODE_LABEL: Record<string, string> = { cheapest_price: 'Cheapest purchase price', cheapest_price_franco: 'Price and Franco optimisation' };

interface ResultsVisualizationProps {
  strategyName: string;
  config: OrchestrationConfig;
  data: Dataset;
  onNext: () => void;
}

export const ResultsVisualization: React.FC<ResultsVisualizationProps> = ({ strategyName, config, data, onNext }) => {
  const sim = useMemo(() => simulate(data, config), [data, config]);
  const { results, totalPurchaseAmount } = sim;
  const fulfillmentRate = pct(sim.matchedLines, sim.totalLines);
  const pricedRate = pct(sim.skuCount - sim.unpricedSkus.length, sim.skuCount);

  const groups = Object.entries(
    results.reduce((acc: Record<string, GroupedResult[]>, r: GroupedResult) => {
      (acc[r.supplierId] ||= []).push(r);
      return acc;
    }, {} as Record<string, GroupedResult[]>)
  );

  return (
    <div className="os-col">
      <div className="os-card os-col" style={{ gap: 16 }}>
        <div className="os-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 className="os-title-m" style={{ margin: 0 }}>Consolidated purchase orders</h2>
            <p className="os-label-s t-secondary" style={{ margin: '4px 0 0' }}>
              Grouped by SKU and supplier · {MODE_LABEL[config.consolidationMode] ?? config.consolidationMode}
            </p>
          </div>
          <OsButton kind="secondary" icon="download">Export XLSX</OsButton>
        </div>
        <div className="os-row" style={{ gap: 24, alignItems: 'stretch' }}>
          <div className="os-kpi"><span className="l">Total purchase</span><span className="v">{eur(totalPurchaseAmount)}</span></div>
          <div className="os-sep-v" />
          <div className="os-kpi"><span className="l">Matched order lines ({fulfillmentRate} %)</span><span className="v">{sim.matchedLines}</span></div>
          <div className="os-sep-v" />
          <div className="os-kpi"><span className="l">Orders</span><span className="v">{sim.matchedOrders}</span></div>
          <div className="os-sep-v" />
          <div className="os-kpi"><span className="l">Priced SKUs ({pricedRate} %)</span><span className="v">{sim.skuCount - sim.unpricedSkus.length} / {sim.skuCount}</span></div>
        </div>
        {sim.unpricedSkus.length > 0 && (
          <OsAlert color="orange">
            {sim.unpricedSkus.length} SKU(s) have no supplier price and are left out: {sim.unpricedSkus.slice(0, 8).join(', ')}
            {sim.unpricedSkus.length > 8 ? '…' : ''}
          </OsAlert>
        )}
        {data.truncated && <OsAlert color="orange">Only the first 2,000 orders were loaded.</OsAlert>}
        {config.blockIfFrancoNotMet && (
          <OsAlert color="orange">Blocking mode is active: orders whose supplier does not reach the Franco are excluded.</OsAlert>
        )}
      </div>

      <div className="os-card flush">
        <div className="os-table-wrap">
          <table className="os-table">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>SKU / Product</th>
                <th className="r">Quantity</th>
                <th className="r">Unit price</th>
                <th className="r">Total amount</th>
                <th className="r">Franco</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(([supplierId, items]) => {
                const shippingFee = items.reduce((sum, i) => sum + (i.shippingFee || 0), 0);
                const totalQuantity = items.reduce((sum, i) => sum + i.totalQuantity, 0);
                const totalAmount = items.reduce((sum, i) => sum + i.totalAmount, 0) + shippingFee;
                const shippingPerUnit = totalQuantity > 0 ? shippingFee / totalQuantity : 0;
                const reached = items[0].francoReached;
                const noFranco = items[0].franco === null;

                return (
                  <React.Fragment key={supplierId}>
                    {items.map((r, idx) => (
                      <tr key={`${r.supplierId}-${r.sku}`} className={reached ? undefined : 'muted'}>
                        <td className="os-body-l" style={{ whiteSpace: 'nowrap' }}>{idx === 0 ? r.supplierName : ''}</td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span className="os-body-m" style={{ color: reached ? 'var(--text-brand)' : undefined }}>{r.sku}</span>
                            <span style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.productName}</span>
                          </div>
                        </td>
                        <td className="r t-num">{r.totalQuantity}</td>
                        <td className="r t-num">{eur(r.unitPrice)}</td>
                        <td className="r t-num">{eur(r.totalAmount)}</td>
                        <td className="r">
                          {r.francoReached ? (
                            <OsBadge text="Reached" color="green" icon="check" />
                          ) : config.blockIfFrancoNotMet ? (
                            <OsBadge text="Blocked" color="red" icon="close" />
                          ) : (
                            <OsBadge text="Below Franco" color="grey" />
                          )}
                        </td>
                      </tr>
                    ))}
                    {shippingFee > 0 && (
                      <tr className="fee">
                        <td />
                        <td>
                          <span className="os-row t-orange" style={{ flexWrap: 'nowrap' }}>
                            <OsIcon icon="truck" size="s" />
                            <span className="os-body-l">Shipping fee</span>
                          </span>
                        </td>
                        <td className="r t-num t-secondary">{shippingPerUnit > 0 && `${eur(shippingPerUnit)} / unit`}</td>
                        <td />
                        <td className="r t-num">{eur(shippingFee)}</td>
                        <td className="r"><OsBadge text="Fee applied" color="orange" /></td>
                      </tr>
                    )}
                    <tr className="subtotal">
                      <td style={{ whiteSpace: 'nowrap' }}>Total {items[0].supplierName}</td>
                      <td className="os-body-s t-secondary">
                        {shippingFee > 0 ? `Incl. ${eur(shippingPerUnit)} shipping per unit` : noFranco ? 'No franco defined' : reached ? `Franco ${eur(items[0].franco!)} reached` : `Franco ${eur(items[0].franco!)}`}
                      </td>
                      <td className="r t-num">{totalQuantity}</td>
                      <td />
                      <td className="r t-num">{eur(totalAmount)}</td>
                      <td className="r">
                        <OsBadge text={reached ? 'Franco OK' : 'Below Franco'} color={reached ? 'green' : 'orange'} />
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {results.length === 0 && <div className="os-empty">No order matches the selected criteria.</div>}
        </div>
      </div>

      <div className="os-card os-row" style={{ justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h3 className="os-title-s" style={{ margin: 0 }}>Finalise orchestration</h3>
          <p className="os-label-s t-secondary" style={{ margin: '4px 0 0' }}>
            {strategyName ? `${strategyName} · ` : ''}{sim.matchedOrders} orders · {sim.matchedLines} order lines ({fulfillmentRate} %) · {results.length} purchase lines
          </p>
        </div>
        <OsButton icon="play" onClick={onNext}>Launch</OsButton>
      </div>
    </div>
  );
};
