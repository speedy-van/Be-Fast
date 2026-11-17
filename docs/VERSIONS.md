# إصدارات المرحلة M0

تحقّق اختيار الإصدارات في 16 تشرين الثاني 2026. الاعتمادات المباشرة مثبّتة بإصدارات دقيقة ويثبّت `pnpm-lock.yaml` الإصدارات التابعة.

| المجموعة       | الاعتماد                               | الإصدار                      |
| -------------- | -------------------------------------- | ---------------------------- |
| التشغيل        | Node.js                                | 26.13.1 LTS                  |
| التشغيل        | pnpm                                   | 12.21.0                      |
| أدوات المستودع | Turborepo                              | 2.11.11                      |
| أدوات المستودع | TypeScript                             | 6.0.3                        |
| أدوات المستودع | ESLint                                 | 10.15.0                      |
| أدوات المستودع | `@eslint/js`                           | 10.0.1                       |
| أدوات المستودع | `typescript-eslint`                    | 8.73.0                       |
| أدوات المستودع | Prettier                               | 3.10.1                       |
| أدوات المستودع | Vitest                                 | 5.1.0                        |
| أنواع          | `@types/node`                          | 26.6.6                       |
| API            | Fastify                                | 5.12.8                       |
| API            | `pg`                                   | 8.23.1                       |
| API            | `@types/pg`                            | 8.23.1                       |
| الويب          | Next.js                                | 16.4.6                       |
| الويب          | `tailwindcss`، `@tailwindcss/postcss`  | 4.3.5                        |
| الويب          | `postcss`                              | 8.5.33                       |
| الويب وAndroid | React                                  | 19.3.0                       |
| الويب          | React DOM                              | 19.3.0                       |
| أنواع          | `@types/react`، `@types/react-dom`     | 19.3.0                       |
| Android        | `expo`                                 | 58.0.25                      |
| Android        | `expo-router`                          | 58.0.31                      |
| Android        | `expo-constants`                       | 58.0.16                      |
| Android        | `expo-linking`                         | 58.0.17                      |
| Android        | `expo-localization`، `expo-status-bar` | 58.0.5                       |
| Android        | `@expo/log-box`                        | 58.0.15                      |
| Android        | `@expo/metro-runtime`                  | 58.0.17                      |
| Android        | `react-native`                         | 0.88.1                       |
| Android        | `react-native-safe-area-context`       | 5.11.1                       |
| Android        | `react-native-screens`                 | 4.30.1                       |
| Docker Compose | `postgres`                             | 18.7-trixie                  |
| Docker Compose | MinIO Community                        | RELEASE.2025-10-15T17-29-55Z |
| صورة MinIO     | `golang` للبناء                        | 1.27.4-alpine3.24            |
| صورة MinIO     | `alpine` للتشغيل                       | 3.24.4                       |

- TypeScript ‏6.0.3 هو أحدث إصدار مستقر في المجال المعلن من محلّل TypeScript لـ ESLint ‏(`<6.1.0`). [إصدارات Node.js](https://nodejs.org/dist/index.json) · [سجل npm](https://registry.npmjs.org/) · [توافق typescript-eslint](https://typescript-eslint.io/users/dependency-versions/)
- أضاف pnpm استثناءات عمر النشر لإصدارات `typescript-eslint` الدقيقة المنشورة يوم التثبيت. تستمر قاعدة عمر النشر الافتراضية لبقية الاعتمادات. [إعدادات pnpm](https://pnpm.io/settings)
- تتبع حزم Android إصدارات Expo SDK 58 المتوافقة مع React Native وAndroid 7.0. تشترك لوحة الإدارة مع Expo في إصدار React. [Expo SDK](https://docs.expo.dev/versions/latest/) · [Expo Router](https://docs.expo.dev/router/installation/) · [Next.js](https://nextjs.org/docs/app) · [Tailwind مع Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs)
- ثُبّتت صور Docker الخارجية ببصماتها في ملفات الإعداد، وثُبّت MinIO بمعرّف المصدر للإصدار الرسمي. [PostgreSQL](https://www.postgresql.org/support/versioning/) · [إصدار MinIO](https://github.com/minio/minio/releases/tag/RELEASE.2025-10-15T17-29-55Z) · [Go](https://go.dev/doc/devel/release) · [Alpine Linux](https://alpinelinux.org/downloads/)

## إصدارات المرحلة M1

ثُبّت `@vitest/coverage-v8` بالإصدار `5.1.0`، الإصدار المستقر المطابق لـ Vitest المثبّت. يفرض حد تغطية الأسطر لحزمة `domain` في `corepack pnpm test`. [توثيق تغطية Vitest](https://vitest.dev/guide/coverage)

## إصدارات المرحلة M2

- ثُبّتت `prisma` و`@prisma/client` و`@prisma/adapter-pg` بالإصدار المستقر `7.10.1`. يطابق المحوّل PostgreSQL القياسي عبر `pg`. [دليل الترقية إلى Prisma ORM 7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)
- حُصر السماح بسكربتات تثبيت Prisma ومحركه بالإصدار `7.10.1`. [إعدادات بناء pnpm](https://pnpm.io/settings/build#allowbuilds)

## إصدارات المرحلة M3

- ثُبّت `zod` ‏`4.6.7` لمخططات عقود المصادقة والأخطاء، و`jose` ‏`6.2.17` لإصدار JWT والتحقق منه، و`otplib` ‏`13.6.0` للتحقق من TOTP. [Zod](https://zod.dev/) · [jose](https://github.com/panva/jose) · [otplib](https://otplib.yeojz.dev/)

## إصدارات المرحلة M4

- ثُبّت `sharp` ‏`0.35.5` لترميز WebP، و`@fastify/multipart` ‏`10.1.9` لقراءة رفع الملفات ضمن الحدود، و`@aws-sdk/client-s3` ‏`3.1170.0` للمخازن المتوافقة مع S3. [sharp](https://sharp.pixelplumbing.com/api-resize/) · [Fastify Multipart](https://github.com/fastify/fastify-multipart) · [S3](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html)
- أضاف pnpm استثناء عمر نشر للإصدارين المثبّتين من `@fastify/multipart` و`@aws-sdk/client-s3` فقط. [إعدادات pnpm](https://pnpm.io/settings/dependency-resolution#minimumreleaseageexclude)

## إصدارات المرحلة M7

- ثُبّت `pg-boss` بالإصدار المستقر `12.38.2`. يعمل عامل متابعة الطلبات على PostgreSQL، وتنشر عملية الخادم مهمة كل 15 ثانية مع منع التكرار على مستوى قاعدة البيانات. [جدولة pg-boss](https://pgboss.io/api/scheduling)
