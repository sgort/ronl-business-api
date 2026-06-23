export interface Signal {
  id: string;
  tab: 'politiek' | 'regionaal' | 'europa' | 'media';
  dossierId: string | null;
  title: string;
  src: string;
  bron: 'tk' | 'ob' | null;
  ref?: { type: string; nr: string; url: string } | null;
  rel: number;
  impact: 'kans' | 'risico' | null;
  impactLabel: string | null;
  duiding: string | null;
  status: 'candidate' | 'ai_drafted' | 'confirmed' | 'dismissed';
  aiDraft?: { rel: number; impact: string; impactLabel: string; duiding: string } | null;
  confirmedBy?: string | null;
  confirmedAt?: string | null;
}

export interface FeedItem {
  id: string;
  title: string;
  type: string | null;
  number: string | null;
  date: string | null;
  url: string | null;
  source: 'tk' | 'ob';
  description?: string;
}
