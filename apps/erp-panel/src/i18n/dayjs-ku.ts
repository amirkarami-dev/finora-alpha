import dayjs from 'dayjs';

/**
 * Sorani Kurdish for dayjs, registered under 'ku'.
 *
 * dayjs ships a `ku` locale, but it is Kurmanji in the Latin alphabet — the wrong script for
 * this desk, whose Kurdish readers are in Iraqi Kurdistan and write Sorani in the Arabic
 * script. Registering our own definition under the same name means the rest of the app can
 * treat 'ku' like 'ar' and 'fa': `LOCALES.ku.dayjsLocale` names it and `useLocaleEffect`
 * switches to it. Importing this module is what registers the locale; nothing is exported.
 *
 * Month names are the ones used in Iraqi Kurdistan (the Levantine calendar names), which is
 * what a Kurdish invoice or bank statement there shows.
 */
dayjs.locale(
  {
    name: 'ku',
    weekdays: ['یەکشەممە', 'دووشەممە', 'سێشەممە', 'چوارشەممە', 'پێنجشەممە', 'هەینی', 'شەممە'],
    weekdaysShort: ['یەک', 'دوو', 'سێ', 'چوار', 'پێنج', 'هەینی', 'شەممە'],
    weekdaysMin: ['ی', 'د', 'س', 'چ', 'پ', 'هـ', 'ش'],
    months: [
      'کانوونی دووەم',
      'شوبات',
      'ئازار',
      'نیسان',
      'ئایار',
      'حوزەیران',
      'تەممووز',
      'ئاب',
      'ئەیلوول',
      'تشرینی یەکەم',
      'تشرینی دووەم',
      'کانوونی یەکەم',
    ],
    monthsShort: [
      'کانوونی ٢',
      'شوبات',
      'ئازار',
      'نیسان',
      'ئایار',
      'حوزەیران',
      'تەممووز',
      'ئاب',
      'ئەیلوول',
      'تشرینی ١',
      'تشرینی ٢',
      'کانوونی ١',
    ],
    // The working week in Iraqi Kurdistan starts on Saturday.
    weekStart: 6,
    ordinal: (n: number) => `${n}`,
    formats: {
      LT: 'HH:mm',
      LTS: 'HH:mm:ss',
      L: 'DD/MM/YYYY',
      LL: 'D MMMM YYYY',
      LLL: 'D MMMM YYYY HH:mm',
      LLLL: 'dddd, D MMMM YYYY HH:mm',
    },
    relativeTime: {
      future: 'لە %s',
      past: '%s لەمەوبەر',
      s: 'چەند چرکەیەک',
      m: 'خولەکێک',
      mm: '%d خولەک',
      h: 'کاتژمێرێک',
      hh: '%d کاتژمێر',
      d: 'ڕۆژێک',
      dd: '%d ڕۆژ',
      M: 'مانگێک',
      MM: '%d مانگ',
      y: 'ساڵێک',
      yy: '%d ساڵ',
    },
  },
  undefined,
  // Register only — the active locale is chosen by `useLocaleEffect`.
  true,
);
