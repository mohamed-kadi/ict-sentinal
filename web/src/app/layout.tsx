import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: 'ICT Trading Desk',
  description: 'Lightweight ICT trading app',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <Script src="/lwc.js" strategy="afterInteractive" />
      </head>
      <body>{children}</body>
    </html>
  );
}
