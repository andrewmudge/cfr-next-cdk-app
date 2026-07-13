import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/lib/auth/AuthContext';
import { Toaster } from '@/components/ui/sonner';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Churchwell Family Reunion 2026',
  description: 'The 59th Annual Churchwell Family Reunion - Aug 28th - Sep 1st 2025 at Casa de Fruta',
  keywords: 'family reunion, Churchwell, Casa de Fruta, 2026',
  icons: {
    icon: '/favicon.ico',}
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <AuthProvider>
          {children}
        </AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}