import { Bungee, Chakra_Petch } from 'next/font/google';

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { GAME_TITLE, STUDIO_NAME } from '~/lib/studio';

import './globals.css';

const display = Bungee({ weight: '400', subsets: ['latin'], variable: '--font-bungee' });
const ui = Chakra_Petch({ weight: ['400', '500', '600', '700'], subsets: ['latin'], variable: '--font-chakra' });

export const metadata: Metadata = {
  title: { default: `${GAME_TITLE} · ${STUDIO_NAME}`, template: `%s · ${GAME_TITLE}` },
  description: 'Four company cars. One free space. No insurance. First to park wins.',
  appleWebApp: { capable: true, title: 'Parking Lot', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0a0d18',
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en" className={`${display.variable} ${ui.variable}`}>
    <body className="min-h-screen font-sans">{children}</body>
  </html>
);

export default RootLayout;
