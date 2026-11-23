// Supplier purchase prices: degressive price tiers per item and franco per supplier.
// Manual entry, or Excel import (with a downloadable template).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ItemRef, PriceTier, SupplierRef, SupplierTerm } from '../types';
import type { DataSource } from '../services/dataSource';
import { downloadWorkbook, parseImport, ParsedImport } from '../services/excel';
import { OsAlert, OsBadge, OsButton, OsCheckbox, OsField, OsIcon, OsLoading } from './os';

const eur = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 4 });
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
  const [draft, setDraft] = useState({ itemId: '', minQty: '1', unitPrice: '' });
  const [draftError, setDraftError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<(ParsedImport & { fileName: string }) | null>(null);
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [s, p, it] = await Promise.all([source.listSuppliers(), source.getPrices(), source.listItems().catch(() => [] as ItemRef[])]);
      setSuppliers(s);
      setPrices(p.prices);
      setTerms(p.terms);
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
  const supplierFranco = terms.find((t) => t.supplierId === supplierId)?.franco ?? null;

  useEffect(() => {
    setFranco(supplierFranco === null ? '' : String(supplierFranco));
  }, [supplierId, supplierFranco]);

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

  const saveFranco = () => {
    const v = franco.trim() === '' ? null : toNum(franco);
    if (v === undefined || (v !== null && v < 0)) return setError('Franco must be a positive amount or empty.');
    run(() => source.savePrices({ terms: [{ supplierId, franco: v }] }), 'Franco saved.');
  };

  const addTier = () => {
    const minQty = Number(draft.minQty);
    const unitPrice = toNum(draft.unitPrice);
    const itemId = draft.itemId.trim();
    if (!itemId) return setDraftError('Select an item.');
    if (!Number.isInteger(minQty) || minQty < 1) return setDraftError('Minimum quantity must be an integer ≥ 1.');
    if (unitPrice === undefined || unitPrice < 0) return setDraftError('Enter a valid unit price.');
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
      setError(`Unable to read ${file.name}: ${(err as Error).message}`);
    }
  };

  const confirmImport = () => {
    if (!parsed) return;
    const replaceSuppliers = replace ? [...new Set(parsed.prices.map((p) => p.supplierId))] : [];
    const summary = `${parsed.prices.length} price tier(s) and ${parsed.terms.length} franco value(s) imported.`;
    run(async () => {
      await source.savePrices({ prices: parsed.prices, terms: parsed.terms, replaceSuppliers });
      setParsed(null);
    }, summary);
  };

  if (loading) return <OsLoading text="Loading suppliers and prices" />;

  const importSuppliers = parsed ? new Set(parsed.prices.map((p) => p.supplierId)).size : 0;

  return (
    <div className="os-col">
      <div className="os-card os-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div style={{ minWidth: 240, flex: 1 }}>
          <h2 className="os-title-m" style={{ margin: 0 }}>Supplier purchase prices</h2>
          <p className="os-label-s t-secondary" style={{ margin: '4px 0 0' }}>
            Unit prices per item with quantity tiers, and the franco of each supplier. Used by the consolidation simulation.
          </p>
        </div>
        <div className="os-row">
          <OsButton kind="secondary" icon="download" onClick={() => downloadWorkbook('supplier-prices-template.xlsx', suppliers, items)}>
            Download template
          </OsButton>
          <OsButton kind="secondary" icon="download" disabled={!prices.length} onClick={() => downloadWorkbook('supplier-prices.xlsx', suppliers, items, prices, terms)}>
            Export
          </OsButton>
          <OsButton icon="file" onClick={() => fileRef.current?.click()} disabled={busy || !suppliers.length}>Import Excel</OsButton>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={onFile} />
        </div>
      </div>

      {error && <OsAlert color="red">{error}</OsAlert>}
      {notice && <OsAlert color="green">{notice}</OsAlert>}
      {!suppliers.length && !error && (
        <OsAlert color="orange">No supplier stock point found. Suppliers are stock points whose type is the supplier type set in the settings.</OsAlert>
      )}

      {parsed && (
        <section className="os-card os-col" aria-label="Import preview">
          <div className="os-row" style={{ gap: 12 }}>
            <OsIcon icon="file" className="t-secondary" />
            <h3 className="os-title-s" style={{ margin: 0 }}>Import of {parsed.fileName}</h3>
          </div>
          <OsAlert color={parsed.errors.length ? 'red' : 'blue'}>
            {parsed.prices.length} price tier(s) for {importSuppliers} supplier(s), {parsed.terms.length} franco value(s).
            {parsed.errors.length > 0 && ' Fix the errors below and import the file again.'}
          </OsAlert>
          {parsed.errors.length > 0 && (
            <ul className="os-label-s t-red" style={{ margin: 0, paddingLeft: 20 }}>
              {parsed.errors.slice(0, 15).map((e) => <li key={e}>{e}</li>)}
              {parsed.errors.length > 15 && <li>… {parsed.errors.length - 15} more</li>}
            </ul>
          )}
          {parsed.warnings.length > 0 && (
            <OsAlert color="orange">
              <ul style={{ margin: 0, paddingLeft: 18 }}>{parsed.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </OsAlert>
          )}
          <OsCheckbox checked={replace} onChange={setReplace} label="Replace the existing prices of the suppliers in the file" />
          <div className="os-row" style={{ justifyContent: 'flex-end' }}>
            <OsButton kind="secondary" onClick={() => setParsed(null)}>Cancel</OsButton>
            <OsButton icon="check" disabled={busy || parsed.errors.length > 0 || (!parsed.prices.length && !parsed.terms.length)} onClick={confirmImport}>
              Import
            </OsButton>
          </div>
        </section>
      )}

      {suppliers.length > 0 && (
        <section className="os-card flush">
          <div className="os-card-head" style={{ flexWrap: 'wrap', alignItems: 'flex-end', gap: 16 }}>
            <OsField label="Supplier" htmlFor="pr-supplier">
              <select id="pr-supplier" className="os-input" style={{ minWidth: 260 }} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.id}) · {countBySupplier.get(s.id) || 0} price(s)</option>
                ))}
              </select>
            </OsField>
            <OsField label="Franco (€)" htmlFor="pr-franco">
              <div className="os-row" style={{ flexWrap: 'nowrap' }}>
                <input id="pr-franco" className="os-input num" style={{ width: 140 }} inputMode="decimal" placeholder="None" value={franco} onChange={(e) => setFranco(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveFranco()} />
                <OsButton kind="secondary" icon="save" disabled={busy} onClick={saveFranco}>Save</OsButton>
              </div>
            </OsField>
            <div style={{ flex: 1 }} />
            <OsField label="Search" htmlFor="pr-filter">
              <input id="pr-filter" className="os-input" style={{ width: 220 }} placeholder="Item ID or name" value={filter} onChange={(e) => setFilter(e.target.value)} />
            </OsField>
          </div>

          <div className="os-table-wrap">
            <table className="os-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Name</th>
                  <th className="r">From quantity</th>
                  <th className="r">Unit price (€)</th>
                  <th className="r" style={{ width: 60 }} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((p, i) => {
                  const first = i === 0 || rows[i - 1].itemId !== p.itemId;
                  return (
                    <tr key={`${p.itemId}|${p.minQty}|${p.unitPrice}`}>
                      <td className="os-body-l">{first ? p.itemId : ''}</td>
                      <td>{first ? itemName.get(p.itemId) ?? <span className="t-secondary">Unknown item</span> : ''}</td>
                      <td className="r t-num">{p.minQty === 1 ? <OsBadge text="Base price" color="grey" /> : `≥ ${p.minQty}`}</td>
                      <td className="r">
                        <input
                          className="os-input num"
                          style={{ width: 120, display: 'inline-block' }}
                          aria-label={`Unit price of ${p.itemId} from ${p.minQty}`}
                          defaultValue={String(p.unitPrice)}
                          inputMode="decimal"
                          onBlur={(e) => updatePrice(p, e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        />
                      </td>
                      <td className="r">
                        <OsButton kind="tertiary" color="red" round icon="trash" aria-label="Delete price tier" title="Delete" disabled={busy}
                          onClick={() => run(() => source.deletePrice(p.supplierId, p.itemId, p.minQty))} />
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={5} className="os-empty">{filter ? 'No price matches the search.' : 'No price for this supplier yet.'}</td></tr>
                )}
                <tr className="detail">
                  <td colSpan={5}>
                    <div className="os-row" style={{ alignItems: 'flex-end', gap: 12 }}>
                      <OsField label="Item" htmlFor="pr-item">
                        <input id="pr-item" className="os-input" style={{ width: 260 }} list="pr-items" placeholder="Item ID" value={draft.itemId} onChange={(e) => setDraft({ ...draft, itemId: e.target.value })} />
                        <datalist id="pr-items">
                          {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                        </datalist>
                      </OsField>
                      <OsField label="From quantity" htmlFor="pr-qty">
                        <input id="pr-qty" className="os-input num" style={{ width: 120 }} inputMode="numeric" value={draft.minQty} onChange={(e) => setDraft({ ...draft, minQty: e.target.value })} />
                      </OsField>
                      <OsField label="Unit price (€)" htmlFor="pr-price">
                        <input id="pr-price" className="os-input num" style={{ width: 120 }} inputMode="decimal" value={draft.unitPrice} onChange={(e) => setDraft({ ...draft, unitPrice: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addTier()} />
                      </OsField>
                      <OsButton icon="add" disabled={busy} onClick={addTier}>Add price</OsButton>
                      {draftError && <span className="os-hint error" role="alert">{draftError}</span>}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {supplierFranco !== null && (
            <p className="os-label-s t-secondary" style={{ margin: 0, padding: '12px 16px' }}>Franco: {eur(supplierFranco)}</p>
          )}
        </section>
      )}
    </div>
  );
};
