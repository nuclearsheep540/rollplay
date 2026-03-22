/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useState, useEffect, useRef } from 'react'

const SIDE_CONFIG = {
  left: {
    drawerClass: 'party-drawer',
    tabStripClass: 'left-drawer-tab-strip',
    tabStripInnerClass: 'left-drawer-tab-strip-inner',
    tabClass: 'left-drawer-tab',
    hiddenTransform: 'translateX(-100%)',
  },
  right: {
    drawerClass: 'right-drawer',
    tabStripClass: 'right-drawer-tab-strip',
    tabStripInnerClass: 'right-drawer-tab-strip-inner',
    tabClass: 'right-drawer-tab',
    hiddenTransform: 'translateX(100%)',
  },
};

/**
 * Reusable side drawer with tabbed navigation.
 *
 * Manages its own "settled" state — the `.drawer-settled` CSS class that
 * enables backdrop-filter blur. Settled logic:
 *   - Open/close (transform animates): unsettle → re-settle on transitionEnd
 *   - Tab switch (no transform change): stay settled immediately
 */
export default function Drawer({ side = 'left', tabs, activeTab, onTabChange, children }) {
  const config = SIDE_CONFIG[side];
  const [settled, setSettled] = useState(!!activeTab);
  const prevTabRef = useRef(activeTab);

  useEffect(() => {
    const prev = prevTabRef.current;
    prevTabRef.current = activeTab;

    // Tab switch (both non-null): no transform change, settle immediately
    if (prev && activeTab && prev !== activeTab) {
      setSettled(true);
      return;
    }

    // Open or close: transform will animate, wait for transitionEnd
    if (Boolean(prev) !== Boolean(activeTab)) {
      setSettled(false);
    }
  }, [activeTab]);

  const handleTransitionEnd = (e) => {
    if (e.target === e.currentTarget && e.propertyName === 'transform') {
      setSettled(!!activeTab);
    }
  };

  const handleTabClick = (tabId) => {
    onTabChange(activeTab === tabId ? null : tabId);
  };

  return (
    <div
      className={`${config.drawerClass} ${settled ? 'drawer-settled' : ''}`}
      style={{ transform: activeTab ? 'translateX(0)' : config.hiddenTransform }}
      onTransitionEnd={handleTransitionEnd}
    >
      <div className={config.tabStripClass}>
        <div className={config.tabStripInnerClass}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`${config.tabClass} ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => handleTabClick(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="drawer-content">
        {children}
        <div aria-hidden="true" style={{ flexShrink: 0, height: '40vh' }} />
      </div>
    </div>
  );
}
