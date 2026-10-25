export const PlayIcon = () => (
  <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
    <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" fill="currentColor" />
  </svg>
);

export const PlusIcon = () => (
  <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
    <path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none" />
  </svg>
);

export const SearchIcon = () => (
  <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
    <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="2.4" fill="none" />
    <path d="M15.5 15.5L20 20" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
  </svg>
);

export const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none" />
  </svg>
);

export const InfoIcon = () => (
  <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
    <circle cx="12" cy="7" r="1.6" fill="currentColor" />
    <path d="M12 11v7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
  </svg>
);

const stroke = { stroke: 'currentColor', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' } as const;

export const HomeIcon = () => (
  <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
    <path d="M4 11l8-6.5 8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" {...stroke} />
  </svg>
);

export const FilmIcon = () => (
  <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
    <rect x="3.5" y="5" width="17" height="14" rx="2.5" {...stroke} />
    <path d="M8 5v14M16 5v14M3.5 9.5H8M3.5 14.5H8M16 9.5h4.5M16 14.5h4.5" {...stroke} />
  </svg>
);

export const TvIcon = () => (
  <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
    <rect x="3" y="5" width="18" height="12" rx="2.5" {...stroke} />
    <path d="M8.5 20.5h7" {...stroke} />
  </svg>
);

export const LibraryIcon = () => (
  <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
    <rect x="4" y="8" width="16" height="12" rx="2.5" {...stroke} />
    <path d="M6.5 5h11M9 2.5h6" {...stroke} />
  </svg>
);

export const GearIcon = () => (
  <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
    <circle cx="12" cy="12" r="3.2" {...stroke} />
    <path
      d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"
      {...stroke}
    />
  </svg>
);

export const ChevronRightIcon = () => (
  <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
    <path d="M9.5 5.5L16 12l-6.5 6.5" {...stroke} stroke-width={2.6} />
  </svg>
);

export const ProfileIcon = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
    <circle cx="12" cy="9" r="4" fill="currentColor" />
    <path d="M4.5 20c1.2-3.6 4-5.4 7.5-5.4s6.3 1.8 7.5 5.4z" fill="currentColor" />
  </svg>
);
