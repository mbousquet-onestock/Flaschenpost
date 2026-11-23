import React, { useState } from 'react';
import { OrchestrationConfig, OrderStatus, StockPointType, StockPointRank, ConsolidationMode, SupplierRef } from '../types';
import { OsBadge, OsButton, OsCheckbox, OsFloating, OsIcon, OsSwitch, OsTag } from './os';

interface OrchestrationScenariosProps {
  config: OrchestrationConfig;
  onChange: (config: OrchestrationConfig) => void;
  /** Order line statuses that can be selected (from the settings). */
  statusOptions: string[];
  suppliers: SupplierRef[];
}

type Menu = 'status' | 'type' | 'rank' | 'suppliers' | null;

const TYPES: { value: StockPointType; label: string }[] = [
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'supplier', label: 'Supplier' },
];
const RANKS: StockPointRank[] = ['P1', 'P2', 'P3'];
const MODES: { value: ConsolidationMode; title: string; text: string }[] = [
  { value: 'cheapest_price', title: 'Cheapest purchase price', text: 'Groups quantities to reach the best unit price tier per SKU.' },
  { value: 'cheapest_price_franco', title: 'Price and Franco optimisation', text: 'Optimises both the unit price and reaching the free shipping threshold (Franco).' },
];

const ConditionTag: React.FC<{ category: string; field: string; value: string; onEdit: () => void }> = ({ category, field, value, onEdit }) => (
  <OsTag draggable onClick={onEdit}>
    <span className="muted">{category} · {field} in </span>
    {value}
  </OsTag>
);

const OrRow: React.FC = () => (
  <div className="os-row" style={{ paddingTop: 4 }}>
    <OsBadge text="OR" color="grey" secondary />
    <OsButton kind="secondary" icon="add">Add condition</OsButton>
  </div>
);

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

  const toggleStatus = (status: OrderStatus) => {
    const statuses = config.statuses.includes(status) ? config.statuses.filter((s) => s !== status) : [...config.statuses, status];
    onChange({ ...config, statuses });
  };

  const toggleSupplier = (id: string) => {
    const cur = config.selectedSupplierIds || [];
    onChange({ ...config, selectedSupplierIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };

  return (
    <div className="os-col">
      <Section title="Order information">
        <div className="os-row">
          <div style={{ position: 'relative' }}>
            <ConditionTag category="Order information" field="Status" value={config.statuses.join(', ') || 'None'} onEdit={() => toggle('status')} />
            {activeMenu === 'status' && (
              <OsFloating onClose={close} style={{ width: 240 }}>
                <div className="os-float-head"><span className="os-body-l t-secondary">Order status</span></div>
                {statusOptions.length === 0 && <div className="os-opt t-secondary">No status configured</div>}
                {statusOptions.map((s) => (
                  <div key={s}><OsCheckbox checked={config.statuses.includes(s)} onChange={() => toggleStatus(s)} label={s} /></div>
                ))}
              </OsFloating>
            )}
          </div>
          <OsButton kind="secondary" icon="add" onClick={() => setActiveMenu('status')}>Add condition</OsButton>
        </div>
        <OrRow />
      </Section>

      <Section title="Stock point">
        <div className="os-row">
          <div style={{ position: 'relative' }}>
            <ConditionTag category="Stock point" field="Type" value={TYPES.find((t) => t.value === config.stockPointType)?.label ?? config.stockPointType} onEdit={() => toggle('type')} />
            {activeMenu === 'type' && (
              <OsFloating onClose={close}>
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    className={`os-opt${config.stockPointType === t.value ? ' selected' : ''}`}
                    onClick={() => { onChange({ ...config, stockPointType: t.value }); close(); }}
                  >
                    <span style={{ flex: 1 }}>{t.label}</span>
                    {config.stockPointType === t.value && <OsIcon icon="check" size="s" />}
                  </button>
                ))}
              </OsFloating>
            )}
          </div>
          <OsButton kind="secondary" icon="add" onClick={() => setActiveMenu('type')}>Add condition</OsButton>
        </div>

        <div className="os-row">
          <div style={{ position: 'relative' }}>
            <ConditionTag category="Stock point" field="Rank" value={config.stockPointRank} onEdit={() => toggle('rank')} />
            {activeMenu === 'rank' && (
              <OsFloating onClose={close}>
                {RANKS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`os-opt${config.stockPointRank === r ? ' selected' : ''}`}
                    onClick={() => { onChange({ ...config, stockPointRank: r }); close(); }}
                  >
                    <span style={{ flex: 1 }}>{r}</span>
                    {config.stockPointRank === r && <OsIcon icon="check" size="s" />}
                  </button>
                ))}
              </OsFloating>
            )}
          </div>
          <OsButton kind="secondary" icon="add" onClick={() => setActiveMenu('rank')}>Add condition</OsButton>
        </div>

        {config.stockPointType === 'supplier' && (
          <div className="os-row">
            <div style={{ position: 'relative' }}>
              <ConditionTag
                category="Stock point"
                field="Suppliers"
                value={config.selectedSupplierIds?.length ? `${config.selectedSupplierIds.length} selected` : 'All'}
                onEdit={() => toggle('suppliers')}
              />
              {activeMenu === 'suppliers' && (
                <OsFloating onClose={close} style={{ width: 280 }}>
                  <div className="os-float-head">
                    <span className="os-body-l t-secondary">Suppliers</span>
                    <OsButton kind="tertiary" color="brand" onClick={() => onChange({ ...config, selectedSupplierIds: [] })}>Clear</OsButton>
                  </div>
                  <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                    {suppliers.length === 0 && <div className="os-opt t-secondary">No supplier found</div>}
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
                </OsFloating>
              )}
            </div>
            <OsButton kind="secondary" icon="add" onClick={() => setActiveMenu('suppliers')}>Add condition</OsButton>
          </div>
        )}
        <OrRow />
      </Section>

      <Section title="Consolidation strategy">
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
                  <span className={`os-label-l${on ? ' t-brand' : ''}`} style={{ display: 'block' }}>{m.title}</span>
                  <span className="os-label-s t-secondary">{m.text}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: 12 }}>
          <OsSwitch
            checked={config.blockIfFrancoNotMet}
            onChange={(v) => onChange({ ...config, blockIfFrancoNotMet: v })}
            label="Block orders if Franco is not met"
          />
          <p className="os-label-s t-secondary" style={{ margin: '0 0 0 40px' }}>
            When a supplier's free shipping threshold is not reached, the associated orders are not validated.
          </p>
        </div>
      </Section>
    </div>
  );
};
