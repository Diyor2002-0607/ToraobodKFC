// Buyurtmani Telegram'ga yuboradigan Netlify funksiyasi.
// Bot tokeni va chat ID faqat Netlify muhit o'zgaruvchilaridan olinadi:
//   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

const LIMITS = { name: 50, phone: 20, address: 300, items: 30, itemName: 60, qty: 99, body: 8000 };
const MIN_FILL_MS = 3000; // formani 3 soniyadan tez to'ldirish — bot belgisi
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 3; // bir IP'dan daqiqasiga 3 tadan ko'p buyurtma emas
const recent = new Map(); // ishlab turgan nusxa doirasidagi oddiy cheklov

const json = (status, data) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clean = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim() : '');
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' so‘m';

function rateLimited(ip) {
  const now = Date.now();
  const hits = (recent.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) { recent.set(ip, hits); return true; }
  hits.push(now); recent.set(ip, hits);
  return false;
}

function validate(data) {
  const name = clean(data.name);
  const phone = clean(data.phone);
  const address = clean(data.address);
  if (name.length < 2 || name.length > LIMITS.name) return { error: 'Ismingizni to‘g‘ri kiriting (2–50 belgi).' };
  const digits = phone.replace(/\D/g, '');
  if (phone.length > LIMITS.phone || !/^[+\d\s()-]+$/.test(phone) || digits.length < 9 || digits.length > 12)
    return { error: 'Telefon raqamini to‘g‘ri kiriting.' };
  if (address.length < 3 || address.length > LIMITS.address) return { error: 'Manzil yoki izohni kiriting (3–300 belgi).' };

  if (!Array.isArray(data.items) || data.items.length === 0) return { error: 'Savat bo‘sh.' };
  if (data.items.length > LIMITS.items) return { error: 'Savatda mahsulot juda ko‘p.' };
  const items = [];
  for (const it of data.items) {
    const itemName = clean(it && it.name);
    const qty = Number(it && it.qty);
    const price = Number(it && it.price);
    if (!itemName || itemName.length > LIMITS.itemName || !Number.isInteger(qty) || qty < 1 || qty > LIMITS.qty ||
        !Number.isInteger(price) || price < 0 || price > 10_000_000)
      return { error: 'Savatdagi ma’lumotlar noto‘g‘ri.' };
    items.push({ name: itemName, qty, price });
  }
  return { name, phone, address, items };
}

export default async (req, context) => {
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Faqat POST so‘rovi qabul qilinadi.' });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error('TELEGRAM_BOT_TOKEN yoki TELEGRAM_CHAT_ID sozlanmagan');
    return json(500, { ok: false, error: 'Server sozlanmagan.' });
  }

  const raw = await req.text();
  if (raw.length > LIMITS.body) return json(413, { ok: false, error: 'So‘rov juda katta.' });
  let data;
  try { data = JSON.parse(raw); } catch { return json(400, { ok: false, error: 'Noto‘g‘ri so‘rov.' }); }
  if (!data || typeof data !== 'object') return json(400, { ok: false, error: 'Noto‘g‘ri so‘rov.' });

  // Spamdan himoya: yashirin maydonni faqat botlar to'ldiradi — jim rad etamiz
  if (clean(data.website)) return json(200, { ok: true });
  // Forma juda tez yuborilgan (brauzer odatda o'zi kutadi, bu yerga faqat botlar yetib keladi)
  const elapsed = Number(data.elapsed);
  if (!Number.isFinite(elapsed) || elapsed < MIN_FILL_MS)
    return json(400, { ok: false, error: 'Iltimos, bir necha soniyadan so‘ng qayta yuboring.' });

  const ip = (context && context.ip) || req.headers.get('x-nf-client-connection-ip') || 'unknown';
  if (rateLimited(ip)) return json(429, { ok: false, error: 'Juda ko‘p urinish. Birozdan so‘ng qayta urinib ko‘ring.' });

  const v = validate(data);
  if (v.error) return json(400, { ok: false, error: v.error });

  const total = v.items.reduce((s, it) => s + it.price * it.qty, 0);
  const lines = v.items.map((it, i) => `${i + 1}. ${esc(it.name)} × ${it.qty} = ${fmt(it.price * it.qty)}`);
  const text = [
    '🍗 <b>Yangi buyurtma!</b>',
    '',
    `👤 <b>Ism:</b> ${esc(v.name)}`,
    `📞 <b>Telefon:</b> ${esc(v.phone)}`,
    `📍 <b>Manzil / izoh:</b> ${esc(v.address)}`,
    '',
    '🛒 <b>Buyurtma:</b>',
    ...lines,
    '',
    `💰 <b>Jami:</b> ${fmt(total)}`,
    '🚚 Yetkazib berish — bepul',
  ].join('\n');

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out.ok) {
      console.error('Telegram xatosi:', res.status, out.description);
      return json(502, { ok: false, error: 'Buyurtmani yuborib bo‘lmadi.' });
    }
  } catch (e) {
    console.error('Telegram bilan bog‘lanib bo‘lmadi:', e);
    return json(502, { ok: false, error: 'Buyurtmani yuborib bo‘lmadi.' });
  }

  return json(200, { ok: true });
};

export const config = { path: '/api/order' };
