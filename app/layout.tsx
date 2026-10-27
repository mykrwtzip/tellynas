import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: {
    default: 'Tellynas — your files, stored on Telegram',
    template: '%s · Tellynas',
  },
  description:
    'Tellynas turns a Telegram chat into unlimited personal cloud storage with folders, previews, search and instant downloads.',
  applicationName: 'Tellynas',
  icons: {
    icon: '/icon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f6fa' },
    { media: '(prefers-color-scheme: dark)', color: '#070b14' },
  ],
  width: 'device-width',
  initialScale: 1,
};

const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem('tellynas-theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored ? stored === 'dark' : prefersDark;
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        <div className="ambient" aria-hidden />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
