// Supplier purchase prices: degressive price tiers per item and franco per supplier.
// Manual entry, or Excel import (with a downloadable template).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ItemRef, ItemWeight, PriceTier, ShippingMode, SupplierRef, SupplierTerm } from '../types';
import type { DataSource } from '../services/dataSource';
import { downloadWorkbook, parseImport, ParsedImport } from '../services/excel';
import { OsAlert, OsBadge, OsButton, OsCheckbox, OsField, OsIcon, OsLoading } from './os';
import { money, t } from '../services/i18n';

const eur = (n: number) => money(n, 4);
const toNum = (s: string) => {
  const n = Number(s.trim().replace(/\s|€/g, '').replace(',', '.'));
  return s.trim() && isFinite(n) ? n : undefined;
};

export const PricingTab: React.FC<{ source: DataSource; onDataChanged: () => void }> = ({ source, onDataChanged }) => {
  const [suppliers, setSuppliers] = useState<SupplierRef[]>([]);
  const [items, setItems] = useState<ItemRef[]>([]);
  const [prices, setPrices] = useState<PriceTier[]>([]);
  const [terms, setTerms] = useState<SupplierTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [filter, setFilter] = useState('');
  const [franco, setFranco] = useState('');
  const [shipMode, setShipMode] = useState<ShippingMode | ''>('');
  const [shipAmount, setShipAmount] = useState('');
  const [weights, setWeights] = useState<ItemWeight[]>([]);
  const [draft, setDraft] = useState({ itemId: '', minQty: '1', unitPrice: '' });
  const [draftError, setDraftError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<(ParsedImport & { fileName: string }) | null>(null);
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState(false);
  const [supplierWarning, setSupplierWarning] = useState<string | undefined>();
  const [newSupplier, setNewSupplier] = useState<{ id: string; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [list, p, it] = await Promise.all([source.listSuppliers(), source.getPrices(), source.listItems().catch(() => [] as ItemRef[])]);
      const s = list.suppliers;
      setSuppliers(s);
      setSupplierWarning(list.warning);
      setPrices(p.prices);
      setTerms(p.terms);
      setWeights(p.weights);
      setItems(it);
      setSupplierId((cur) => (cur && s.some((x) => x.id === cur) ? cur : s[0]?.id ?? ''));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [source]);

  useEffect(() => {
    reload();
  }, [reload]);

  const itemName = useMemo(() => new Map(items.map((i) => [i.id, i.name])), [items]);
  const countBySupplier = useMemo(() => {
    const m = new Map<string, number>();
    prices.forEach((p) => m.set(p.supplierId, (m.get(p.supplierId) || 0) + 1));
    return m;
  }, [prices]);
  const term = terms.find((x) => x.supplierId === supplierId);
  const weightOf = useMemo(() => new Map(weights.map((w) => [w.itemId, w.weightKg])), [weights]);

  useEffect(() => {
    setFranco(term?.franco == null ? '' : String(term.franco));
    setShipMode(term?.shipping?.mode ?? '');
    setShipAmount(term?.shipping ? String(term.shipping.amount) : '');
  }, [supplierId, term]);

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return prices
      .filter((p) => p.supplierId === supplierId)
      .filter((p) => !q || p.itemId.toLowerCase().includes(q) || (itemName.get(p.itemId) || '').toLowerCase().includes(q))
      .sort((a, b) => a.itemId.localeCompare(b.itemId) || a.minQty - b.minQty);
  }, [prices, supplierId, filter, itemName]);

  const run = async (fn: () => Promise<void>, done?: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      await reload();
      onDataChanged();
      if (done) setNotice(done);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** Saves the franco and the shipping fee of the selected supplier together. */
  const saveTerms = () => {
    const v = franco.trim() === '' ? null : toNum(franco);
    if (v === undefined || (v !== null && v < 0)) return setError(t('Franco must be a positive amount or empty.'));
    const amount = toNum(shipAmount);
    if (shipMode && (amount === undefined || amount < 0)) return setError(t('Enter a valid shipping fee amount.'));
    const shipping = shipMode ? { mode: shipMode, amount: amount! } : null;
    run(() => source.savePrices({ terms: [{ supplierId, franco: v, shipping }] }), t('Franco and shipping fee saved.'));
  };

  const updateWeight = (itemId: string, value: string) => {
    const weightKg = value.trim() === '' ? null : toNum(value);
    if (weightKg === undefined || (weightKg !== null && weightKg < 0) || weightKg === (weightOf.get(itemId) ?? null)) return;
    run(() => source.savePrices({ weights: [{ itemId, weightKg }] }));
  };

  const addTier = () => {
    const minQty = Number(draft.minQty);
    const unitPrice = toNum(draft.unitPrice);
    const itemId = draft.itemId.trim();
    if (!itemId) return setDraftError(t('Select an item.'));
    if (!Number.isInteger(minQty) || minQty < 1) return setDraftError(t('Minimum quantity must be an integer ≥ 1.'));
    if (unitPrice === undefined || unitPrice < 0) return setDraftError(t('Enter a valid unit price.'));
    setDraftError(null);
    run(async () => {
      await source.savePrices({ prices: [{ supplierId, itemId, minQty, unitPrice }] });
      setDraft({ itemId, minQty: '', unitPrice: '' });
    });
  };

  const updatePrice = (p: PriceTier, value: string) => {
    const unitPrice = toNum(value);
    if (unitPrice === undefined || unitPrice < 0 || unitPrice === p.unitPrice) return;
    run(() => source.savePrices({ prices: [{ ...p, unitPrice }] }));
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setNotice(null);
    try {
      setParsed({ ...(await parseImport(file, suppliers, items)), fileName: file.name });
    } catch (err) {
      setError(t('Unable to read {file}: {error}', { file: file.name, error: (err as Error).message }));
    }
  };

  const addSupplier = () => {
    if (!newSupplier) return;
    const id = newSupplier.id.trim();
    const name = newSupplier.name.trim() || id;
    if (!/^[\w.@:/ -]{1,128}$/.test(id)) return setError(t('Enter a supplier ID (letters, digits, - _ . : / @).'));
    if (suppliers.some((s) => s.id === id)) return setError(t('The supplier {id} already exists.', { id }));
    run(async () => {
      await source.saveSuppliers([{ id, name }]);
      setNewSupplier(null);
      setSupplierId(id);
    }, t('Supplier {name} added.', { name }));
  };

  const removeSupplier = (s: SupplierRef) => {
    if (!window.confirm(t('Delete the supplier "{name}" with its prices and franco?', { name: s.name }))) return;
    run(() => source.deleteSupplier(s.id), t('Supplier {name} deleted.', { name: s.name }));
  };

  const confirmImport = () => {
    if (!parsed) return;
    const replaceSuppliers = replace ? [...new Set(parsed.prices.map((p) => p.supplierId))] : [];
    const summary = t('{prices} price tier(s) and {terms} franco value(s) imported.', { prices: parsed.prices.length, terms: parsed.terms.length });
    run(async () => {
      if (parsed.newSuppliers.length) await source.saveSuppliers(parsed.newSuppliers);
      // Keep the stored shipping fee of a supplier when the file gives only its franco.
      const merged = parsed.terms.map((x) => (x.shipping === undefined ? { ...x, shipping: terms.find((y) => y.supplierId === x.supplierId)?.shipping ?? null } : x));
      await source.savePrices({ prices: parsed.prices, terms: merged, weights: parsed.weights, replaceSuppliers });
      setParsed(null);
    }, summary);
  };

  if (loading) return <OsLoading text={t('Loading suppliers and prices')} />;

  const importSuppliers = parsed ? new Set(parsed.prices.map((p) => p.supplierId)).size : 0;
  const selected = suppliers.find((s) => s.id === supplierId);

  return (
    <div className="os-col">
      <div className="os-card os-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ minWidth: 240, flex: 1 }}>
          <h2 className="os-title-m" style={{ margin: 0 }}>{t('Supplier purchase prices')}</h2>
          <p className="os-label-s t-secondary" style={{ margin: '4px 0 0' }}>
            {t('Unit prices per item with quantity tiers, and the franco of each supplier. Used by the consolidation simulation.')}
          </p>
        </div>
        <div className="os-row">
          <OsButton kind="secondary" icon="add" onClick={() => setNewSupplier({ id: '', name: '' })}>{t('Add supplier')}</OsButton>
          <OsButton kind="secondary" icon="download" onClick={() => downloadWorkbook('supplier-prices-template.xlsx', suppliers, items)}>
            {t('Download template')}
          </OsButton>
          <OsButton kind="secondary" icon="download" disabled={!prices.length} onClick={() => downloadWorkbook('supplier-prices.xlsx', suppliers, items, prices, terms, weights)}>
            {t('Export')}
          </OsButton>
          <OsButton icon="file" onClick={() => fileRef.current?.click()} disabled={busy}>{t('Import Excel')}</OsButton>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={onFile} />
        </div>
      </div>

      {error && <OsAlert color="red">{error}</OsAlert>}
      {notice && <OsAlert color="green">{notice}</OsAlert>}
      {supplierWarning && <OsAlert color="orange">{t('OneStock supplier stock points could not be read: {error}', { error: supplierWarning })}</OsAlert>}
      {!suppliers.length && !error && !newSupplier && (
        <OsAlert>{t('No supplier yet. Add one, or import an Excel file: the suppliers of the file that do not exist are created.')}</OsAlert>
      )}

      {newSupplier && (
        <form className="os-card os-row" style={{ alignItems: 'flex-end', gap: 12 }} onSubmit={(e) => { e.preventDefault(); addSupplier(); }} aria-label={t('Add supplier')}>
          <OsField label={t('Supplier ID')} htmlFor="ns-id">
            <input id="ns-id" className="os-input" style={{ width: 220 }} autoFocus value={newSupplier.id} onChange={(e) => setNewSupplier({ ...newSupplier, id: e.target.value })} required />
          </OsField>
          <OsField label={t('Name')} htmlFor="ns-name">
            <input id="ns-name" className="os-input" style={{ width: 280 }} value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} />
          </OsField>
          <OsButton kind="secondary" onClick={() => setNewSupplier(null)}>{t('Cancel')}</OsButton>
          <OsButton type="submit" icon="check" disabled={busy}>{t('Add supplier')}</OsButton>
        </form>
      )}

      {parsed && (
        <section className="os-card os-col" aria-label={t('Import preview')}>
          <div className="os-row" style={{ gap: 12 }}>
            <OsIcon icon="file" className="t-secondary" />
            <h3 className="os-title-s" style={{ margin: 0 }}>{t('Import of {file}', { file: parsed.fileName })}</h3>
          </div>
          <OsAlert color={parsed.errors.length ? 'red' : 'blue'}>
            {t('{prices} price tier(s) for {suppliers} supplier(s), {terms} franco value(s).', { prices: parsed.prices.length, suppliers: importSuppliers, terms: parsed.terms.length })}
            {parsed.newSuppliers.length > 0 && ' ' + t('{count} new supplier(s) will be created: {names}.', {
              count: parsed.newSuppliers.length,
              names: parsed.newSuppliers.slice(0, 6).map((s) => s.name).join(', ') + (parsed.newSuppliers.length > 6 ? '…' : ''),
            })}
            {parsed.errors.length > 0 && ' ' + t('Fix the errors below and import the file again.')}
          </OsAlert>
          {parsed.errors.length > 0 && (
            <ul className="os-label-s t-red" style={{ margin: 0, paddingLeft: 20 }}>
              {parsed.errors.slice(0, 15).map((e) => <li key={e}>{e}</li>)}
              {parsed.errors.length > 15 && <li>{t('… {count} more', { count: parsed.errors.length - 15 })}</li>}
            </ul>
          )}
          {parsed.warnings.length > 0 && (
            <OsAlert color="orange">
              <ul style={{ margin: 0, paddingLeft: 18 }}>{parsed.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </OsAlert>
          )}
          <OsCheckbox checked={replace} onChange={setReplace} label={t('Replace the existing prices of the suppliers in the file')} />
          <div className="os-row" style={{ justifyContent: 'flex-end' }}>
            <OsButton kind="secondary" onClick={() => setParsed(null)}>{t('Cancel')}</OsButton>
            <OsButton icon="check" disabled={busy || parsed.errors.length > 0 || (!parsed.prices.length && !parsed.terms.length)} onClick={confirmImport}>
              {t('Import')}
            </OsButton>
          </div>
        </section>
      )}

      {suppliers.length > 0 && (
        <section className="os-card flush">
          <div className="os-card-head" style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: 16 }}>
            <OsField label={t('Supplier')} htmlFor="pr-supplier">
              <select id="pr-supplier" className="os-input" style={{ minWidth: 260 }} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </OsField>
            {selected?.source === 'local' && (
              <OsButton kind="tertiary" color="red" icon="trash" disabled={busy} onClick={() => removeSupplier(selected)}>{t('Delete supplier')}</OsButton>
            )}
            <div style={{ flex: 1 }} />
            <OsField label={t('Search')} htmlFor="pr-filter">
              <input id="pr-filter" className="os-input" style={{ width: 220 }} placeholder={t('Item ID or name')} value={filter} onChange={(e) => setFilter(e.target.value)} />
            </OsField>
          </div>

          <form
            className="os-row"
            style={{ alignItems: 'flex-start', gap: 12, padding: 16, borderBottom: '1px solid var(--border-primary)' }}
            onSubmit={(e) => { e.preventDefault(); saveTerms(); }}
            aria-label={t('Franco and shipping fee')}
          >
            <OsField label={t('Franco (€)')} htmlFor="pr-franco" hint={t('Order amount from which shipping is free')}>
              <input id="pr-franco" className="os-input num" style={{ width: 140 }} inputMode="decimal" placeholder={t('None')} value={franco} onChange={(e) => setFranco(e.target.value)} />
            </OsField>
            <OsField label={t('Shipping fee if the franco is not reached')} htmlFor="pr-ship-mode">
              <select id="pr-ship-mode" className="os-input" style={{ width: 240 }} value={shipMode} onChange={(e) => setShipMode(e.target.value as ShippingMode | '')}>
                <option value="">{t('No shipping fee')}</option>
                <option value="fixed">{t('Fixed amount per order')}</option>
                <option value="weight">{t('Amount per kg')}</option>
                <option value="quantity">{t('Amount per unit ordered')}</option>
              </select>
            </OsField>
            {shipMode && (
              <OsField label={shipMode === 'fixed' ? t('Amount (€)') : shipMode === 'weight' ? t('Amount (€ / kg)') : t('Amount (€ / unit)')} htmlFor="pr-ship-amount"
                hint={shipMode === 'weight' ? t('Uses the item weights below') : undefined}>
                <input id="pr-ship-amount" className="os-input num" style={{ width: 140 }} inputMode="decimal" value={shipAmount} onChange={(e) => setShipAmount(e.target.value)} required />
              </OsField>
            )}
            <div style={{ paddingTop: 21 }}><OsButton type="submit" kind="secondary" icon="save" disabled={busy}>{t('Save')}</OsButton></div>
          </form>

          <div className="os-table-wrap">
            <table className="os-table">
              <thead>
                <tr>
                  <th>{t('Item')}</th>
                  <th>{t('Name')}</th>
                  <th className="r">{t('Weight (kg)')}</th>
                  <th className="r">{t('From quantity')}</th>
                  <th className="r">{t('Unit price (€)')}</th>
                  <th className="r" style={{ width: 60 }} aria-label={t('Actions')} />
                </tr>
              </thead>
              <tbody>
                {rows.map((p, i) => {
                  const first = i === 0 || rows[i - 1].itemId !== p.itemId;
                  return (
                    <tr key={`${p.itemId}|${p.minQty}|${p.unitPrice}`}>
                      <td className="os-body-l">{first ? p.itemId : ''}</td>
                      <td>{first ? itemName.get(p.itemId) ?? <span className="t-secondary">{t('Unknown item')}</span> : ''}</td>
                      <td className="r">
                        {first && (
                          <input
                            key={`w-${p.itemId}-${weightOf.get(p.itemId) ?? ''}`}
                            className="os-input num"
                            style={{ width: 90, display: 'inline-block' }}
                            aria-label={t('Weight of {item} in kg', { item: p.itemId })}
                            defaultValue={weightOf.get(p.itemId) == null ? '' : String(weightOf.get(p.itemId))}
                            placeholder="—"
                            inputMode="decimal"
                            onBlur={(e) => updateWeight(p.itemId, e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                          />
                        )}
                      </td>
                      <td className="r t-num">{p.minQty === 1 ? <OsBadge text={t('Base price')} color="grey" /> : `≥ ${p.minQty}`}</td>
                      <td className="r">
                        <input
                          className="os-input num"
                          style={{ width: 120, display: 'inline-block' }}
                          aria-label={t('Unit price of {item} from {qty}', { item: p.itemId, qty: p.minQty })}
                          defaultValue={String(p.unitPrice)}
                          inputMode="decimal"
                          onBlur={(e) => updatePrice(p, e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        />
                      </td>
                      <td className="r">
                        <OsButton kind="tertiary" color="red" round icon="trash" aria-label={t('Delete price tier')} title={t('Delete')} disabled={busy}
                          onClick={() => run(() => source.deletePrice(p.supplierId, p.itemId, p.minQty))} />
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="os-empty">{filter ? t('No price matches the search.') : t('No price for this supplier yet.')}</td></tr>
                )}
                <tr className="detail">
                  <td colSpan={6}>
                    <div className="os-row" style={{ alignItems: 'flex-end', gap: 12 }}>
                      <OsField label={t('Item')} htmlFor="pr-item">
                        <input id="pr-item" className="os-input" style={{ width: 260 }} list="pr-items" placeholder={t('Item ID')} value={draft.itemId} onChange={(e) => setDraft({ ...draft, itemId: e.target.value })} />
                        <datalist id="pr-items">
                          {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                        </datalist>
                      </OsField>
                      <OsField label={t('From quantity')} htmlFor="pr-qty">
                        <input id="pr-qty" className="os-input num" style={{ width: 120 }} inputMode="numeric" value={draft.minQty} onChange={(e) => setDraft({ ...draft, minQty: e.target.value })} />
                      </OsField>
                      <OsField label={t('Unit price (€)')} htmlFor="pr-price">
                        <input id="pr-price" className="os-input num" style={{ width: 120 }} inputMode="decimal" value={draft.unitPrice} onChange={(e) => setDraft({ ...draft, unitPrice: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addTier()} />
                      </OsField>
                      <OsButton icon="add" disabled={busy} onClick={addTier}>{t('Add price')}</OsButton>
                      {draftError && <span className="os-hint error" role="alert">{draftError}</span>}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};
