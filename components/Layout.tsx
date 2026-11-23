// Wave Orchestrator runs as an extension inside the OneStock back-office:
// the host already provides OsSideMenu and OsNavBar, so the extension renders only its content area.
import React from 'react';
import { OsBadge, OsButton } from './os';

/** Content area of the extension: OsCenteredLayout padding on surface-page-background, optional sticky action bar. */
export const ExtensionLayout: React.FC<{ footer?: React.ReactNode; children: React.ReactNode }> = ({ footer, children }) => (
  <div className="os-ext">
    <main className="os-centered">{children}</main>
    {footer}
  </div>
);

/** In-page header used on sub-pages of the extension (back button, title, optional status badge, actions). */
export const PageHeader: React.FC<{
  title: string;
  onBack?: () => void;
  badge?: string;
  end?: React.ReactNode;
}> = ({ title, onBack, badge, end }) => (
  <div className="os-row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
    <div className="os-row" style={{ flexWrap: 'nowrap', minWidth: 0 }}>
      {onBack && <OsButton kind="tertiary" round icon="arrow-left" aria-label="Back" title="Back" onClick={onBack} />}
      <h1 className="os-title-m" style={{ margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
      {badge && <OsBadge text={badge} color="orange" />}
    </div>
    {end && <div className="os-row" style={{ flex: 'none' }}>{end}</div>}
  </div>
);
