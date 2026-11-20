import type { MetadataRoute } from 'next';

const manifest = (): MetadataRoute.Manifest => ({
  name: 'Parking Lot',
  short_name: 'Parking Lot',
  description: 'Four company cars. One free space. First to park wins.',
  start_url: '/play',
  display: 'fullscreen',
  orientation: 'landscape',
  background_color: '#0a0d18',
  theme_color: '#17181D',
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
});

export default manifest;
