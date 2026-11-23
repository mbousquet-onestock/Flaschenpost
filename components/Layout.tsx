// OneStock app shell: OsSideMenu (left) + OsNavBar (top) + content on surface-page-background.
// Page list, order and icons follow the Back-office menu of the OneStock design system (BO_PAGES / BO_FOOTER).
import React, { useEffect, useState } from 'react';
import { OsIcon, IconName } from './os';

type Page = { label: string; icon: IconName; sub?: string[]; trail?: IconName };

const BO_PAGES: Page[] = [
  { label: 'Analytics', icon: 'chart' },
  { label: 'BI Suite', icon: 'insights' },
  { label: 'Orders', icon: 'shopping-cart-outline' },
  { label: 'Customers', icon: 'person-outline' },
  { label: 'Payments', icon: 'card' },
  { label: 'Stocks', icon: 'cube', sub: ['Stock', 'Unavailable items'] },
  { label: 'Items', icon: 'item-outline' },
  { label: 'Buffers', icon: 'database' },
  { label: 'Stock locations', icon: 'store-outline' },
  { label: 'Orchestration', icon: 'bullet-list' },
  { label: 'Workflow', icon: 'lan' },
  { label: 'Delivery', icon: 'truck-outline' },
];

const BO_FOOTER: Page[] = [
  { label: 'Help', icon: 'help-outline', trail: 'ext-link' },
  { label: 'Troubleshoot', icon: 'search' },
  { label: 'Users', icon: 'people-outline' },
  { label: 'Configuration', icon: 'configuration' },
];

const MenuPage: React.FC<{ page: Page; active: boolean; onClick?: () => void }> = ({ page, active, onClick }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`os-mp${active ? ' active' : ''}`}
        title={page.label}
        aria-current={active ? 'page' : undefined}
        aria-expanded={page.sub ? open : undefined}
        onClick={() => (page.sub ? setOpen(!open) : onClick?.())}
      >
        <OsIcon icon={page.icon} />
        <span className="lbl">{page.label}</span>
        {page.sub && <OsIcon icon="arrow-drop-down" className="trail" />}
        {page.trail && <OsIcon icon={page.trail} size="s" className="trail" />}
      </button>
      {page.sub && open && (
        <div className="os-sub">
          {page.sub.map((s) => <button type="button" key={s} className="os-sp">{s}</button>)}
        </div>
      )}
    </>
  );
};

export const OsSideMenu: React.FC<{ active: string; onNavigate?: (label: string) => void }> = ({ active, onNavigate }) => {
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1024);
  // The menu collapses to its 56 px rail below 1024 px wide.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const h = (e: MediaQueryListEvent) => setOpen(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return (
    <aside className={`os-sm${open ? '' : ' closed'}`} aria-label="Main navigation">
      <div className="os-sm-logo">
        {open && <img src="/logos/logo-white.svg" alt="OneStock" />}
        <button type="button" className="os-round-dark" aria-label={open ? 'Collapse menu' : 'Expand menu'} onClick={() => setOpen(!open)}>
          <OsIcon icon={open ? 'chevron-left' : 'menu'} size="s" />
        </button>
      </div>
      <div className="os-sm-tenant">
        <button type="button" className="os-sm-tenant-btn" title="Fashion Market">
          <span className="os-fav">FM</span>
          <span className="name">Fashion Market</span>
          <OsIcon icon="sort" size="s" />
        </button>
      </div>
      <div className="os-sm-scroll">
        <nav className="os-sm-pages">
          {BO_PAGES.map((p) => (
            <MenuPage key={p.label} page={p} active={p.label === active} onClick={() => onNavigate?.(p.label)} />
          ))}
        </nav>
      </div>
      <div className="os-sm-foot">
        <div className="os-sep" />
        <div className="os-sm-pages">
          {BO_FOOTER.map((p) => <MenuPage key={p.label} page={p} active={false} />)}
        </div>
        <div className="os-sep" />
        <button type="button" className="os-mu">
          <span className="os-av">A</span>
          <span className="id"><b>Administrator</b><span>Warehouse lead</span></span>
        </button>
      </div>
    </aside>
  );
};

export type Crumb = { label: string; onClick?: () => void };

export const OsNavBar: React.FC<{
  crumbs: Crumb[];
  onBack?: () => void;
  info?: string;
  end?: React.ReactNode;
}> = ({ crumbs, onBack, info, end }) => (
  <header className="os-nb">
    {onBack && (
      <button type="button" className="os-round-dark" aria-label="Back" onClick={onBack}>
        <OsIcon icon="arrow-left" size="s" />
      </button>
    )}
    {info && <span className="os-nb-info">{info}</span>}
    <nav className="os-bc" aria-label="Breadcrumb">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <React.Fragment key={i}>
            {i > 0 && <OsIcon icon="chevron-right" className="os-bc-sep" />}
            {last ? (
              <span className="os-bc-el" aria-current="page">{c.label}</span>
            ) : (
              <button type="button" className="os-bc-el prev" onClick={c.onClick}>{c.label}</button>
            )}
          </React.Fragment>
        );
      })}
    </nav>
    {end && <div className="os-nb-end">{end}</div>}
  </header>
);

export const OsAppLayout: React.FC<{
  active: string;
  nav: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}> = ({ active, nav, footer, children }) => (
  <div className="os-app">
    <OsSideMenu active={active} />
    <div className="os-app-main">
      {nav}
      <main className="os-app-body">
        <div className="os-centered">{children}</div>
        {footer}
      </main>
    </div>
  </div>
);
