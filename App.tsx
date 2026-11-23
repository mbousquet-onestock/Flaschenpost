import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { OrchestrationScenarios } from './components/OrchestrationScenarios';
import { ResultsVisualization } from './components/ResultsVisualization';
import { StrategyDashboard } from './components/StrategyDashboard';
import { PricingTab } from './components/PricingTab';
import { SettingsTab } from './components/SettingsTab';
import { ExtensionLayout, PageHeader } from './components/Layout';
import { OsAlert, OsButton, OsLoading, OsStepper, OsTabs } from './components/os';
import { Step, Scenario, OrchestrationConfig, Dataset } from './types';
import { MOCK_SCENARIOS } from './constants';
import { HostContext, resolveHostContext, setManualContext } from './services/context';
import { createDataSource, DataMode, DEFAULT_MODE, loadSavedMode } from './services/dataSource';

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

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<Step>(Step.StrategyManagement);
  const [scenarios, setScenarios] = useState<Scenario[]>(MOCK_SCENARIOS);
  const [strategyName, setStrategyName] = useState<string>('');
  const [orchestrationConfig, setOrchestrationConfig] = useState<OrchestrationConfig>(DEFAULT_CONFIG);
  const [tab, setTab] = useState<Tab>(settingsRequested() ? 'settings' : 'strategies');
  const [showSettings, setShowSettings] = useState(settingsRequested());

  // ---------- context and data ----------
  // Context (environment + site ID) from OneStock or the settings, and the data source saved for that site.
  const [context, setContext] = useState<HostContext | null | undefined>(undefined);
  const [mode, setMode] = useState<DataMode | undefined>(undefined);
  useEffect(() => {
    resolveHostContext().then(async (ctx) => {
      setContext(ctx);
      // First run: no environment known yet, show the settings so it can be entered.
      if (!ctx) {
        setShowSettings(true);
        setTab('settings');
      }
      setMode((ctx && (await loadSavedMode(ctx))) || DEFAULT_MODE);
    });
  }, []);
  const source = useMemo(() => (context === undefined || !mode ? null : createDataSource(mode, context)), [context, mode]);

  const changeContext = (ctx: { env: string; siteId: string }) => {
    const next = setManualContext(ctx);
    setContext(next);
    if (next) loadSavedMode(next).then((m) => setMode(m || DEFAULT_MODE));
  };

  const [data, setData] = useState<Dataset | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const reloadData = useCallback(() => setDataVersion((v) => v + 1), []);
  useEffect(() => {
    if (!source) return;
    let alive = true;
    setData(null);
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
  if (!source) {
    return <ExtensionLayout><OsLoading text="Reading the OneStock context" /></ExtensionLayout>;
  }

  const dataState = dataError ? (
    <OsAlert color="red">
      Data could not be loaded: {dataError}
      {source.mode === 'dynamic' && ' Check the environment connection and the order line statuses in the settings.'}
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
        {tab === 'settings' && showSettings && (
          <SettingsTab context={context ?? null} mode={source.mode} onModeChange={setMode} onContextChange={changeContext} onSaved={reloadData} />
        )}
      </div>
    </ExtensionLayout>
  );
};

export default App;
