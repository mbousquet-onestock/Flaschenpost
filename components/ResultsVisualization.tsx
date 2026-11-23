
import React, { useMemo } from 'react';
import { MOCK_ORDERS, MOCK_PRODUCTS, MOCK_SUPPLIERS, SHIPPING_FEE } from '../constants';
import { OrchestrationConfig, Product, Supplier } from '../types';
import { OsAlert, OsBadge, OsButton, OsIcon } from './os';

const eur = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'EUR' });
const MODE_LABEL: Record<string, string> = { cheapest_price: 'Cheapest purchase price', cheapest_price_franco: 'Price and Franco optimisation' };

interface ResultsVisualizationProps {
  strategyName: string;
  config: OrchestrationConfig;
  onNext: () => void;
}

interface GroupedResult {
  sku: string;
  productName: string;
  supplierName: string;
  supplierId: string;
  totalQuantity: number;
  unitPrice: number;
  totalAmount: number;
  francoReached: boolean;
  franco: number;
  shippingFee?: number;
}

export const ResultsVisualization: React.FC<ResultsVisualizationProps> = ({ strategyName, config, onNext }) => {
  const { results, matchedOrdersCount } = useMemo(() => {
    // 1. Filter orders by selected statuses and rank
    const filteredOrders = MOCK_ORDERS.filter((order: any) => {
      const statusMatch = config.statuses.includes(order.status as any);
      if (!statusMatch) return false;

      if (config.stockPointRank === 'P1') return order.priority === 'P1';
      if (config.stockPointRank === 'P2') return order.priority === 'P1' || order.priority === 'P2';
      return true; // P3 takes all
    });

    const matchedOrdersCount = filteredOrders.length;

    // 1.5 Filter by selected suppliers if any
    const selectedSupplierIds = config.selectedSupplierIds || [];
    
    // 2. Group by SKU
    const skuTotals: Record<string, number> = {};
    filteredOrders.forEach((order: any) => {
      skuTotals[order.sku] = (skuTotals[order.sku] || 0) + order.quantity;
    });

    // 3. Map to suppliers and calculate prices
    const supplierGroups: Record<string, GroupedResult[]> = {};
    
    Object.entries(skuTotals).forEach(([sku, quantity]) => {
      const product = MOCK_PRODUCTS.find((p: Product) => p.sku === sku);
      if (!product) return;

      const supplier = MOCK_SUPPLIERS.find((s: Supplier) => s.id === product.supplierId);
      if (!supplier) return;

      // Filter by selected suppliers if specified
      if (selectedSupplierIds.length > 0 && !selectedSupplierIds.includes(supplier.id)) {
        return;
      }

      // Find the best price based on quantity
      const sortedPrices = [...product.prices].sort((a: any, b: any) => b.quantity - a.quantity);
      const priceTier = sortedPrices.find((p: any) => quantity >= p.quantity) || sortedPrices[sortedPrices.length - 1];
      const unitPrice = priceTier.price;
      const totalAmount = unitPrice * quantity;

      if (!supplierGroups[supplier.id]) {
        supplierGroups[supplier.id] = [];
      }

      supplierGroups[supplier.id].push({
        sku,
        productName: product.name,
        supplierName: supplier.name,
        supplierId: supplier.id,
        totalQuantity: quantity,
        unitPrice,
        totalAmount,
        francoReached: false, // Will calculate after grouping all items for this supplier
        franco: supplier.franco
      });
    });

    // 4. Calculate if franco is reached for each supplier
    const finalResults: GroupedResult[] = [];
    Object.values(supplierGroups).forEach((items: GroupedResult[]) => {
      const supplierTotal = items.reduce((sum: number, item: GroupedResult) => sum + item.totalAmount, 0);
      const francoReached = supplierTotal >= items[0].franco;
      
      items.forEach((item: GroupedResult, idx: number) => {
        // Add shipping fee only to the first item of the supplier group for accounting
        const shippingFee = (!francoReached && idx === 0 && !config.blockIfFrancoNotMet) ? SHIPPING_FEE : 0;
        finalResults.push({ ...item, francoReached, shippingFee });
      });
    });

    return { results: finalResults.sort((a, b) => a.supplierName.localeCompare(b.supplierName)), matchedOrdersCount };
  }, [config]);

  const totalPurchaseAmount = useMemo(() => {
    return results.reduce((sum: number, r: GroupedResult) => {
      if (config.blockIfFrancoNotMet && !r.francoReached) return sum;
      return sum + r.totalAmount + (r.shippingFee || 0);
    }, 0);
  }, [results, config.blockIfFrancoNotMet]);

  const fulfillmentRate = Math.round((matchedOrdersCount / MOCK_ORDERS.length) * 100);
  const lineFulfillmentRate = Math.round((results.length / MOCK_PRODUCTS.length) * 100);

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
          <div className="os-kpi"><span className="l">Matched orders ({fulfillmentRate} %)</span><span className="v">{matchedOrdersCount}</span></div>
          <div className="os-sep-v" />
          <div className="os-kpi"><span className="l">Order lines ({lineFulfillmentRate} %)</span><span className="v">{results.length}</span></div>
        </div>
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
                        {shippingFee > 0 ? `Incl. ${eur(shippingPerUnit)} shipping per unit` : reached ? 'Franco reached' : ''}
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
            {strategyName ? `${strategyName} · ` : ''}{matchedOrdersCount} orders ({fulfillmentRate} %) · {results.length} order lines ({lineFulfillmentRate} %)
          </p>
        </div>
        <OsButton icon="play" onClick={onNext}>Launch</OsButton>
      </div>
    </div>
  );
};
