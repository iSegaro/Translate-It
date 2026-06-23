const FONT_MAP = Object.freeze({
  'Times-Roman': '"Times New Roman", Times, serif',
  'TimesNewRoman': '"Times New Roman", Times, serif',
  'TimesNewRomanPSMT': '"Times New Roman", Times, serif',
  'Helvetica': '"Helvetica Neue", Helvetica, Arial, sans-serif',
  'Helvetica-Bold': '"Helvetica Neue", Helvetica, Arial, sans-serif',
  'Helvetica-Oblique': '"Helvetica Neue", Helvetica, Arial, sans-serif',
  'Helvetica-BoldOblique': '"Helvetica Neue", Helvetica, Arial, sans-serif',
  'Arial': 'Arial, Helvetica, sans-serif',
  'ArialMT': 'Arial, Helvetica, sans-serif',
  'Arial-BoldMT': 'Arial, Helvetica, sans-serif',
  'Arial-ItalicMT': 'Arial, Helvetica, sans-serif',
  'Courier': '"Courier New", Courier, monospace',
  'CourierNew': '"Courier New", Courier, monospace',
  'CourierNewPSMT': '"Courier New", Courier, monospace',
  'Courier-Bold': '"Courier New", Courier, monospace',
  'Courier-Oblique': '"Courier New", Courier, monospace',
  'Courier-BoldOblique': '"Courier New", Courier, monospace',
  'CourierNewPS-BoldMT': '"Courier New", Courier, monospace',
  'CourierNewPS-ItalicMT': '"Courier New", Courier, monospace',
  'CourierNewPS-BoldItalicMT': '"Courier New", Courier, monospace',
  'Symbol': 'Symbol, serif',
  'ZapfDingbats': '"Zapf Dingbats", serif',
  'Georgia': 'Georgia, "Times New Roman", Times, serif',
  'Times': '"Times New Roman", Times, serif',
  'Palatino': '"Palatino Linotype", "Book Antiqua", Palatino, serif',
  'Garamond': 'Garamond, "Times New Roman", Times, serif',
  'Bookman': '"Bookman Old Style", Garamond, serif',
  'Trebuchet': '"Trebuchet MS", Helvetica, sans-serif',
  'Verdana': 'Verdana, Geneva, sans-serif',
  'Tahoma': 'Tahoma, Verdana, sans-serif',
  'Comic Sans': '"Comic Sans MS", cursive',
  'Impact': 'Impact, "Arial Black", sans-serif',
  'Lucida': '"Lucida Console", Monaco, monospace'
})

const GENERIC_FALLBACK = 'sans-serif'

export function resolvePdfFontFamily(fontFamily) {
  if (!fontFamily) return GENERIC_FALLBACK

  const direct = FONT_MAP[fontFamily]
  if (direct) return direct

  const lower = fontFamily.toLowerCase()
  for (const [key, value] of Object.entries(FONT_MAP)) {
    if (lower.includes(key.toLowerCase())) {
      return value
    }
  }

  return `"${fontFamily}", ${GENERIC_FALLBACK}`
}
