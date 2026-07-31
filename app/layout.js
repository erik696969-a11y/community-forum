import './globals.css';
import Footer from './components/Footer';

export const metadata = {
  title: 'Community Forum',
  description: 'Hacienda del Señorío de Cifuentes — community forum for owners',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
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
      </body>
    </html>
  );
}
