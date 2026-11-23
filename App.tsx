import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { OrchestrationScenarios } from './components/OrchestrationScenarios';
import { ResultsVisualization } from './components/ResultsVisualization';
import { StrategyDashboard } from './components/StrategyDashboard';
import { PricingTab } from './components/PricingTab';
import { SettingsTab } from './components/SettingsTab';
import { ExtensionLayout, PageHeader } from './components/Layout';
import { OsAlert, OsButton, OsLoading, OsStepper, OsTabs } from './components/os';
import { Step, Scenario, OrchestrationConfig, Dataset } from './types';
import { HostContext, resolveHostContext, setManualContext } from './services/context';
import { createDataSource, DataMode, DEFAULT_MODE, loadSavedMode } from './services/dataSource';
import { infoCatalog, simulate, toPurchaseOrders } from './services/simulation';
import { PurchaseOrdersTab } from './components/PurchaseOrdersTab';
import { date, money, t } from './services/i18n';

const DEFAULT_CONFIG: OrchestrationConfig = {
  statuses: ['Placed', 'Out Of Stock'],
  stockPointType: 'warehouse',
  stockPointRank: 'P1',
  consolidationMode: 'cheapest_price',
  blockIfFrancoNotMet: false,
  selectedSupplierIds: [],
};

const steps = () => [t('Execution scenario'), t('Consolidated purchase orders')];

const pad = (n: number) => String(n).padStart(2, '0');
/** "YYYY-MM-DD HH:MM", the format shown in the strategy list. */
const stamp = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Sales channels of the site (GET /sales_channels), plus channels found in the orders that are not in that list. */
function salesChannelOptions(data: Dataset): { id: string; name: string }[] {
  const known = data.salesChannels ?? [];
  const extra = [...new Set(data.lines.map((l) => l.channel).filter((x): x is string => !!x))]
    .filter((id) => !known.some((c) => c.id === id))
    .map((id) => ({ id, name: id }));
  return [...known, ...extra.sort((a, b) => a.id.localeCompare(b.id))];
}

/** Next execution of a schedule from now, in the browser's time zone. */
function nextRun(schedule: { days: number[]; times: string[] }): string | undefined {
  const now = new Date();
  for (let d = 0; d < 8; d++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
    if (!schedule.days.includes(day.getDay())) continue;
    for (const t of [...schedule.times].sort()) {
      const [h, m] = t.split(':').map(Number);
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
      if (at > now) return stamp(at);
    }
  }
  return undefined;
}

type Tab = 'strategies' | 'purchases' | 'prices' | 'settings';

/** ?settings (or #settings) in the URL opens the settings tab directly. */
const settingsRequested = () => {
  const u = new URL(window.location.href);
  return u.searchParams.has('settings') || /(^|[#&])settings\b/.test(u.hash);
};

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<Step>(Step.StrategyManagement);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [strategiesLoading, setStrategiesLoading] = useState(true);
  /** Strategy being edited or simulated (saved on Finish and save / Launch). */
  const [current, setCurrent] = useState<Scenario | null>(null);
  const strategyName = current?.name ?? '';
  const [orchestrationConfig, setOrchestrationConfig] = useState<OrchestrationConfig>(DEFAULT_CONFIG);
  const [tab, setTab] = useState<Tab>(settingsRequested() ? 'settings' : 'strategies');

  // ---------- context and data ----------
  // Context (environment + site ID) from OneStock or the settings, and the data source saved for that site.
  const [context, setContext] = useState<HostContext | null | undefined>(undefined);
  const [mode, setMode] = useState<DataMode | undefined>(undefined);
  useEffect(() => {
    resolveHostContext().then(async (ctx) => {
      setContext(ctx);
      // First run: no environment known yet, show the settings so it can be entered.
      if (!ctx) setTab('settings');
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

  // ---------- strategies (per site in dynamic mode) ----------
  const [strategyError, setStrategyError] = useState<string | null>(null);
  const reloadStrategies = useCallback(async () => {
    if (!source) return;
    setStrategiesLoading(true);
    try {
      setScenarios(await source.listStrategies());
      setStrategyError(null);
    } catch (e) {
      setScenarios([]);
      setStrategyError((e as Error).message);
    } finally {
      setStrategiesLoading(false);
    }
  }, [source]);
  useEffect(() => {
    reloadStrategies();
  }, [reloadStrategies]);

  const persist = async (s: Scenario) => {
    try {
      await source!.saveStrategy(s);
      setStrategyError(null);
    } catch (e) {
      setStrategyError(t('The strategy could not be saved: {error}', { error: (e as Error).message }));
    }
    await reloadStrategies();
  };

  // ---------- strategy flow ----------
  const openStrategy = (strategy: Scenario, step: Step) => {
    setLaunchError(null);
    setCurrent(strategy);
    if (strategy.config) {
      // Keep only the statuses available in the current data (an empty list means no status condition).
      const options = data?.statusOptions ?? [];
      const statuses = options.length ? strategy.config.statuses.filter((st) => options.includes(st)) : strategy.config.statuses;
      setOrchestrationConfig({ ...strategy.config, statuses });
    }
    setCurrentStep(step);
  };

  const handleCreateNew = () => {
    setLaunchError(null);
    setCurrent({
      id: `ST-${Date.now().toString(36)}`,
      name: t('New strategy {date}', { date: date(new Date()) }),
      description: '',
      rules: [],
      metrics: { fulfillmentRate: 0, shippingCost: 0, deliveryTime: 0, carbonFootprint: 0, orderCount: 0, itemCount: 0 },
      status: 'Draft',
    });
    setOrchestrationConfig({ ...DEFAULT_CONFIG, statuses: data?.statusOptions ?? DEFAULT_CONFIG.statuses, selectedSupplierIds: [] });
    setCurrentStep(Step.OrchestrationScenarios);
  };

  const handleUpdateStrategyName = (id: string, newName: string) => {
    const s = scenarios.find((x) => x.id === id);
    if (s) persist({ ...s, name: newName });
  };

  const handleSaveSchedule = (id: string, schedule: { days: number[]; times: string[] }) => {
    const s = scenarios.find((x) => x.id === id);
    if (s) persist({ ...s, schedule, nextExecution: nextRun(schedule), status: s.status === 'Draft' ? 'Scheduled' : s.status });
  };

  const handleDelete = async (s: Scenario) => {
    if (!window.confirm(t('Delete the strategy "{name}"?', { name: s.name }))) return;
    try {
      await source!.deleteStrategy(s.id);
    } catch (e) {
      setStrategyError(t('The strategy could not be deleted: {error}', { error: (e as Error).message }));
    }
    await reloadStrategies();
  };

  /** Saves the current strategy with its scenario and the figures of its simulation. */
  const saveCurrent = async (launched: boolean) => {
    if (!current) return;
    const sim = data ? simulate(data, orchestrationConfig) : null;
    await persist({
      ...current,
      config: orchestrationConfig,
      metrics: {
        ...current.metrics,
        orderCount: sim?.matchedOrders ?? current.metrics.orderCount,
        itemCount: sim ? sim.results.reduce((n, r) => n + r.totalQuantity, 0) : current.metrics.itemCount,
        totalPurchaseAmount: sim?.totalPurchaseAmount ?? current.metrics.totalPurchaseAmount,
      },
      ...(launched ? { lastExecuted: stamp(new Date()), status: 'Active' as const } : {}),
    });
    setCurrentStep(Step.StrategyManagement);
  };

  // ---------- launch: supplier purchase orders + order line status change ----------
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [launchNotice, setLaunchNotice] = useState<string | null>(null);

  const launch = async () => {
    if (!current || !data || !source) return;
    const sim = simulate(data, orchestrationConfig);
    const orders = toPurchaseOrders(sim, orchestrationConfig, { id: current.id, name: current.name });
    if (!orders.length) return setLaunchError(t('Nothing to order: no supplier can be ordered from with this scenario.'));
    const target = (await source.getSettings().catch(() => null))?.launchStatus || '';
    const lineCount = orders.reduce((n, o) => n + o.lines.reduce((m, l) => m + l.orderLines.length, 0), 0);
    const total = money(orders.reduce((s, o) => s + o.total, 0));
    const question =
      t('Create {count} supplier order(s) for {amount}?', { count: orders.length, amount: total }) +
      '\n' +
      (target
        ? t('{lines} order line(s) will move to the status "{status}".', { lines: lineCount, status: target })
        : t('The order line statuses will not change: no status after launch is set in the settings.'));
    if (!window.confirm(question)) return;
    setLaunching(true);
    setLaunchError(null);
    try {
      const r = await source.launch(orders);
      await saveCurrent(true);
      setLaunchNotice(
        t('{count} supplier order(s) created.', { count: r.purchaseOrders.length }) +
          (r.target
            ? ' ' + t('{updated} order line(s) moved to "{status}", {failed} failed.', { updated: r.updated, status: r.target, failed: r.failed })
            : ''),
      );
      reloadData();
      setTab('purchases');
    } catch (e) {
      setLaunchError(t('The launch failed: {error}', { error: (e as Error).message }));
    } finally {
      setLaunching(false);
    }
  };

  const backToDashboard = () => setCurrentStep(Step.StrategyManagement);
  const prevStep = () => setCurrentStep((s) => (s > 0 ? ((s - 1) as Step) : s));
  const nextStep = () => setCurrentStep((s) => (s < 2 ? ((s + 1) as Step) : s));

  const inFlow = currentStep !== Step.StrategyManagement;

  // ---------- rendering ----------
  if (!source) {
    return <ExtensionLayout><OsLoading text={t('Reading the OneStock context')} /></ExtensionLayout>;
  }

  const dataState = dataError ? (
    <OsAlert color="red">
      {t('Data could not be loaded: {error}', { error: dataError })}
      {source.mode === 'dynamic' && ' ' + t('Check the environment connection and the order line statuses in the settings.')}
    </OsAlert>
  ) : !data ? (
    <OsLoading text={t('Loading orders, suppliers and prices')} />
  ) : null;

  const footer = inFlow && (
    <div className="os-actionbar">
      <OsButton kind="secondary" icon="arrow-left" onClick={currentStep === Step.OrchestrationScenarios ? backToDashboard : prevStep}>
        {currentStep === Step.OrchestrationScenarios ? t('Back to strategies') : t('Previous step')}
      </OsButton>
      {currentStep < Step.ResultsVisualization ? (
        <OsButton onClick={nextStep} iconEnd="arrow-right">{t('Continue')}</OsButton>
      ) : (
        <OsButton icon="check" onClick={() => saveCurrent(false)}>{t('Finish and save')}</OsButton>
      )}
    </div>
  );

  if (inFlow) {
    return (
      <ExtensionLayout footer={footer}>
        <div className="os-col">
          <PageHeader title={strategyName} onBack={backToDashboard} badge={currentStep === Step.OrchestrationScenarios ? t('Draft') : undefined} />
          <div className="os-card" style={{ padding: '12px 16px' }}>
            <OsStepper steps={steps()} current={currentStep - 1} onStepClick={(i) => setCurrentStep((i + 1) as Step)} />
          </div>
          {launchError && <OsAlert color="red">{launchError}</OsAlert>}
          {dataState ??
            (currentStep === Step.OrchestrationScenarios ? (
              <OrchestrationScenarios config={orchestrationConfig} onChange={setOrchestrationConfig} statusOptions={data!.statusOptions} suppliers={data!.suppliers}
                channelOptions={salesChannelOptions(data!)}
                typeOptions={[...new Set(data!.lines.flatMap((l) => l.orderTypes ?? []))].sort()}
                infoCatalog={infoCatalog(data!.lines)} />
            ) : (
              <ResultsVisualization strategyName={strategyName} config={orchestrationConfig} data={data!} onNext={launch} launching={launching} />
            ))}
        </div>
      </ExtensionLayout>
    );
  }

  const tabs: { id: Tab; label: string; discreet?: boolean }[] = [
    { id: 'strategies', label: t('Strategies') },
    { id: 'purchases', label: t('Supplier orders') },
    { id: 'prices', label: t('Supplier prices') },
    // Invisible until hovered (or selected).
    { id: 'settings', label: t('Settings'), discreet: true },
  ];

  return (
    <ExtensionLayout>
      <div className="os-col">
        <OsTabs tabs={tabs} value={tab} onChange={setTab} />
        {tab === 'strategies' && (
          <>
            {dataError && dataState}
            {strategyError && <OsAlert color="red">{strategyError}</OsAlert>}
            <StrategyDashboard
              scenarios={scenarios}
              loading={strategiesLoading}
              onSaveSchedule={handleSaveSchedule}
              onDelete={handleDelete}
              onSelect={(s) => openStrategy(s, Step.ResultsVisualization)}
              onEdit={(s) => openStrategy(s, Step.OrchestrationScenarios)}
              onCreateNew={handleCreateNew}
              onUpdateName={handleUpdateStrategyName}
            />
          </>
        )}
        {tab === 'purchases' && <PurchaseOrdersTab source={source} notice={launchNotice} />}
        {tab === 'prices' && <PricingTab source={source} onDataChanged={reloadData} />}
        {tab === 'settings' && (
          <SettingsTab source={source} context={context ?? null} mode={source.mode} onModeChange={setMode} onContextChange={changeContext} onSaved={reloadData} />
        )}
      </div>
    </ExtensionLayout>
  );
};

export default App;
