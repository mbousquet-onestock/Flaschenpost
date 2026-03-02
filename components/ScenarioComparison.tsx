
import React, { useMemo, useState } from 'react';
import { MOCK_SCENARIOS, MOCK_ORDERS, MOCK_PRODUCTS, MOCK_SUPPLIERS } from '../constants';
import { Scenario, OrchestrationConfig } from '../types';

interface ScenarioComparisonProps {
  currentStrategyName: string;
  currentConfig: OrchestrationConfig;
}

export const ScenarioComparison: React.FC<ScenarioComparisonProps> = ({ currentStrategyName, currentConfig }) => {
  // Current draft scenario
  const currentDraft: Scenario = {
    id: 'current-draft-id',
    name: currentStrategyName || 'New Strategy (Draft)',
    description: 'Current configuration in progress...',
    rules: [],
    metrics: { fulfillmentRate: 88, shippingCost: 5.1, deliveryTime: 2.1, carbonFootprint: 1.8, orderCount: 142, itemCount: 310 },
    config: currentConfig,
    status: 'Draft'
  };

  const allAvailableScenarios = [currentDraft, ...MOCK_SCENARIOS];
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<string[]>(
    [currentDraft.id, MOCK_SCENARIOS[0].id, MOCK_SCENARIOS[1].id]
  );

  // Calculate supplier metrics for each selected strategy
  const supplierComparisonData = useMemo(() => {
    const strategies = allAvailableScenarios.filter((s: Scenario) => selectedScenarioIds.includes(s.id));
    
    const results = strategies.map((strategy: Scenario) => {
      const config = strategy.config || currentConfig;
      
      // Filter orders that match the strategy config (status and order priority)
      const eligibleOrders = MOCK_ORDERS.filter((order: any) => {
        const statusMatch = config.statuses.includes(order.status as any);
        if (!statusMatch) return false;
        
        if (config.stockPointRank === 'P1') return order.priority === 'P1';
        if (config.stockPointRank === 'P2') return order.priority === 'P1' || order.priority === 'P2';
        return true; 
      });

      // Filter suppliers that match the strategy config (supplier rank)
      const eligibleSuppliers = MOCK_SUPPLIERS.filter((s: any) => {
        if (config.stockPointRank === 'P1') return s.rank === 'P1';
        if (config.stockPointRank === 'P2') return s.rank === 'P1' || s.rank === 'P2';
        return true;
      });

      const supplierIds = new Set(eligibleSuppliers.map((s: any) => s.id));
      
      // Calculate coverage: orders that can be fulfilled by eligible suppliers
      let fulfilledCount = 0;
      const supplierTotals: Record<string, number> = {};

      eligibleOrders.forEach((order: any) => {
        // Find if any eligible supplier has this product
        const product = MOCK_PRODUCTS.find((p: any) => p.sku === order.sku && supplierIds.has(p.supplierId));
        if (product) {
          fulfilledCount++;
          
          // Calculate price
          const sortedPrices = [...product.prices].sort((a: any, b: any) => b.quantity - a.quantity);
          const priceTier = sortedPrices.find((p: any) => order.quantity >= p.quantity) || sortedPrices[sortedPrices.length - 1];
          const amount = priceTier.price * order.quantity;
          
          supplierTotals[product.supplierId] = (supplierTotals[product.supplierId] || 0) + amount;
        }
      });

      const coverage = eligibleOrders.length > 0 ? (fulfilledCount / eligibleOrders.length) * 100 : 0;

      return {
        strategyId: strategy.id,
        coverage,
        supplierTotals
      };
    });

    return {
      strategies: results,
      suppliers: MOCK_SUPPLIERS.map((supplier: any) => {
        const strategyMetrics = results.map((res: any) => {
          const amount = res.supplierTotals[supplier.id] || 0;
          return {
            strategyId: res.strategyId,
            amount,
            francoReached: amount >= supplier.franco
          };
        });
        return { ...supplier, strategyMetrics };
      })
    };
  }, [selectedScenarioIds, currentConfig]);

  const toggleScenario = (id: string) => {
    setSelectedScenarioIds(prev => 
      prev.includes(id) 
        ? prev.filter(sid => sid !== id) 
        : [...prev, id]
    );
  };

  const selectedScenarios = allAvailableScenarios.filter(s => selectedScenarioIds.includes(s.id));

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Strategy Selector */}
      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-[#00A79D]/10 text-[#00A79D] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">Step 03</span>
              <h3 className="text-lg font-black text-slate-900">Comparison Selection</h3>
            </div>
            <p className="text-sm text-slate-500 font-medium">Compare supplier consolidation across benchmark strategies.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {allAvailableScenarios.map((s: Scenario) => {
              const isDraft = s.id === 'current-draft-id';
              return (
                <button
                  key={s.id}
                  onClick={() => toggleScenario(s.id)}
                  className={`relative px-5 py-2.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 ${
                    selectedScenarioIds.includes(s.id)
                      ? isDraft 
                        ? 'bg-[#00A79D] border-[#00A79D] text-white shadow-lg shadow-emerald-500/30 ring-2 ring-emerald-500/20' 
                        : 'bg-slate-900 border-slate-900 text-white shadow-lg shadow-slate-900/20'
                      : 'bg-white border-slate-200 text-slate-400 hover:border-[#00A79D] hover:text-[#00A79D]'
                  }`}
                >
                  {isDraft && <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>}
                  {s.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Supplier Comparison Matrix */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden">
        <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-slate-900">Supplier Consolidation Matrix</h3>
            <p className="text-sm text-slate-500 font-medium">
              Comparing purchase amounts and Franco threshold attainment
            </p>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          {selectedScenarioIds.length > 0 ? (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-400 text-[10px] font-bold uppercase tracking-widest border-b border-slate-100">
                <tr>
                  <th className="px-8 py-6 w-64">Supplier & Franco</th>
                  {selectedScenarios.map((s: Scenario) => (
                    <th key={s.id} className="px-8 py-6 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={s.id === 'current-draft-id' ? "text-[#00A79D]" : "text-slate-900"}>{s.name}</span>
                        <div className="flex items-center gap-1.5">
                          <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-[#00A79D]" 
                              style={{ width: `${supplierComparisonData.strategies.find((st: any) => st.strategyId === s.id)?.coverage || 0}%` }}
                            ></div>
                          </div>
                          <span className="text-[8px] text-slate-500 font-black">
                            {(supplierComparisonData.strategies.find((st: any) => st.strategyId === s.id)?.coverage || 0).toFixed(0)}% Cov.
                          </span>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {supplierComparisonData.suppliers.map((supplier: any) => (
                  <tr key={supplier.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-8 py-6">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800">{supplier.name}</span>
                          <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${
                            supplier.rank === 'P1' ? 'bg-emerald-100 text-emerald-700' : 
                            supplier.rank === 'P2' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {supplier.rank}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium">Franco: {supplier.franco.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>
                      </div>
                    </td>
                    
                    {supplier.strategyMetrics.map((metric: any, sIdx: number) => (
                      <td key={sIdx} className="px-8 py-6 text-center">
                        {metric.amount > 0 ? (
                          <div className="flex flex-col items-center gap-2">
                            <span className={`font-black ${metric.francoReached ? 'text-slate-900' : 'text-slate-400'}`}>
                              {metric.amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                            </span>
                            {metric.francoReached ? (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[8px] font-black uppercase tracking-tighter">
                                Franco OK
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-400 rounded text-[8px] font-black uppercase tracking-tighter">
                                Missing {(supplier.franco - metric.amount).toFixed(0)}€
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-200 text-[10px] font-bold italic">No Assignment</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-20 text-center text-slate-400 italic">
              Select at least one strategy above to begin comparison.
            </div>
          )}
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="bg-slate-900 rounded-[2.5rem] p-8 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-[#00A79D]/20 rounded-2xl flex items-center justify-center text-[#00A79D]">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <div className="space-y-1">
            <h4 className="text-white font-black text-xl tracking-tight">Finalize Orchestration</h4>
            <p className="text-slate-400 text-sm font-medium">Ready to launch wave with "{currentDraft.name}"</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <button className="px-10 py-3.5 bg-[#00A79D] text-white rounded-2xl font-black text-sm hover:bg-[#008d84] transition-all shadow-xl shadow-emerald-500/20 flex items-center gap-3">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
            Save & Launch Wave
          </button>
        </div>
      </div>
    </div>
  );
};
