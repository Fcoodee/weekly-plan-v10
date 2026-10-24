# weekly_plan_v10 — الخطة الأسبوعية (مدارس دار الفرسان)

واجهة ثابتة (GitHub Pages) تقرأ وتكتب في Google Sheets عبر Apps Script Web App.

## الهيكل
- `index.html` — الصفحة. `css/app.css` — التنسيق والطباعة. `js/app.js` — المنطق.
- `js/config.js` — `API_URL` (رابط `/exec`) و`CLIENT_ID` (اختياري لدخول المسؤول).
- `data/logos.json` — الشعارات. `template/weekly_plan_template.docx` — قالب Word المعتمد.

## الدخول
رابط كل دور: `https://fcoodee.github.io/weekly-plan-v10/?t=الرمز`. يُحفظ الرمز في الجلسة ويُزال من العنوان.
الصلاحية يفرضها الخادم (مادة + صف، وقفل الأسبوع)؛ إخفاء الواجهة ليس أمنًا.

## التشغيل
1. Settings → Pages → Deploy from branch → `main` / root.
2. في Code.gs اضبط `CFG.PAGE_URL` ثم شغّل «توليد رموز الأدوار» وانشر New version.
3. وزّع الروابط من تبويب `Links`.

## PDF
زر «حفظ PDF» يفتح الطباعة: اختر Save as PDF، اتجاه أفقي، وأوقف Headers and footers.
