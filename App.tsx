
import React, { useState } from 'react';
import { Stepper } from './components/Stepper';
import { ConditionBuilder } from './components/ConditionBuilder';
import { OrchestrationScenarios } from './components/OrchestrationScenarios';
import { ResultsVisualization } from './components/ResultsVisualization';
import { ScenarioComparison } from './components/ScenarioComparison';
import { StrategyDashboard } from './components/StrategyDashboard';
import { Step, Condition, Scenario, OrchestrationConfig } from './types';
import { MOCK_SCENARIOS } from './constants';

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<Step>(Step.StrategyManagement);
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>(MOCK_SCENARIOS);
  const [selectedStrategy, setSelectedStrategy] = useState<Scenario | null>(null);
  const [strategyName, setStrategyName] = useState<string>('');
  
  const [orchestrationConfig, setOrchestrationConfig] = useState<OrchestrationConfig>({
    statuses: ['Placed', 'Out Of Stock'],
    stockPointType: 'warehouse',
    stockPointRank: 'P1',
    consolidationMode: 'cheapest_price',
    blockIfFrancoNotMet: false,
    selectedSupplierIds: []
  });

  const addCondition = (c: Condition) => setConditions(prev => [...prev, c]);
  const removeCondition = (id: string) => setConditions(prev => prev.filter(c => c.id !== id));

  const handleSelectStrategy = (strategy: Scenario) => {
    setSelectedStrategy(strategy);
    setStrategyName(strategy.name);
    if (strategy.config) setOrchestrationConfig(strategy.config);
    setCurrentStep(Step.ResultsVisualization);
  };

  const handleEditStrategy = (strategy: Scenario) => {
    setSelectedStrategy(strategy);
    setStrategyName(strategy.name);
    if (strategy.config) setOrchestrationConfig(strategy.config);
    setCurrentStep(Step.OrchestrationScenarios);
  };

  const handleCreateNew = () => {
    setSelectedStrategy(null);
    setStrategyName('New Strategy ' + new Date().toLocaleDateString('en-US'));
    setConditions([]);
    setOrchestrationConfig({
      statuses: ['Placed', 'Out Of Stock'],
      stockPointType: 'warehouse',
      stockPointRank: 'P1',
      consolidationMode: 'cheapest_price',
      blockIfFrancoNotMet: false,
      selectedSupplierIds: []
    });
    setCurrentStep(Step.OrchestrationScenarios);
  };

  const handleUpdateStrategyName = (id: string, newName: string) => {
    setScenarios(prev => prev.map(s => s.id === id ? { ...s, name: newName } : s));
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case Step.StrategyManagement:
        return (
          <StrategyDashboard 
            scenarios={scenarios}
            onSelect={handleSelectStrategy} 
            onEdit={handleEditStrategy}
            onCreateNew={handleCreateNew} 
            onUpdateName={handleUpdateStrategyName}
          />
        );
      case Step.OrchestrationScenarios:
        return (
          <OrchestrationScenarios 
            config={orchestrationConfig} 
            onChange={setOrchestrationConfig} 
          />
        );
      case Step.ResultsVisualization:
        return (
          <ResultsVisualization 
            strategyName={strategyName} 
            config={orchestrationConfig}
            onNext={() => setCurrentStep(Step.StrategyManagement)} 
          />
        );
      default:
        return null;
    }
  };

  const nextStep = () => {
    if (currentStep < 2) setCurrentStep(prev => (prev + 1) as Step);
  };

  const prevStep = () => {
    if (currentStep > 0) {
        if (currentStep === Step.OrchestrationScenarios) setCurrentStep(Step.StrategyManagement);
        else setCurrentStep(prev => (prev - 1) as Step);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-[#00A79D]/30 selection:text-[#00A79D] py-8">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        {/* Integrated Branding Block */}
        <div className="mb-10 flex flex-col sm:flex-row sm:items-end justify-between gap-6 border-b border-slate-200 pb-8">
          <div className="flex items-center gap-5">
            <div 
                className="w-14 h-14 bg-[#00A79D] rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-xl shadow-emerald-500/20 cursor-pointer hover:rotate-3 transition-transform"
                onClick={() => setCurrentStep(Step.StrategyManagement)}
            >
                OS
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight leading-none">Wave Orchestrator</h1>
              <p className="text-slate-500 font-medium mt-2">Enterprise-grade order fulfillment logic & simulation</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
                onClick={() => setCurrentStep(Step.StrategyManagement)}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm ${
                    currentStep === Step.StrategyManagement 
                    ? 'bg-slate-100 text-slate-400 border border-slate-200' 
                    : 'bg-white border border-slate-200 text-[#00A79D] hover:bg-emerald-50'
                }`}
            >
              Dashboard
            </button>
            <button className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              View History
            </button>
          </div>
        </div>

        {/* Dynamic Content */}
        <div className="min-h-[450px]">
          {renderStepContent()}
        </div>

        {/* Navigation Bar */}
        {currentStep > 0 && (
          <div className="mt-12 flex items-center justify-between py-8 border-t border-slate-200 sticky bottom-0 z-40 bg-slate-50/90 backdrop-blur-xl -mx-4 px-4 md:-mx-8 md:px-8">
            <button
              onClick={prevStep}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-sm transition-all text-slate-600 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              {currentStep === Step.OrchestrationScenarios ? 'Back to Dashboard' : 'Previous Phase'}
            </button>
            
            <div className="hidden sm:flex items-center gap-3">
              {[1,2].map(i => (
                <div key={i} className={`h-1.5 rounded-full transition-all duration-500 ${currentStep === i ? 'w-10 bg-[#00A79D]' : 'w-2 bg-slate-300'}`} />
              ))}
            </div>

            {currentStep < 2 ? (
              <button
                onClick={nextStep}
                className="flex items-center gap-2 px-8 py-3 rounded-2xl font-bold text-sm transition-all bg-[#00A79D] text-white hover:bg-[#008d84] shadow-xl shadow-emerald-600/20 hover:-translate-y-0.5 active:translate-y-0"
              >
                Continue to Next Step
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </button>
            ) : (
              <button
                onClick={() => setCurrentStep(Step.StrategyManagement)}
                className="flex items-center gap-2 px-8 py-3 rounded-2xl font-bold text-sm transition-all bg-slate-900 text-white hover:bg-slate-800 shadow-xl shadow-slate-900/20 hover:-translate-y-0.5 active:translate-y-0"
              >
                Finish & Save
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
