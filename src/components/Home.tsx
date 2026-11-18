'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import type { Game } from '~/game/render/game';

const STEPS = [
  ['Line up', 'Four company cars side by side at the entrance. Engines on.'],
  ['Find the empty bay', 'One space left in the whole lot, and nobody tells you where. Drive the aisles and look.'],
  ['Stop inside the lines', 'Straight, between the lines, standing still. First one wins. Hit a shopper and you are out.'],
];

const KEYS = [
  ['W / S', 'gas · brake, then reverse'],
  ['A / D', 'steer'],
  ['Space', 'handbrake'],
  ['H', 'horn'],
  ['C', 'camera'],
];

/** The home page: the real game running behind the title, four bots fighting for one space. */
export const Home = () => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let game: Game | null = null;
    let cancelled = false;
    void import('~/game/render/game').then(({ Game }) => {
      if (cancelled || !canvas.current) return;
      game = new Game(canvas.current, { mode: 'showcase' });
      setReady(true);
    });
    return () => {
      cancelled = true;
      game?.dispose();
    };
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden">
      <canvas ref={canvas} className="fixed inset-0 h-full w-full" style={{ opacity: ready ? 1 : 0, transition: 'opacity 1.2s' }} />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-r from-[#0a0d18]/90 via-[#0a0d18]/45 to-transparent" />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#0a0d18]/85 to-transparent" />

      <section className="relative z-10 flex min-h-screen flex-col justify-center px-6 py-10 sm:px-14" style={{ animation: 'riseIn 0.7s ease-out both' }}>
        <a href="https://merge-conflict-drab.vercel.app" className="text-lilac mb-5 text-xs font-semibold tracking-[0.3em] uppercase hover:text-cream">
          Merge Conflict · Game 03
        </a>
        <h1 className="font-display text-cream text-5xl leading-none sm:text-7xl">
          Parking
          <br />
          <span className="text-gold">Lot</span>
        </h1>
        <p className="text-cream mt-5 max-w-md text-xl font-semibold sm:text-2xl">Four company cars. One free space. No insurance.</p>
        <p className="text-lilac mt-2 max-w-md">Ram first, file the incident report later.</p>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Link
            href="/play"
            className="panel-cut bg-gold font-display text-ink-deep px-10 py-4 text-xl tracking-wide transition hover:brightness-110 active:scale-95"
          >
            Drive
          </Link>
          <span className="text-lilac text-sm">You against three bots. Online with friends is next.</span>
        </div>

        <ol className="mt-12 grid max-w-3xl gap-3 sm:grid-cols-3">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="panel-cut bg-ink/80 border-blue/20 border p-4 backdrop-blur-sm">
              <div className="font-display text-gold text-2xl">{i + 1}</div>
              <div className="text-cream mt-1 font-bold">{title}</div>
              <div className="text-lilac mt-1 text-sm">{text}</div>
            </li>
          ))}
        </ol>

        <div className="text-lilac mt-6 hidden flex-wrap gap-x-5 gap-y-1 text-sm sm:flex">
          {KEYS.map(([k, v]) => (
            <span key={k}>
              <kbd className="bg-ink text-cream rounded px-1.5 py-0.5 font-bold">{k}</kbd> {v}
            </span>
          ))}
        </div>
      </section>
    </main>
  );
};
