import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ОСББ кінця світу',
  description: 'Рогалик про ходячий будинок, дивних сусідів і новий світанок.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk">
      <body>{children}</body>
    </html>
  );
}
