import { brandConfig } from '../../lib/brandConfig';

export default function Footer() {
  return (
    <footer className="text-center text-xs text-harbor/50 py-6 px-4">
      <img
        src={brandConfig.heroImage}
        alt={brandConfig.heroImageAlt}
        className="w-full max-w-xs mx-auto h-24 object-cover rounded-lg mb-3 opacity-90"
      />
      <p className="font-semibold">{brandConfig.fullLegalName}</p>
      <p>{brandConfig.address}</p>
    </footer>
  );
}
