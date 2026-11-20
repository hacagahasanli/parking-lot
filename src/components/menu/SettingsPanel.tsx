'use client';

/**
 * Settings: a panel that slides in from the left with five tabs. Used by the main menu and by the pause menu. Every change
 * is saved at once and applied live (no reload, no Apply button); "Reset to default" per section and "Reset all" at the foot.
 */
import { useEffect, useRef, useState } from 'react';

import { ACTIONS, DEFAULTS, keyLabel, rebind, unbind, unbound } from '~/game/settings';

import { Kbd, Panel, Row, Segmented, Slider, Toggle, usePadNav, useMenuNav } from './ui';

import type { Action, Settings, SettingsStore, Slot } from '~/game/settings';
import type { Tier } from '~/game/render/quality';

export type Tab = 'controls' | 'camera' | 'graphics' | 'audio' | 'access';
const TABS: { id: Tab; label: string }[] = [
  { id: 'controls', label: 'Controls' },
  { id: 'camera', label: 'Camera' },
  { id: 'graphics', label: 'Graphics' },
  { id: 'audio', label: 'Audio' },
  { id: 'access', label: 'Accessibility' },
];

const TIER_NAME: Record<Tier, string> = { low: 'Low', medium: 'Medium', high: 'High' };
const pct = (v: number) => `${Math.round(v)}%`;

const SectionReset = ({ onClick, label = 'Reset to default' }: { onClick: () => void; label?: string }) => (
  <button type="button" data-nav onClick={onClick} className="text-lilac hover:text-gold mt-4 min-h-10 text-xs font-bold tracking-widest uppercase">
    ↺ {label}
  </button>
);

/** One key slot: click, then press the new key (Esc cancels, Backspace clears). */
const KeySlot = ({ code, waiting, onStart, label }: { code: string | null; waiting: boolean; onStart: () => void; label: string }) => (
  <button
    type="button"
    data-nav
    onClick={onStart}
    aria-label={`${label}: ${waiting ? 'press a key' : keyLabel(code)}. Press Enter to change.`}
    className={`min-h-10 min-w-[4.5rem] -skew-x-6 border px-2 text-sm font-bold transition ${waiting ? 'border-gold text-gold' : code ? 'border-cream/20 bg-cream/8 text-cream hover:border-gold/70' : 'border-cream/10 text-lilac/60 border-dashed'}`}
    style={waiting ? { animation: 'keyWait 0.9s ease-in-out infinite' } : undefined}
  >
    <span className="inline-block skew-x-6">{waiting ? 'Press a key' : keyLabel(code)}</span>
  </button>
);

const Controls = ({ s, store, touch }: { s: Settings; store: SettingsStore; touch: boolean }) => {
  const [waiting, setWaiting] = useState<{ action: Action; slot: Slot } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const b = s.controls.bindings;

  // While waiting for a key, the next key press is the new binding (captured before anything else sees it).
  useEffect(() => {
    if (!waiting) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === 'Escape') {
        setWaiting(null);
        return;
      }
      if (e.code === 'Backspace' || e.code === 'Delete') {
        store.set('controls', { bindings: unbind(b, waiting.action, waiting.slot) });
        setNotice(`${ACTIONS.find((a) => a.id === waiting.action)?.label} slot cleared.`);
        setWaiting(null);
        return;
      }
      const r = rebind(b, waiting.action, waiting.slot, e.code);
      if (r.reserved) {
        setNotice(`${keyLabel(e.code)} is reserved for the menus. Pick another key.`);
        return;
      }
      store.set('controls', { bindings: r.bindings });
      const label = ACTIONS.find((a) => a.id === waiting.action)?.label;
      setNotice(
        r.swapped
          ? `${keyLabel(e.code)} was on ${ACTIONS.find((a) => a.id === r.swapped!.action)?.label}: swapped, that is now ${keyLabel(r.bindings[r.swapped.action][r.swapped.slot])}.`
          : `${label}: ${keyLabel(e.code)}.`,
      );
      setWaiting(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [waiting, b, store]);

  const missing = unbound(b);
  const manual = s.controls.transmission === 'manual';
  return (
    <div>
      <Row label="Transmission" hint={manual ? 'For enthusiasts: you shift R · N · 1–4 yourself. Watch the shift light; R only when stopped.' : 'Recommended. The car shifts for you: gas to go, hold brake when stopped to reverse.'}>
        <Segmented label="Transmission" value={s.controls.transmission} options={[{ v: 'auto', label: 'Automatic' }, { v: 'manual', label: 'Manual (expert)' }]} onChange={(v) => store.set('controls', { transmission: v })} />
      </Row>

      <h3 className="text-lilac mt-6 mb-1 text-[11px] font-semibold tracking-[0.3em] uppercase">Keyboard</h3>
      <div role="table" aria-label="Key bindings" data-capturing={waiting ? '' : undefined}>
        {ACTIONS.map(({ id, label, manualOnly }) => (
          <div key={id} role="row" className={`border-cream/8 flex items-center gap-2 border-b py-1.5 ${manualOnly && !manual ? 'opacity-55' : ''}`}>
            <div role="rowheader" className="text-cream min-w-0 flex-1 text-sm">
              {id === 'down' && manual ? 'Brake' : id === 'up' && manual ? 'Gas (in R: backwards)' : label}
              {manualOnly && !manual && <span className="text-lilac ml-2 text-[10px] tracking-widest uppercase">manual only</span>}
            </div>
            {([0, 1] as const).map((slot) => (
              <div role="cell" key={slot}>
                <KeySlot
                  code={b[id][slot]}
                  label={`${label}, ${slot === 0 ? 'main key' : 'second key'}`}
                  waiting={waiting?.action === id && waiting.slot === slot}
                  onStart={() => {
                    setNotice(null);
                    setWaiting({ action: id, slot });
                  }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 min-h-5 text-xs" aria-live="polite">
        {waiting ? (
          <span className="text-gold">Press a key for {ACTIONS.find((a) => a.id === waiting.action)?.label}. <Kbd>Esc</Kbd> cancels, <Kbd>Bksp</Kbd> clears.</span>
        ) : notice ? (
          <span className="text-cream/85">{notice}</span>
        ) : missing.length ? (
          <span className="text-orange">No key for: {missing.map((m) => ACTIONS.find((a) => a.id === m)?.label).join(', ')}.</span>
        ) : null}
      </div>
      <SectionReset
        onClick={() => {
          store.set('controls', { bindings: DEFAULTS.controls.bindings });
          setNotice('Keys reset to default.');
        }}
        label="Reset keys to default"
      />

      <h3 className="text-lilac mt-6 mb-1 text-[11px] font-semibold tracking-[0.3em] uppercase">Gamepad</h3>
      <p className="text-cream/80 text-xs leading-relaxed">
        Left stick steer · RT gas · LT brake / reverse · A handbrake · X horn · Y camera · RB / LB shift up / down · Start pause. In menus: d-pad, A, B, LB / RB for tabs.
      </p>

      <h3 className="text-lilac mt-6 mb-1 text-[11px] font-semibold tracking-[0.3em] uppercase">Touch controls{touch ? '' : ' (phones and tablets)'}</h3>
      <Row label="Button size">
        <Slider label="Touch button size" value={Math.round(s.controls.touchSize * 100)} min={80} max={130} step={5} format={pct} onChange={(v) => store.set('controls', { touchSize: v / 100 })} />
      </Row>
      <Row label="Button opacity">
        <Slider label="Touch button opacity" value={Math.round(s.controls.touchOpacity * 100)} min={30} max={100} step={5} format={pct} onChange={(v) => store.set('controls', { touchOpacity: v / 100 })} />
      </Row>
      <Row label="Left-handed" hint="Pedals on the left, steering on the right.">
        <Toggle label="Left-handed touch layout" on={s.controls.leftHanded} onChange={(v) => store.set('controls', { leftHanded: v })} />
      </Row>
      <SectionReset onClick={() => store.set('controls', { touchSize: 1, touchOpacity: DEFAULTS.controls.touchOpacity, leftHanded: false, transmission: 'auto' })} label="Reset touch and transmission" />
    </div>
  );
};

const CameraTab = ({ s, store }: { s: Settings; store: SettingsStore }) => (
  <div>
    <Row label="View" hint={s.camera.mode === 'park' ? 'High and tilted, turning calmly with the car: read the whole lot.' : 'Low behind the car, like a racing game.'}>
      <Segmented label="Camera view" value={s.camera.mode} options={[{ v: 'park', label: 'Parking view' }, { v: 'chase', label: 'Chase' }]} onChange={(v) => store.set('camera', { mode: v })} />
    </Row>
    <Row label="Camera shake" hint="The jolt on a crash.">
      <Toggle label="Camera shake" on={s.camera.shake} onChange={(v) => store.set('camera', { shake: v })} />
    </Row>
    <SectionReset onClick={() => store.reset('camera')} />
  </div>
);

const Graphics = ({ s, store, tier }: { s: Settings; store: SettingsStore; tier: Tier | null }) => (
  <div>
    <Row label="Quality" hint={s.graphics.quality === 'auto' && tier ? `Auto picks for this device. Now drawing: ${TIER_NAME[tier]}.` : 'Low runs on anything; High has soft shadows and sharp edges.'}>
      <Segmented
        label="Graphics quality"
        value={s.graphics.quality}
        options={[
          { v: 'auto', label: 'Auto' },
          { v: 'low', label: 'Low' },
          { v: 'medium', label: 'Medium' },
          { v: 'high', label: 'High' },
        ]}
        onChange={(v) => store.set('graphics', { quality: v })}
      />
    </Row>
    <Row label="Shadows" hint={tier === 'low' ? 'Low quality never draws shadows.' : 'Sun shadows under cars, posts and trees.'}>
      <Toggle label="Shadows" on={s.graphics.shadows} onChange={(v) => store.set('graphics', { shadows: v })} />
    </Row>
    <Row label="Resolution" hint="Lower is faster on weak devices.">
      <Slider label="Resolution scale" value={Math.round(s.graphics.resolution * 100)} min={50} max={100} step={5} format={pct} onChange={(v) => store.set('graphics', { resolution: v / 100 })} />
    </Row>
    <Row label="Show FPS">
      <Toggle label="Show frames per second" on={s.graphics.showFps} onChange={(v) => store.set('graphics', { showFps: v })} />
    </Row>
    <SectionReset onClick={() => store.reset('graphics')} />
  </div>
);

const Audio = ({ s, store, portalMuted }: { s: Settings; store: SettingsStore; portalMuted: boolean }) => (
  <div>
    {portalMuted && <p className="bg-gold/15 text-gold mb-2 px-3 py-2 text-xs font-bold">The site’s mute button is on: the game stays silent until it is turned off there.</p>}
    {(
      [
        ['master', 'Master'],
        ['engine', 'Engines'],
        ['effects', 'Effects'],
      ] as const
    ).map(([k, label]) => (
      <Row key={k} label={label} hint={k === 'engine' ? 'Every car’s engine and tyres (this game has no music: the lot is the soundtrack).' : undefined}>
        <Slider label={`${label} volume`} value={Math.round(s.audio[k] * 100)} format={pct} onChange={(v) => store.set('audio', { [k]: v / 100 })} />
      </Row>
    ))}
    <Row label="Mute">
      <Toggle label="Mute all sound" on={s.audio.muted} onChange={(v) => store.set('audio', { muted: v })} />
    </Row>
    <SectionReset onClick={() => store.reset('audio')} />
  </div>
);

const Access = ({ s, store }: { s: Settings; store: SettingsStore }) => (
  <div>
    <Row label="Reduced motion" hint="No camera shake, no speed zoom, no flashing; the menu camera holds still.">
      <Toggle label="Reduced motion" on={s.access.reducedMotion} onChange={(v) => store.set('access', { reducedMotion: v })} />
    </Row>
    <Row label="Colour-blind friendly" hint="Good news turns blue instead of green, so nothing is told apart by red and green alone.">
      <Toggle label="Colour-blind friendly highlights" on={s.access.colorBlind} onChange={(v) => store.set('access', { colorBlind: v })} />
    </Row>
    <Row label="Larger text" hint="Bigger HUD and menu text.">
      <Toggle label="Larger HUD text" on={s.access.largeHud} onChange={(v) => store.set('access', { largeHud: v })} />
    </Row>
    <SectionReset onClick={() => store.reset('access')} />
  </div>
);

export const SettingsPanel = ({
  settings,
  store,
  onBack,
  tier,
  touch,
  portalMuted = false,
  initialTab = 'controls',
  onTabChange,
  kicker,
}: {
  settings: Settings;
  store: SettingsStore;
  onBack: () => void;
  tier: Tier | null;
  touch: boolean;
  portalMuted?: boolean;
  initialTab?: Tab;
  onTabChange?: (t: Tab) => void;
  kicker?: string;
}) => {
  const [tab, setTabState] = useState<Tab>(initialTab);
  const [confirmReset, setConfirmReset] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const setTab = (t: Tab) => {
    setTabState(t);
    onTabChange?.(t);
  };
  const cycle = (dir: 1 | -1) => {
    const i = (TABS.findIndex((t) => t.id === tab) + dir + TABS.length) % TABS.length;
    setTab(TABS[i].id);
    tabRefs.current[i]?.focus();
  };
  useMenuNav(ref, onBack);
  usePadNav(ref, { onBack, onTab: cycle });
  useEffect(() => tabRefs.current[TABS.findIndex((t) => t.id === tab)]?.focus(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Panel
      title="Settings"
      kicker={kicker}
      onBack={onBack}
      panelRef={ref}
      footer={
        <>
          <button
            type="button"
            data-nav
            onClick={() => {
              if (!confirmReset) return setConfirmReset(true);
              store.resetAll();
              setConfirmReset(false);
            }}
            onBlur={() => setConfirmReset(false)}
            className={`min-h-11 px-3 text-xs font-bold tracking-widest uppercase ${confirmReset ? 'bg-orange text-ink-deep' : 'text-lilac hover:text-orange'}`}
          >
            {confirmReset ? 'Press again to reset all' : 'Reset all'}
          </button>
          <button type="button" data-nav onClick={onBack} className="bg-gold font-display text-ink-deep min-h-11 -skew-x-6 px-6 text-base transition hover:brightness-110 active:scale-95">
            <span className="inline-block skew-x-6">Back</span>
          </button>
        </>
      }
    >
      <div className="bg-ink-deep/95 sticky top-0 z-10 -mx-5 px-5 pb-1 sm:-mx-8 sm:px-8">
        <div role="tablist" aria-label="Settings sections" className="flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              data-nav
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  e.preventDefault();
                  cycle(e.key === 'ArrowRight' ? 1 : -1);
                }
              }}
              className={`relative min-h-11 shrink-0 px-3 text-xs font-bold tracking-widest whitespace-nowrap uppercase transition sm:text-[13px] ${tab === t.id ? 'text-gold' : 'text-lilac hover:text-cream'}`}
            >
              {t.label}
              <span className={`bg-gold absolute inset-x-2 bottom-0 h-[3px] origin-left transition-transform ${tab === t.id ? 'scale-x-100' : 'scale-x-0'}`} />
            </button>
          ))}
        </div>
        <div className="text-lilac/70 hidden text-[10px] tracking-widest uppercase sm:block">← → switch tabs · ↑ ↓ move · Esc back</div>
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} key={tab} style={{ animation: 'fadeIn 0.2s ease-out both' }}>
        {tab === 'controls' && <Controls s={settings} store={store} touch={touch} />}
        {tab === 'camera' && <CameraTab s={settings} store={store} />}
        {tab === 'graphics' && <Graphics s={settings} store={store} tier={tier} />}
        {tab === 'audio' && <Audio s={settings} store={store} portalMuted={portalMuted} />}
        {tab === 'access' && <Access s={settings} store={store} />}
      </div>
    </Panel>
  );
};
