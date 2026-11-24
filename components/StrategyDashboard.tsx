import React, { useState } from 'react';
import { Scenario } from '../types';
import { OsAlert, OsBadge, OsButton, OsColor, OsIcon, OsSegmentedControl, OsTag } from './os';
import { LOCALE, t } from '../services/i18n';

interface StrategyDashboardProps {
  scenarios: Scenario[];
  onSelect: (strategy: Scenario) => void;
  onEdit: (strategy: Scenario) => void;
  onCreateNew: () => void;
  onUpdateName: (id: string, newName: string) => void;
  onSaveSchedule: (id: string, schedule: { days: number[]; times: string[] }) => void;
  onDelete: (strategy: Scenario) => void;
  /** Creates a copy of a strategy, placed right after it. */
  onDuplicate: (strategy: Scenario) => void;
  /** New display order (strategy IDs), after a drag and drop. */
  onReorder: (ids: string[]) => void;
  loading?: boolean;
}

/** Meaning of the statuses, shown on hover. */
const STATUS_HELP: Record<string, string> = {
  Draft: 'Never launched and no schedule saved.',
  Scheduled: 'Execution days and times are saved; never launched yet.',
  Active: 'Launched at least once with the Launch button (supplier orders created).',
};

/** Day names in the interface locale (Monday first). 2024-01-01 is a Monday. */
const DAYS = [1, 2, 3, 4, 5, 6, 0].map((value, i) => {
  const d = new Date(2024, 0, 1 + i);
  return { value, label: d.toLocaleDateString(LOCALE, { weekday: 'short' }), full: d.toLocaleDateString(LOCALE, { weekday: 'long' }) };
});

const PRESETS: { key: 'weekdays' | 'weekends' | 'all' | 'clear'; label: string }[] = [
  { key: 'weekdays', label: t('Weekdays') },
  { key: 'weekends', label: t('Weekends') },
  { key: 'all', label: t('Every day') },
  { key: 'clear', label: t('Clear') },
];

const STATUS_COLOR: Record<string, OsColor> = { Active: 'green', Scheduled: 'blue', Draft: 'grey' };

/** "2023-10-24 08:00" → "24/10/2023 08:00" (OneStock date convention). */
export const formatDate = (iso?: string) => {
  if (!iso) return undefined;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}${m[4]}` : iso;
};

export const StrategyDashboard: React.FC<StrategyDashboardProps> = ({ scenarios, onSelect, onEdit, onCreateNew, onUpdateName, onSaveSchedule, onDelete, onDuplicate, onReorder, loading }) => {
  const [showScheduleId, setShowScheduleId] = useState<string | null>(null);
  // Drag and drop: a row can be dragged once its handle is pressed.
  const [armed, setArmed] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  /** Moves a strategy to the place of another one and saves the new order. */
  const move = (id: string, targetId: string) => {
    setDragId(null);
    setOverId(null);
    setArmed(null);
    if (id === targetId) return;
    const ids = scenarios.map((s) => s.id);
    const from = ids.indexOf(id);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, id);
    onReorder(ids);
  };
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [manualTimes, setManualTimes] = useState<string[]>([]);
  const [newTime, setNewTime] = useState('08:00');

  const handleSaveName = (id: string) => {
    if (tempName.trim()) onUpdateName(id, tempName.trim());
    setEditingNameId(null);
  };

  const toggleDay = (v: number) =>
    setSelectedDays((prev) => (prev.includes(v) ? prev.filter((d) => d !== v) : [...prev, v].sort((a, b) => a - b)));

  const addTime = () => {
    if (newTime && !manualTimes.includes(newTime)) setManualTimes((prev) => [...prev, newTime].sort());
  };

  const setDayPreset = (type: 'weekdays' | 'weekends' | 'all' | 'clear') => {
    if (type === 'clear') setSelectedDays([]);
    else if (type === 'weekdays') setSelectedDays([1, 2, 3, 4, 5]);
    else if (type === 'weekends') setSelectedDays([6, 0]);
    else setSelectedDays([1, 2, 3, 4, 5, 6, 0]);
  };

  const toggleSchedule = (strategy: Scenario) => {
    if (showScheduleId === strategy.id) return setShowScheduleId(null);
    setShowScheduleId(strategy.id);
    setSelectedDays(strategy.schedule?.days ?? [1, 2, 3, 4, 5]);
    setManualTimes(strategy.schedule?.times ?? ['08:00', '14:00', '20:00']);
  };

  return (
    <div className="os-card flush">
      <div className="os-card-head" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div>
          <h2 className="os-title-m" style={{ margin: 0 }}>{t('Saved orchestration strategies')}</h2>
          <p className="os-label-s t-secondary" style={{ margin: '4px 0 0' }}>
            {t('Manage, edit or launch pre-configured fulfilment workflows.')}
          </p>
        </div>
        <div className="os-row">
          <OsButton kind="secondary" icon="time">{t('Execution history')}</OsButton>
          <OsButton icon="add" onClick={onCreateNew}>{t('New strategy')}</OsButton>
        </div>
      </div>

      <div className="os-table-wrap">
        <table className="os-table">
          <thead>
            <tr>
              <th style={{ width: 40 }} aria-label={t('Order')} />
              <th>{t('Strategy name')}</th>
              <th className="r">{t('Orders')}</th>
              <th className="r">{t('Items')}</th>
              <th>{t('Status')}</th>
              <th>{t('Last run')}</th>
              <th>{t('Next run')}</th>
              <th className="r">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((strategy) => {
              const scheduleOpen = showScheduleId === strategy.id;
              return (
                <React.Fragment key={strategy.id}>
                  <tr
                    draggable={armed === strategy.id}
                    onDragStart={(e) => { setDragId(strategy.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', strategy.id); }}
                    onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(strategy.id); } }}
                    onDrop={(e) => { e.preventDefault(); if (dragId) move(dragId, strategy.id); }}
                    onDragEnd={() => { setDragId(null); setOverId(null); setArmed(null); }}
                    className={[dragId === strategy.id ? 'dragging' : '', overId === strategy.id && dragId && dragId !== strategy.id ? 'drop-target' : ''].join(' ')}
                  >
                    <td style={{ paddingRight: 0 }}>
                      <button
                        type="button"
                        className="drag-handle"
                        aria-label={t('Move {name} (Alt + up / down arrows)', { name: strategy.name })}
                        title={t('Drag to reorder')}
                        onMouseDown={() => setArmed(strategy.id)}
                        onMouseUp={() => setArmed(null)}
                        onKeyDown={(e) => {
                          if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
                          e.preventDefault();
                          const i = scenarios.findIndex((s) => s.id === strategy.id);
                          const target = scenarios[e.key === 'ArrowUp' ? i - 1 : i + 1];
                          if (target) move(strategy.id, target.id);
                        }}
                      >
                        <OsIcon icon="drag" size="s" />
                      </button>
                    </td>
                    <td style={{ minWidth: 260 }}>
                      {editingNameId === strategy.id ? (
                        <div className="os-row" style={{ flexWrap: 'nowrap' }}>
                          <input
                            className="os-input"
                            value={tempName}
                            aria-label={t('Strategy name')}
                            autoFocus
                            onChange={(e) => setTempName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveName(strategy.id);
                              if (e.key === 'Escape') setEditingNameId(null);
                            }}
                          />
                          <OsButton kind="tertiary" color="brand" round icon="check" aria-label={t('Save name')} onClick={() => handleSaveName(strategy.id)} />
                        </div>
                      ) : (
                        <div className="os-row" style={{ flexWrap: 'nowrap', gap: 4 }}>
                          <div style={{ minWidth: 0 }}>
                            <div className="os-body-l">{strategy.name}</div>
                            <div className="os-body-s t-secondary" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {strategy.description}
                            </div>
                          </div>
                          <OsButton
                            kind="tertiary"
                            round
                            icon="edit"
                            title={t('Rename')}
                            aria-label={t('Rename')}
                            onClick={() => { setEditingNameId(strategy.id); setTempName(strategy.name); }}
                          />
                        </div>
                      )}
                    </td>
                    <td className="r t-num">{strategy.metrics.orderCount}</td>
                    <td className="r t-num">{strategy.metrics.itemCount}</td>
                    <td>
                      {strategy.status ? <span title={STATUS_HELP[strategy.status] ? t(STATUS_HELP[strategy.status]) : undefined}><OsBadge text={t(strategy.status)} color={STATUS_COLOR[strategy.status] ?? 'grey'} /></span> : <span className="t-disabled">—</span>}
                    </td>
                    <td className="t-num" style={{ whiteSpace: 'nowrap' }}>{formatDate(strategy.lastExecuted) ?? <span className="t-secondary">{t('Never')}</span>}</td>
                    <td className="t-num" style={{ whiteSpace: 'nowrap' }}>
                      {formatDate(strategy.nextExecution) ?? <span className="t-secondary">{strategy.status === 'Active' ? t('Pending') : t('Manual')}</span>}
                    </td>
                    <td className="r">
                      <div className="os-row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap', gap: 4 }}>
                        <OsButton kind="tertiary" round icon="edit" title={t('Edit logic')} aria-label={t('Edit logic')} onClick={() => onEdit(strategy)} />
                        <OsButton
                          kind="tertiary"
                          round
                          icon="time"
                          title={t('Schedule')}
                          aria-label={t('Schedule')}
                          aria-expanded={scheduleOpen}
                          className={scheduleOpen ? 'brand' : undefined}
                          onClick={() => toggleSchedule(strategy)}
                        />
                        <OsButton kind="tertiary" round icon="copy" title={t('Duplicate')} aria-label={t('Duplicate')} onClick={() => onDuplicate(strategy)} />
                        <OsButton kind="tertiary" color="red" round icon="trash" title={t('Delete')} aria-label={t('Delete')} onClick={() => onDelete(strategy)} />
                        <OsButton kind="secondary" icon="play" onClick={() => onSelect(strategy)}>{t('Simulate')}</OsButton>
                      </div>
                    </td>
                  </tr>

                  {scheduleOpen && (
                    <tr className="detail">
                      <td colSpan={8}>
                        <div className="os-card os-col" style={{ gap: 16 }}>
                          <div className="os-row" style={{ gap: 12 }}>
                            <OsIcon icon="time" className="t-secondary" />
                            <h3 className="os-title-s" style={{ margin: 0 }}>{t('Execution schedule')}</h3>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
                            <div className="os-col" style={{ gap: 8 }}>
                              <div className="os-row" style={{ justifyContent: 'space-between' }}>
                                <span className="os-label-l">{t('Execution days')}</span>
                                <div className="os-row" style={{ gap: 0 }}>
                                  {PRESETS.map((p) => (
                                    <OsButton key={p.key} kind="tertiary" color="brand" onClick={() => setDayPreset(p.key)}>{p.label}</OsButton>
                                  ))}
                                </div>
                              </div>
                              <OsSegmentedControl
                                options={DAYS.map((d) => ({ value: d.value, label: d.label }))}
                                value={selectedDays}
                                onToggle={toggleDay}
                              />
                            </div>

                            <div className="os-col" style={{ gap: 8 }}>
                              <span className="os-label-l">{t('Execution times')}</span>
                              <div className="os-row" style={{ flexWrap: 'nowrap' }}>
                                <input
                                  type="time"
                                  className="os-input"
                                  aria-label={t('Execution time')}
                                  value={newTime}
                                  onChange={(e) => setNewTime(e.target.value)}
                                  style={{ maxWidth: 160 }}
                                />
                                <OsButton kind="secondary" icon="add" onClick={addTime}>{t('Add time')}</OsButton>
                              </div>
                              <div className="os-row">
                                {manualTimes.length === 0 ? (
                                  <span className="os-label-s t-secondary">{t('No execution time added yet.')}</span>
                                ) : (
                                  manualTimes.map((time) => (
                                    <OsTag key={time} color="grey" onClose={() => setManualTimes((prev) => prev.filter((x) => x !== time))}>
                                      <span className="t-num">{time}</span>
                                    </OsTag>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>

                          {selectedDays.length > 0 && manualTimes.length > 0 ? (
                            <OsAlert>
                              {t('Scheduled for {count} execution(s) per day on {days} at {times}.', {
                                count: manualTimes.length,
                                days: selectedDays.length === 7 ? t('every day') : selectedDays.map((dv) => DAYS.find((d) => d.value === dv)?.label).join(', '),
                                times: manualTimes.join(', '),
                              })}
                            </OsAlert>
                          ) : (
                            <OsAlert color="orange">{t('Select at least one execution day and one execution time.')}</OsAlert>
                          )}

                          <div className="os-row" style={{ justifyContent: 'flex-end' }}>
                            <OsButton kind="secondary" onClick={() => setShowScheduleId(null)}>{t('Cancel')}</OsButton>
                            <OsButton icon="check" disabled={!selectedDays.length || !manualTimes.length} onClick={() => { onSaveSchedule(strategy.id, { days: selectedDays, times: manualTimes }); setShowScheduleId(null); }}>
                              {t('Save schedule')}
                            </OsButton>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {scenarios.length === 0 && (
              <tr><td colSpan={8} className="os-empty">{loading ? t('Loading strategies') : t('No strategy yet for this site. Create one with New strategy.')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
