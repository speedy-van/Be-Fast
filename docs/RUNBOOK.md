# تشغيل Be Fast

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
