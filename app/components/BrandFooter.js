export default function BrandFooter() {
  return (
    <div className="bg-sand py-8 px-4 text-center border-t border-harbor/10">
      <style>{`
        @keyframes flameFlicker {
          0%, 100% { transform: scale(1) rotate(0deg); opacity: 1; }
          25% { transform: scale(1.06) rotate(-2deg); opacity: 0.85; }
          50% { transform: scale(0.96) rotate(2deg); opacity: 1; }
          75% { transform: scale(1.04) rotate(-1deg); opacity: 0.9; }
        }
        .flame-icon {
          animation: flameFlicker 1.6s ease-in-out infinite;
          transform-origin: center bottom;
        }
      `}</style>
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#C98A2E"
        strokeWidth="1.5"
        className="mx-auto mb-2 flame-icon"
      >
        <circle cx="17.5" cy="4" r="0.6" fill="#C98A2E" stroke="none" />
        <circle cx="15.5" cy="6.5" r="0.4" fill="#C98A2E" stroke="none" />
        <path d="M12 21c-3.5 0-6-2.3-6-5.6 0-2 1-3.6 2.2-5.1.3 1 1 1.7 1.7 1.7-.3-2.6.6-5.3 3-7 -.4 1.8.1 3 1 4 1.3 1.4 4.1 3 4.1 6.4 0 3.3-2.5 5.6-6 5.6z" />
      </svg>
      <p className="text-sm tracking-widest">
        <span className="text-harbor font-semibold">ORE FORGE</span>{' '}
        <span className="text-ochre font-semibold">APPS</span>
      </p>
      <p className="text-[11px] text-harbor/50 tracking-widest mt-1 uppercase">
        Ideas, forged into apps
      </p>
    </div>
  );
}
