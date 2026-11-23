// OneStock Design System — React recreations of the Os* components used by Wave Orchestrator.
// Styles live in styles/onestock.css; icons are the official OneStock SVGs in public/icons.
import React, { useEffect, useRef } from 'react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/* ---------- OsIcon ---------- */
export type IconName =
  | 'add' | 'arrow-drop-down' | 'arrow-left' | 'arrow-right' | 'bullet-list' | 'card' | 'chart' | 'check'
  | 'check-circle' | 'checkbox-checked' | 'checkbox-unchecked' | 'chevron-down' | 'chevron-left' | 'chevron-right'
  | 'circle' | 'close' | 'close-circle' | 'configuration' | 'cube' | 'database' | 'download' | 'drag' | 'edit'
  | 'ext-link' | 'flash' | 'help-outline' | 'info-outline' | 'insights' | 'item-outline' | 'lan' | 'menu'
  | 'people-outline' | 'person-outline' | 'play' | 'radio-button-checked' | 'radio-button-half_checked'
  | 'radio-button-unchecked' | 'search' | 'shopping-cart-outline' | 'sort' | 'store-outline' | 'time' | 'truck'
  | 'truck-outline' | 'warning-outline';

export const OsIcon: React.FC<{ icon: IconName; size?: 'xs' | 's' | 'm' | 'l'; className?: string; spin?: boolean }> = ({
  icon, size = 'm', className, spin,
}) => (
  <span
    aria-hidden="true"
    className={cx('os-icon', size, spin && 'spin', className)}
    style={{ ['--os-icon' as string]: `url(/icons/${icon}.svg)` } as React.CSSProperties}
  />
);

/* ---------- OsButton ---------- */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: 'primary' | 'secondary' | 'tertiary' | 'on-dark';
  color?: 'brand' | 'orange' | 'red';
  icon?: IconName;
  iconEnd?: IconName;
  round?: boolean;
};
export const OsButton: React.FC<BtnProps> = ({ kind = 'primary', color, icon, iconEnd, round, className, children, ...rest }) => (
  <button
    type="button"
    {...rest}
    className={cx('os-btn', kind, color, icon && 'has-icon', icon && !children && 'icon-only', round && 'round', className)}
  >
    {icon && <OsIcon icon={icon} size="s" />}
    {children}
    {iconEnd && <OsIcon icon={iconEnd} size="s" />}
  </button>
);

/* ---------- OsBadge ---------- */
export type OsColor = 'primary' | 'red' | 'orange' | 'blue' | 'green' | 'purple' | 'grey' | 'neutral';
export const OsBadge: React.FC<{ text: React.ReactNode; color?: OsColor; icon?: IconName; secondary?: boolean }> = ({
  text, color = 'primary', icon, secondary,
}) => (
  <span className={cx('os-badge', color !== 'primary' && color, secondary && 'secondary')}>
    {icon && <OsIcon icon={icon} size="xs" />}
    {text}
  </span>
);

/* ---------- OsTag ---------- */
export const OsTag: React.FC<{
  children: React.ReactNode;
  color?: 'primary' | 'orange' | 'grey';
  secondary?: boolean;
  draggable?: boolean;
  onClick?: () => void;
  onClose?: () => void;
}> = ({ children, color = 'primary', secondary, draggable, onClick, onClose }) => (
  <span
    className={cx('os-tag', color !== 'primary' && color, secondary && 'secondary', draggable && 'drag', onClose && 'closable', onClick && 'clickable')}
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
  >
    {draggable && <span className="os-tag-btn"><OsIcon icon="drag" size="s" /></span>}
    <span>{children}</span>
    {onClose && (
      <button type="button" className="os-tag-btn" aria-label="Remove" onClick={(e) => { e.stopPropagation(); onClose(); }}>
        <OsIcon icon="close" size="s" />
      </button>
    )}
  </span>
);

/* ---------- OsCheckbox / OsSwitch ---------- */
export const OsCheckbox: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; color?: 'orange' }> = ({
  checked, onChange, label, color,
}) => (
  <label className={cx('os-ctl os-cb', checked && 'on', color, !!label && 'has-label')}>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="act"><OsIcon icon={checked ? 'checkbox-checked' : 'checkbox-unchecked'} /></span>
    {label && <span>{label}</span>}
  </label>
);

export const OsSwitch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; color?: 'orange' }> = ({
  checked, onChange, label, color,
}) => (
  <label className={cx('os-ctl os-sw', checked && 'on', color, !!label && 'has-label')}>
    <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="act"><span className="track" /></span>
    {label && <span>{label}</span>}
  </label>
);

/* ---------- OsSegmentedControl ---------- */
export function OsSegmentedControl<T extends string | number>({ options, value, onToggle }: {
  options: { value: T; label: string }[];
  value: T[];
  onToggle: (v: T) => void;
}) {
  return (
    <div className="os-seg" role="group">
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={value.includes(o.value)} className={cx(value.includes(o.value) && 'on')} onClick={() => onToggle(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- OsAlert ---------- */
export const OsAlert: React.FC<{ color?: 'blue' | 'orange' | 'red' | 'green'; children: React.ReactNode }> = ({ color = 'blue', children }) => (
  <div className={cx('os-alert', color !== 'blue' && color)} role="status">
    <OsIcon icon={color === 'green' ? 'check-circle' : color === 'blue' ? 'info-outline' : 'warning-outline'} />
    <div>{children}</div>
  </div>
);

/* ---------- Floating container that closes on outside click ---------- */
export const OsFloating: React.FC<{ onClose: () => void; className?: string; style?: React.CSSProperties; children: React.ReactNode }> = ({
  onClose, className, style, children,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const t = setTimeout(() => document.addEventListener('mousedown', h));
    document.addEventListener('keydown', k);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [onClose]);
  return <div ref={ref} className={cx('os-float', className)} style={{ top: 'calc(100% + 4px)', left: 0, ...style }}>{children}</div>;
};

/* ---------- OsStepper ---------- */
export const OsStepper: React.FC<{ steps: string[]; current: number; onStepClick?: (i: number) => void }> = ({ steps, current, onStepClick }) => (
  <div className="os-stepper">
    {steps.map((label, i) => {
      const state = i < current ? 'done' : i === current ? 'current' : 'next';
      const pos = i === 0 ? 'start' : i === steps.length - 1 ? 'end' : 'middle';
      const icon: IconName = state === 'done' ? 'check-circle' : state === 'current' ? 'radio-button-checked' : 'circle';
      return (
        <div key={label} className={cx('os-step', state, pos, onStepClick && 'clickable')}>
          <div className="band">
            {onStepClick ? (
              <button type="button" className="ind" onClick={() => onStepClick(i)} aria-label={label}><OsIcon icon={icon} /></button>
            ) : (
              <span className="ind"><OsIcon icon={icon} /></span>
            )}
          </div>
          <span className="lbl">{label}</span>
        </div>
      );
    })}
  </div>
);
