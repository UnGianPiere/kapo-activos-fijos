import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from '@/providers/providers';
import { PWAProvider } from '@/components/pwa-provider';
import { AutoSyncInitializer } from '@/components/auto-sync-initializer';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Activos Fijos - Sistema de Gestión',
  description: 'Sistema completo para la gestión de activos fijos',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1f2937',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={inter.className} suppressHydrationWarning>
        <Providers>
          <PWAProvider>
            <AutoSyncInitializer />
            {children}
          </PWAProvider>
        </Providers>
      </body>
    </html>
  );
}