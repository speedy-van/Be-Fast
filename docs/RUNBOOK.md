# تشغيل Be Fast

## التشغيل المحلي

ثبّت Node بالإصدار المحدد في `.nvmrc` وفعّل Corepack. استخدم `corepack pnpm` من جذر المستودع. جهّز ملف `.env` محلياً بالرجوع إلى `.env.example`. أدخل رابطَي PostgreSQL المباشرين المتاحين لك مع التحقق الكامل من TLS، ومفتاح مصادقة عشوائياً. احتفظ بالقيم في ملف البيئة المحلي أو مخزن الأسرار.

```powershell
node --version
corepack pnpm install --frozen-lockfile
corepack pnpm db:check
corepack pnpm db:migrate
corepack pnpm db:seed
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build
```

يعرض `db:check` إصدار الخادم لكل من فرعَي التطوير والاختبار. يطبّق `db:migrate` الترحيلات ويضيف `db:seed` بيانات التطوير على فرع `dev`. تستخدم اختبارات API وPlaywright مخططات مؤقتة في فرع `test` وتزيلها بعد التشغيل.

شغّل API واللوحة في طرفيتين بعد البناء. يطبع مزوّد التطوير رمز OTP ورقم الهاتف المحجوب في سجل API.

```powershell
$env:NODE_ENV = 'development'
corepack pnpm --filter @be-fast/api start
```

```powershell
corepack pnpm --filter admin dev --hostname 127.0.0.1
```

افتح اللوحة على `http://127.0.0.1:3000` وتحقّق من `GET /health` على منفذ API. يعيد المسار `200` إذا نجح فحص PostgreSQL و`503` عند تعذّر الاتصال.

### متغيرات التشغيل

| المتغير                                              | الاستعمال                                                                                                             |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                       | اتصال التطوير أو الإنتاج لتشغيل API والترحيلات وأدوات الإدارة والنسخ. رابط PostgreSQL مباشر مع `sslmode=verify-full`. |
| `TEST_DATABASE_URL`                                  | اتصال مباشر منفصل لفرع الاختبار مع `sslmode=verify-full`.                                                             |
| `AUTH_SECRET`                                        | مفتاح عشوائي بترميز Base64url من 32 بايت على الأقل. يحمي رموز الجلسة وتجزئة OTP وتوقيع روابط المستندات.               |
| `HOST`، `PORT`، `NODE_ENV`                           | واجهة API ومنفذه وبيئته. القيم المحلية `127.0.0.1` و`3001` و`development`.                                            |
| `TRUST_LOCAL_PROXY`                                  | القيمة `1` تجعل API يقبل معلومات عنوان العميل من اتصال loopback موثوق. الافتراضي تعطيل الثقة.                         |
| `STORAGE_DRIVER`                                     | `local` يحفظ في `.storage/`، و`s3` يستخدم مخزن الإنتاج الخاص.                                                         |
| `S3_BUCKET`، `S3_REGION`، `S3_ENDPOINT`              | اسم الحاوية والمنطقة وعنوان الخدمة المتوافقة مع S3 عند الحاجة. يؤدي ضبط `S3_ENDPOINT` إلى تشغيل اختبار عقد S3.        |
| `S3_ACCESS_KEY_ID`، `S3_SECRET_ACCESS_KEY`           | اعتماد المخزن. املأهما معاً عند استخدام الاعتماد الصريح. يدعم المشغّل سلسلة الاعتمادات المعتادة عند تركهما فارغين.      |
| `SEED_ADMIN_PASSWORD`، `SEED_ADMIN_TOTP_SECRET`      | اختياريان معاً لحساب المدير التجريبي الذي يهيّئه seed.                                                                  |
| `ADMIN_EMAIL`، `ADMIN_PASSWORD`، `ADMIN_TOTP_SECRET` | مدخلات عملية `admin:create` المؤقتة.                                                                                  |
| `ADMIN_API_ORIGIN`                                   | عنوان API الداخلي في بيئة عملية لوحة الإدارة، افتراضياً `http://127.0.0.1:3001`.                                       |
| `ADMIN_TRUST_LOCAL_PROXY`                            | يُضبط على `1` في عملية اللوحة خلف وسيط محلي يكتب رأس عنوان العميل كما هو موضّح أدناه.                                   |
| `EXPO_PUBLIC_API_ORIGIN`                             | قاعدة عنوان API وقت بناء تطبيق Android، افتراضياً `http://10.0.2.2:3001` للمحاكي. يدخل المتغير في حزمة التطبيق.        |

## إنشاء أول مدير

زوّد عملية التهيئة بـ`ADMIN_EMAIL` وكلمة مرور بطول 8 أحرف على الأقل و`ADMIN_TOTP_SECRET` بترميز Base32 لسر بطول 16 بايت على الأقل. أدخل السر نفسه في تطبيق المصادقة واضبط ساعة الجهاز. نفّذ الأمر التالي ثم أزل اعتماد التهيئة من بيئة العملية. تدخل لوحة الإدارة بالبريد وكلمة المرور ورمز TOTP.

```powershell
corepack pnpm admin:create
```

## النشر على خادم واحد

1. خصّص اتصال PostgreSQL مباشر ووسيلة تخزين خاصة. اضبط أسرار التشغيل خارج المستودع. شغّل التثبيت والترحيل والبناء باستخدام الإصدار المثبت في `.nvmrc`. يُستخدم seed في التطوير فقط.
2. اضبط `NODE_ENV=production` وخيارات التخزين وعنوان API. شغّل API على loopback عبر `corepack pnpm --filter @be-fast/api start`، واللوحة عبر `corepack pnpm --filter admin exec next start --hostname 127.0.0.1`. أبقِ العمليتين تحت إشراف مدير خدمات الخادم.
3. أظهر API واللوحة عبر HTTPS من وسيط عكسي على الخادم نفسه. احفظ `Host` الأصلي واضبط `X-Forwarded-Proto` إلى البروتوكول الفعلي. اكتب `X-Forwarded-For` بعنوان اتصال العميل كما يراه الوسيط، بقيمة IP واحدة. اضبط `TRUST_LOCAL_PROXY=1` لعملية API و`ADMIN_TRUST_LOCAL_PROXY=1` لعملية اللوحة في هذا التركيب. اضبط سجل الوسيط ليحجب الاستعلامات والرؤوس والأجسام التي قد تحمل معلومات اعتماد. [تشغيل Next.js على خادم خاص](https://nextjs.org/docs/app/guides/self-hosting) · [إعداد ثقة Fastify بالوسيط](https://fastify.dev/docs/latest/Reference/Server/#trustproxy)
4. هيّئ أول مدير، وتحقّق من `GET /health` عبر HTTPS ومن دخول المدير. أعطِ تطبيقَي Android عنوان API العام عبر `EXPO_PUBLIC_API_ORIGIN` وقت البناء.

يرسل مزوّد OTP المحلي الرموز في وضع التطوير فقط. تسجيل عميل أو مالك جديد في الإنتاج يحتاج مزوّد OTP معتمداً وفق [بوابات التحقق الخارجية](EXECUTION_PLAN.md). ملفات APK المذكورة أدناه موقعة بمفتاح التصحيح للاختبار المحلي. يتبع اختيار آلية توقيع وتوزيع الإنتاج البوابة نفسها.

## النسخ الاحتياطي والاستعادة

شغّل النسخ من بيئة الاتصال بالمصدر. اختر مساراً خاصاً خارج المستودع لملف جديد غير موجود مسبقاً.

```powershell
corepack pnpm db:backup 'D:\BeFastBackup\application.jsonl'
```

استعد إلى وجهة منفصلة فارغة أُعدّت من إصدار التطبيق نفسه. عيّن `DATABASE_URL` إلى اتصال الوجهة في الطرفية التي ستستخدمها، ثم طبّق الترحيلات من دون تشغيل seed أو خدمة API على الوجهة أثناء الاستعادة.

```powershell
corepack pnpm db:migrate
corepack pnpm db:restore 'D:\BeFastBackup\application.jsonl'
```

يحفظ النسخ لقطة متسقة لجداول التطبيق بصيغة PostgreSQL الأصلية. تفحص الاستعادة تطابق الترحيلات، وسلامة الملف، وعدد صفوف كل جدول قبل اعتماد المعاملة. ترفض الوجهة التي تحتوي بيانات. يعرض الأمران عدد الجداول والصفوف فقط. احفظ ملف النسخة في مخزن مقيّد بالوصول ومشفّر. يشمل الملف بيانات حساسة مثل العناوين وتجزئات الاعتمادات وأسرار TOTP.

احتفظ بملفات الوسائط الخاصة والعامة من مخزنها وبأسرار النشر في نسخ منفصلة، وأعدها مع قاعدة البيانات عند الاسترداد. يعيد الخادم إنشاء جداول طابور `pg-boss` التشغيلية عند الإقلاع؛ تفحص مهمة الطلبات الحالة المخزنة في جداول التطبيق. يُنسخ الإصدار المطابق من ترحيلات Prisma مع إصدار التطبيق.

لاختبار الاستعادة الآلية من الجذر، شغّل الأمر الآتي بعد بناء الحزم وتوليد عميل Prisma. ينشئ الاختبار مخططي مصدر ووجهة مستقلين في قاعدة `TEST_DATABASE_URL`، ويطبّق الترحيلات على الوجهة الفارغة، ويقارن عدد الصفوف لكل جدول ويزيل المخططين. يشمل الاختبار نسخة مقطوعة لإثبات التراجع، ورفض إعادة الاستعادة إلى وجهة معبّأة.

```powershell
corepack pnpm exec vitest run --project api --coverage.enabled false apps/api/test/database-backup.test.ts
```

## تطبيقات Android في التطوير

يحتاج البناء إلى Gradle `9.4.1` ومنصّة Android SDK ‏`37.0` (`platforms;android-37.0`) وJDK 17 وأدوات البناء `37.0.0` وNDK `27.1.12297006` وCMake `3.22.1`. عيّن `JAVA_HOME` و`ANDROID_HOME` إلى الأدوات المثبّتة. يعثر أمر البناء على Gradle في ذاكرة التوزيعات المحلية أو في `GRADLE_HOME`. يشتمل Expo على قالب المشروع الأصلي. يستخدم التطبيقان ذاكرة Gradle مشتركة في `.android-gradle/` بجذر المستودع، ولكل تطبيق ملفات بناء أصلية منفصلة. شغّل أمري البناء بالتتابع لأن بعض مكتبات Android المشتركة تُجمَّع داخل `node_modules`. [توافق AGP 9.2](https://developer.android.com/build/releases/agp-9-2-0-release-notes) · [تثبيت Android SDK 37](https://developer.android.com/about/versions/17/setup-sdk) · [بناء Expo المحلي](https://docs.expo.dev/guides/local-app-development/)

ثبّت المنصّة عبر SDK Manager في Android Studio لتسجيل الحزمة محلياً في `package.xml`. يستخدم Gradle هذا الملف للتعرّف على المنصّة.

من جذر المستودع على Windows، ثبّت اعتماداته وابنِ حزم مساحة العمل. شغّل خادم التطوير في طرفية منفصلة على المنفذ `3001` بعد تجهيز متغيرات `.env` المحلية.

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm exec turbo run build --filter=./packages/* --filter=@be-fast/api
$env:NODE_ENV = 'development'
corepack pnpm --filter @be-fast/api start
```

شغّل محاكي Android من «إدارة الأجهزة» في Android Studio. يتصل التطبيق افتراضياً بالخادم المحلي عبر `http://10.0.2.2:3001`. نفّذ في طرفية ثانية من جذر المستودع.

### تطبيق المطعم

```powershell
corepack pnpm --filter restaurant build:android
adb devices
adb install -r apps\restaurant\android\app\build\outputs\apk\debug\app-debug.apk
adb shell am start -n com.befast.restaurant/.MainActivity
```

على هاتف متصل عبر USB مع تصحيح USB مفعّلاً، أنشئ مسار الاتصال العكسي قبل بناء الملف وتثبيته.

```powershell
adb reverse tcp:3001 tcp:3001
$env:EXPO_PUBLIC_API_ORIGIN = 'http://127.0.0.1:3001'
corepack pnpm --filter restaurant build:android
adb install -r apps\restaurant\android\app\build\outputs\apk\debug\app-debug.apk
```

عند نجاح البناء، يُستخدم `app-debug.apk` للاختبار المحلي بمفتاح التصحيح في قالب Expo. تحقّق يدوياً على جهاز أو محاكٍ من الدخول بحساب المالك ورؤية شاشة الطلبات. جرّب تبديل الاتصال أثناء فتح الشاشة وتحقق من ظهور شريط الانقطاع واختفائه بعد أول تحديث ناجح. [أوامر ADB وتثبيت التطبيقات](https://developer.android.com/tools/adb)

### تطبيق العميل

```powershell
corepack pnpm --filter customer build:android
adb devices
adb install -r apps\customer\android\app\build\outputs\apk\debug\app-debug.apk
adb shell am start -n com.befast.customer/.MainActivity
```

للتشغيل على هاتف متصل عبر USB، استخدم أمر `adb reverse` ومتغير `EXPO_PUBLIC_API_ORIGIN` كما في المثال السابق قبل بناء تطبيق العميل. اختر الحي وتصفّح المطاعم والمنيو. بعد تحميل القائمة بنجاح، افصل الشبكة وتحقّق من استمرار عرضها مع وقت آخر تحديث.
