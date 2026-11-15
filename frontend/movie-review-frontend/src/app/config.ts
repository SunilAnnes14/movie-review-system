// Backend locations. Override at runtime by setting window.CINEVAULT_API before the app boots.
const runtime = (globalThis as any).CINEVAULT_API as string | undefined;

export const API_URL = runtime || 'http://localhost:5000/api';
export const SOCKET_URL = API_URL.replace(/\/api\/?$/, '');

export const GENRES = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family', 'Fantasy',
  'History', 'Horror', 'Music', 'Mystery', 'Romance', 'Sci-Fi', 'Thriller', 'War', 'Western'
];

export const LANGUAGES: Record<string, string> = {
  en: 'English', ta: 'Tamil', hi: 'Hindi', te: 'Telugu', ml: 'Malayalam', kn: 'Kannada', ja: 'Japanese',
  ko: 'Korean', pt: 'Portuguese', es: 'Spanish', fr: 'French', it: 'Italian', de: 'German', zh: 'Chinese'
};

export const VAULT_STATUSES = [
  { value: 'want_to_watch', label: 'Want to Watch', icon: '🔖' },
  { value: 'watching', label: 'Watching', icon: '▶' },
  { value: 'watched', label: 'Watched', icon: '✓' }
] as const;
