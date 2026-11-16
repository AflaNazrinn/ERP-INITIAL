/* Letterhead designs for Create a Company (company.html → Generate).
   Each design draws an A4 page (1240 × 1754 px, 150 dpi) on a canvas from the company's details; Generate picks
   one at random (not the same one twice in a row) and the PNG becomes the company's letterhead.
   To add a design: push one more { name, draw(ctx, data) } onto LETTERHEADS.
   data: { name, businessType, logo (an Image or null), email, phone, website, cr, vat, building, street, area, city,
           country, poBox, postalCode, colors } — every text is a string, '' when the field was left blank; a design leaves
           out whatever is blank.
   The designs are layouts only: their colours come from the company's logo (data.colors = lhPalette(logo):
   { primary, dark, onPrimary }), so a red logo gets a red letterhead. A design never hard-codes its accent colours;
   text and icons drawn on the primary colour use onPrimary (white, or dark ink on a light colour such as yellow). */

'use strict';

const LETTERHEAD_WIDTH = 1240;
const LETTERHEAD_HEIGHT = 1754;

/* ---------- shared drawing helpers ---------- */

// Lucide icon outlines (24 × 24), drawn white inside a coloured circle.
const LH_ICONS = {
  mail: { stroke: ['M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z', 'm22 6-10 7L2 6'] },
  phone: { fill: ['M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z'] },
  pin: { fill: ['M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z'], hole: [12, 10, 3] },
  globe: { stroke: ['M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20z', 'M2 12h20', 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'] },
};

// An icon (white, or glyphColor) in a filled circle of radius r centred on (x, y).
function lhIconBadge(ctx, icon, x, y, r, color, glyphColor = '#ffffff') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  lhIcon(ctx, icon, x, y, r * 1.05, glyphColor, color);
  ctx.restore();
}

// A bare icon of the given size centred on (x, y); holeColor fills the pin's dot.
function lhIcon(ctx, icon, x, y, size, color, holeColor) {
  const spec = LH_ICONS[icon];
  const scale = size / 24;
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(scale, scale);
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  for (const d of spec.stroke || []) ctx.stroke(new Path2D(d));
  for (const d of spec.fill || []) ctx.fill(new Path2D(d));
  if (spec.hole) {
    ctx.fillStyle = holeColor;
    ctx.beginPath();
    ctx.arc(spec.hole[0], spec.hole[1], spec.hole[2], 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function lhPolygon(ctx, color, points) {
  ctx.fillStyle = color;
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fill();
}

// The largest font size (down to min) at which text fits in width.
function lhFit(ctx, text, width, weight, size, min, family = 'Roboto, Arial, sans-serif') {
  for (; size > min; size -= 1) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= width) return size;
  }
  ctx.font = `${weight} ${min}px ${family}`;
  return min;
}

// The logo scaled to fit a box (keeping its shape), centred vertically; returns the width it took (0 without a logo).
function lhLogo(ctx, logo, x, y, maxWidth, maxHeight) {
  if (!logo) return 0;
  const w0 = logo.naturalWidth || logo.width || maxHeight;
  const h0 = logo.naturalHeight || logo.height || maxHeight;
  const scale = Math.min(maxWidth / w0, maxHeight / h0);
  const w = w0 * scale, h = h0 * scale;
  ctx.drawImage(logo, x, y + (maxHeight - h) / 2, w, h);
  return w;
}

// The company name as the designs show it: the first word on top (bold), the rest under it. A short first word
// (AL, THE, ABC) keeps the next word with it: "AL NOOR" / "TRADING", not "AL" / "NOOR TRADING".
function lhNameLines(name) {
  const words = name.trim().split(/\s+/);
  const top = words[0]?.length <= 3 && words.length > 2 ? 2 : 1;
  return words.length > top ? [words.slice(0, top).join(' '), words.slice(top).join(' ')] : [words.join(' ')];
}

const lhJoin = (parts, glue = ', ') => parts.filter(Boolean).join(glue);

// Up to two initials of the company name, for a logo tile or circle when no logo has been uploaded yet.
function lhInitials(name) {
  const words = name.trim().split(/\s+/).filter(word => !/^(LLC|L\.L\.C\.?|SAOC|SAOG|SPC|WLL|CO\.?|CO|LTD\.?|INC)$/i.test(word));
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2)).toUpperCase();
}

// Text with letter spacing (drawn letter by letter: not every browser has ctx.letterSpacing). align: left / center / right.
function lhSpaced(ctx, text, x, y, spacing, align = 'left') {
  const chars = [...text];
  const width = chars.reduce((sum, ch) => sum + ctx.measureText(ch).width, 0) + spacing * Math.max(0, chars.length - 1);
  let at = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  const saved = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const ch of chars) { ctx.fillText(ch, at, y); at += ctx.measureText(ch).width + spacing; }
  ctx.textAlign = saved;
  return width;
}

function lhRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// The logo in a size × size box; without a logo, the shape the design shows there ('tile', 'circle', 'outline-tile',
// 'outline-circle') with the company's initials in it.
function lhLogoOrMark(ctx, d, x, y, size, shape) {
  if (d.logo) { lhLogo(ctx, d.logo, x, y, size, size); return; }
  const filled = !shape.startsWith('outline');
  const color = shape.endsWith('circle') && filled ? d.colors.dark : d.colors.primary;
  ctx.save();
  if (shape.endsWith('circle')) { ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2 - 2, 0, Math.PI * 2); }
  else lhRoundRect(ctx, x + 2, y + 2, size - 4, size - 4, size * 0.14);
  if (filled) { ctx.fillStyle = color; ctx.fill(); } else { ctx.lineWidth = 3; ctx.strokeStyle = color; ctx.stroke(); }
  ctx.fillStyle = filled ? (shape.endsWith('circle') ? '#ffffff' : d.colors.onPrimary) : color;
  ctx.font = `700 ${Math.round(size * 0.34)}px Roboto, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(lhInitials(d.name), x + size / 2, y + size / 2 + 2);
  ctx.restore();
}

// A colour of the same hue at another lightness (a tint or a shade of the logo's colour).
function lhShade(hex, lightness, minSaturation = 0) {
  const [h, s] = lhRgbToHsl(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
  return lhHslToHex(h, Math.max(s, minSaturation), lightness);
}

const LH_INK = '#334155';      // body text
const LH_MUTED = '#64748b';    // small print
const LH_RULE = '#e5e7eb';     // hairlines

// The address in two lines, as the designs print it: "Building, Street, Area" / "City, Country · P O Box …".
function lhAddressLines(d, { postal = false } = {}) {
  return [
    lhJoin([d.building, d.street, d.area]),
    lhJoin([lhJoin([d.city, d.country]), d.poBox && `P O Box ${d.poBox}`, postal && d.postalCode && `PC ${d.postalCode}`], ' · '),
  ].filter(Boolean);
}
const lhRegistration = d => lhJoin([d.cr && `CR No. ${d.cr}`, d.vat && `VAT Reg. No. ${d.vat}`], ' · ');

/* ---------- colours from the logo ----------
   primary:   the logo's main colour, as it is (the most common saturated colour; white and transparent pixels ignored;
              light and dark shades of one hue counted apart, so Bluesun's bright blue is not mixed with its navy).
              Only a very pale colour is deepened a little, so the bars still show on white paper.
   dark:      a second, dark colour of the logo when it has one (Bluesun's navy); otherwise a deep shade of the primary.
   onPrimary: white when white text reads well on the primary (contrast 3:1 or more), else the dark colour.
   A logo without colour (black, grey) gets charcoal tones; no logo, or one the browser will not let the page read
   (some SVGs), gets the default blue and navy. */
const LH_DEFAULT_COLORS = { primary: '#1877d8', dark: '#1f2a37', onPrimary: '#ffffff' };

function lhRgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function lhHslToHex(h, s, l) {
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return `#${[f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}
// Contrast of an HSL colour against white (WCAG).
function lhContrastWithWhite(h, s, l) {
  const hex = lhHslToHex(h, s, l);
  const lin = i => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5);
  return 1.05 / (lum + 0.05);
}
function lhDarkenFor(h, s, l, contrast) {
  while (l > 0.05 && lhContrastWithWhite(h, s, l) < contrast) l -= 0.02;
  return l;
}

function lhPalette(logo) {
  if (!logo) return { ...LH_DEFAULT_COLORS };
  let pixels;
  try {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const w0 = logo.naturalWidth || logo.width || size, h0 = logo.naturalHeight || logo.height || size;
    const scale = Math.min(size / w0, size / h0);
    ctx.drawImage(logo, 0, 0, w0 * scale, h0 * scale);
    pixels = ctx.getImageData(0, 0, size, size).data;
  } catch {
    return { ...LH_DEFAULT_COLORS };                      // the browser would not let the page read this logo
  }

  // Count the logo's colours: saturated ones by hue (24 buckets of 15°), the rest as "neutral".
  const buckets = new Map();
  let inked = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 160) continue;                    // transparent
    const [h, s, l] = lhRgbToHsl(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (l > 0.93) continue;                               // white background
    inked += 1;
    const key = s < 0.18 || l < 0.08 ? 'neutral' : `${Math.floor(h / 15) % 24}${l < 0.3 ? 'd' : 'l'}`;   // hue band, dark or light
    const b = buckets.get(key) || { count: 0, h: 0, hx: 0, hy: 0, s: 0, l: 0 };
    b.count += 1; b.hx += Math.cos(h * Math.PI / 180); b.hy += Math.sin(h * Math.PI / 180); b.s += s; b.l += l;
    buckets.set(key, b);
  }
  if (!inked) return { ...LH_DEFAULT_COLORS };
  const mean = b => [((Math.atan2(b.hy, b.hx) * 180 / Math.PI) + 360) % 360, b.s / b.count, b.l / b.count];
  // The main colour: the biggest colour band, preferring a light shade over a dark one of about the same size.
  const weight = ([key, b]) => b.count * (key.endsWith('d') ? 0.6 : 1);
  const hues = [...buckets.entries()].filter(([key]) => key !== 'neutral').sort((a, b) => weight(b) - weight(a));
  const chromatic = hues.reduce((sum, [, b]) => sum + b.count, 0);

  // A logo without real colour: charcoal tones.
  if (chromatic < inked * 0.1) {
    const n = buckets.get('neutral');
    const l = Math.max(0.2, Math.min(0.32, n ? n.l / n.count : 0.25));
    return { primary: lhHslToHex(0, 0, l), dark: lhHslToHex(0, 0, 0.09), onPrimary: '#ffffff' };
  }

  let [h, s, l] = mean(hues[0][1]);
  s = Math.max(s, 0.45);                                  // a washed-out average would look grey
  l = Math.min(l, 0.62);                                  // a very pale colour would vanish on white paper
  const primary = lhHslToHex(h, s, l);

  // The dark colour: another, dark colour of the logo (a different hue or the neutral ink), else a shade of the primary.
  const others = [...buckets.entries()]
    .filter(([key, b]) => key !== hues[0][0] && b.count >= inked * 0.08)
    .map(([, b]) => mean(b))
    .filter(([, , ol]) => ol < 0.32);
  let dark;
  if (others.length) {
    const [oh, os, ol] = others[0];
    dark = lhHslToHex(oh, Math.min(os, 0.6), lhDarkenFor(oh, Math.min(os, 0.6), ol, 9));
  } else {
    const ds = Math.min(s, 0.45);
    dark = lhHslToHex(h, ds, lhDarkenFor(h, ds, 0.18, 9));
  }
  return { primary, dark, onPrimary: lhContrastWithWhite(h, s, l) >= 3 ? '#ffffff' : dark };
}

/* ---------- the designs ---------- */

const LETTERHEADS = [
  /* 1. Blue bars: logo and name on the left; email and phone in the middle; CR, address and VAT on the right
        after a thin divider. A blue bar, a slash and a navy bar under the header; at the foot a blue bar, a navy
        notch and a taller blue bar with the website. */
  {
    name: 'Blue bars',
    draw(ctx, d) {
      const W = LETTERHEAD_WIDTH, H = LETTERHEAD_HEIGHT;
      const BLUE = d.colors.primary, NAVY = d.colors.dark, ON = d.colors.onPrimary, GREY = '#334155';   // from the logo (lhPalette)
      const M = 74, R = W - 74;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);

      // Right column, four lines as in the design: CR, P.O. Box / PC, area / city / country (the street when there is
      // no area or city), VAT; a right-aligned block next to the margin.
      const right = [
        d.cr && `CR No: ${d.cr}`,
        lhJoin([d.poBox && `PO Box: ${d.poBox}`, d.postalCode && `PC: ${d.postalCode}`]),
        lhJoin(d.area || d.city ? [d.area, d.city, d.country] : [d.building, d.street, d.country]),
        d.vat && `VAT No: ${d.vat}`,
      ].filter(Boolean);
      ctx.font = '400 19px Roboto, Arial, sans-serif';
      const rightText = Math.min(330, Math.max(0, ...right.map(line => ctx.measureText(line).width)));
      const rightX = R - rightText;                         // where its text starts
      const top = 66, bottom = 170;                         // the header band, above the bars

      if (right.length) {
        const lineH = 25;
        let y = top + 18 + Math.max(0, (bottom - top - right.length * lineH) / 2 - 8);
        lhIconBadge(ctx, 'pin', rightX - 32, y - 6, 16, BLUE, ON);
        ctx.fillStyle = GREY;
        for (const line of right) {
          lhFit(ctx, line, rightText, 400, 19, 13);
          ctx.fillText(line, rightX, y);
          y += lineH;
        }
      }

      // Middle column: email and phone, each with its round icon, then the divider before the right column.
      const middle = [['mail', d.email], ['phone', d.phone]].filter(([, text]) => text);
      const dividerX = right.length ? rightX - 64 : R;
      let middleX = dividerX;
      if (middle.length) {
        ctx.font = '400 20px Roboto, Arial, sans-serif';
        const width = Math.min(300, Math.max(...middle.map(([, text]) => ctx.measureText(text).width)));
        middleX = dividerX - (right.length ? 44 : 0) - width - 46;
        const gap = 48;
        let y = (top + bottom) / 2 - ((middle.length - 1) * gap) / 2;
        for (const [icon, text] of middle) {
          lhIconBadge(ctx, icon, middleX + 16, y, 16, BLUE, ON);
          ctx.fillStyle = GREY;
          lhFit(ctx, text, width, 400, 20, 13);
          ctx.textBaseline = 'middle';
          ctx.fillText(text, middleX + 46, y + 1);
          ctx.textBaseline = 'alphabetic';
          y += gap;
        }
      }
      if (right.length && middle.length) {
        ctx.fillStyle = '#e5e7eb';
        ctx.fillRect(dividerX, top, 2, bottom - top);
      }

      // Left: the logo, then the name (first word bold on top, the rest under it).
      const logoW = lhLogo(ctx, d.logo, M, top + 4, 150, 100);
      const nameX = M + (logoW ? logoW + 22 : 0);
      const nameWidth = Math.max(160, (middle.length ? middleX : dividerX) - nameX - 36);
      const lines = lhNameLines(d.name);
      ctx.fillStyle = NAVY;
      if (lines.length === 1) {
        lhFit(ctx, lines[0], nameWidth, 700, 46, 22);
        ctx.textBaseline = 'middle';
        ctx.fillText(lines[0], nameX, top + 54);
        ctx.textBaseline = 'alphabetic';
      } else {
        lhFit(ctx, lines[0], nameWidth, 700, 42, 20);
        ctx.fillText(lines[0], nameX, top + 50);
        ctx.fillStyle = GREY;
        lhFit(ctx, lines[1], nameWidth, 400, 38, 18);
        ctx.fillText(lines[1], nameX, top + 96);
      }

      // Under the header: a blue bar, a thin slash, a navy bar.
      const y1 = 196, y2 = 205, cut = 9;
      const split = Math.round(M + (R - M) * 0.44);
      lhPolygon(ctx, BLUE, [[M, y1], [split, y1], [split - cut, y2], [M, y2]]);
      lhPolygon(ctx, NAVY, [[split + 8, y1], [split + 12, y1], [split + 3, y2], [split - 1, y2]]);
      lhPolygon(ctx, NAVY, [[split + 24, y1], [R, y1], [R, y2], [split + 24 - cut, y2]]);

      // The foot: a blue bar, a navy notch, a taller blue bar holding the website.
      const f1 = H - 54, f2 = H - 40, tall = H - 62, mid = Math.round(M + (R - M) * 0.5);
      lhPolygon(ctx, BLUE, [[M, f1], [mid - 18, f1], [mid - 6, f2], [M, f2]]);
      lhPolygon(ctx, NAVY, [[mid - 2, f1], [mid + 22, f1], [mid + 34, f2], [mid + 10, f2]]);
      lhPolygon(ctx, BLUE, [[mid + 56, tall], [R, tall], [R, f2], [mid + 40, f2]]);
      if (d.website) {
        const textR = R - 22, cy = (tall + f2) / 2;
        ctx.fillStyle = ON;
        const size = lhFit(ctx, d.website, R - mid - 140, 600, 17, 11, '"Roboto Mono", ui-monospace, monospace');
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(d.website, textR, cy + 1);
        const textW = ctx.measureText(d.website).width;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        lhIcon(ctx, 'globe', textR - textW - 16, cy, size, ON);
      }
    },
  },

  /* 2. Tile and columns: a logo tile, the name with the business type under it, the website in a pill on the right;
        a three-part bar (main colour, a light tint, grey). At the foot a rule and three columns: Address, Contact,
        Registration. */
  {
    name: 'Tile and columns',
    draw(ctx, d) {
      const W = LETTERHEAD_WIDTH, H = LETTERHEAD_HEIGHT, M = 87, R = W - 86;
      const P = d.colors.primary, DARK = d.colors.dark, LIGHT = lhShade(P, 0.66, 0.55);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);

      lhLogoOrMark(ctx, d, M, 88, 100, 'tile');
      let pillLeft = R;
      if (d.website) {
        ctx.font = '600 16px "Roboto Mono", ui-monospace, monospace';
        const w = Math.min(320, ctx.measureText(d.website).width) + 44;
        pillLeft = R - w;
        lhRoundRect(ctx, pillLeft, 117, w, 42, 21);
        ctx.fillStyle = lhShade(P, 0.97, 0.3); ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = lhShade(P, 0.8, 0.4); ctx.stroke();
        ctx.fillStyle = P; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        lhFit(ctx, d.website, w - 44, 600, 16, 11, '"Roboto Mono", ui-monospace, monospace');
        ctx.fillText(d.website, pillLeft + w / 2, 139);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }
      const nameX = M + 120, nameW = pillLeft - nameX - 30;
      ctx.fillStyle = DARK;
      lhFit(ctx, d.name, nameW, 800, 40, 20);
      ctx.fillText(d.name, nameX, 136);
      if (d.businessType) {
        ctx.fillStyle = LH_MUTED;
        ctx.font = '700 14px Roboto, Arial, sans-serif';
        lhSpaced(ctx, d.businessType.toUpperCase(), nameX, 169, 2.4);
      }

      const y = 217, h = 8, a = M + 234, b = a + 9 + 117;
      ctx.fillStyle = P; ctx.fillRect(M, y, a - M, h);
      ctx.fillStyle = LIGHT; ctx.fillRect(a + 7, y, b - a - 7, h);
      ctx.fillStyle = LH_RULE; ctx.fillRect(b + 7, y, R - b - 7, h);

      // The foot: a rule, then three columns.
      ctx.fillStyle = P; ctx.fillRect(M, 1604, R - M, 4);
      const columns = [
        ['Address', lhAddressLines(d)],
        ['Contact', [d.phone, d.email].filter(Boolean)],
        ['Registration', [d.cr && `CR No. ${d.cr}`, d.vat && `VAT Reg. No. ${d.vat}`].filter(Boolean)],
      ];
      const colW = (R - M) / 3;
      columns.forEach(([label, lines], i) => {
        const x = M + i * (colW + 4);
        ctx.fillStyle = P;
        ctx.font = '800 13px Roboto, Arial, sans-serif';
        lhSpaced(ctx, label.toUpperCase(), x, 1645, 2);
        ctx.fillStyle = LH_INK;
        lines.forEach((line, n) => { lhFit(ctx, line, colW - 24, 400, 15, 11); ctx.fillText(line, x, 1678 + n * 23); });
      });
    },
  },

  /* 3. Corner stripes: slanted stripes in the top-right corner (main colour, dark, main colour band), a round logo,
        the name with the business type in the main colour, phone / email / website on the right; a short coloured rule
        and a grey one. At the foot the address and registration on the right and the stripes again bottom-left. */
  {
    name: 'Corner stripes',
    draw(ctx, d) {
      const W = LETTERHEAD_WIDTH, H = LETTERHEAD_HEIGHT, M = 83, R = W - 79;
      const P = d.colors.primary, DARK = d.colors.dark;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);

      // Top-right: a thin stripe, a dark stripe, then the band running off the page.
      const t = 77;
      lhPolygon(ctx, P, [[912, 0], [936, 0], [890, t], [859, t]]);
      lhPolygon(ctx, DARK, [[954, 0], [1006, 0], [958, t], [908, t]]);
      lhPolygon(ctx, P, [[1032, 0], [W, 0], [W, t], [980, t]]);

      lhLogoOrMark(ctx, d, M, 125, 100, 'circle');
      const contact = [[d.phone, 700, DARK], [d.email, 400, LH_INK], [d.website, 400, LH_INK]].filter(([text]) => text);
      ctx.textAlign = 'right';
      let widest = 0;
      contact.forEach(([text, weight, color], i) => {
        ctx.fillStyle = color;
        lhFit(ctx, text, 330, weight, 16, 11);
        widest = Math.max(widest, ctx.measureText(text).width);
        ctx.fillText(text, R, 156 + i * 23);
      });
      ctx.textAlign = 'left';
      const nameX = M + 118, nameW = R - widest - nameX - 40;
      ctx.fillStyle = DARK;
      lhFit(ctx, d.name, nameW, 800, 41, 20);
      ctx.fillText(d.name, nameX, 177);
      if (d.businessType) {
        ctx.fillStyle = P;
        ctx.font = '800 14px Roboto, Arial, sans-serif';
        lhSpaced(ctx, d.businessType.toUpperCase(), nameX, 207, 2.4);
      }
      ctx.fillStyle = P; ctx.fillRect(M, 256, 238, 4);
      ctx.fillStyle = LH_RULE; ctx.fillRect(M + 238, 257, R - M - 238, 2);

      // The foot: address and registration on the right; stripes bottom-left.
      const foot = [lhJoin([d.building, d.street, d.area, d.city, d.country]), lhRegistration(d)].filter(Boolean);
      ctx.fillStyle = LH_MUTED;
      ctx.textAlign = 'right';
      foot.forEach((line, i) => { lhFit(ctx, line, 620, 400, 15, 11); ctx.fillText(line, R, 1671 + i * 22 - (foot.length === 1 ? 0 : 0)); });
      ctx.textAlign = 'left';
      lhPolygon(ctx, P, [[0, 1708], [306, 1708], [295, H], [0, H]]);
      lhPolygon(ctx, DARK, [[339, 1702], [379, 1702], [343, H], [306, H]]);
      lhPolygon(ctx, P, [[398, 1702], [430, 1702], [393, H], [366, H]]);
    },
  },

  /* 4. Classic centred: a round logo in the middle, the name in spaced capitals (dark), the business type in the main
        colour; a double rule (dark, then a thin coloured one). At the foot the double rule again and two centred lines
        joined by small diamonds. */
  {
    name: 'Classic centred',
    draw(ctx, d) {
      const W = LETTERHEAD_WIDTH, H = LETTERHEAD_HEIGHT, M = 109, R = W - 109, C = W / 2;
      const P = d.colors.primary, DARK = d.colors.dark;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);

      lhLogoOrMark(ctx, d, C - 46, 89, 92, 'outline-circle');
      ctx.fillStyle = DARK;
      let size = 36;
      for (; size > 18; size -= 1) {                        // fit the spaced name across the page
        ctx.font = `800 ${size}px Roboto, Arial, sans-serif`;
        if (ctx.measureText(d.name).width + d.name.length * size * 0.2 <= R - M) break;
      }
      lhSpaced(ctx, d.name, C, 228, size * 0.2, 'center');
      if (d.businessType) {
        ctx.fillStyle = P;
        ctx.font = '800 13px Roboto, Arial, sans-serif';
        lhSpaced(ctx, d.businessType.toUpperCase(), C, 263, 3.4, 'center');
      }
      ctx.fillStyle = DARK; ctx.fillRect(M, 300, R - M, 4);
      ctx.fillStyle = P; ctx.fillRect(M, 310, R - M, 2);

      ctx.fillStyle = P; ctx.fillRect(M, 1636, R - M, 2);
      ctx.fillStyle = DARK; ctx.fillRect(M, 1643, R - M, 4);
      const lines = [
        [lhJoin([d.building, d.street, d.area, d.city, d.country]), lhJoin([d.poBox && `P O Box ${d.poBox}`, d.postalCode && `PC ${d.postalCode}`], ' · ')],
        [d.phone, d.email, lhRegistration(d)],
      ].map(parts => parts.filter(Boolean)).filter(parts => parts.length);
      lines.forEach((parts, i) => {
        ctx.font = '400 15px Roboto, Arial, sans-serif';
        const gap = 34;
        const widths = parts.map(part => ctx.measureText(part).width);
        let x = C - (widths.reduce((a, b) => a + b, 0) + gap * (parts.length - 1)) / 2;
        const y = 1683 + i * 26;
        parts.forEach((part, n) => {
          ctx.fillStyle = LH_MUTED;
          ctx.fillText(part, x, y);
          x += widths[n];
          if (n < parts.length - 1) {                       // a small diamond between the parts
            ctx.fillStyle = P;
            lhPolygon(ctx, P, [[x + gap / 2, y - 12], [x + gap / 2 + 6, y - 6], [x + gap / 2, y], [x + gap / 2 - 6, y - 6]]);
            x += gap;
          }
        });
      });
    },
  },

  /* 5. Minimal: an outlined logo tile, the name with the business type in the main colour, the address block on the
        right; a grey hairline. At the foot a hairline and one centred line: Phone · Email · Web, the labels coloured. */
  {
    name: 'Minimal',
    draw(ctx, d) {
      const W = LETTERHEAD_WIDTH, H = LETTERHEAD_HEIGHT, M = 92, R = W - 82;
      const P = d.colors.primary, DARK = d.colors.dark;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);

      lhLogoOrMark(ctx, d, M, 70, 98, 'outline-tile');
      const right = [lhJoin([d.building, d.street, d.area]),
        lhJoin([lhJoin([d.city, d.country]), d.poBox && `P O Box ${d.poBox}`, d.postalCode && `PC ${d.postalCode}`], ' · '),
        lhRegistration(d)].filter(Boolean);
      ctx.fillStyle = LH_MUTED;
      ctx.textAlign = 'right';
      let widest = 0;
      right.forEach((line, i) => {
        lhFit(ctx, line, 420, 400, 15, 11);
        widest = Math.max(widest, ctx.measureText(line).width);
        ctx.fillText(line, R, 101 + i * 23);
      });
      ctx.textAlign = 'left';
      const nameX = M + 118;
      ctx.fillStyle = DARK;
      lhFit(ctx, d.name, R - widest - nameX - 40, 800, 41, 20);
      ctx.fillText(d.name, nameX, 116);
      if (d.businessType) {
        ctx.fillStyle = P;
        ctx.font = '800 14px Roboto, Arial, sans-serif';
        lhSpaced(ctx, d.businessType.toUpperCase(), nameX, 150, 2.4);
      }
      ctx.fillStyle = LH_RULE; ctx.fillRect(M, 200, R - M, 2);

      ctx.fillStyle = LH_RULE; ctx.fillRect(M, 1650, R - M, 2);
      const parts = [['Phone', d.phone], ['Email', d.email], ['Web', d.website]].filter(([, value]) => value);
      ctx.font = '400 15px Roboto, Arial, sans-serif';
      const bold = '700 15px Roboto, Arial, sans-serif', plain = '400 15px Roboto, Arial, sans-serif';
      const measure = (font, text) => { ctx.font = font; return ctx.measureText(text).width; };
      const sep = '  ·  ';
      const total = parts.reduce((sum, [label, value], i) => sum + measure(bold, label + ' ') + measure(plain, value) + (i ? measure(plain, sep) : 0), 0);
      let x = W / 2 - total / 2;
      parts.forEach(([label, value], i) => {
        if (i) { ctx.font = plain; ctx.fillStyle = LH_MUTED; ctx.fillText(sep, x, 1684); x += ctx.measureText(sep).width; }
        ctx.font = bold; ctx.fillStyle = P; ctx.fillText(label + ' ', x, 1684); x += ctx.measureText(label + ' ').width;
        ctx.font = plain; ctx.fillStyle = LH_MUTED; ctx.fillText(value, x, 1684); x += ctx.measureText(value).width;
      });
    },
  },

  /* 6. Angled panel: the logo and the name (as design 1) on the left; a slanted panel in the main colour across the
        top-right with a dark stripe beside it, holding email, phone and the address / registration in white. At the
        foot a coloured wedge with a dark stripe bottom-left and the website on the right. */
  {
    name: 'Angled panel',
    draw(ctx, d) {
      const W = LETTERHEAD_WIDTH, H = LETTERHEAD_HEIGHT, M = 87;
      const P = d.colors.primary, DARK = d.colors.dark, ON = d.colors.onPrimary;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);

      lhPolygon(ctx, DARK, [[755, 0], [770, 0], [639, 278], [617, 278]]);
      lhPolygon(ctx, P, [[785, 0], [W, 0], [W, 254], [658, 254]]);
      const rows = [
        ['mail', [d.email]],
        ['phone', [d.phone]],
        ['pin', [lhJoin([d.poBox && `PO Box ${d.poBox}`, d.postalCode && `PC ${d.postalCode}`, d.city || d.area, d.country]),
          lhJoin([d.cr && `CR ${d.cr}`, d.vat && `VAT ${d.vat}`], ' · ')].filter(Boolean)],
      ].filter(([, lines]) => lines.some(Boolean));
      let y = 98;
      ctx.fillStyle = ON;
      for (const [icon, lines] of rows) {
        lhIcon(ctx, icon, 880, y - 6, 17, ON, P);
        for (const line of lines) {
          ctx.fillStyle = ON;
          lhFit(ctx, line, W - 906 - 40, 400, 15, 11);
          ctx.fillText(line, 906, y);
          y += 24;
        }
        y += 11;
      }

      const logoW = lhLogo(ctx, d.logo, M, 72, 140, 92);
      const nameX = M + (logoW ? logoW + 20 : 0), nameW = 600 - nameX;
      const lines = lhNameLines(d.name);
      ctx.fillStyle = DARK;
      if (lines.length === 1) {
        lhFit(ctx, lines[0], nameW, 700, 40, 20); ctx.fillText(lines[0], nameX, 132);
      } else {
        lhFit(ctx, lines[0], nameW, 700, 36, 18); ctx.fillText(lines[0], nameX, 112);
        ctx.fillStyle = LH_INK;
        lhFit(ctx, lines[1], nameW, 400, 34, 16); ctx.fillText(lines[1], nameX, 152);
      }

      lhPolygon(ctx, DARK, [[0, 1615], [0, 1625], [484, H], [470, H]]);
      lhPolygon(ctx, P, [[0, 1636], [446, H], [0, H]]);
      if (d.website) {
        ctx.fillStyle = P;
        ctx.textAlign = 'right';
        lhFit(ctx, d.website, 420, 600, 16, 11, '"Roboto Mono", ui-monospace, monospace');
        ctx.fillText(d.website, W - 66, 1705);
        ctx.textAlign = 'left';
      }
    },
  },
];
