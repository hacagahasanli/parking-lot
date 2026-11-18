import type { MetadataRoute } from 'next';

const manifest = (): MetadataRoute.Manifest => ({
  name: 'Parking Lot',
  short_name: 'Parking Lot',
  description: 'Four company cars. One free space. First to park wins.',
  start_url: '/play',
  display: 'fullscreen',
  orientation: 'landscape',
  background_color: '#0a0d18',
  theme_color: '#0a0d18',
  icons: [{ src: '/icon', sizes: '512x512', type: 'image/png' }],
});

export default manifest;
