/**
 * Normalizes comment text for keyword matching per SRS BR-CM-01: lowercase,
 * strip Vietnamese diacritics, strip emoji, trim, collapse whitespace.
 */
function normalizeText(text) {
  return text
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

module.exports = { normalizeText };
