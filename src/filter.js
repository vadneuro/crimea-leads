const BUYER_KEYWORDS = [
  // Explicit intent
  'куплю', 'хочу купить', 'хочу приобрести', 'готов купить', 'готова купить',
  'приобрету', 'планирую купить', 'хочу взять',
  // Searching
  'ищу квартир', 'ищу дом', 'ищу участ', 'ищу недвижим', 'ищу вариант',
  'ищем квартир', 'ищем жильё', 'ищем дом', 'ищу жильё',
  // Considering
  'рассматриваю', 'рассматриваем', 'подбираю', 'присматриваю',
  'смотрю варианты', 'рассмотрю вариант', 'интересует покупк', 'интересует квартир',
  // Needs
  'нужна квартир', 'нужен дом', 'нужен участ', 'нужна недвижим',
  // Help requests
  'помогите найти', 'посоветуйте', 'подскажите квартир',
  // Relocation intent
  'переезжаем', 'переезжаю', 'хотим переехать', 'планируем переехать',
  'хочу переехать', 'думаем переехать', 'переехать в', 'ищем жильё для',
];

const CRIMEA_KEYWORDS = [
  'крым', 'ялт', 'симферопол', 'севастопол', 'алушт', 'евпатори',
  'керч', 'феодоси', 'судак', 'алупк', 'саки', 'джанкой', 'юбк',
  'южный берег', 'бахчисарай', 'армянск', 'инкерман', 'форос',
  'гурзуф', 'партенит', 'коктебел', 'береговое', 'николаевк',
  'большая ялта', 'большой севастополь',
];

const CRIMEA_GROUP_KEYWORDS = [
  'крым', 'ялт', 'симферопол', 'севастопол', 'алушт', 'евпатори',
  'керч', 'феодоси', 'судак', 'crimea', 'krim', 'yalta',
];

const SELLER_KEYWORDS = [
  'продам', 'сдам', 'аренда', 'предлагаю', 'продаётся', 'сдаётся',
  'продаю', 'предлагается', 'сдаю', 'от собственника', 'собственник',
  'риелтор', 'агентство', 'торг уместен', 'без комиссии', 'срочно продам',
];

// Negation patterns — "не куплю", "не хочу купить" etc.
const NEGATION_RE = /не\s+(куплю|хочу|буду|стану|планирую|готов|готова|рассматрив|собираюсь)/i;

// Real estate object must appear in text — eliminates "хочу купить парфюм", news, courses, etc.
// Uses specific stems/suffixes to avoid false matches on "домой", "участие", "студент".
const REALTY_RE = /квартир|апартамент|студи[яеюи]|комнат[аеуы]|недвижим|жильё|жилье|жилплощ|новостройк|коттедж|таунхаус|участо[кке]|земельн|дач[ауеи]|(?:^|\s)дом(?:\s|,|$)/im;

// Match keyword requiring full word boundary (no Cyrillic before or after).
// Prevents "рассматривают"→"рассматриваю", "окупить"→"купить", etc.
function matchesKeyword(text, keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(?<![а-яёА-ЯЁ])' + escaped + '(?![а-яёА-ЯЁ])', 'i').test(text);
}

export function isCrimeaGroup(title) {
  if (!title) return false;
  const lower = title.toLowerCase();
  return CRIMEA_GROUP_KEYWORDS.some(kw => lower.includes(kw));
}

export function isLead(text, groupTitle = '') {
  if (!text || text.length < 20) return false;
  const lower = text.toLowerCase();

  // Broadcast/pinned messages have many @mentions — skip them
  const mentions = (text.match(/@\w+/g) || []).length;
  if (mentions >= 3) return false;

  // Must mention a real estate object — rejects perfume/courses/news/roads
  if (!REALTY_RE.test(text)) return false;

  const hasSeller = SELLER_KEYWORDS.some(kw => lower.includes(kw));
  if (hasSeller) return false;

  // Negation: "не куплю", "не хочу купить"
  if (NEGATION_RE.test(text)) return false;

  // Word-boundary match — avoids "рассматривают"→"рассматриваю", "окупить"→"купить"
  const hasBuyer = BUYER_KEYWORDS.some(kw => matchesKeyword(lower, kw));
  if (!hasBuyer) return false;

  // From a Crimea group → real estate buyer intent is enough
  if (isCrimeaGroup(groupTitle)) return true;

  // Otherwise require Crimea keyword in the message text
  return CRIMEA_KEYWORDS.some(kw => lower.includes(kw));
}

export function getCrimeaMatch(text) {
  const lower = text.toLowerCase();
  return CRIMEA_KEYWORDS.find(kw => lower.includes(kw)) || '';
}
