# تشغيل Be Fast

## تطبيق المطعم على Android في التطوير

هذه مسودة تشغيل. توقف التحقق قبل بناء APK. قبل اتباع الأوامر، وفّر Gradle `9.4.1` ومنصّة Android SDK ‏`android-37` وحدّث مسودة `build:android` لتستخدمهما. إصدار `9.7.0` المتاح محلياً أخفق عند تجميع ملحقات Expo وReact Native. يحتاج البناء أيضاً إلى JDK 17 وأدوات البناء `37.0.0` وNDK `27.1.12297006` وCMake `3.22.1`. عيّن `JAVA_HOME` و`ANDROID_HOME` إلى الأدوات المثبّتة. يشتمل Expo على قالب المشروع الأصلي. [توافق AGP 9.2](https://developer.android.com/build/releases/agp-9-2-0-release-notes) · [بناء Expo المحلي](https://docs.expo.dev/guides/local-app-development/)

من جذر المستودع على Windows، ثبّت اعتماداته وابنِ حزم مساحة العمل. شغّل خادم التطوير في طرفية منفصلة على المنفذ `3001` بعد تجهيز متغيرات `.env` المحلية.

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm exec turbo run build --filter=./packages/* --filter=@be-fast/api
$env:NODE_ENV = 'development'
corepack pnpm --filter @be-fast/api start
```

شغّل محاكي Android من «إدارة الأجهزة» في Android Studio. يتصل التطبيق افتراضياً بالخادم المحلي عبر `http://10.0.2.2:3001`. نفّذ في طرفية ثانية من جذر المستودع.

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
