// Condition on a free "information" field of the order, customer, order item, destination or carrier,
// laid out like the OneStock rule editor: field, wanted field name, wanted field type, operator, values.
import React, { useState } from 'react';
import type { InfoCondition, InfoOperator, InfoSource, InfoType } from '../types';
import { t } from '../services/i18n';
import { OsButton, OsField, OsTag } from './os';

export const INFO_SOURCES: { value: InfoSource; label: string }[] = [
  { value: 'order', label: 'Order information' },
  { value: 'customer', label: 'Customer information' },
  { value: 'item', label: 'Order item information' },
  { value: 'destination', label: 'Destination information' },
  { value: 'carrier', label: 'Carrier information' },
];

const OPERATORS: Record<InfoType, { value: InfoOperator; label: string }[]> = {
  string: [
    { value: 'in', label: 'in' },
    { value: 'not_in', label: 'not in' },
    { value: 'contains', label: 'contains' },
    { value: 'exists', label: 'is filled in' },
    { value: 'not_exists', label: 'is empty' },
  ],
  number: [
    { value: 'eq', label: '=' },
    { value: 'neq', label: '≠' },
    { value: 'gt', label: '>' },
    { value: 'gte', label: '≥' },
    { value: 'lt', label: '<' },
    { value: 'lte', label: '≤' },
    { value: 'exists', label: 'is filled in' },
    { value: 'not_exists', label: 'is empty' },
  ],
  boolean: [
    { value: 'eq', label: 'is' },
    { value: 'neq', label: 'is not' },
    { value: 'exists', label: 'is filled in' },
    { value: 'not_exists', label: 'is empty' },
  ],
};

const noValue = (op: InfoOperator) => op === 'exists' || op === 'not_exists';
const singleValue = (c: InfoCondition) => c.type === 'boolean' || (c.type === 'number' && ['gt', 'gte', 'lt', 'lte'].includes(c.operator));

export function newInfoCondition(): InfoCondition {
  return { id: Math.random().toString(36).slice(2, 10), source: 'order', field: '', type: 'string', operator: 'in', values: [] };
}

/** Text of a condition for its tag, e.g. "Order information · gift in yes, maybe". */
export function infoConditionLabel(c: InfoCondition): { prefix: string; value: string } {
  const source = t(INFO_SOURCES.find((s) => s.value === c.source)?.label ?? c.source);
  const op = t(OPERATORS[c.type].find((o) => o.value === c.operator)?.label ?? c.operator);
  return { prefix: `${source} · ${c.field || t('(field to fill in)')} ${op}`, value: noValue(c.operator) ? '' : c.values.join(', ') || t('(to fill in)') };
}

export const InfoConditionEditor: React.FC<{
  value: InfoCondition;
  onChange: (c: InfoCondition) => void;
  /** Known keys and values per source, from the loaded orders. */
  catalog: Record<InfoSource, Map<string, Set<string>>>;
}> = ({ value: c, onChange, catalog }) => {
  const [draft, setDraft] = useState('');
  const keys = [...catalog[c.source].keys()].sort();
  const known = [...(catalog[c.source].get(c.field.trim()) ?? [])].sort();
  const id = `ic-${c.id}`;

  const addValue = () => {
    const v = draft.trim();
    if (v && !c.values.includes(v)) onChange({ ...c, values: [...c.values, v] });
    setDraft('');
  };

  return (
    <div className="os-col" style={{ gap: 12, padding: 8, width: 360 }}>
      <OsField label={t('Field')} htmlFor={`${id}-source`}>
        <select id={`${id}-source`} className="os-input" value={c.source} onChange={(e) => onChange({ ...c, source: e.target.value as InfoSource })}>
          {INFO_SOURCES.map((s) => <option key={s.value} value={s.value}>{t(s.label)}</option>)}
        </select>
      </OsField>
      <OsField label={t('Wanted field name')} htmlFor={`${id}-field`} hint={keys.length ? undefined : t('No field of this kind in the loaded orders: type its name.')}>
        <input id={`${id}-field`} className="os-input" list={`${id}-keys`} autoFocus value={c.field} onChange={(e) => onChange({ ...c, field: e.target.value })} />
        <datalist id={`${id}-keys`}>{keys.map((k) => <option key={k} value={k} />)}</datalist>
      </OsField>
      <OsField label={t('Wanted field type')} htmlFor={`${id}-type`}>
        <select id={`${id}-type`} className="os-input" value={c.type}
          onChange={(e) => {
            const type = e.target.value as InfoType;
            onChange({ ...c, type, operator: OPERATORS[type][0].value, values: type === 'boolean' ? ['true'] : [] });
          }}>
          <option value="string">string</option>
          <option value="number">number</option>
          <option value="boolean">boolean</option>
        </select>
      </OsField>
      <OsField label={t('Operator')} htmlFor={`${id}-op`}>
        <select id={`${id}-op`} className="os-input" value={c.operator}
          onChange={(e) => {
            const operator = e.target.value as InfoOperator;
            const next = { ...c, operator };
            onChange(singleValue(next) ? { ...next, values: c.values.slice(0, 1) } : next);
          }}>
          {OPERATORS[c.type].map((o) => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
        </select>
      </OsField>
      {!noValue(c.operator) &&
        (c.type === 'boolean' ? (
          <OsField label={t('Value')} htmlFor={`${id}-bool`}>
            <select id={`${id}-bool`} className="os-input" value={c.values[0] ?? 'true'} onChange={(e) => onChange({ ...c, values: [e.target.value] })}>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </OsField>
        ) : singleValue(c) ? (
          <OsField label={t('Value')} htmlFor={`${id}-num`}>
            <input id={`${id}-num`} className="os-input num" inputMode="decimal" value={c.values[0] ?? ''} onChange={(e) => onChange({ ...c, values: [e.target.value] })} />
          </OsField>
        ) : (
          <OsField label={t('Values')} htmlFor={`${id}-val`} hint={t('Press Enter to add each value.')}>
            <div className="os-row" style={{ gap: 4 }}>
              {c.values.map((v) => (
                <OsTag key={v} color="grey" onClose={() => onChange({ ...c, values: c.values.filter((x) => x !== v) })}>{v}</OsTag>
              ))}
            </div>
            <div className="os-row" style={{ flexWrap: 'nowrap' }}>
              <input id={`${id}-val`} className="os-input" list={`${id}-values`} value={draft} inputMode={c.type === 'number' ? 'decimal' : undefined}
                onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addValue(); } }} />
              <OsButton kind="secondary" icon="add" aria-label={t('Add')} onClick={addValue} disabled={!draft.trim()} />
            </div>
            <datalist id={`${id}-values`}>{known.filter((v) => !c.values.includes(v)).map((v) => <option key={v} value={v} />)}</datalist>
          </OsField>
        ))}
    </div>
  );
};
