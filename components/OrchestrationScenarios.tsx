import React, { useState } from 'react';
import { InfoCondition, InfoSource, OrchestrationConfig, OrderDateFilter, OrderStatus, StockPointType, StockPointRank, ConsolidationMode, SupplierRef } from '../types';
import { OsButton, OsCheckbox, OsFloating, OsIcon, OsSwitch, OsTag } from './os';
import { date as fmtDate, t } from '../services/i18n';
import { InfoConditionEditor, infoConditionLabel, newInfoCondition } from './InfoConditionEditor';

interface OrchestrationScenariosProps {
  config: OrchestrationConfig;
  onChange: (config: OrchestrationConfig) => void;
  /** Order line statuses that can be selected (from the settings). */
  statusOptions: string[];
  suppliers: SupplierRef[];
  /** Sales channels of the site (id + name) and order types found in the loaded order lines. */
  channelOptions: { id: string; name: string }[];
  typeOptions: string[];
  /** Information keys and values found in the loaded orders, per source. */
  infoCatalog: Record<InfoSource, Map<string, Set<string>>>;
}

type Condition = 'status' | 'date' | 'channel' | 'otype' | 'customer' | 'item' | 'type' | 'rank' | 'suppliers';
/** Open floating menu: a condition, an add menu, or `info:<id>` for an information field condition. */
type Menu = Condition | 'add-order' | 'add-stock' | `info:${string}` | null;

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
const LABELS: Record<Condition, string> = {
  status: 'Status', date: 'Creation date', channel: 'Sales channel', otype: 'Order type', customer: 'Customer', item: 'Item',
  type: 'Type', rank: 'Rank', suppliers: 'Suppliers',
};
const ORDER_CONDITIONS: Condition[] = ['status', 'date', 'channel', 'otype', 'customer', 'item'];

/** Editor of a text condition: several values separated by commas, matched as "contains". */
const TextEditor: React.FC<{ id: string; value: string; placeholder: string; onChange: (v: string) => void; onDone: () => void }> = ({ id, value, placeholder, onChange, onDone }) => (
  <div className="os-col" style={{ gap: 4, padding: 8 }}>
    <input id={id} className="os-input" autoFocus value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onDone()} />
    <span className="os-hint">{t('Contains one of the values; separate several values with commas.')}</span>
  </div>
);

/** Quick choices for the order creation date: [label, from D-n, to D-n]. */
const DATE_PRESETS: [string, number, number][] = [
  ['Today', 0, 0],
  ['Yesterday', 1, 1],
  ['Last 7 days', 6, 0],
  ['D-7 to D-1', 7, 1],
  ['D-30 to D-1', 30, 1],
];

const dayLabel = (n: number) => (n === 0 ? t('Today') : t('D-{n}', { n }));
const isoLabel = (iso: string) => fmtDate(new Date(`${iso}T00:00:00`));

/** Text of an order date condition, e.g. "D-7 → D-1" or "01/11/2026 → 15/11/2026". */
export function orderDateLabel(f: OrderDateFilter): string {
  if (f.mode === 'relative') {
    const a = Math.max(f.fromDays, f.toDays);
    const b = Math.min(f.fromDays, f.toDays);
    return a === b ? dayLabel(a) : `${dayLabel(a)} → ${dayLabel(b)}`;
  }
  if (f.from && f.to) return `${isoLabel(f.from)} → ${isoLabel(f.to)}`;
  if (f.from) return t('from {date}', { date: isoLabel(f.from) });
  if (f.to) return t('until {date}', { date: isoLabel(f.to) });
  return t('Any date');
}

const DateEditor: React.FC<{ value: OrderDateFilter; onChange: (v: OrderDateFilter) => void }> = ({ value, onChange }) => {
  const num = (s: string) => Math.max(0, Math.min(365, Math.round(Number(s) || 0)));
  return (
    <div className="os-col" style={{ gap: 8, padding: 8 }}>
      <div className="os-seg" role="group" aria-label={t('Creation date')}>
        <button type="button" className={value.mode === 'relative' ? 'on' : ''} aria-pressed={value.mode === 'relative'}
          onClick={() => onChange({ mode: 'relative', fromDays: 7, toDays: 1 })}>{t('Relative to the run day')}</button>
        <button type="button" className={value.mode === 'absolute' ? 'on' : ''} aria-pressed={value.mode === 'absolute'}
          onClick={() => onChange({ mode: 'absolute' })}>{t('Fixed dates')}</button>
      </div>
      {value.mode === 'relative' ? (
        <>
          <div className="os-row" style={{ gap: 4 }}>
            {DATE_PRESETS.map(([label, from, to]) => (
              <button key={label} type="button" className="os-btn tertiary brand" style={{ minHeight: 30, padding: '4px 8px' }}
                onClick={() => onChange({ mode: 'relative', fromDays: from, toDays: to })}>{t(label)}</button>
            ))}
          </div>
          <div className="os-row" style={{ flexWrap: 'nowrap' }}>
            <label className="os-label-s" htmlFor="od-from">{t('From D-')}</label>
            <input id="od-from" className="os-input num" style={{ width: 70 }} type="number" min={0} max={365} value={value.fromDays}
              onChange={(e) => onChange({ ...value, fromDays: num(e.target.value) })} />
            <label className="os-label-s" htmlFor="od-to">{t('to D-')}</label>
            <input id="od-to" className="os-input num" style={{ width: 70 }} type="number" min={0} max={365} value={value.toDays}
              onChange={(e) => onChange({ ...value, toDays: num(e.target.value) })} />
          </div>
          <span className="os-hint">{t('D is the day the strategy runs. D-0 is today.')}</span>
        </>
      ) : (
        <div className="os-row" style={{ flexWrap: 'nowrap' }}>
          <label className="os-label-s" htmlFor="od-abs-from">{t('From')}</label>
          <input id="od-abs-from" className="os-input" type="date" style={{ width: 160 }} value={value.from ?? ''} onChange={(e) => onChange({ ...value, from: e.target.value || undefined })} />
          <label className="os-label-s" htmlFor="od-abs-to">{t('To')}</label>
          <input id="od-abs-to" className="os-input" type="date" style={{ width: 160 }} value={value.to ?? ''} onChange={(e) => onChange({ ...value, to: e.target.value || undefined })} />
        </div>
      )}
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="os-card os-col">
    <h3 className="os-title-s" style={{ margin: 0 }}>{title}</h3>
    {children}
  </section>
);

export const OrchestrationScenarios: React.FC<OrchestrationScenariosProps> = ({ config, onChange, statusOptions, suppliers, channelOptions, typeOptions, infoCatalog }) => {
  const [activeMenu, setActiveMenu] = useState<Menu>(null);
  const close = () => setActiveMenu(null);
  const toggle = (m: Exclude<Menu, null>) => setActiveMenu((cur) => (cur === m ? null : m));

  const has: Record<Condition, boolean> = {
    status: config.statuses.length > 0,
    date: !!config.orderDate,
    channel: config.salesChannels !== undefined,
    otype: config.orderTypes !== undefined,
    customer: config.customerQuery !== undefined,
    item: config.itemQuery !== undefined,
    type: !!config.stockPointType,
    rank: !!config.stockPointRank,
    suppliers: config.selectedSupplierIds !== undefined,
  };

  const add = (c: Condition) => {
    if (c === 'status') onChange({ ...config, statuses: statusOptions.length ? [...statusOptions] : config.statuses });
    if (c === 'date') onChange({ ...config, orderDate: { mode: 'relative', fromDays: 7, toDays: 1 } });
    if (c === 'channel') onChange({ ...config, salesChannels: channelOptions.map((o) => o.id) });
    if (c === 'otype') onChange({ ...config, orderTypes: [...typeOptions] });
    if (c === 'customer') onChange({ ...config, customerQuery: '' });
    if (c === 'item') onChange({ ...config, itemQuery: '' });
    if (c === 'type') onChange({ ...config, stockPointType: 'supplier' });
    if (c === 'rank') onChange({ ...config, stockPointRank: 'P1' });
    if (c === 'suppliers') onChange({ ...config, selectedSupplierIds: [] });
    setActiveMenu(['status', 'suppliers', 'date', 'channel', 'otype', 'customer', 'item'].includes(c) ? c : null);
  };

  const remove = (c: Condition) => {
    if (c === 'status') onChange({ ...config, statuses: [] });
    if (c === 'date') onChange({ ...config, orderDate: undefined });
    if (c === 'channel') onChange({ ...config, salesChannels: undefined });
    if (c === 'otype') onChange({ ...config, orderTypes: undefined });
    if (c === 'customer') onChange({ ...config, customerQuery: undefined });
    if (c === 'item') onChange({ ...config, itemQuery: undefined });
    if (c === 'type') onChange({ ...config, stockPointType: undefined });
    if (c === 'rank') onChange({ ...config, stockPointRank: undefined });
    if (c === 'suppliers') onChange({ ...config, selectedSupplierIds: undefined });
    close();
  };

  const toggleStatus = (status: OrderStatus) => {
    const statuses = config.statuses.includes(status) ? config.statuses.filter((s) => s !== status) : [...config.statuses, status];
    if (statuses.length) onChange({ ...config, statuses });
  };

  /** Toggles a value of a list condition; the last value cannot be unchecked (remove the condition instead). */
  const toggleIn = (list: string[], v: string) => {
    const next = list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
    return next.length ? next : list;
  };

  const checkList = (title: string, options: { id: string; name: string }[], selected: string[], set: (next: string[]) => void, empty: string) => (
    <>
      <div className="os-float-head"><span className="os-body-l t-secondary">{title}</span></div>
      {options.length === 0 && <div className="os-opt t-secondary">{empty}</div>}
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {options.map((o) => (
          <div key={o.id}>
            <OsCheckbox checked={selected.includes(o.id)} onChange={() => set(toggleIn(selected, o.id))}
              label={o.name === o.id ? o.id : <span style={{ display: 'flex', flexDirection: 'column' }}><span className="os-label-s">{o.name}</span><span className="os-body-s t-secondary">{o.id}</span></span>} />
          </div>
        ))}
      </div>
    </>
  );

  const toggleSupplier = (id: string) => {
    const cur = config.selectedSupplierIds || [];
    onChange({ ...config, selectedSupplierIds: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };

  const tag = (c: Condition, category: string, value: string, editor: React.ReactNode, width?: number) => (
    <div style={{ position: 'relative' }} key={c}>
      <OsTag draggable onClick={() => toggle(c)} onClose={() => remove(c)}>
        <span className="muted">
          {c === 'date'
            ? t('{category} · {field}:', { category: t(category), field: t(LABELS[c]) })
            : c === 'customer' || c === 'item'
              ? t('{category} · {field} contains', { category: t(category), field: t(LABELS[c]) })
              : t('{category} · {field} in', { category: t(category), field: t(LABELS[c]) })}{' '}
        </span>
        {value}
      </OsTag>
      {activeMenu === c && <OsFloating onClose={close} style={width ? { width } : undefined}>{editor}</OsFloating>}
    </div>
  );

  const addInfo = () => {
    const c = newInfoCondition();
    onChange({ ...config, infoConditions: [...(config.infoConditions ?? []), c] });
    setActiveMenu(`info:${c.id}`);
  };
  const setInfo = (c: InfoCondition) => onChange({ ...config, infoConditions: (config.infoConditions ?? []).map((x) => (x.id === c.id ? c : x)) });
  const removeInfo = (id: string) => {
    const rest = (config.infoConditions ?? []).filter((x) => x.id !== id);
    onChange({ ...config, infoConditions: rest.length ? rest : undefined });
    close();
  };

  const addButton = (menu: 'add-order' | 'add-stock', options: Condition[], withInfo = false) => {
    const missing = options.filter((c) => !has[c]);
    return (
      <div style={{ position: 'relative' }}>
        <OsButton kind="secondary" icon="add" disabled={!missing.length && !withInfo} onClick={() => toggle(menu)}>{t('Add condition')}</OsButton>
        {activeMenu === menu && (
          <OsFloating onClose={close}>
            {missing.map((c) => (
              <button key={c} type="button" className="os-opt" onClick={() => add(c)}>{t(LABELS[c])}</button>
            ))}
            {withInfo && <button type="button" className="os-opt" onClick={addInfo}>{t('Information field')}</button>}
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
        {has.status && (
          <div className="os-row">
            {tag('status', 'Order information', config.statuses.join(', '), (
              <>
                <div className="os-float-head"><span className="os-body-l t-secondary">{t('Order line status')}</span></div>
                {statusOptions.length === 0 && <div className="os-opt t-secondary">{t('No status configured')}</div>}
                {statusOptions.map((s) => (
                  <div key={s}><OsCheckbox checked={config.statuses.includes(s)} onChange={() => toggleStatus(s)} label={s} /></div>
                ))}
              </>
            ), 240)}
          </div>
        )}
        {config.orderDate && (
          <div className="os-row">
            {tag('date', 'Order information', orderDateLabel(config.orderDate), (
              <DateEditor value={config.orderDate} onChange={(orderDate) => onChange({ ...config, orderDate })} />
            ), 440)}
          </div>
        )}
        {config.salesChannels && (
          <div className="os-row">
            {tag('channel', 'Order information',
              config.salesChannels.map((id) => channelOptions.find((o) => o.id === id)?.name ?? id).join(', ') || t('None'),
              checkList(t('Sales channel'), channelOptions, config.salesChannels, (salesChannels) => onChange({ ...config, salesChannels }), t('No sales channel found')), 260)}
          </div>
        )}
        {config.orderTypes && (
          <div className="os-row">
            {tag('otype', 'Order information', config.orderTypes.join(', ') || t('None'),
              checkList(t('Order type'), typeOptions.map((v) => ({ id: v, name: v })), config.orderTypes, (orderTypes) => onChange({ ...config, orderTypes }), t('No order type in the loaded orders')), 260)}
          </div>
        )}
        {config.customerQuery !== undefined && (
          <div className="os-row">
            {tag('customer', 'Order information', config.customerQuery.trim() || t('(to fill in)'), (
              <TextEditor id="cond-customer" value={config.customerQuery} placeholder={t('Name or email')}
                onChange={(customerQuery) => onChange({ ...config, customerQuery })} onDone={close} />
            ), 360)}
          </div>
        )}
        {config.itemQuery !== undefined && (
          <div className="os-row">
            {tag('item', 'Order information', config.itemQuery.trim() || t('(to fill in)'), (
              <TextEditor id="cond-item" value={config.itemQuery} placeholder={t('SKU or name')}
                onChange={(itemQuery) => onChange({ ...config, itemQuery })} onDone={close} />
            ), 360)}
          </div>
        )}
        {(config.infoConditions ?? []).map((c) => {
          const label = infoConditionLabel(c);
          const menu = `info:${c.id}` as const;
          return (
            <div className="os-row" key={c.id}>
              <div style={{ position: 'relative' }}>
                <OsTag draggable onClick={() => toggle(menu)} onClose={() => removeInfo(c.id)}>
                  <span className="muted">{label.prefix} </span>
                  {label.value}
                </OsTag>
                {activeMenu === menu && (
                  <OsFloating onClose={close}>
                    <InfoConditionEditor value={c} onChange={setInfo} catalog={infoCatalog} />
                  </OsFloating>
                )}
              </div>
            </div>
          );
        })}
        <div className="os-row">{addButton('add-order', ORDER_CONDITIONS, true)}</div>
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
