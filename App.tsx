import React, { useState } from 'react';
import { OrchestrationScenarios } from './components/OrchestrationScenarios';
import { ResultsVisualization } from './components/ResultsVisualization';
import { StrategyDashboard } from './components/StrategyDashboard';
import { ExtensionLayout, PageHeader } from './components/Layout';
import { OsButton, OsStepper } from './components/os';
import { Step, Scenario, OrchestrationConfig } from './types';
import { MOCK_SCENARIOS } from './constants';

const DEFAULT_CONFIG: OrchestrationConfig = {
  statuses: ['Placed', 'Out Of Stock'],
  stockPointType: 'warehouse',
  stockPointRank: 'P1',
  consolidationMode: 'cheapest_price',
  blockIfFrancoNotMet: false,
  selectedSupplierIds: [],
};

const STEPS = ['Execution scenario', 'Consolidated purchase orders'];

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<Step>(Step.StrategyManagement);
  const [scenarios, setScenarios] = useState<Scenario[]>(MOCK_SCENARIOS);
  const [strategyName, setStrategyName] = useState<string>('');
  const [orchestrationConfig, setOrchestrationConfig] = useState<OrchestrationConfig>(DEFAULT_CONFIG);

  const openStrategy = (strategy: Scenario, step: Step) => {
    setStrategyName(strategy.name);
    if (strategy.config) setOrchestrationConfig(strategy.config);
    setCurrentStep(step);
  };

  const handleCreateNew = () => {
    setStrategyName('New strategy ' + new Date().toLocaleDateString('fr-FR'));
    setOrchestrationConfig({ ...DEFAULT_CONFIG, selectedSupplierIds: [] });
    setCurrentStep(Step.OrchestrationScenarios);
  };

  const handleUpdateStrategyName = (id: string, newName: string) => {
    setScenarios((prev) => prev.map((s) => (s.id === id ? { ...s, name: newName } : s)));
  };

  const backToDashboard = () => setCurrentStep(Step.StrategyManagement);
  const prevStep = () => setCurrentStep((s) => (s > 0 ? ((s - 1) as Step) : s));
  const nextStep = () => setCurrentStep((s) => (s < 2 ? ((s + 1) as Step) : s));

  const inFlow = currentStep !== Step.StrategyManagement;

  const footer = inFlow && (
    <div className="os-actionbar">
      <OsButton kind="secondary" icon="arrow-left" onClick={currentStep === Step.OrchestrationScenarios ? backToDashboard : prevStep}>
        {currentStep === Step.OrchestrationScenarios ? 'Back to strategies' : 'Previous step'}
      </OsButton>
      {currentStep < Step.ResultsVisualization ? (
        <OsButton onClick={nextStep} iconEnd="arrow-right">Continue</OsButton>
      ) : (
        <OsButton icon="check" onClick={backToDashboard}>Finish and save</OsButton>
      )}
    </div>
  );

  return (
    <ExtensionLayout footer={footer}>
      <div className="os-col">
        {inFlow && (
          <PageHeader
            title={strategyName}
            onBack={backToDashboard}
            badge={currentStep === Step.OrchestrationScenarios ? 'Draft' : undefined}
          />
        )}
        {inFlow && (
          <div className="os-card" style={{ padding: '12px 16px' }}>
            <OsStepper steps={STEPS} current={currentStep - 1} onStepClick={(i) => setCurrentStep((i + 1) as Step)} />
          </div>
        )}

        {currentStep === Step.StrategyManagement && (
          <StrategyDashboard
            scenarios={scenarios}
            onSelect={(s) => openStrategy(s, Step.ResultsVisualization)}
            onEdit={(s) => openStrategy(s, Step.OrchestrationScenarios)}
            onCreateNew={handleCreateNew}
            onUpdateName={handleUpdateStrategyName}
          />
        )}
        {currentStep === Step.OrchestrationScenarios && (
          <OrchestrationScenarios config={orchestrationConfig} onChange={setOrchestrationConfig} />
        )}
        {currentStep === Step.ResultsVisualization && (
          <ResultsVisualization strategyName={strategyName} config={orchestrationConfig} onNext={backToDashboard} />
        )}
      </div>
    </ExtensionLayout>
  );
};

export default App;
