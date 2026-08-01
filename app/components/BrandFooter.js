export default function BrandFooter() {
  return (
    <div className="bg-[#181A1F] py-8 px-4 text-center">
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#E85D3D"
        strokeWidth="1.5"
        className="mx-auto mb-2"
      >
        <circle cx="17.5" cy="4" r="0.6" fill="#E85D3D" stroke="none" />
        <circle cx="15.5" cy="6.5" r="0.4" fill="#E85D3D" stroke="none" />
        <path d="M12 21c-3.5 0-6-2.3-6-5.6 0-2 1-3.6 2.2-5.1.3 1 1 1.7 1.7 1.7-.3-2.6.6-5.3 3-7 -.4 1.8.1 3 1 4 1.3 1.4 4.1 3 4.1 6.4 0 3.3-2.5 5.6-6 5.6z" />
      </svg>
      <p className="text-sm tracking-widest">
        <span className="text-gray-300 font-semibold">ORE FORGE</span>{' '}
        <span className="text-[#E85D3D] font-semibold">APPS</span>
      </p>
      <p className="text-[11px] text-gray-500 tracking-widest mt-1 uppercase">
        Ideas, forged into apps
      </p>
    </div>
  );
}
