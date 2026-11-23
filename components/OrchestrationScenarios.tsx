import React, { useState } from 'react';
import { OrchestrationConfig, OrderStatus, StockPointType, StockPointRank, ConsolidationMode, SupplierRef } from '../types';
import { OsButton, OsCheckbox, OsFloating, OsIcon, OsSwitch, OsTag } from './os';
import { t } from '../services/i18n';

interface OrchestrationScenariosProps {
  config: OrchestrationConfig;
  onChange: (config: OrchestrationConfig) => void;
  /** Order line statuses that can be selected (from the settings). */
  statusOptions: string[];
  suppliers: SupplierRef[];
}

type Condition = 'status' | 'type' | 'rank' | 'suppliers';
type Menu = Condition | 'add-order' | 'add-stock' | null;

const TYPES: { value: StockPointType; label: string }[] = [
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'supplier', label: 'Supplier' },
];
// Texts below are English keys, translated where they are rendered.
const RANKS: StockPointRank[] = ['P1', 'P2', 'P3'];
const MODES: { value: ConsolidationMode; title: string; text: string }[] = [
  { value: 'cheapest_price', title: 'Cheapest purchase price', text: 'Groups quantities to reach the best unit price tier per SKU.' },
  { value: 'cheapest_price_franco', title: 'Price and Franco optimisation', text: 'Optimises both the unit price and reaching the free shipping threshold (Franco).' },
];
const LABELS: Record<Condition, string> = { status: 'Status', type: 'Type', rank: 'Rank', suppliers: 'Suppliers' };

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="os-card os-col">
    <h3 className="os-title-s" style={{ margin: 0 }}>{title}</h3>
    {children}
  </section>
);

export const OrchestrationScenarios: React.FC<OrchestrationScenariosProps> = ({ config, onChange, statusOptions, suppliers }) => {
  const [activeMenu, setActiveMenu] = useState<Menu>(null);
  const close = () => setActiveMenu(null);
  const toggle = (m: Exclude<Menu, null>) => setActiveMenu((cur) => (cur === m ? null : m));

  const has: Record<Condition, boolean> = {
    status: config.statuses.length > 0,
    type: !!config.stockPointType,
    rank: !!config.stockPointRank,
    suppliers: config.selectedSupplierIds !== undefined,
  };

  const add = (c: Condition) => {
    if (c === 'status') onChange({ ...config, statuses: statusOptions.length ? [...statusOptions] : config.statuses });
    if (c === 'type') onChange({ ...config, stockPointType: 'supplier' });
    if (c === 'rank') onChange({ ...config, stockPointRank: 'P1' });
    if (c === 'suppliers') onChange({ ...config, selectedSupplierIds: [] });
    setActiveMenu(c === 'status' || c === 'suppliers' ? c : null);
  };

  const remove = (c: Condition) => {
    if (c === 'status') onChange({ ...config, statuses: [] });
    if (c === 'type') onChange({ ...config, stockPointType: undefined });
    if (c === 'rank') onChange({ ...config, stockPointRank: undefined });
    if (c === 'suppliers') onChange({ ...config, selectedSupplierIds: undefined });
    close();
  };

  const toggleStatus = (status: OrderStatus) => {
    const statuses = config.statuses.includes(status) ? config.statuses.filter((s) => s !== status) : [...config.statuses, status];
    if (statuses.length) onChange({ ...config, statuses });
  };

  const toggleSupplier = (id: string) => {
    const cur = config.selectedSupplierIds || [];
    onChange({ ...config, selectedSupplierIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };

  const tag = (c: Condition, category: string, value: string, editor: React.ReactNode, width?: number) => (
    <div style={{ position: 'relative' }} key={c}>
      <OsTag draggable onClick={() => toggle(c)} onClose={() => remove(c)}>
        <span className="muted">{t('{category} · {field} in', { category: t(category), field: t(LABELS[c]) })} </span>
        {value}
      </OsTag>
      {activeMenu === c && <OsFloating onClose={close} style={width ? { width } : undefined}>{editor}</OsFloating>}
    </div>
  );

  const addButton = (menu: 'add-order' | 'add-stock', options: Condition[]) => {
    const missing = options.filter((c) => !has[c]);
    return (
      <div style={{ position: 'relative' }}>
        <OsButton kind="secondary" icon="add" disabled={!missing.length} onClick={() => toggle(menu)}>{t('Add condition')}</OsButton>
        {activeMenu === menu && (
          <OsFloating onClose={close}>
            {missing.map((c) => (
              <button key={c} type="button" className="os-opt" onClick={() => add(c)}>{t(LABELS[c])}</button>
            ))}
          </OsFloating>
        )}
      </div>
    );
  };

  const option = (selected: boolean, label: string, onClick: () => void) => (
    <button key={label} type="button" className={`os-opt${selected ? ' selected' : ''}`} onClick={onClick}>
      <span style={{ flex: 1 }}>{label}</span>
      {selected && <OsIcon icon="check" size="s" />}
    </button>
  );

  return (
    <div className="os-col">
      <Section title={t('Order information')}>
        <div className="os-row">
          {has.status &&
            tag('status', 'Order information', config.statuses.join(', '), (
              <>
                <div className="os-float-head"><span className="os-body-l t-secondary">{t('Order line status')}</span></div>
                {statusOptions.length === 0 && <div className="os-opt t-secondary">{t('No status configured')}</div>}
                {statusOptions.map((s) => (
                  <div key={s}><OsCheckbox checked={config.statuses.includes(s)} onChange={() => toggleStatus(s)} label={s} /></div>
                ))}
              </>
            ), 240)}
          {addButton('add-order', ['status'])}
        </div>
        {!has.status && <p className="os-label-s t-secondary" style={{ margin: 0 }}>{t('No condition: order lines of every configured status are taken.')}</p>}
      </Section>

      <Section title={t('Stock point')}>
        {has.type &&
          <div className="os-row">
            {tag('type', 'Stock point', t(TYPES.find((x) => x.value === config.stockPointType)?.label ?? String(config.stockPointType)), (
              TYPES.map((x) => option(config.stockPointType === x.value, t(x.label), () => { onChange({ ...config, stockPointType: x.value }); close(); }))
            ))}
          </div>}
        {has.rank &&
          <div className="os-row">
            {tag('rank', 'Stock point', String(config.stockPointRank), (
              RANKS.map((r) => option(config.stockPointRank === r, r, () => { onChange({ ...config, stockPointRank: r }); close(); }))
            ))}
          </div>}
        {has.suppliers &&
          <div className="os-row">
            {tag('suppliers', 'Stock point', config.selectedSupplierIds?.length ? t('{count} selected', { count: config.selectedSupplierIds.length }) : t('All'), (
              <>
                <div className="os-float-head">
                  <span className="os-body-l t-secondary">{t('Suppliers')}</span>
                  <OsButton kind="tertiary" color="brand" onClick={() => onChange({ ...config, selectedSupplierIds: [] })}>{t('All')}</OsButton>
                </div>
                <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                  {suppliers.length === 0 && <div className="os-opt t-secondary">{t('No supplier found')}</div>}
                  {suppliers.map((s) => (
                    <div key={s.id}>
                      <OsCheckbox
                        checked={(config.selectedSupplierIds || []).includes(s.id)}
                        onChange={() => toggleSupplier(s.id)}
                        label={
                          <span style={{ display: 'flex', flexDirection: 'column' }}>
                            <span className="os-label-s">{s.name}</span>
                            <span className="os-body-s t-secondary">{s.id}</span>
                          </span>
                        }
                      />
                    </div>
                  ))}
                </div>
              </>
            ), 280)}
          </div>}
        <div className="os-row">{addButton('add-stock', ['type', 'rank', 'suppliers'])}</div>
      </Section>

      <Section title={t('Consolidation strategy')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 8 }} role="radiogroup">
          {MODES.map((m) => {
            const on = config.consolidationMode === m.value;
            return (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={on}
                className={`os-choice${on ? ' on' : ''}`}
                onClick={() => onChange({ ...config, consolidationMode: m.value })}
              >
                <span className="act"><OsIcon icon={on ? 'radio-button-checked' : 'radio-button-unchecked'} /></span>
                <span>
                  <span className={`os-label-l${on ? ' t-brand' : ''}`} style={{ display: 'block' }}>{t(m.title)}</span>
                  <span className="os-label-s t-secondary">{t(m.text)}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: 12 }}>
          <OsSwitch
            checked={config.blockIfFrancoNotMet}
            onChange={(v) => onChange({ ...config, blockIfFrancoNotMet: v })}
            label={t('Block orders if Franco is not met')}
          />
          <p className="os-label-s t-secondary" style={{ margin: '0 0 0 40px' }}>
            {t("When a supplier's free shipping threshold is not reached, the associated orders are not validated.")}
          </p>
        </div>
      </Section>
    </div>
  );
};
