
import React, { useState } from 'react';
import { OrchestrationConfig, OrderStatus, StockPointType, StockPointRank, ConsolidationMode } from '../types';
import { MOCK_SUPPLIERS } from '../constants';
import { GripVertical, Plus, ChevronDown, X } from 'lucide-react';

interface OrchestrationScenariosProps {
  config: OrchestrationConfig;
  onChange: (config: OrchestrationConfig) => void;
}

export const OrchestrationScenarios: React.FC<OrchestrationScenariosProps> = ({ config, onChange }) => {
  const [activeMenu, setActiveMenu] = useState<'status' | 'type' | 'rank' | 'suppliers' | null>(null);

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

  const ConditionTag = ({ category, field, value, onEdit }: { category: string, field: string, value: string, onEdit: () => void }) => (
    <div 
      onClick={onEdit}
      className="flex items-center gap-2 bg-[#E6F6F4] text-[#00A79D] px-3 py-1.5 rounded-md border border-[#D1EFEC] cursor-pointer hover:bg-[#D1EFEC] transition-colors group"
    >
      <GripVertical className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
      <span className="text-[13px] font-medium">
        {category} - <span className="text-[#00A79D]/80">{field}</span> in <span className="font-bold">{value}</span>
      </span>
    </div>
  );

  const AddButton = ({ onClick }: { onClick: () => void }) => (
    <button 
      onClick={onClick}
      className="bg-white border border-slate-200 px-4 py-1.5 rounded-md font-bold text-slate-700 text-[13px] hover:bg-slate-50 transition-all shadow-sm active:scale-95"
    >
      Add condition
    </button>
  );

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

      <div className="space-y-8">
        {/* Order Information Section */}
        <div className="space-y-4">
          <h3 className="text-base font-bold text-slate-700 px-1">Order information</h3>
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm relative">
            <div className="flex flex-col gap-4">
              {/* Row 1: Order Status */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative">
                  <ConditionTag 
                    category="Order information" 
                    field="Status" 
                    value={config.statuses.join(', ') || 'None'} 
                    onEdit={() => setActiveMenu(activeMenu === 'status' ? null : 'status')}
                  />
                  {activeMenu === 'status' && (
                    <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 p-4 animate-in zoom-in-95 duration-200">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Statuses</span>
                        <button onClick={() => setActiveMenu(null)}><X className="w-4 h-4 text-slate-400 hover:text-slate-600" /></button>
                      </div>
                      <div className="space-y-2">
                        {(['Placed', 'Out Of Stock', 'Supplier'] as OrderStatus[]).map(status => (
                          <label key={status} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors">
                            <input 
                              type="checkbox" 
                              checked={config.statuses.includes(status)}
                              onChange={() => toggleStatus(status)}
                              className="w-4 h-4 rounded border-slate-300 text-[#00A79D] focus:ring-[#00A79D]"
                            />
                            <span className="text-sm font-bold text-slate-700">{status}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <AddButton onClick={() => setActiveMenu('status')} />
              </div>

              {/* OR Row */}
              <div className="flex items-center gap-4 mt-2">
                <div className="bg-slate-50 text-slate-400 px-2 py-1 rounded text-[10px] font-bold border border-slate-100 uppercase tracking-tighter">OR</div>
                <button className="bg-white border border-slate-200 px-4 py-1.5 rounded-md font-bold text-slate-700 text-[13px] hover:bg-slate-50 transition-all shadow-sm active:scale-95">
                  Add condition
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Stock Point Section */}
        <div className="space-y-4">
          <h3 className="text-base font-bold text-slate-700 px-1">Stock Point</h3>
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm relative">
            <div className="flex flex-col gap-4">
              {/* Row 2: Stock Point Type */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative">
                  <ConditionTag 
                    category="Stock Point" 
                    field="Type" 
                    value={config.stockPointType} 
                    onEdit={() => setActiveMenu(activeMenu === 'type' ? null : 'type')}
                  />
                  {activeMenu === 'type' && (
                    <div className="absolute top-full left-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 p-4 animate-in zoom-in-95 duration-200">
                      <div className="space-y-1">
                        {(['warehouse', 'supplier'] as StockPointType[]).map(type => (
                          <button
                            key={type}
                            onClick={() => {
                              onChange({ ...config, stockPointType: type });
                              setActiveMenu(null);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-bold capitalize transition-colors ${
                              config.stockPointType === type ? 'bg-emerald-50 text-[#00A79D]' : 'text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <AddButton onClick={() => setActiveMenu('type')} />
              </div>

              {/* Row 3: Stock Point Rank */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative">
                  <ConditionTag 
                    category="Stock Point" 
                    field="Rank" 
                    value={config.stockPointRank} 
                    onEdit={() => setActiveMenu(activeMenu === 'rank' ? null : 'rank')}
                  />
                  {activeMenu === 'rank' && (
                    <div className="absolute top-full left-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 p-4 animate-in zoom-in-95 duration-200">
                      <div className="space-y-1">
                        {(['P1', 'P2', 'P3'] as StockPointRank[]).map(rank => (
                          <button
                            key={rank}
                            onClick={() => {
                              onChange({ ...config, stockPointRank: rank });
                              setActiveMenu(null);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-bold transition-colors ${
                              config.stockPointRank === rank ? 'bg-emerald-50 text-[#00A79D]' : 'text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            {rank}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <AddButton onClick={() => setActiveMenu('rank')} />
              </div>

              {/* Optional Row 4: Suppliers */}
              {config.stockPointType === 'supplier' && (
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="relative">
                    <ConditionTag 
                      category="Stock Point" 
                      field="Suppliers" 
                      value={config.selectedSupplierIds?.length ? `${config.selectedSupplierIds.length} selected` : 'All'} 
                      onEdit={() => setActiveMenu(activeMenu === 'suppliers' ? null : 'suppliers')}
                    />
                    {activeMenu === 'suppliers' && (
                      <div className="absolute top-full left-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 p-4 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Suppliers</span>
                          <button onClick={() => onChange({ ...config, selectedSupplierIds: [] })} className="text-[10px] font-bold text-[#00A79D] hover:underline">Clear</button>
                        </div>
                        <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                          {MOCK_SUPPLIERS.map(supplier => (
                            <label key={supplier.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors">
                              <input 
                                type="checkbox" 
                                checked={(config.selectedSupplierIds || []).includes(supplier.id)}
                                onChange={() => toggleSupplier(supplier.id)}
                                className="w-4 h-4 rounded border-slate-300 text-[#00A79D] focus:ring-[#00A79D]"
                              />
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-slate-700">{supplier.name}</span>
                                <span className="text-[9px] text-slate-400 font-mono">{supplier.id}</span>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <AddButton onClick={() => setActiveMenu('suppliers')} />
                </div>
              )}

              {/* OR Row */}
              <div className="flex items-center gap-4 mt-2">
                <div className="bg-slate-50 text-slate-400 px-2 py-1 rounded text-[10px] font-bold border border-slate-100 uppercase tracking-tighter">OR</div>
                <button className="bg-white border border-slate-200 px-4 py-1.5 rounded-md font-bold text-slate-700 text-[13px] hover:bg-slate-50 transition-all shadow-sm active:scale-95">
                  Add condition
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Consolidation Mode (Keep this as it's a different type of setting) */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/30">
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
