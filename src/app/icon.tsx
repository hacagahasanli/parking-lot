import { ImageResponse } from 'next/og';

export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

/** The app icon: a parking P in a painted bay, on the night ink. */
const Icon = () =>
  new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0d18' }}>
        <div
          style={{
            width: 330,
            height: 330,
            borderRadius: 60,
            background: '#1f6fd6',
            border: '18px solid #ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            fontSize: 250,
            fontWeight: 900,
          }}
        >
          P
        </div>
      </div>
    ),
    size,
  );

export default Icon;
