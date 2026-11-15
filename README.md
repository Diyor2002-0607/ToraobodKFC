# ToraobodKFC
Mahallamdagi do'kon uchun, u yerda tovuq qanotchalari ham tayyorlanadi
Muommo: Mijozlar mahsulot buyurtma qilishda qiynaladi
Yechim: Onlayn buyurtma beruvchi sayt yaratish

## Telegram'ga buyurtma yuborish (Netlify)

Buyurtma oynasidagi forma `netlify/functions/order.mjs` funksiyasiga (`/api/order`) yuboriladi, u esa buyurtmani Telegram botga jo'natadi.

Netlify'da **Site configuration → Environment variables** bo'limiga quyidagilarni qo'shing:

- `TELEGRAM_BOT_TOKEN` — @BotFather bergan bot tokeni
- `TELEGRAM_CHAT_ID` — buyurtmalar keladigan chat yoki guruh ID raqami

O'zgaruvchilarni qo'shgandan keyin saytni qayta deploy qiling. Token va chat ID kodda saqlanmaydi.
