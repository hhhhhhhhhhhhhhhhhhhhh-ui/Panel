import './globals.css';
import React from 'react';
import AnalyticsTracker from '../components/AnalyticsTracker';

export const metadata = {
  title: 'Admin Panel',
  description: 'Professional operations dashboard.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        <AnalyticsTracker />
        {children}
      </body>
    </html>
  );
}

