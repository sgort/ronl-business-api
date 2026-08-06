import { nl, type Translations } from './nl';
import { en } from './en';

export type Lang = 'nl' | 'en';
export type { Translations };
export const translations: Record<Lang, Translations> = { nl, en };
