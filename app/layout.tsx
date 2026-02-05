// app/layout.tsx
import type { Metadata } from 'next';
import Script from 'next/script';
import { JetBrains_Mono, Space_Grotesk, Inter } from 'next/font/google';
import '../app/globals.css';
import { Providers } from './components/Providers';

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-mono',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-display',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-sans',
});

// Frame embed metadata
const frameMetadata = {
  version: 'next',
  // TODO: Replace with deployed URL
  imageUrl: 'https://perps.fixr.nexus/frame-preview.png',
  button: {
    title: 'Trade Perps on Arb',
    action: {
      type: 'launch_frame',
      name: 'Fixr Perps',
      url: 'https://perps.fixr.nexus',
      splashImageUrl: 'https://perps.fixr.nexus/splash.png',
      splashBackgroundColor: '#0D1117'
    }
  }
};

export const metadata: Metadata = {
  title: 'Fixr Perps | GMX Trading Terminal',
  description: 'Trade perpetuals on GMX V2 directly from Farcaster. ETH, BTC, ARB, LINK with up to 50x leverage on Arbitrum.',
  other: {
    'fc:frame': JSON.stringify(frameMetadata),
    'og:image': frameMetadata.imageUrl,
    'fc:frame:image': frameMetadata.imageUrl,
    'fc:frame:button:1': frameMetadata.button.title,
    'fc:frame:post_url': frameMetadata.button.action.url,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${jetbrainsMono.variable} ${spaceGrotesk.variable} ${inter.variable}`}>
      <head>
        <Script
          src="https://cdn.jsdelivr.net/npm/@farcaster/frame-sdk/dist/index.min.js"
          strategy="beforeInteractive"
        />
      </head>
      <body className="font-sans bg-terminal-bg text-terminal-text antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
