import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono, Noto_Sans_JP } from 'next/font/google';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
});

const notoSansJp = Noto_Sans_JP({
  preload: false,
  variable: '--font-jp',
  weight: ['400', '500', '700'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'ResQ-Next Actuarial Reserving Workbench',
  description:
    'Enterprise non-life insurance IBNR reserving workbench with interactive Chainladder & Bornhuetter-Ferguson link-ratio outlier exclusion, Mack standard error, ODP Bootstrap simulation, and AI Actuary audit diagnostics.',
  openGraph: {
    title: 'ResQ-Next Actuarial Reserving Workbench',
    description:
      'Enterprise non-life insurance IBNR reserving workbench with interactive Chainladder & Bornhuetter-Ferguson link-ratio outlier exclusion, Mack standard error, ODP Bootstrap simulation, and AI Actuary audit diagnostics.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ResQ-Next Actuarial Reserving Workbench',
    description:
      'Enterprise non-life insurance IBNR reserving workbench with interactive Chainladder & Bornhuetter-Ferguson link-ratio outlier exclusion, Mack standard error, ODP Bootstrap simulation, and AI Actuary audit diagnostics.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plusJakarta.variable} ${notoSansJp.variable} ${jetbrainsMono.variable} dark`}
    >
      <body
        suppressHydrationWarning
        className="bg-slate-950 text-slate-100 font-sans antialiased selection:bg-sky-500/30 selection:text-sky-200"
      >
        {children}
      </body>
    </html>
  );
}
