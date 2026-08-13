import './globals.css';
import { Analytics } from '@vercel/analytics/next';
import Footer from './components/Footer';
import BrandFooter from './components/BrandFooter';

export const metadata = {
  title: 'Mi Hacienda',
  description: 'Hacienda del Señorío de Cifuentes — community forum for owners',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" href="/favicon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Mi Hacienda Owners App" />
        <meta name="theme-color" content="#143B4D" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Public+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body min-h-screen">
        {children}
        <Footer />
        <BrandFooter />
        <Analytics />
      </body>
    </html>
  );
}
