import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/lib/auth/AuthContext';
import { Toaster } from '@/components/ui/sonner';
import { formatReunionDates, ordinal, reunionNumber, reunionYear } from '@/lib/reunion-config';

const inter = Inter({ subsets: ['latin'] });

// Re-render at most hourly so the title/link preview roll over on the Tuesday after Labor Day.
export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const year = reunionYear();
  const title = `Churchwell Family Reunion ${year}`;
  const description = `The ${ordinal(reunionNumber(year))} Annual Churchwell Family Reunion - ${formatReunionDates(year, 'ordinal')} at Casa de Fruta`;
  return {
    title,
    description,
    keywords: `family reunion, Churchwell, Casa de Fruta, ${year}`,
    icons: { icon: '/favicon.ico' },
    // Link previews (iMessage, Facebook, etc.)
    openGraph: { title, description, siteName: 'Churchwell Family Reunion', type: 'website' },
    twitter: { card: 'summary', title, description },
  };
}

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