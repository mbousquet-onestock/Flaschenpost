
import React, { useMemo } from 'react';
import { MOCK_ORDERS, MOCK_PRODUCTS, MOCK_SUPPLIERS, SHIPPING_FEE } from '../constants';
import { OrchestrationConfig, Product, Supplier } from '../types';

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

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden">
        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-[#00A79D]/10 text-[#00A79D] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">Step 02</span>
              <h2 className="text-xl font-black text-slate-900">Consolidated Purchase Orders</h2>
            </div>
            <p className="text-sm text-slate-500 font-medium">Grouped by SKU and Supplier based on <span className="text-[#00A79D] font-bold">{config.consolidationMode.replace('_', ' ')}</span></p>
            {config.blockIfFrancoNotMet && (
              <p className="text-[10px] text-orange-600 font-black uppercase tracking-widest mt-1 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                Blocking mode active: Orders without Franco are excluded
              </p>
            )}
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Purchase</p>
              <p className="text-xl font-black text-slate-900">{totalPurchaseAmount.toLocaleString('en-US', { style: 'currency', currency: 'EUR' })}</p>
            </div>
            <button className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold bg-white text-slate-600 rounded-xl border border-slate-200 hover:bg-slate-50 transition-all shadow-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Export XLSX
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-400 text-[10px] font-bold uppercase tracking-widest border-b border-slate-100">
              <tr>
                <th className="px-8 py-5">Supplier</th>
                <th className="px-8 py-5">SKU / Product</th>
                <th className="px-8 py-5">Quantity</th>
                <th className="px-8 py-5">Unit Price</th>
                <th className="px-8 py-5">Total Amount</th>
                <th className="px-8 py-5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {Object.entries(
                results.reduce((acc: Record<string, GroupedResult[]>, r: GroupedResult) => {
                  if (!acc[r.supplierId]) acc[r.supplierId] = [];
                  acc[r.supplierId].push(r);
                  return acc;
                }, {} as Record<string, GroupedResult[]>)
              ).map(([supplierId, items]: [string, GroupedResult[]]) => {
                const shippingFee = items.reduce((sum: number, i: GroupedResult) => sum + (i.shippingFee || 0), 0);
                const totalQuantity = items.reduce((sum: number, i: GroupedResult) => sum + i.totalQuantity, 0);
                const totalAmount = items.reduce((sum: number, i: GroupedResult) => sum + i.totalAmount, 0) + shippingFee;
                const shippingPerUnit = totalQuantity > 0 ? shippingFee / totalQuantity : 0;
                
                return (
                  <React.Fragment key={supplierId}>
                    {items.map((result: GroupedResult, idx: number) => (
                      <tr key={`${result.supplierId}-${result.sku}`} className={`transition-colors group ${!result.francoReached ? 'bg-slate-50/50 text-slate-400 opacity-60 grayscale' : 'hover:bg-slate-50'}`}>
                        <td className="px-8 py-4">
                          {idx === 0 && (
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-[10px] ${result.francoReached ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                                {result.supplierName.charAt(result.supplierName.length - 1)}
                              </div>
                              <span className="font-bold">{result.supplierName}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-8 py-4">
                          <div className="flex flex-col">
                            <span className="font-mono font-bold text-[#00A79D] text-xs">{result.sku}</span>
                            <span className="font-medium text-slate-600 truncate max-w-[200px]">{result.productName}</span>
                          </div>
                        </td>
                        <td className="px-8 py-4 font-black text-slate-700">{result.totalQuantity}</td>
                        <td className="px-8 py-4 font-medium">{result.unitPrice.toFixed(2)} €</td>
                        <td className="px-8 py-4 font-black text-slate-900">{result.totalAmount.toLocaleString('en-US', { style: 'currency', currency: 'EUR' })}</td>
                        <td className="px-8 py-4 text-right">
                          {result.francoReached ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black uppercase tracking-tight">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                              Reached
                            </span>
                          ) : (
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tight ${config.blockIfFrancoNotMet ? 'bg-red-100 text-red-600' : 'bg-slate-200 text-slate-500'}`}>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                              {config.blockIfFrancoNotMet ? 'Blocked' : 'Below Franco'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {shippingFee > 0 && (
                      <tr className="bg-orange-50/30 text-orange-600 border-t border-orange-100">
                        <td className="px-8 py-3"></td>
                        <td className="px-8 py-3 font-black text-xs uppercase tracking-widest flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" /></svg>
                          Shipping Fee
                        </td>
                        <td className="px-8 py-3 font-black text-slate-500 text-[10px]">
                          {shippingPerUnit > 0 && (
                            <span className="bg-orange-100 px-2 py-0.5 rounded">
                              {shippingPerUnit.toFixed(2)} € / unit
                            </span>
                          )}
                        </td>
                        <td className="px-8 py-3"></td>
                        <td className="px-8 py-3 font-black">{shippingFee.toLocaleString('en-US', { style: 'currency', currency: 'EUR' })}</td>
                        <td className="px-8 py-3 text-right">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-[10px] font-black uppercase tracking-tight">
                            Fee Applied
                          </span>
                        </td>
                      </tr>
                    )}
                    {/* Supplier Summary Row */}
                    <tr className="bg-slate-100/50 border-t-2 border-slate-200 font-black text-slate-900">
                      <td className="px-8 py-4 text-[10px] uppercase tracking-widest text-slate-400">Total {items[0].supplierName}</td>
                      <td className="px-8 py-4"></td>
                      <td className="px-8 py-4">{totalQuantity}</td>
                      <td className="px-8 py-4 text-xs text-slate-500 font-bold italic">
                        {shippingFee > 0 ? `Incl. ${shippingPerUnit.toFixed(2)}€ ship/unit` : 'Franco Reached'}
                      </td>
                      <td className="px-8 py-4 text-[#00A79D] text-base">
                        {totalAmount.toLocaleString('en-US', { style: 'currency', currency: 'EUR' })}
                      </td>
                      <td className="px-8 py-4 text-right">
                        <span className={`px-3 py-1 rounded-full text-[10px] uppercase tracking-tighter ${items[0].francoReached ? 'bg-emerald-500 text-white' : 'bg-orange-500 text-white'}`}>
                          {items[0].francoReached ? 'Franco OK' : 'Below Franco'}
                        </span>
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {results.length === 0 && (
            <div className="p-20 text-center text-slate-400 italic">
              No orders match the selected criteria.
            </div>
          )}
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="bg-[#0a1220] rounded-[2.5rem] px-8 py-7 shadow-2xl flex flex-col lg:flex-row items-center justify-between gap-6 border border-white/5">
        <div className="flex items-center gap-6">
          <div className="w-14 h-14 bg-[#00A79D]/10 rounded-2xl flex items-center justify-center text-[#00A79D] border border-[#00A79D]/20">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <div className="space-y-0.5">
            <h4 className="text-white font-black text-xl tracking-tight leading-tight">Finalize Orchestration</h4>
            <p className="text-slate-400 text-[13px] font-medium tracking-tight">
              Matched: <span className="text-white font-black">{matchedOrdersCount} orders</span> ({fulfillmentRate}%) | <span className="text-white font-black">{results.length} order lines</span> ({lineFulfillmentRate}%)
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          <button 
            onClick={onNext}
            className="px-10 py-3 bg-orange-600 text-white rounded-2xl font-black text-sm hover:bg-orange-500 transition-all shadow-xl shadow-orange-600/20 flex items-center gap-3"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            Launch
          </button>
        </div>
      </div>
    </div>
  );
};
