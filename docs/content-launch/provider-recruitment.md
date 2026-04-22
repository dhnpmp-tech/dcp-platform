# Earn SAR from Your Idle GPU — List on DCP

*DCP — Saudi-hosted GPU compute network for AI workloads*

---

## Your GPU Is Working Against You by Sitting Idle

If you own an NVIDIA GPU — a gaming rig, workstation, or repurposed node — it can stay idle for long periods, even while AI teams still need more local capacity.

DCP connects GPU owners with AI teams and startups in Saudi Arabia that need containerized AI capacity. You install a lightweight daemon, and your GPU joins routing as soon as it is healthy and online.

Built for Saudi context, DCP emphasizes local energy economics and Arabic AI-model support as a practical differentiator for region-first AI teams.

---

## How Much Can You Earn?

Providers keep **75%** of every job. DCP takes a 25% platform fee.

| Factor | What drives payouts |
|--------|---------------------|
| Utilization | Time the GPU is online and matched to demand |
| Job mix | Model type, job duration, and completion quality |
| Regional demand | Live demand in your region and time window |
| Queue depth | Provider competition and local matching conditions |

Use your dashboard planner to estimate realistic scenarios based on your hardware profile.

---

## Quick start checklist

### Step 1 — Register

Go to **[dcp.sa/setup](https://dcp.sa/setup)**. Enter your name, email, and GPU model. Keep your Provider API Key secure for daemon setup.

### Step 2 — Install the Daemon

The DCP daemon is a lightweight Python script. It runs silently in the background, sends a heartbeat every 30 seconds, and executes jobs inside isolated Docker containers on your GPU.

**Linux / macOS:**
```bash
curl -sL "https://dcp.sa/api/dc1/providers/download/setup?key=YOUR_KEY&os=linux" | bash
```

**Windows — one click:**
Download the `.exe` installer from [dcp.sa/provider/download](https://dcp.sa/provider/download). It handles Python and the daemon setup for Windows. No command line required.

### Step 3 — Go Live

Once your daemon is running and status is **online** in your [provider dashboard](https://dcp.sa/provider), jobs are assigned through demand-driven matching. Keep status visible while you tune maintenance windows.

---

## Your Machine Stays Safe

Every job runs inside an isolated Docker container. Renters get GPU compute only — they cannot:

- Open a shell on your machine
- Access your files or home directory
- See your other running processes
- Access your local network

When a job completes, the container is destroyed. Containerized execution is isolated from your system files.

DCP aligns with Saudi data protection approach (PDPL). Data handling is scoped to job execution contexts and job data remains bounded to containerized workloads.

---

## Getting Paid

- Earnings are reflected in your **provider wallet** after completed jobs are settled
- View your balance and full job history at [dcp.sa/provider](https://dcp.sa/provider)
- Payout timing and thresholds are visible in your dashboard.
- **SAR only** — no crypto, no PayPal

---

## Who Should Register?

- Gamers with RTX 3080 / 3090 / 4090 machines that are idle at night
- Former crypto miners looking to repurpose their rigs profitably
- IT teams with spare GPU workstations
- Businesses with server hardware sitting underutilized

If your NVIDIA GPU has ≥ 8 GB VRAM and you have a stable internet connection (100 Mbps+), you are eligible to onboard.

---

## Register Now

**[dcp.sa/setup](https://dcp.sa/setup)**

Questions? Email **support@dcp.sa** or find us on [Hsoub.com](https://hsoub.com).

---
---

# اكسب ريالات سعودية من بطاقتك الرسومية الخاملة — سجّل في DCP

*DCP — منصة سعودية للحوسبة الرسومية المتخصصة في ذكاء اصطناعي*

<div dir="rtl">

---

## بطاقتك الرسومية تخسر المال كل يوم وهي خاملة

إذا كنت تمتلك بطاقة NVIDIA — سواء كانت في جهاز الألعاب أو محطة عمل — فإنها قد تبقى خاملة لفترات طويلة رغم وجود طلبات استيعاب محلية على قدرات AI.

DCP يربط أصحاب بطاقات GPU بفرق الذكاء الاصطناعي والباحثين في السعودية الذين يحتاجون قدرة حوسبة حقيقية. تثبّت برنامجًا خفيفًا، وتشارك بطاقتك في التوجيه للحملات عند التوافر والاستعداد.

---

## كم يمكنك أن تكسب؟

المزوّد يحتفظ بـ **75%** من كل مهمة. DCP تأخذ 25% عمولة المنصة.

| العامل | ما الذي يحدد الأرباح |
|--------|----------------------|
| وقت الاتصال | زمن تواجد البطاقة المتاح للمهام |
| نوع المهمة | استدلال، توليد صور، أو تدريب |
| نسبة إكمال المهمة | لا تُحتسب إلا المهام المكتملة |
| التنافس المحلي | عدد المزوّدين النشطين في نفس الوقت |

استخدم لوحة التخطيط في الداشبورد لاستخراج سيناريوهات تقديرية وفق استخدامك الفعلي.

---

## خطوات الإعداد

### الخطوة 1 — التسجيل

اذهب إلى **[dcp.sa/setup](https://dcp.sa/setup)**. أدخل اسمك وبريدك الإلكتروني ونوع بطاقتك الرسومية. احتفظ بمفتاح API الذي يظهر لك للبدء في إعداد الديمون.

### الخطوة 2 — تثبيت البرنامج

برنامج DCP عبارة عن سكريبت Python خفيف. يعمل بصمت في الخلفية، يرسل إشارة نبض كل 30 ثانية، وينفّذ المهام داخل حاويات Docker معزولة على بطاقتك الرسومية.

**Linux / macOS:**
```bash
curl -sL "https://dcp.sa/api/dc1/providers/download/setup?key=YOUR_KEY&os=linux" | bash
```

**ويندوز — بنقرة واحدة:**
حمّل ملف `.exe` من [dcp.sa/provider/download](https://dcp.sa/provider/download). يتولى إعداد Python والبرنامج للنظام. لا حاجة لسطر الأوامر.

### الخطوة 3 — ابدأ بالمطابقة

بعد تشغيل البرنامج وظهور جهازك بحالة **أونلاين** في [لوحة تحكم المزوّد](https://dcp.sa/provider)، تظهر فرص التوجيه حسب التوافر والطلب. يمكنك إدارة التوفر من اللوحة.

---

## جهازك يبقى آمناً

كل مهمة تعمل داخل حاوية Docker معزولة. المستأجر يحصل على قوة الحوسبة فقط — لا يستطيع:

- فتح terminal على جهازك
- الوصول إلى ملفاتك أو مجلداتك
- رؤية باقي العمليات الجارية
- الوصول إلى شبكتك المحلية

عند اكتمال المهمة، تُحذف الحاوية تلقائياً. تنفيذ الحاويات معزول عن ملفات النظام الأساسية.

DCP يلتزم بأنظمة حماية البيانات السعودية (نظام PDPL). جميع بيانات المهام تُعالَج داخل المملكة العربية السعودية.

---

## كيف تستلم أرباحك؟

- تظهر الأرباح في **محفظة المزوّد** بعد تسوية الوظائف المكتملة
- تابع رصيدك وسجل مهامك الكامل من [dcp.sa/provider](https://dcp.sa/provider)
- توقيت المدفوعات وحدود السحب موضحة في إعدادات محفظة المزوّد
- **ريال سعودي فقط** — لا عملات رقمية، لا PayPal، لا تعقيدات

---

## من يجب أن يسجّل؟

- اللاعبون الذين يمتلكون أجهزة RTX 3080 / 3090 / 4090 خاملة في الليل
- المعدّنون السابقون الراغبون في إعادة توظيف منصاتهم بشكل مربح
- فرق تقنية المعلومات التي تمتلك محطات عمل رسومية احتياطية
- الشركات التي لديها أجهزة خوادم غير مُستغلة بكامل طاقتها

إذا كانت بطاقتك NVIDIA تحتوي على ≥ 8 جيجابايت VRAM ولديك اتصال إنترنت ثابت (100 ميجابت/ثانية فأعلى)، فأنت مؤهّل.

**الدليل التنافسي في السعودية:** ميزة الطاقة المحلية والتوافقيّة مع نماذج الذكاء الاصطناعي العربية (مثل ALLaM 7B وFalcon H1 وJAIS 13B وBGE-M3) ترفع ملاءمة التنفيذ للمشاريع المحلية.

---

## سجّل الآن

**[dcp.sa/setup](https://dcp.sa/setup)**

لديك أسئلة؟ راسلنا على **support@dcp.sa** أو تفضّل بزيارتنا على [Hsoub.com](https://hsoub.com).

</div>
