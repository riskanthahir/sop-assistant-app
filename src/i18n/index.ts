import type { Language } from '../types';
import { en, type UIStrings } from './en';
import { si } from './si';
import { ta } from './ta';

export const TRANSLATIONS: Record<Language, UIStrings> = {
  en,
  si,
  ta,
};

export const LANGUAGE_OPTIONS: Array<{ code: Language; label: string; shortLabel: string }> = [
  { code: 'en', label: 'EN', shortLabel: 'E' },
  { code: 'si', label: 'සිංහල', shortLabel: 'සි' },
  { code: 'ta', label: 'தமிழ்', shortLabel: 'த' },
];

export const SAFETY_FOOTER_ALL_LANGUAGES = [
  { lang: 'EN', text: 'Verify against the original SOP before safety-critical work.' },
  { lang: 'සිංහල', text: 'ආරක්ෂාවට අදාළ වැදගත් කාර්යයන්ට පෙර මුල් SOP ලේඛනය සමඟ සසඳා තහවුරු කරගන්න.' },
  { lang: 'தமிழ்', text: 'பாதுகாப்பு முக்கியத்துவம் வாய்ந்த பணிகளுக்கு முன் அசல் SOP ஆவணத்துடன் சரிபார்க்கவும்.' },
];
