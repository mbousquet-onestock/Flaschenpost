
import React from 'react';
import { OrchestrationConfig, OrderStatus, StockPointType, StockPointRank, ConsolidationMode } from '../types';
import { MOCK_SUPPLIERS } from '../constants';

interface OrchestrationScenariosProps {
  config: OrchestrationConfig;
  onChange: (config: OrchestrationConfig) => void;
}

export const OrchestrationScenarios: React.FC<OrchestrationScenariosProps> = ({ config, onChange }) => {
  const toggleStatus = (status: OrderStatus) => {
    const newStatuses = config.statuses.includes(status)
      ? config.statuses.filter(s => s !== status)
      : [...config.statuses, status];
    onChange({ ...config, statuses: newStatuses });
  };

  const toggleSupplier = (supplierId: string) => {
    const currentSelected = config.selectedSupplierIds || [];
    const newSelected = currentSelected.includes(supplierId)
      ? currentSelected.filter(id => id !== supplierId)
      : [...currentSelected, supplierId];
    onChange({ ...config, selectedSupplierIds: newSelected });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-white p-6 rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/30">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-[#00A79D]/10 text-[#00A79D] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">Step 01</span>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Execution Scenario</h2>
          </div>
          <p className="text-slate-500 text-xs font-medium">Configure routing logic and consolidation rules.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Order Status Selection */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/30">
          <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 text-[#00A79D] rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
            </div>
            Order Statuses to Process
          </h3>
          <div className="space-y-3">
            {(['Placed', 'Out Of Stock', 'Supplier'] as OrderStatus[]).map(status => (
              <label key={status} className={`flex items-center justify-between p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                config.statuses.includes(status) ? 'border-[#00A79D] bg-emerald-50/50' : 'border-slate-100 hover:border-slate-200'
              }`}>
                <span className="font-bold text-slate-700">{status}</span>
                <input 
                  type="checkbox" 
                  className="hidden" 
                  checked={config.statuses.includes(status)}
                  onChange={() => toggleStatus(status)}
                />
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                  config.statuses.includes(status) ? 'bg-[#00A79D] border-[#00A79D]' : 'border-slate-300'
                }`}>
                  {config.statuses.includes(status) && <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Stock Point Configuration */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/30">
          <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
            </div>
            Stock Point Target
          </h3>
          <div className="space-y-6">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">Type of Stock Point</label>
              <div className="grid grid-cols-2 gap-3">
                {(['warehouse', 'supplier'] as StockPointType[]).map(type => (
                  <button
                    key={type}
                    onClick={() => onChange({ ...config, stockPointType: type })}
                    className={`p-4 rounded-2xl border-2 font-bold capitalize transition-all ${
                      config.stockPointType === type ? 'border-[#00A79D] bg-emerald-50/50 text-[#00A79D]' : 'border-slate-100 text-slate-500 hover:border-slate-200'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">Rank Priority</label>
              <div className="grid grid-cols-3 gap-3">
                {(['P1', 'P2', 'P3'] as StockPointRank[]).map(rank => (
                  <button
                    key={rank}
                    onClick={() => onChange({ ...config, stockPointRank: rank })}
                    className={`p-4 rounded-2xl border-2 font-bold transition-all ${
                      config.stockPointRank === rank ? 'border-[#00A79D] bg-emerald-50/50 text-[#00A79D]' : 'border-slate-100 text-slate-500 hover:border-slate-200'
                    }`}
                  >
                    {rank}
                  </button>
                ))}
              </div>
            </div>
            {config.stockPointType === 'supplier' && (
              <div className="pt-4 border-t border-slate-100">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">Specific Suppliers Selection</label>
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                  {MOCK_SUPPLIERS.map(supplier => (
                    <label key={supplier.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                      (config.selectedSupplierIds || []).includes(supplier.id) ? 'border-[#00A79D] bg-emerald-50/50' : 'border-slate-100 hover:border-slate-200'
                    }`}>
                      <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                        (config.selectedSupplierIds || []).includes(supplier.id) ? 'bg-[#00A79D] border-[#00A79D]' : 'border-slate-300'
                      }`}>
                        {(config.selectedSupplierIds || []).includes(supplier.id) && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700">{supplier.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{supplier.id}</span>
                      </div>
                    </label>
                  ))}
                </div>
                {(config.selectedSupplierIds || []).length > 0 && (
                  <button 
                    onClick={() => onChange({ ...config, selectedSupplierIds: [] })}
                    className="mt-3 text-[10px] font-bold text-[#00A79D] uppercase tracking-widest hover:underline"
                  >
                    Clear selection
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Consolidation Mode */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/30">
          <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            Consolidation Strategy
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <button
              onClick={() => onChange({ ...config, consolidationMode: 'cheapest_price' })}
              className={`p-6 rounded-3xl border-2 text-left transition-all ${
                config.consolidationMode === 'cheapest_price' ? 'border-[#00A79D] bg-emerald-50/50' : 'border-slate-100 hover:border-slate-200'
              }`}
            >
              <h4 className={`font-black mb-1 ${config.consolidationMode === 'cheapest_price' ? 'text-[#00A79D]' : 'text-slate-800'}`}>Cheapest Purchase Price</h4>
              <p className="text-xs text-slate-500 font-medium">Groups quantities to reach the best unit price tier per SKU.</p>
            </button>
            <button
              onClick={() => onChange({ ...config, consolidationMode: 'cheapest_price_franco' })}
              className={`p-6 rounded-3xl border-2 text-left transition-all ${
                config.consolidationMode === 'cheapest_price_franco' ? 'border-[#00A79D] bg-emerald-50/50' : 'border-slate-100 hover:border-slate-200'
              }`}
            >
              <h4 className={`font-black mb-1 ${config.consolidationMode === 'cheapest_price_franco' ? 'text-[#00A79D]' : 'text-slate-800'}`}>Price + Franco Optimization</h4>
              <p className="text-xs text-slate-500 font-medium">Optimizes for both unit price and reaching the free shipping threshold (Franco).</p>
            </button>
          </div>

          <div className="pt-6 border-t border-slate-100">
            <label className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
              config.blockIfFrancoNotMet ? 'border-orange-500 bg-orange-50/50' : 'border-slate-100 hover:border-slate-200'
            }`}>
              <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                config.blockIfFrancoNotMet ? 'bg-orange-500 border-orange-500' : 'border-slate-300'
              }`}>
                {config.blockIfFrancoNotMet && <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
              </div>
              <input 
                type="checkbox" 
                className="hidden" 
                checked={config.blockIfFrancoNotMet}
                onChange={(e) => onChange({ ...config, blockIfFrancoNotMet: e.target.checked })}
              />
              <div>
                <span className={`font-bold block ${config.blockIfFrancoNotMet ? 'text-orange-700' : 'text-slate-700'}`}>Block orders if Franco is not met</span>
                <p className="text-[10px] text-slate-500 font-medium">If the free shipping threshold is not reached for a supplier, the associated orders will not be validated.</p>
              </div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
