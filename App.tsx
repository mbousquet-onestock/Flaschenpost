import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { OrchestrationScenarios } from './components/OrchestrationScenarios';
import { ResultsVisualization } from './components/ResultsVisualization';
import { StrategyDashboard } from './components/StrategyDashboard';
import { PricingTab } from './components/PricingTab';
import { SettingsTab } from './components/SettingsTab';
import { ExtensionLayout, PageHeader } from './components/Layout';
import { OsAlert, OsButton, OsField, OsLoading, OsStepper, OsTabs } from './components/os';
import { Step, Scenario, OrchestrationConfig, Dataset } from './types';
import { MOCK_SCENARIOS } from './constants';
import { HostContext, resolveHostContext, setDevContext } from './services/context';
import { createDataSource, DATA_MODE } from './services/dataSource';

const DEFAULT_CONFIG: OrchestrationConfig = {
  statuses: ['Placed', 'Out Of Stock'],
  stockPointType: 'warehouse',
  stockPointRank: 'P1',
  consolidationMode: 'cheapest_price',
  blockIfFrancoNotMet: false,
  selectedSupplierIds: [],
};

const STEPS = ['Execution scenario', 'Consolidated purchase orders'];

type Tab = 'strategies' | 'prices' | 'settings';

/** The settings tab is hidden: shown with ?settings (or #settings) in the URL, toggled with Ctrl+Shift+S. */
const settingsRequested = () => {
  const u = new URL(window.location.href);
  return u.searchParams.has('settings') || /(^|[#&])settings\b/.test(u.hash);
};

/** Development helper when no OneStock context is available (dynamic version, local run only). */
const DevContextForm: React.FC = () => {
  const [env, setEnv] = useState('qualif');
  const [siteId, setSiteId] = useState('c00');
  return (
    <form className="os-card os-row" style={{ alignItems: 'flex-end' }} onSubmit={(e) => { e.preventDefault(); setDevContext({ env, siteId }); window.location.reload(); }}>
      <OsField label="Environment" htmlFor="dev-env"><input id="dev-env" className="os-input" value={env} onChange={(e) => setEnv(e.target.value)} /></OsField>
      <OsField label="Site ID" htmlFor="dev-site"><input id="dev-site" className="os-input" value={siteId} onChange={(e) => setSiteId(e.target.value)} /></OsField>
      <OsButton type="submit">Use this context (development)</OsButton>
    </form>
  );
};

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<Step>(Step.StrategyManagement);
  const [scenarios, setScenarios] = useState<Scenario[]>(MOCK_SCENARIOS);
  const [strategyName, setStrategyName] = useState<string>('');
  const [orchestrationConfig, setOrchestrationConfig] = useState<OrchestrationConfig>(DEFAULT_CONFIG);
  const [tab, setTab] = useState<Tab>(settingsRequested() ? 'settings' : 'strategies');
  const [showSettings, setShowSettings] = useState(settingsRequested());

  // ---------- context and data ----------
  const [context, setContext] = useState<HostContext | null | undefined>(DATA_MODE === 'static' ? null : undefined);
  useEffect(() => {
    if (DATA_MODE === 'dynamic') resolveHostContext().then(setContext);
  }, []);
  const source = useMemo(() => (context === undefined ? null : createDataSource(context)), [context]);

  const [data, setData] = useState<Dataset | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const reloadData = useCallback(() => setDataVersion((v) => v + 1), []);
  useEffect(() => {
    if (!source) return;
    let alive = true;
    setDataError(null);
    source.loadDataset().then(
      (d) => alive && setData(d),
      (e: Error) => alive && (setData(null), setDataError(e.message)),
    );
    return () => {
      alive = false;
    };
  }, [source, dataVersion]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setShowSettings((v) => {
          if (v) setTab((t) => (t === 'settings' ? 'strategies' : t));
          else setTab('settings');
          return !v;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---------- strategy flow ----------
  const openStrategy = (strategy: Scenario, step: Step) => {
    setStrategyName(strategy.name);
    if (strategy.config) {
      // Keep only the statuses available in the current data; fall back to all of them.
      const options = data?.statusOptions ?? [];
      const statuses = strategy.config.statuses.filter((st) => options.includes(st));
      setOrchestrationConfig({ ...strategy.config, statuses: statuses.length ? statuses : options.length ? options : strategy.config.statuses });
    }
    setCurrentStep(step);
  };

  const handleCreateNew = () => {
    setStrategyName('New strategy ' + new Date().toLocaleDateString('fr-FR'));
    setOrchestrationConfig({ ...DEFAULT_CONFIG, statuses: data?.statusOptions ?? DEFAULT_CONFIG.statuses, selectedSupplierIds: [] });
    setCurrentStep(Step.OrchestrationScenarios);
  };

  const handleUpdateStrategyName = (id: string, newName: string) => {
    setScenarios((prev) => prev.map((s) => (s.id === id ? { ...s, name: newName } : s)));
  };

  const backToDashboard = () => setCurrentStep(Step.StrategyManagement);
  const prevStep = () => setCurrentStep((s) => (s > 0 ? ((s - 1) as Step) : s));
  const nextStep = () => setCurrentStep((s) => (s < 2 ? ((s + 1) as Step) : s));

  const inFlow = currentStep !== Step.StrategyManagement;

  // ---------- rendering ----------
  if (context === undefined) {
    return <ExtensionLayout><OsLoading text="Reading the OneStock context" /></ExtensionLayout>;
  }

  if (!source) {
    return (
      <ExtensionLayout>
        <div className="os-col">
          <OsAlert color="red">
            The OneStock context (environment and site ID) was not received. Open Wave Orchestrator from the OneStock back-office.
          </OsAlert>
          {import.meta.env.DEV && <DevContextForm />}
        </div>
      </ExtensionLayout>
    );
  }

  const dataState = dataError ? (
    <OsAlert color="red">
      Data could not be loaded: {dataError}
      {source.mode === 'dynamic' && ' Check the connection and the order line statuses in the settings.'}
    </OsAlert>
  ) : !data ? (
    <OsLoading text="Loading orders, suppliers and prices" />
  ) : null;

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

  if (inFlow) {
    return (
      <ExtensionLayout footer={footer}>
        <div className="os-col">
          <PageHeader title={strategyName} onBack={backToDashboard} badge={currentStep === Step.OrchestrationScenarios ? 'Draft' : undefined} />
          <div className="os-card" style={{ padding: '12px 16px' }}>
            <OsStepper steps={STEPS} current={currentStep - 1} onStepClick={(i) => setCurrentStep((i + 1) as Step)} />
          </div>
          {dataState ??
            (currentStep === Step.OrchestrationScenarios ? (
              <OrchestrationScenarios config={orchestrationConfig} onChange={setOrchestrationConfig} statusOptions={data!.statusOptions} suppliers={data!.suppliers} />
            ) : (
              <ResultsVisualization strategyName={strategyName} config={orchestrationConfig} data={data!} onNext={backToDashboard} />
            ))}
        </div>
      </ExtensionLayout>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'strategies', label: 'Strategies' },
    { id: 'prices', label: 'Supplier prices' },
    ...(showSettings ? [{ id: 'settings' as Tab, label: 'Settings' }] : []),
  ];

  return (
    <ExtensionLayout>
      <div className="os-col">
        <OsTabs tabs={tabs} value={tab} onChange={setTab} />
        {tab === 'strategies' && (
          <>
            {dataError && dataState}
            <StrategyDashboard
              scenarios={scenarios}
              onSelect={(s) => openStrategy(s, Step.ResultsVisualization)}
              onEdit={(s) => openStrategy(s, Step.OrchestrationScenarios)}
              onCreateNew={handleCreateNew}
              onUpdateName={handleUpdateStrategyName}
            />
          </>
        )}
        {tab === 'prices' && <PricingTab source={source} onDataChanged={reloadData} />}
        {tab === 'settings' && showSettings && <SettingsTab source={source} onSaved={reloadData} />}
      </div>
    </ExtensionLayout>
  );
};

export default App;
