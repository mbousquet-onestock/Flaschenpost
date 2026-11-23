import React, { useState } from 'react';
import { Scenario } from '../types';
import { OsAlert, OsBadge, OsButton, OsColor, OsIcon, OsSegmentedControl, OsTag } from './os';

interface StrategyDashboardProps {
  scenarios: Scenario[];
  onSelect: (strategy: Scenario) => void;
  onEdit: (strategy: Scenario) => void;
  onCreateNew: () => void;
  onUpdateName: (id: string, newName: string) => void;
}

const DAYS = [
  { label: 'Mon', full: 'Monday', value: 1 },
  { label: 'Tue', full: 'Tuesday', value: 2 },
  { label: 'Wed', full: 'Wednesday', value: 3 },
  { label: 'Thu', full: 'Thursday', value: 4 },
  { label: 'Fri', full: 'Friday', value: 5 },
  { label: 'Sat', full: 'Saturday', value: 6 },
  { label: 'Sun', full: 'Sunday', value: 0 },
];

const PRESETS: { key: 'weekdays' | 'weekends' | 'all' | 'clear'; label: string }[] = [
  { key: 'weekdays', label: 'Weekdays' },
  { key: 'weekends', label: 'Weekends' },
  { key: 'all', label: 'Every day' },
  { key: 'clear', label: 'Clear' },
];

const STATUS_COLOR: Record<string, OsColor> = { Active: 'green', Scheduled: 'blue', Draft: 'grey' };

/** "2023-10-24 08:00" → "24/10/2023 08:00" (OneStock date convention). */
export const formatDate = (iso?: string) => {
  if (!iso) return undefined;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}${m[4]}` : iso;
};

export const StrategyDashboard: React.FC<StrategyDashboardProps> = ({ scenarios, onSelect, onEdit, onCreateNew, onUpdateName }) => {
  const [showScheduleId, setShowScheduleId] = useState<string | null>(null);
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

  const toggleSchedule = (id: string) => {
    if (showScheduleId === id) return setShowScheduleId(null);
    setShowScheduleId(id);
    setManualTimes(['08:00', '14:00', '20:00']);
  };

  return (
    <div className="os-card flush">
      <div className="os-card-head" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div>
          <h2 className="os-title-m" style={{ margin: 0 }}>Saved orchestration strategies</h2>
          <p className="os-label-s t-secondary" style={{ margin: '4px 0 0' }}>
            Manage, edit or launch pre-configured fulfilment workflows.
          </p>
        </div>
        <OsButton icon="add" onClick={onCreateNew}>New strategy</OsButton>
      </div>

      <div className="os-table-wrap">
        <table className="os-table">
          <thead>
            <tr>
              <th>Strategy name</th>
              <th className="r">Orders</th>
              <th className="r">Items</th>
              <th>Status</th>
              <th>Last run</th>
              <th>Next run</th>
              <th className="r">Actions</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((strategy) => {
              const scheduleOpen = showScheduleId === strategy.id;
              return (
                <React.Fragment key={strategy.id}>
                  <tr>
                    <td style={{ minWidth: 260 }}>
                      {editingNameId === strategy.id ? (
                        <div className="os-row" style={{ flexWrap: 'nowrap' }}>
                          <input
                            className="os-input"
                            value={tempName}
                            aria-label="Strategy name"
                            autoFocus
                            onChange={(e) => setTempName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveName(strategy.id);
                              if (e.key === 'Escape') setEditingNameId(null);
                            }}
                          />
                          <OsButton kind="tertiary" color="brand" round icon="check" aria-label="Save name" onClick={() => handleSaveName(strategy.id)} />
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
                            title="Rename"
                            aria-label="Rename"
                            onClick={() => { setEditingNameId(strategy.id); setTempName(strategy.name); }}
                          />
                        </div>
                      )}
                    </td>
                    <td className="r t-num">{strategy.metrics.orderCount}</td>
                    <td className="r t-num">{strategy.metrics.itemCount}</td>
                    <td>
                      {strategy.status ? <OsBadge text={strategy.status} color={STATUS_COLOR[strategy.status] ?? 'grey'} /> : <span className="t-disabled">—</span>}
                    </td>
                    <td className="t-num" style={{ whiteSpace: 'nowrap' }}>{formatDate(strategy.lastExecuted) ?? <span className="t-secondary">Never</span>}</td>
                    <td className="t-num" style={{ whiteSpace: 'nowrap' }}>
                      {formatDate(strategy.nextExecution) ?? <span className="t-secondary">{strategy.status === 'Active' ? 'Pending' : 'Manual'}</span>}
                    </td>
                    <td className="r">
                      <div className="os-row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap', gap: 4 }}>
                        <OsButton kind="tertiary" round icon="edit" title="Edit logic" aria-label="Edit logic" onClick={() => onEdit(strategy)} />
                        <OsButton
                          kind="tertiary"
                          round
                          icon="time"
                          title="Schedule"
                          aria-label="Schedule"
                          aria-expanded={scheduleOpen}
                          className={scheduleOpen ? 'brand' : undefined}
                          onClick={() => toggleSchedule(strategy.id)}
                        />
                        <OsButton kind="secondary" icon="play" onClick={() => onSelect(strategy)}>Simulate</OsButton>
                      </div>
                    </td>
                  </tr>

                  {scheduleOpen && (
                    <tr className="detail">
                      <td colSpan={7}>
                        <div className="os-card os-col" style={{ gap: 16 }}>
                          <div className="os-row" style={{ gap: 12 }}>
                            <OsIcon icon="time" className="t-secondary" />
                            <h3 className="os-title-s" style={{ margin: 0 }}>Execution schedule</h3>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
                            <div className="os-col" style={{ gap: 8 }}>
                              <div className="os-row" style={{ justifyContent: 'space-between' }}>
                                <span className="os-label-l">Execution days</span>
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
                              <span className="os-label-l">Execution times</span>
                              <div className="os-row" style={{ flexWrap: 'nowrap' }}>
                                <input
                                  type="time"
                                  className="os-input"
                                  aria-label="Execution time"
                                  value={newTime}
                                  onChange={(e) => setNewTime(e.target.value)}
                                  style={{ maxWidth: 160 }}
                                />
                                <OsButton kind="secondary" icon="add" onClick={addTime}>Add time</OsButton>
                              </div>
                              <div className="os-row">
                                {manualTimes.length === 0 ? (
                                  <span className="os-label-s t-secondary">No execution time added yet.</span>
                                ) : (
                                  manualTimes.map((t) => (
                                    <OsTag key={t} color="grey" onClose={() => setManualTimes((prev) => prev.filter((x) => x !== t))}>
                                      <span className="t-num">{t}</span>
                                    </OsTag>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>

                          {selectedDays.length > 0 && manualTimes.length > 0 ? (
                            <OsAlert>
                              Scheduled for <b>{manualTimes.length} execution(s)</b> per day on{' '}
                              <b>{selectedDays.length === 7 ? 'every day' : selectedDays.map((dv) => DAYS.find((d) => d.value === dv)?.label).join(', ')}</b>{' '}
                              at <b>{manualTimes.join(', ')}</b>.
                            </OsAlert>
                          ) : (
                            <OsAlert color="orange">Select at least one execution day and one execution time.</OsAlert>
                          )}

                          <div className="os-row" style={{ justifyContent: 'flex-end' }}>
                            <OsButton kind="secondary" onClick={() => setShowScheduleId(null)}>Cancel</OsButton>
                            <OsButton icon="check" disabled={!selectedDays.length || !manualTimes.length} onClick={() => setShowScheduleId(null)}>
                              Save schedule
                            </OsButton>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
