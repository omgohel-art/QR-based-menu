export default function CafeDecorations() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
      {/* Coffee bean — top right */}
      <svg className="absolute top-[8%] right-[6%] w-16 h-16 opacity-[0.035] rotate-[25deg]" viewBox="0 0 64 64" fill="none">
        <ellipse cx="32" cy="32" rx="14" ry="22" stroke="#4A3428" strokeWidth="2.5" fill="none" />
        <path d="M32 10 C28 22, 28 42, 32 54" stroke="#4A3428" strokeWidth="1.5" fill="none" />
      </svg>

      {/* Coffee bean — bottom left */}
      <svg className="absolute bottom-[12%] left-[4%] w-12 h-12 opacity-[0.03] -rotate-[40deg]" viewBox="0 0 64 64" fill="none">
        <ellipse cx="32" cy="32" rx="14" ry="22" stroke="#4A3428" strokeWidth="2.5" fill="none" />
        <path d="M32 10 C28 22, 28 42, 32 54" stroke="#4A3428" strokeWidth="1.5" fill="none" />
      </svg>

      {/* Leaf — mid left */}
      <svg className="absolute top-[45%] left-[2%] w-14 h-14 opacity-[0.025] rotate-[15deg]" viewBox="0 0 48 48" fill="none">
        <path d="M8 40 C8 40, 12 8, 40 8" stroke="#4A3428" strokeWidth="1.5" fill="none" />
        <path d="M8 40 C20 30, 30 20, 40 8" stroke="#4A3428" strokeWidth="1" fill="none" opacity="0.6" />
        <path d="M14 34 C18 28, 24 20, 32 12" stroke="#4A3428" strokeWidth="0.8" fill="none" opacity="0.4" />
      </svg>

      {/* Leaf — top left */}
      <svg className="absolute top-[18%] left-[8%] w-10 h-10 opacity-[0.02] -rotate-[30deg]" viewBox="0 0 48 48" fill="none">
        <path d="M8 40 C8 40, 12 8, 40 8" stroke="#4A3428" strokeWidth="1.5" fill="none" />
        <path d="M8 40 C20 30, 30 20, 40 8" stroke="#4A3428" strokeWidth="1" fill="none" opacity="0.5" />
      </svg>

      {/* Steam wisps — top center */}
      <svg className="absolute top-[5%] left-[40%] w-20 h-24 opacity-[0.02]" viewBox="0 0 80 96" fill="none">
        <path d="M30 96 C30 80, 50 70, 40 50 C30 30, 50 20, 40 0" stroke="#4A3428" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <path d="M50 96 C50 82, 30 72, 40 54 C50 36, 30 26, 40 10" stroke="#4A3428" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.6" />
      </svg>

      {/* Coffee bean — mid right */}
      <svg className="absolute top-[60%] right-[3%] w-10 h-10 opacity-[0.025] rotate-[60deg]" viewBox="0 0 64 64" fill="none">
        <ellipse cx="32" cy="32" rx="14" ry="22" stroke="#4A3428" strokeWidth="2.5" fill="none" />
        <path d="M32 10 C28 22, 28 42, 32 54" stroke="#4A3428" strokeWidth="1.5" fill="none" />
      </svg>

      {/* Small leaf — bottom right */}
      <svg className="absolute bottom-[20%] right-[10%] w-8 h-8 opacity-[0.02] rotate-[45deg]" viewBox="0 0 48 48" fill="none">
        <path d="M8 40 C8 40, 12 8, 40 8" stroke="#4A3428" strokeWidth="1.5" fill="none" />
      </svg>
    </div>
  );
}
