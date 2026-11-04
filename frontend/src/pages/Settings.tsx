import { useState, type ReactNode } from 'react';
import { Icon } from '../components/Icon';
import { AccessPanel } from './settings/Access';
import { GuardsPanel } from './settings/Guards';
import { FeaturesPanel, GeneralPanel, SignInPanel } from './settings/Simple';
import { UsersPanel } from './settings/Users';

const TABS: { key: string; label: string; icon: string; panel: () => ReactNode }[] = [
  { key: 'general', label: 'General', icon: 'buildings', panel: () => <GeneralPanel /> },
  { key: 'access', label: 'Access control', icon: 'lock-key', panel: () => <AccessPanel /> },
  { key: 'users', label: 'Users', icon: 'users', panel: () => <UsersPanel /> },
  { key: 'features', label: 'Features', icon: 'toggle-right', panel: () => <FeaturesPanel /> },
  { key: 'guards', label: 'Guards', icon: 'shield-check', panel: () => <GuardsPanel /> },
  { key: 'signin', label: 'Sign-in', icon: 'sign-in', panel: () => <SignInPanel /> },
];

export default function Settings() {
  const [tab, setTab] = useState('general');
  const cur = TABS.find((t) => t.key === tab) ?? TABS[0];
  return (
    <div className="page">
      <h1 className="hero-title">Settings</h1>
      <div className="tabs" role="tablist" aria-label="Settings sections">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" id={`tab-${t.key}`} aria-selected={t.key === tab} aria-controls="settings-panel"
            className={`tab ${t.key === tab ? 'on' : ''}`} onClick={() => setTab(t.key)}>
            <Icon name={t.icon} /> {t.label}
          </button>
        ))}
      </div>
      <div id="settings-panel" role="tabpanel" aria-labelledby={`tab-${cur.key}`}>
        {cur.panel()}
      </div>
    </div>
  );
}
