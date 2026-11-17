# واجهة Be Fast البرمجية

يُولّد الملف بالأمر `corepack pnpm docs:api` من سجل المسارات وعقود Zod في `packages/contracts`. للتحقق من مطابقته للمصدر شغّل `corepack pnpm docs:api --check`.

المسارات التي تبدأ بـ`/customer` و`/restaurant` و`/admin` تتطلب ترويسة `Authorization: Bearer <access token>` بنوع الحساب الموافق. بعض عمليات الطلب تطبّق شروطاً إضافية من آلة الحالات. تُرسل أجسام الطلبات بتنسيق JSON، ورفع الصور باستخدام `multipart/form-data` بجزء ملف واحد من JPEG أو PNG أو WebP بحد 5 MiB.

تستعمل الأخطاء غلاف [`errorEnvelopeSchema`](#errorenvelopeschema). تفشل المدخلات غير الصالحة عادة بـ`400`، وتعيد المصادقة أو الصلاحية `401` أو `403`، ويعيد المورد غير المتاح لذلك الحساب `404`. تستعمل حدود المعدّل `429` عند تجاوزها.

أكواد الخطأ المشتركة `ACCOUNT_UNAVAILABLE`، `ACTIVE_ORDERS`، `BELOW_MINIMUM`، `CONFLICT`، `DATABASE_UNAVAILABLE`، `FORBIDDEN`، `INTERNAL_ERROR`، `INVALID_CREDENTIALS`، `INVALID_OTP`، `INVALID_OPTIONS`، `INVALID_REFRESH_TOKEN`، `INVALID_TRANSITION`، `ITEM_UNAVAILABLE`، `NOT_FOUND`، `OTP_UNAVAILABLE`، `OUT_OF_ZONE`، `PASSWORD_CHANGE_REQUIRED`، `PRICE_CHANGED`، `RATE_LIMITED`، `RESTAURANT_CLOSED`، `TOO_MANY_ACTIVE_ORDERS`، `UNAUTHENTICATED`، `VALIDATION_ERROR`.

## الصحة والتصفح العام

| الطريقة والمسار | الدور أو نوع الدخول | معاملات المسار | الاستعلام | الجسم | نجاح الاستجابة | ملاحظات |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /health` | عام | — | — | — | 200 · [`healthResponseSchema`](#healthresponseschema) | يعيد `503 DATABASE_UNAVAILABLE` عند تعذّر فحص القاعدة. |
| `GET /public/geo` | عام | — | [`geoListQuerySchema`](#geolistqueryschema) | — | 200 · [`publicGeoSchema`](#publicgeoschema) | — |
| `GET /public/categories` | عام | — | [`geoListQuerySchema`](#geolistqueryschema) | — | 200 · [`publicFoodCategoriesSchema`](#publicfoodcategoriesschema) | — |
| `GET /public/restaurants` | عام | — | [`browseListQuerySchema`](#browselistqueryschema) | — | 200 · [`browseListResponseSchema`](#browselistresponseschema) | — |
| `GET /public/restaurants/:id` | عام | [`publicRestaurantDetailParamsSchema`](#publicrestaurantdetailparamsschema) | [`publicRestaurantDetailQuerySchema`](#publicrestaurantdetailqueryschema) | — | 200 · [`publicRestaurantDetailResponseSchema`](#publicrestaurantdetailresponseschema) | — |
| `GET /public/images/:restaurantId/:assetId/:width` | عام | [`publicImagePathSchema`](#publicimagepathschema) | — | — | 200 · `image/webp` | — |

## المصادقة

| الطريقة والمسار | الدور أو نوع الدخول | معاملات المسار | الاستعلام | الجسم | نجاح الاستجابة | ملاحظات |
| --- | --- | --- | --- | --- | --- | --- |
| `POST /auth/customer/otp/request` | بيانات المصادقة في الطلب | — | — | [`customerOtpRequestSchema`](#customerotprequestschema) | 204 · بلا جسم | قد يعيد `429 RATE_LIMITED` أو `503 OTP_UNAVAILABLE`. |
| `POST /auth/customer/otp/verify` | بيانات المصادقة في الطلب | — | — | [`customerOtpVerifySchema`](#customerotpverifyschema) | 200 · [`authTokensSchema`](#authtokensschema) | يعيد `401 INVALID_OTP` عند تعذّر قبول الرمز. |
| `POST /auth/restaurant/otp/request` | بيانات المصادقة في الطلب | — | — | [`customerOtpRequestSchema`](#customerotprequestschema) | 204 · بلا جسم | قد يعيد `429 RATE_LIMITED` أو `503 OTP_UNAVAILABLE`. |
| `POST /auth/restaurant/register` | بيانات المصادقة في الطلب | — | — | [`restaurantRegisterSchema`](#restaurantregisterschema) | 201 · [`authTokensSchema`](#authtokensschema) | تسجيل مالك المطعم برمز OTP وكلمة مرور. |
| `POST /auth/restaurant/login` | بيانات المصادقة في الطلب | — | — | [`restaurantLoginSchema`](#restaurantloginschema) | 200 · [`authTokensSchema`](#authtokensschema) | إعادة الطلب مع `newPassword` عند `403 PASSWORD_CHANGE_REQUIRED` في أول دخول للموظف. |
| `POST /auth/admin/login` | بيانات المصادقة في الطلب | — | — | [`adminLoginSchema`](#adminloginschema) | 200 · [`authTokensSchema`](#authtokensschema) | يُرفض البريد أو كلمة المرور أو رمز TOTP غير الصالح أو المعاد استخدامه بـ`401 INVALID_CREDENTIALS`. |
| `POST /auth/refresh` | بيانات المصادقة في الطلب | — | — | [`refreshTokenSchema`](#refreshtokenschema) | 200 · [`authTokensSchema`](#authtokensschema) | يدوّر رمز التجديد. إعادة استعمال رمز سابق تبطل عائلته. |
| `POST /auth/logout` | بيانات المصادقة في الطلب | — | — | [`refreshTokenSchema`](#refreshtokenschema) | 204 · بلا جسم | — |

## تطبيق العميل

| الطريقة والمسار | الدور أو نوع الدخول | معاملات المسار | الاستعلام | الجسم | نجاح الاستجابة | ملاحظات |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /customer/me` | `customer` | — | — | — | 200 · [`customerProfileSchema`](#customerprofileschema) | — |
| `PATCH /customer/me` | `customer` | — | — | [`customerProfileUpdateSchema`](#customerprofileupdateschema) | 200 · [`customerProfileSchema`](#customerprofileschema) | تعيين الاسم مرة واحدة. |
| `DELETE /customer/me` | `customer` | — | — | — | 204 · بلا جسم | يعيد `409 ACTIVE_ORDERS` عند وجود طلب نشط. يخفي بيانات الحساب والطلبات في معاملة واحدة. |
| `GET /customer/addresses` | `customer` | — | — | — | 200 · [`customerAddressListSchema`](#customeraddresslistschema) | — |
| `GET /customer/addresses/:addressId` | `customer` | [`customerAddressParamsSchema`](#customeraddressparamsschema) | — | — | 200 · [`customerAddressSchema`](#customeraddressschema) | — |
| `POST /customer/addresses` | `customer` | — | — | [`customerAddressCreateSchema`](#customeraddresscreateschema) | 201 · [`customerAddressSchema`](#customeraddressschema) | — |
| `PATCH /customer/addresses/:addressId` | `customer` | [`customerAddressParamsSchema`](#customeraddressparamsschema) | — | [`customerAddressUpdateSchema`](#customeraddressupdateschema) | 200 · [`customerAddressSchema`](#customeraddressschema) | — |
| `PATCH /customer/addresses/:addressId/default` | `customer` | [`customerAddressParamsSchema`](#customeraddressparamsschema) | — | — | 200 · [`customerAddressSchema`](#customeraddressschema) | — |
| `DELETE /customer/addresses/:addressId` | `customer` | [`customerAddressParamsSchema`](#customeraddressparamsschema) | — | — | 204 · بلا جسم | — |
| `GET /customer/orders` | `customer` | — | — | — | 200 · [`orderListResponseSchema`](#orderlistresponseschema) | — |
| `GET /customer/orders/:id` | `customer` | [`readOrderParamsSchema`](#readorderparamsschema) | — | — | 200 · [`orderReadSchema`](#orderreadschema) | — |
| `POST /customer/orders` | `customer` | — | — | [`orderCreateSchema`](#ordercreateschema) | 200 أو 201 · [`orderReadSchema`](#orderreadschema) | ترويسة [`Idempotency-Key`](#orderidempotencykeyschema) مطلوبة. `200` لإعادة طلب و`201` للإنشاء. أخطاء `409` تشمل `RESTAURANT_CLOSED`، `OUT_OF_ZONE`، `ITEM_UNAVAILABLE`، `BELOW_MINIMUM`، `PRICE_CHANGED`، `INVALID_OPTIONS`، `TOO_MANY_ACTIVE_ORDERS`. يعيد `PRICE_CHANGED` [تفصيل السعر الجديد](#pricechangeddetailsschema) في `error.details`. |
| `POST /customer/orders/:id/cancel` | `customer` | [`readOrderParamsSchema`](#readorderparamsschema) | — | [`orderCancellationSchema`](#ordercancellationschema) | 200 · [`orderReadSchema`](#orderreadschema) | يمكن حذف جسم الطلب. إلغاء العميل من `PENDING` فقط. |
| `POST /customer/orders/:id/complaint` | `customer` | [`readOrderParamsSchema`](#readorderparamsschema) | — | [`createComplaintSchema`](#createcomplaintschema) | 201 · [`customerComplaintSchema`](#customercomplaintschema) | — |
| `GET /customer/orders/:id/complaint` | `customer` | [`readOrderParamsSchema`](#readorderparamsschema) | — | — | 200 · [`customerComplaintResponseSchema`](#customercomplaintresponseschema) | — |

## تطبيق المطعم

| الطريقة والمسار | الدور أو نوع الدخول | معاملات المسار | الاستعلام | الجسم | نجاح الاستجابة | ملاحظات |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /restaurant/session` | `OWNER`، `MANAGER`، `CASHIER`، `KITCHEN` | — | — | — | 200 · [`restaurantSessionSchema`](#restaurantsessionschema) | — |
| `GET /restaurant/profile` | `OWNER` | — | — | — | 200 · [`adminRestaurantProfileSchema`](#adminrestaurantprofileschema) | — |
| `PATCH /restaurant/profile` | `OWNER` | — | — | [`restaurantProfilePatchSchema`](#restaurantprofilepatchschema) | 200 · [`adminRestaurantProfileSchema`](#adminrestaurantprofileschema) | — |
| `POST /restaurant/profile/submit` | `OWNER` | — | — | — | 200 · [`restaurantSubmissionResponseSchema`](#restaurantsubmissionresponseschema) | — |
| `GET /restaurant/branches/:branchId/profile` | `OWNER` | [`restaurantBranchParamsSchema`](#restaurantbranchparamsschema) | — | — | 200 · [`adminRestaurantProfileSchema`](#adminrestaurantprofileschema) | — |
| `PATCH /restaurant/branches/:branchId/profile` | `OWNER` | [`restaurantBranchParamsSchema`](#restaurantbranchparamsschema) | — | [`restaurantProfilePatchSchema`](#restaurantprofilepatchschema) | 200 · [`adminRestaurantProfileSchema`](#adminrestaurantprofileschema) | — |
| `GET /restaurant/branch/opening-periods` | `OWNER`، `MANAGER` | — | — | — | 200 · [`openingPeriodsSchema`](#openingperiodsschema) | — |
| `PUT /restaurant/branch/opening-periods` | `OWNER`، `MANAGER` | — | — | [`openingPeriodsSchema`](#openingperiodsschema) | 200 · [`openingPeriodsSchema`](#openingperiodsschema) | — |
| `GET /restaurant/branch/settings` | `OWNER`، `MANAGER` | — | — | — | 200 · [`branchSettingsResponseSchema`](#branchsettingsresponseschema) | — |
| `PATCH /restaurant/branch/settings` | `OWNER`، `MANAGER` | — | — | [`restaurantBranchSettingsSchema`](#restaurantbranchsettingsschema) | 200 · [`branchSettingsResponseSchema`](#branchsettingsresponseschema) | — |
| `PATCH /restaurant/branch/accepting-orders` | `OWNER`، `MANAGER`، `CASHIER` | — | — | [`branchAcceptingOrdersSchema`](#branchacceptingordersschema) | 200 · [`branchAcceptingOrdersResponseSchema`](#branchacceptingordersresponseschema) | — |
| `GET /restaurant/branch/delivery-zones` | `OWNER`، `MANAGER` | — | — | — | 200 · [`deliveryZonesResponseSchema`](#deliveryzonesresponseschema) | — |
| `PUT /restaurant/branch/delivery-zones` | `OWNER`، `MANAGER` | — | — | [`deliveryZonesSchema`](#deliveryzonesschema) | 200 · [`deliveryZonesResponseSchema`](#deliveryzonesresponseschema) | — |
| `GET /restaurant/delivery-zones/:zoneId` | `OWNER`، `MANAGER` | [`deliveryZoneParamsSchema`](#deliveryzoneparamsschema) | — | — | 200 · [`deliveryZoneResponseSchema`](#deliveryzoneresponseschema) | — |
| `PATCH /restaurant/delivery-zones/:zoneId` | `OWNER`، `MANAGER` | [`deliveryZoneParamsSchema`](#deliveryzoneparamsschema) | — | [`deliveryZonePatchSchema`](#deliveryzonepatchschema) | 200 · [`deliveryZoneResponseSchema`](#deliveryzoneresponseschema) | — |
| `DELETE /restaurant/delivery-zones/:zoneId` | `OWNER`، `MANAGER` | [`deliveryZoneParamsSchema`](#deliveryzoneparamsschema) | — | — | 204 · بلا جسم | — |
| `POST /restaurant/profile/images/:kind` | `OWNER` | [`restaurantImagePathSchema`](#restaurantimagepathschema) | — | `multipart/form-data` | 201 · [`restaurantImageUploadSchema`](#restaurantimageuploadschema) | — |
| `GET /restaurant/documents` | `OWNER` | — | — | — | 200 · [`restaurantDocumentsResponseSchema`](#restaurantdocumentsresponseschema) | — |
| `GET /restaurant/documents/:documentId` | `OWNER` | [`documentIdPathSchema`](#documentidpathschema) | — | — | 200 · [`restaurantDocumentSchema`](#restaurantdocumentschema) | — |
| `POST /restaurant/documents/:type` | `OWNER` | [`restaurantDocumentPathSchema`](#restaurantdocumentpathschema) | — | `multipart/form-data` | 201 · [`restaurantDocumentSchema`](#restaurantdocumentschema) | — |
| `GET /restaurant/staff` | `OWNER` | — | — | — | 200 · [`restaurantStaffListSchema`](#restaurantstafflistschema) | — |
| `POST /restaurant/staff` | `OWNER` | — | — | [`restaurantStaffCreateSchema`](#restaurantstaffcreateschema) | 201 · [`restaurantStaffMemberSchema`](#restaurantstaffmemberschema) | — |
| `PATCH /restaurant/staff/:staffId` | `OWNER` | [`restaurantStaffParamsSchema`](#restaurantstaffparamsschema) | — | [`restaurantStaffUpdateSchema`](#restaurantstaffupdateschema) | 200 · [`restaurantStaffMemberSchema`](#restaurantstaffmemberschema) | — |
| `DELETE /restaurant/staff/:staffId` | `OWNER` | [`restaurantStaffParamsSchema`](#restaurantstaffparamsschema) | — | — | 204 · بلا جسم | يعطّل الحساب. |
| `GET /restaurant/orders` | `OWNER`، `MANAGER`، `CASHIER`، `KITCHEN` | — | [`restaurantOrderListQuerySchema`](#restaurantorderlistqueryschema) | — | 200 · [`orderListResponseSchema`](#orderlistresponseschema) | — |
| `GET /restaurant/orders/active` | `OWNER`، `MANAGER`، `CASHIER`، `KITCHEN` | — | — | — | 200 · [`orderListResponseSchema`](#orderlistresponseschema) | يحدّث `lastSeenAt` للفرع عند السحب. |
| `GET /restaurant/orders/:id` | `OWNER`، `MANAGER`، `CASHIER`، `KITCHEN` | [`readOrderParamsSchema`](#readorderparamsschema) | — | — | 200 · [`orderReadSchema`](#orderreadschema) | — |
| `POST /restaurant/orders/:id/transition` | `OWNER`، `MANAGER`، `CASHIER`، `KITCHEN` | [`readOrderParamsSchema`](#readorderparamsschema) | — | [`restaurantOrderTransitionSchema`](#restaurantordertransitionschema) | 200 · [`orderReadSchema`](#orderreadschema) | يشترط تفويض الدور للحالة الهدف، ثم تطبّق آلة الحالات. يعيد `409 INVALID_TRANSITION` للحالة السابقة غير الصالحة. |
| `GET /restaurant/reports/summary` | `OWNER` | — | [`restaurantReportQuerySchema`](#restaurantreportqueryschema) | — | 200 · [`restaurantReportSummarySchema`](#restaurantreportsummaryschema) | — |
| `GET /restaurant/finance/ledger` | `OWNER` | — | — | — | 200 · [`financeLedgerResponseSchema`](#financeledgerresponseschema) | — |

## منيو المطعم

| الطريقة والمسار | الدور أو نوع الدخول | معاملات المسار | الاستعلام | الجسم | نجاح الاستجابة | ملاحظات |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /restaurant/menu` | `OWNER`، `MANAGER`، `CASHIER`، `KITCHEN` | — | — | — | 200 · [`restaurantMenuSchema`](#restaurantmenuschema) | — |
| `GET /restaurant/menu/sections` | `OWNER`، `MANAGER`، `CASHIER`، `KITCHEN` | — | — | — | 200 · [`menuSectionsResponseSchema`](#menusectionsresponseschema) | — |
| `GET /restaurant/menu/sections/:sectionId` | `OWNER`، `MANAGER`، `CASHIER`، `KITCHEN` | [`menuSectionPathSchema`](#menusectionpathschema) | — | — | 200 · [`menuSectionResponseSchema`](#menusectionresponseschema) | — |
| `POST /restaurant/menu/sections` | `OWNER`، `MANAGER` | — | — | [`createMenuSectionSchema`](#createmenusectionschema) | 201 · [`menuSectionResponseSchema`](#menusectionresponseschema) | — |
| `PATCH /restaurant/menu/sections/:sectionId` | `OWNER`، `MANAGER` | [`menuSectionPathSchema`](#menusectionpathschema) | — | [`patchMenuSectionSchema`](#patchmenusectionschema) | 200 · [`menuSectionResponseSchema`](#menusectionresponseschema) | — |
| `DELETE /restaurant/menu/sections/:sectionId` | `OWNER`، `MANAGER` | [`menuSectionPathSchema`](#menusectionpathschema) | — | — | 204 · بلا جسم | — |
| `GET /restaurant/menu/items` | `OWNER`، `MANAGER`، `CASHIER`، `KITCHEN` | — | — | — | 200 · [`menuItemsResponseSchema`](#menuitemsresponseschema) | — |
| `GET /restaurant/menu/items/:itemId` | `OWNER`، `MANAGER`، `CASHIER`، `KITCHEN` | [`menuItemPathSchema`](#menuitempathschema) | — | — | 200 · [`menuItemResponseSchema`](#menuitemresponseschema) | — |
| `POST /restaurant/menu/items` | `OWNER`، `MANAGER` | — | — | [`createMenuItemSchema`](#createmenuitemschema) | 201 · [`menuItemResponseSchema`](#menuitemresponseschema) | — |
| `PATCH /restaurant/menu/items/:itemId` | `OWNER`، `MANAGER` | [`menuItemPathSchema`](#menuitempathschema) | — | [`patchMenuItemSchema`](#patchmenuitemschema) | 200 · [`menuItemMetadataResponseSchema`](#menuitemmetadataresponseschema) | — |
| `DELETE /restaurant/menu/items/:itemId` | `OWNER`، `MANAGER` | [`menuItemPathSchema`](#menuitempathschema) | — | — | 204 · بلا جسم | — |
| `PATCH /restaurant/menu/items/:itemId/availability` | `OWNER`، `MANAGER`، `CASHIER`، `KITCHEN` | [`menuItemPathSchema`](#menuitempathschema) | — | [`menuAvailabilitySchema`](#menuavailabilityschema) | 200 · [`menuAvailabilityResponseSchema`](#menuavailabilityresponseschema) | — |
| `POST /restaurant/menu/items/:itemId/duplicate` | `OWNER`، `MANAGER` | [`menuItemPathSchema`](#menuitempathschema) | — | — | 201 · [`menuDuplicateResponseSchema`](#menuduplicateresponseschema) | — |
| `POST /restaurant/menu/items/:itemId/image` | `OWNER`، `MANAGER` | [`menuItemPathSchema`](#menuitempathschema) | — | `multipart/form-data` | 201 · [`restaurantImageUploadSchema`](#restaurantimageuploadschema) | — |
| `GET /restaurant/menu/items/:itemId/sizes` | `OWNER`، `MANAGER`، `CASHIER`، `KITCHEN` | [`menuItemPathSchema`](#menuitempathschema) | — | — | 200 · [`menuSizesResponseSchema`](#menusizesresponseschema) | — |
| `POST /restaurant/menu/items/:itemId/sizes` | `OWNER`، `MANAGER` | [`menuItemPathSchema`](#menuitempathschema) | — | [`createMenuSizeSchema`](#createmenusizeschema) | 201 · [`menuSizeResponseSchema`](#menusizeresponseschema) | — |
| `GET /restaurant/menu/sizes/:sizeId` | `OWNER`، `MANAGER`، `CASHIER`، `KITCHEN` | [`menuSizePathSchema`](#menusizepathschema) | — | — | 200 · [`menuSizeResponseSchema`](#menusizeresponseschema) | — |
| `PATCH /restaurant/menu/sizes/:sizeId` | `OWNER`، `MANAGER` | [`menuSizePathSchema`](#menusizepathschema) | — | [`patchMenuSizeSchema`](#patchmenusizeschema) | 200 · [`menuSizeResponseSchema`](#menusizeresponseschema) | — |
| `DELETE /restaurant/menu/sizes/:sizeId` | `OWNER`، `MANAGER` | [`menuSizePathSchema`](#menusizepathschema) | — | — | 204 · بلا جسم | — |
| `GET /restaurant/menu/items/:itemId/option-groups` | `OWNER`، `MANAGER`، `CASHIER`، `KITCHEN` | [`menuItemPathSchema`](#menuitempathschema) | — | — | 200 · [`menuOptionGroupsResponseSchema`](#menuoptiongroupsresponseschema) | — |
| `POST /restaurant/menu/items/:itemId/option-groups` | `OWNER`، `MANAGER` | [`menuItemPathSchema`](#menuitempathschema) | — | [`createMenuOptionGroupSchema`](#createmenuoptiongroupschema) | 201 · [`menuOptionGroupResponseSchema`](#menuoptiongroupresponseschema) | — |
| `GET /restaurant/menu/option-groups/:groupId` | `OWNER`، `MANAGER`، `CASHIER`، `KITCHEN` | [`menuOptionGroupParamsSchema`](#menuoptiongroupparamsschema) | — | — | 200 · [`menuOptionGroupResponseSchema`](#menuoptiongroupresponseschema) | — |
| `PATCH /restaurant/menu/option-groups/:groupId` | `OWNER`، `MANAGER` | [`menuOptionGroupParamsSchema`](#menuoptiongroupparamsschema) | — | [`patchMenuOptionGroupSchema`](#patchmenuoptiongroupschema) | 200 · [`menuOptionGroupResponseSchema`](#menuoptiongroupresponseschema) | — |
| `DELETE /restaurant/menu/option-groups/:groupId` | `OWNER`، `MANAGER` | [`menuOptionGroupParamsSchema`](#menuoptiongroupparamsschema) | — | — | 204 · بلا جسم | — |
| `GET /restaurant/menu/option-groups/:groupId/options` | `OWNER`، `MANAGER`، `CASHIER`، `KITCHEN` | [`menuOptionGroupParamsSchema`](#menuoptiongroupparamsschema) | — | — | 200 · [`menuOptionsResponseSchema`](#menuoptionsresponseschema) | — |
| `POST /restaurant/menu/option-groups/:groupId/options` | `OWNER`، `MANAGER` | [`menuOptionGroupParamsSchema`](#menuoptiongroupparamsschema) | — | [`createMenuOptionSchema`](#createmenuoptionschema) | 201 · [`menuOptionResponseSchema`](#menuoptionresponseschema) | — |
| `GET /restaurant/menu/options/:optionId` | `OWNER`، `MANAGER`، `CASHIER`، `KITCHEN` | [`menuOptionParamsSchema`](#menuoptionparamsschema) | — | — | 200 · [`menuOptionResponseSchema`](#menuoptionresponseschema) | — |
| `PATCH /restaurant/menu/options/:optionId` | `OWNER`، `MANAGER` | [`menuOptionParamsSchema`](#menuoptionparamsschema) | — | [`patchMenuOptionSchema`](#patchmenuoptionschema) | 200 · [`menuOptionResponseSchema`](#menuoptionresponseschema) | — |
| `PATCH /restaurant/menu/options/:optionId/availability` | `OWNER`، `MANAGER`، `CASHIER`، `KITCHEN` | [`menuOptionParamsSchema`](#menuoptionparamsschema) | — | [`menuAvailabilitySchema`](#menuavailabilityschema) | 200 · [`menuAvailabilityResponseSchema`](#menuavailabilityresponseschema) | — |
| `DELETE /restaurant/menu/options/:optionId` | `OWNER`، `MANAGER` | [`menuOptionParamsSchema`](#menuoptionparamsschema) | — | — | 204 · بلا جسم | — |

## الإدارة

| الطريقة والمسار | الدور أو نوع الدخول | معاملات المسار | الاستعلام | الجسم | نجاح الاستجابة | ملاحظات |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /admin/session` | `SUPER_ADMIN`، `OPERATIONS`، `FINANCE`، `SUPPORT` | — | — | — | 200 · [`adminSessionSchema`](#adminsessionschema) | — |
| `GET /admin/dashboard` | `SUPER_ADMIN`، `OPERATIONS`، `FINANCE`، `SUPPORT` | — | — | — | 200 · [`adminDashboardSchema`](#admindashboardschema) | تعاد الحقول غير المفوّض بها بقيمة `null`. |
| `GET /admin/audit-log` | `SUPER_ADMIN` | — | [`adminAuditLogQuerySchema`](#adminauditlogqueryschema) | — | 200 · [`adminAuditLogSchema`](#adminauditlogschema) | — |
| `GET /admin/customers` | `SUPER_ADMIN`، `SUPPORT` | — | [`adminCustomerSearchQuerySchema`](#admincustomersearchqueryschema) | — | 200 · [`adminCustomerSearchSchema`](#admincustomersearchschema) | — |
| `GET /admin/customers/:id` | `SUPER_ADMIN`، `SUPPORT` | [`adminResourceParamsSchema`](#adminresourceparamsschema) | — | — | 200 · [`adminCustomerDetailSchema`](#admincustomerdetailschema) | — |
| `PATCH /admin/customers/:id/block` | `SUPER_ADMIN` | [`adminResourceParamsSchema`](#adminresourceparamsschema) | — | [`adminCustomerBlockSchema`](#admincustomerblockschema) | 200 · [`adminCustomerSchema`](#admincustomerschema) | — |
| `GET /admin/users` | `SUPER_ADMIN` | — | — | — | 200 · [`adminUserListSchema`](#adminuserlistschema) | — |
| `PATCH /admin/users/:id/role` | `SUPER_ADMIN` | [`adminResourceParamsSchema`](#adminresourceparamsschema) | — | [`adminUserRoleSchema`](#adminuserroleschema) | 200 · [`adminUserSchema`](#adminuserschema) | — |
| `GET /admin/settings` | `SUPER_ADMIN` | — | — | — | 200 · [`adminSettingsSchema`](#adminsettingsschema) | — |
| `PATCH /admin/settings` | `SUPER_ADMIN` | — | — | [`adminSettingsPatchSchema`](#adminsettingspatchschema) | 200 · [`adminSettingsSchema`](#adminsettingsschema) | — |
| `GET /admin/restaurants` | `SUPER_ADMIN`، `OPERATIONS` | — | [`adminRestaurantListQuerySchema`](#adminrestaurantlistqueryschema) | — | 200 · [`restaurantListResponseSchema`](#restaurantlistresponseschema) | — |
| `GET /admin/restaurants/:restaurantId` | `SUPER_ADMIN`، `OPERATIONS` | [`restaurantIdParamsSchema`](#restaurantidparamsschema) | — | — | 200 · [`adminRestaurantProfileSchema`](#adminrestaurantprofileschema) | — |
| `GET /admin/restaurants/commissions` | `SUPER_ADMIN`، `FINANCE` | — | — | — | 200 · [`restaurantCommissionsResponseSchema`](#restaurantcommissionsresponseschema) | — |
| `PATCH /admin/restaurants/:restaurantId/commission` | `SUPER_ADMIN`، `FINANCE` | [`restaurantIdParamsSchema`](#restaurantidparamsschema) | — | [`restaurantCommissionSchema`](#restaurantcommissionschema) | 200 · [`restaurantCommissionSchema`](#restaurantcommissionschema) | — |
| `POST /admin/restaurants/:restaurantId/approve` | `SUPER_ADMIN`، `OPERATIONS` | [`restaurantIdParamsSchema`](#restaurantidparamsschema) | — | [`restaurantReviewSchema`](#restaurantreviewschema) | 200 · [`restaurantReviewResponseSchema`](#restaurantreviewresponseschema) | — |
| `POST /admin/restaurants/:restaurantId/reject` | `SUPER_ADMIN`، `OPERATIONS` | [`restaurantIdParamsSchema`](#restaurantidparamsschema) | — | [`restaurantReviewSchema`](#restaurantreviewschema) | 200 · [`restaurantReviewResponseSchema`](#restaurantreviewresponseschema) | — |
| `POST /admin/restaurants/:restaurantId/suspend` | `SUPER_ADMIN`، `OPERATIONS` | [`restaurantIdParamsSchema`](#restaurantidparamsschema) | — | [`restaurantReviewSchema`](#restaurantreviewschema) | 200 · [`restaurantReviewResponseSchema`](#restaurantreviewresponseschema) | — |
| `POST /admin/restaurants/:restaurantId/resume` | `SUPER_ADMIN`، `OPERATIONS` | [`restaurantIdParamsSchema`](#restaurantidparamsschema) | — | [`restaurantReviewSchema`](#restaurantreviewschema) | 200 · [`restaurantReviewResponseSchema`](#restaurantreviewresponseschema) | — |
| `GET /admin/restaurants/:restaurantId/documents` | `SUPER_ADMIN`، `OPERATIONS` | [`restaurantIdParamsSchema`](#restaurantidparamsschema) | — | — | 200 · [`restaurantDocumentsResponseSchema`](#restaurantdocumentsresponseschema) | — |
| `GET /admin/restaurants/:restaurantId/documents/:documentId/link` | `SUPER_ADMIN`، `OPERATIONS` | [`adminDocumentPathSchema`](#admindocumentpathschema) | — | — | 200 · [`documentLinkSchema`](#documentlinkschema) | — |
| `GET /admin/restaurants/:restaurantId/documents/:documentId` | `SUPER_ADMIN`، `OPERATIONS` | [`adminDocumentPathSchema`](#admindocumentpathschema) | [`signedDocumentQuerySchema`](#signeddocumentqueryschema) | — | 200 · `image/webp` | يعيد `404 NOT_FOUND` عند انقضاء الرابط أو عدم صحة توقيعه. |
| `GET /admin/orders` | `SUPER_ADMIN`، `OPERATIONS`، `SUPPORT` | — | [`adminOrderListQuerySchema`](#adminorderlistqueryschema) | — | 200 · [`orderListResponseSchema`](#orderlistresponseschema) | — |
| `GET /admin/orders/needs-attention` | `SUPER_ADMIN`، `OPERATIONS`، `SUPPORT` | — | — | — | 200 · [`orderListResponseSchema`](#orderlistresponseschema) | — |
| `GET /admin/orders/metrics` | `SUPER_ADMIN`، `OPERATIONS`، `SUPPORT` | — | [`adminOrderMetricsQuerySchema`](#adminordermetricsqueryschema) | — | 200 · [`adminOrderMetricsSchema`](#adminordermetricsschema) | — |
| `GET /admin/orders/:id` | `SUPER_ADMIN`، `OPERATIONS`، `SUPPORT` | [`readOrderParamsSchema`](#readorderparamsschema) | — | — | 200 · [`orderReadSchema`](#orderreadschema) | — |
| `POST /admin/orders/:id/cancel` | `SUPER_ADMIN`، `OPERATIONS` | [`readOrderParamsSchema`](#readorderparamsschema) | — | [`orderCancellationSchema`](#ordercancellationschema) | 200 · [`orderReadSchema`](#orderreadschema) | يمكن حذف جسم الطلب من `PENDING`. يلزم سبب عند الإلغاء بعد القبول. |
| `GET /admin/complaints` | `SUPER_ADMIN`، `OPERATIONS`، `SUPPORT` | — | [`adminComplaintListQuerySchema`](#admincomplaintlistqueryschema) | — | 200 · [`adminComplaintListSchema`](#admincomplaintlistschema) | — |
| `GET /admin/complaints/:id` | `SUPER_ADMIN`، `OPERATIONS`، `SUPPORT` | [`complaintParamsSchema`](#complaintparamsschema) | — | — | 200 · [`adminComplaintSchema`](#admincomplaintschema) | — |
| `PATCH /admin/complaints/:id` | `SUPER_ADMIN`، `OPERATIONS`، `SUPPORT` | [`complaintParamsSchema`](#complaintparamsschema) | — | [`reviewComplaintSchema`](#reviewcomplaintschema) | 200 · [`adminComplaintSchema`](#admincomplaintschema) | — |
| `POST /admin/complaints/:id/resolve-non-delivery` | `SUPER_ADMIN` | [`complaintParamsSchema`](#complaintparamsschema) | — | [`resolveNonDeliveryComplaintSchema`](#resolvenondeliverycomplaintschema) | 200 · [`adminComplaintSchema`](#admincomplaintschema) | حسم عدم الاستلام المثبت وترحيل قيده العكسي معاً. يمكن حذف جسم الطلب. |
| `GET /admin/finance/restaurants` | `SUPER_ADMIN`، `FINANCE` | — | — | — | 200 · [`restaurantBalancesResponseSchema`](#restaurantbalancesresponseschema) | — |
| `GET /admin/finance/restaurants/:restaurantId/ledger` | `SUPER_ADMIN`، `FINANCE` | [`restaurantIdParamsSchema`](#restaurantidparamsschema) | — | — | 200 · [`financeLedgerResponseSchema`](#financeledgerresponseschema) | — |
| `POST /admin/finance/restaurants/:restaurantId/payments` | `SUPER_ADMIN`، `FINANCE` | [`restaurantIdParamsSchema`](#restaurantidparamsschema) | — | [`recordPaymentSchema`](#recordpaymentschema) | 201 · [`ledgerEntrySchema`](#ledgerentryschema) | — |
| `POST /admin/finance/restaurants/:restaurantId/adjustments` | `SUPER_ADMIN`، `FINANCE` | [`restaurantIdParamsSchema`](#restaurantidparamsschema) | — | [`recordAdjustmentSchema`](#recordadjustmentschema) | 201 · [`ledgerEntrySchema`](#ledgerentryschema) | — |
| `GET /admin/governorates` | `SUPER_ADMIN`، `OPERATIONS` | — | [`geoListQuerySchema`](#geolistqueryschema) | — | 200 · [`governoratesResponseSchema`](#governoratesresponseschema) | — |
| `GET /admin/governorates/:id` | `SUPER_ADMIN`، `OPERATIONS` | [`geoIdParamsSchema`](#geoidparamsschema) | — | — | 200 · [`governorateSchema`](#governorateschema) | — |
| `POST /admin/governorates` | `SUPER_ADMIN`، `OPERATIONS` | — | — | [`governorateCreateSchema`](#governoratecreateschema) | 201 · [`governorateSchema`](#governorateschema) | — |
| `PATCH /admin/governorates/:id` | `SUPER_ADMIN`، `OPERATIONS` | [`geoIdParamsSchema`](#geoidparamsschema) | — | [`governorateUpdateSchema`](#governorateupdateschema) | 200 · [`governorateSchema`](#governorateschema) | — |
| `DELETE /admin/governorates/:id` | `SUPER_ADMIN`، `OPERATIONS` | [`geoIdParamsSchema`](#geoidparamsschema) | — | — | 200 أو 204 · [`governorateSchema`](#governorateschema) | يعيد الصف المعطّل بـ`200` عند وجود مراجع إليه أو `204` عند الحذف. |
| `GET /admin/cities` | `SUPER_ADMIN`، `OPERATIONS` | — | [`cityListQuerySchema`](#citylistqueryschema) | — | 200 · [`citiesResponseSchema`](#citiesresponseschema) | — |
| `GET /admin/cities/:id` | `SUPER_ADMIN`، `OPERATIONS` | [`geoIdParamsSchema`](#geoidparamsschema) | — | — | 200 · [`citySchema`](#cityschema) | — |
| `POST /admin/cities` | `SUPER_ADMIN`، `OPERATIONS` | — | — | [`cityCreateSchema`](#citycreateschema) | 201 · [`citySchema`](#cityschema) | — |
| `PATCH /admin/cities/:id` | `SUPER_ADMIN`، `OPERATIONS` | [`geoIdParamsSchema`](#geoidparamsschema) | — | [`cityUpdateSchema`](#cityupdateschema) | 200 · [`citySchema`](#cityschema) | — |
| `DELETE /admin/cities/:id` | `SUPER_ADMIN`، `OPERATIONS` | [`geoIdParamsSchema`](#geoidparamsschema) | — | — | 200 أو 204 · [`citySchema`](#cityschema) | يعيد الصف المعطّل بـ`200` عند وجود مراجع إليه أو `204` عند الحذف. |
| `GET /admin/neighborhoods` | `SUPER_ADMIN`، `OPERATIONS` | — | [`neighborhoodListQuerySchema`](#neighborhoodlistqueryschema) | — | 200 · [`neighborhoodsResponseSchema`](#neighborhoodsresponseschema) | — |
| `GET /admin/neighborhoods/:id` | `SUPER_ADMIN`، `OPERATIONS` | [`geoIdParamsSchema`](#geoidparamsschema) | — | — | 200 · [`neighborhoodSchema`](#neighborhoodschema) | — |
| `POST /admin/neighborhoods` | `SUPER_ADMIN`، `OPERATIONS` | — | — | [`neighborhoodCreateSchema`](#neighborhoodcreateschema) | 201 · [`neighborhoodSchema`](#neighborhoodschema) | — |
| `PATCH /admin/neighborhoods/:id` | `SUPER_ADMIN`، `OPERATIONS` | [`geoIdParamsSchema`](#geoidparamsschema) | — | [`neighborhoodUpdateSchema`](#neighborhoodupdateschema) | 200 · [`neighborhoodSchema`](#neighborhoodschema) | — |
| `DELETE /admin/neighborhoods/:id` | `SUPER_ADMIN`، `OPERATIONS` | [`geoIdParamsSchema`](#geoidparamsschema) | — | — | 200 أو 204 · [`neighborhoodSchema`](#neighborhoodschema) | يعيد الصف المعطّل بـ`200` عند وجود مراجع إليه أو `204` عند الحذف. |
| `GET /admin/categories` | `SUPER_ADMIN`، `OPERATIONS` | — | [`geoListQuerySchema`](#geolistqueryschema) | — | 200 · [`foodCategoriesResponseSchema`](#foodcategoriesresponseschema) | — |
| `GET /admin/categories/:id` | `SUPER_ADMIN`، `OPERATIONS` | [`geoIdParamsSchema`](#geoidparamsschema) | — | — | 200 · [`foodCategorySchema`](#foodcategoryschema) | — |
| `POST /admin/categories` | `SUPER_ADMIN`، `OPERATIONS` | — | — | [`foodCategoryCreateSchema`](#foodcategorycreateschema) | 201 · [`foodCategorySchema`](#foodcategoryschema) | — |
| `PATCH /admin/categories/:id` | `SUPER_ADMIN`، `OPERATIONS` | [`geoIdParamsSchema`](#geoidparamsschema) | — | [`foodCategoryUpdateSchema`](#foodcategoryupdateschema) | 200 · [`foodCategorySchema`](#foodcategoryschema) | — |
| `DELETE /admin/categories/:id` | `SUPER_ADMIN`، `OPERATIONS` | [`geoIdParamsSchema`](#geoidparamsschema) | — | — | 200 أو 204 · [`foodCategorySchema`](#foodcategoryschema) | يعيد الصف المعطّل بـ`200` عند وجود مراجع إليه أو `204` عند الحذف. |

## مخططات العقود

تصف المخططات البيانات المتبادلة. يفرض الخادم أيضاً قواعد الملكية والعزل والتحققات متعددة الحقول والتحويلات، مثل تطبيع الهاتف. الحقول المنتهية بـ`Minor` مبالغ صحيحة في الوحدة الصغرى.

### adminAuditLogQuerySchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "entityId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "action": {
      "type": "string",
      "minLength": 1,
      "maxLength": 100
    },
    "cursor": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "additionalProperties": false
}
```

</details>

### adminAuditLogSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "entries": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "adminUserId": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "action": {
            "type": "string"
          },
          "entityType": {
            "type": "string"
          },
          "entityId": {
            "type": "string"
          },
          "before": {
            "$ref": "#/$defs/__schema0"
          },
          "after": {
            "$ref": "#/$defs/__schema1"
          },
          "ip": {
            "type": "string"
          },
          "createdAt": {
            "type": "string",
            "format": "date-time",
            "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
          }
        },
        "required": [
          "id",
          "adminUserId",
          "action",
          "entityType",
          "entityId",
          "before",
          "after",
          "ip",
          "createdAt"
        ],
        "additionalProperties": false
      }
    },
    "nextCursor": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        },
        {
          "type": "null"
        }
      ]
    }
  },
  "required": [
    "entries",
    "nextCursor"
  ],
  "additionalProperties": false,
  "$defs": {
    "__schema0": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "number"
        },
        {
          "type": "boolean"
        },
        {
          "type": "null"
        },
        {
          "type": "array",
          "items": {
            "$ref": "#/$defs/__schema0"
          }
        },
        {
          "type": "object",
          "propertyNames": {
            "type": "string"
          },
          "additionalProperties": {
            "$ref": "#/$defs/__schema0"
          }
        }
      ]
    },
    "__schema1": {
      "anyOf": [
        {
          "type": "string"
        },
        {
          "type": "number"
        },
        {
          "type": "boolean"
        },
        {
          "type": "null"
        },
        {
          "type": "array",
          "items": {
            "$ref": "#/$defs/__schema1"
          }
        },
        {
          "type": "object",
          "propertyNames": {
            "type": "string"
          },
          "additionalProperties": {
            "$ref": "#/$defs/__schema1"
          }
        }
      ]
    }
  }
}
```

</details>

### adminComplaintListQuerySchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "enum": [
        "OPEN",
        "IN_PROGRESS",
        "RESOLVED"
      ]
    },
    "type": {
      "type": "string",
      "enum": [
        "NOT_RECEIVED",
        "OTHER"
      ]
    }
  },
  "additionalProperties": false
}
```

</details>

### adminComplaintListSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "complaints": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "orderId": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "type": {
            "type": "string",
            "enum": [
              "NOT_RECEIVED",
              "OTHER"
            ]
          },
          "text": {
            "type": "string",
            "maxLength": 1000
          },
          "status": {
            "type": "string",
            "enum": [
              "OPEN",
              "IN_PROGRESS",
              "RESOLVED"
            ]
          },
          "createdAt": {
            "type": "string",
            "format": "date-time",
            "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
          },
          "updatedAt": {
            "type": "string",
            "format": "date-time",
            "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
          },
          "customerId": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "internalNotes": {
            "type": [
              "string",
              "null"
            ]
          },
          "nonDeliveryVerifiedAt": {
            "anyOf": [
              {
                "type": "string",
                "format": "date-time",
                "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
              },
              {
                "type": "null"
              }
            ]
          }
        },
        "required": [
          "id",
          "orderId",
          "type",
          "text",
          "status",
          "createdAt",
          "updatedAt",
          "customerId",
          "internalNotes",
          "nonDeliveryVerifiedAt"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "complaints"
  ],
  "additionalProperties": false
}
```

</details>

### adminComplaintSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "orderId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "type": {
      "type": "string",
      "enum": [
        "NOT_RECEIVED",
        "OTHER"
      ]
    },
    "text": {
      "type": "string",
      "maxLength": 1000
    },
    "status": {
      "type": "string",
      "enum": [
        "OPEN",
        "IN_PROGRESS",
        "RESOLVED"
      ]
    },
    "createdAt": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
    },
    "updatedAt": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
    },
    "customerId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "internalNotes": {
      "type": [
        "string",
        "null"
      ]
    },
    "nonDeliveryVerifiedAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
        },
        {
          "type": "null"
        }
      ]
    }
  },
  "required": [
    "id",
    "orderId",
    "type",
    "text",
    "status",
    "createdAt",
    "updatedAt",
    "customerId",
    "internalNotes",
    "nonDeliveryVerifiedAt"
  ],
  "additionalProperties": false
}
```

</details>

### adminCustomerBlockSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "blocked": {
      "type": "boolean"
    },
    "reason": {
      "type": "string",
      "minLength": 1,
      "maxLength": 500
    }
  },
  "required": [
    "blocked",
    "reason"
  ],
  "additionalProperties": false
}
```

</details>

### adminCustomerDetailSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "customer": {
      "type": "object",
      "properties": {
        "id": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        },
        "name": {
          "type": [
            "string",
            "null"
          ]
        },
        "phone": {
          "type": [
            "string",
            "null"
          ]
        },
        "blockedAt": {
          "anyOf": [
            {
              "type": "string",
              "format": "date-time",
              "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
            },
            {
              "type": "null"
            }
          ]
        },
        "createdAt": {
          "type": "string",
          "format": "date-time",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
        }
      },
      "required": [
        "id",
        "name",
        "phone",
        "blockedAt",
        "createdAt"
      ],
      "additionalProperties": false
    },
    "orders": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "branchId": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "restaurantId": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "restaurantName": {
            "type": [
              "string",
              "null"
            ]
          },
          "restaurantPhone": {
            "type": [
              "string",
              "null"
            ]
          },
          "orderNumber": {
            "type": "string"
          },
          "type": {
            "type": "string",
            "enum": [
              "DELIVERY",
              "PICKUP"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "PENDING",
              "ACCEPTED",
              "PREPARING",
              "READY",
              "OUT_FOR_DELIVERY",
              "DELIVERED",
              "REJECTED",
              "EXPIRED",
              "CANCELLED",
              "DELIVERY_FAILED"
            ]
          },
          "customerId": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "customerName": {
            "type": [
              "string",
              "null"
            ]
          },
          "customerPhone": {
            "type": [
              "string",
              "null"
            ]
          },
          "addressSnapshot": {
            "anyOf": [
              {
                "type": "object",
                "propertyNames": {
                  "type": "string"
                },
                "additionalProperties": {}
              },
              {
                "type": "null"
              }
            ]
          },
          "note": {
            "type": [
              "string",
              "null"
            ]
          },
          "createdAt": {
            "type": "string",
            "format": "date-time",
            "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
          },
          "acceptedAt": {
            "anyOf": [
              {
                "type": "string",
                "format": "date-time",
                "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
              },
              {
                "type": "null"
              }
            ]
          },
          "finishedAt": {
            "anyOf": [
              {
                "type": "string",
                "format": "date-time",
                "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
              },
              {
                "type": "null"
              }
            ]
          },
          "estimatedReadyAt": {
            "anyOf": [
              {
                "type": "string",
                "format": "date-time",
                "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
              },
              {
                "type": "null"
              }
            ]
          },
          "estimatedDeliveryAt": {
            "anyOf": [
              {
                "type": "string",
                "format": "date-time",
                "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
              },
              {
                "type": "null"
              }
            ]
          },
          "serverTime": {
            "type": "string",
            "format": "date-time",
            "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
          },
          "pendingExpiresAt": {
            "anyOf": [
              {
                "type": "string",
                "format": "date-time",
                "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
              },
              {
                "type": "null"
              }
            ]
          },
          "currencyDisplayMode": {
            "type": "string",
            "enum": [
              "OLD",
              "NEW"
            ]
          },
          "prepMinutes": {
            "anyOf": [
              {
                "type": "integer",
                "minimum": -9007199254740991,
                "maximum": 9007199254740991
              },
              {
                "type": "null"
              }
            ]
          },
          "etaMinutes": {
            "anyOf": [
              {
                "type": "integer",
                "minimum": -9007199254740991,
                "maximum": 9007199254740991
              },
              {
                "type": "null"
              }
            ]
          },
          "needsAttention": {
            "type": "boolean"
          },
          "foodSubtotalMinor": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "discountMinor": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "deliveryFeeMinor": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "totalMinor": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "commissionMinor": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "commissionRateBps": {
            "type": "integer",
            "minimum": 0,
            "maximum": 10000
          },
          "items": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                "name": {
                  "type": "string"
                },
                "sizeName": {
                  "type": "string"
                },
                "quantity": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 50
                },
                "note": {
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "unitPriceMinor": {
                  "type": "integer",
                  "minimum": 0,
                  "maximum": 9007199254740991
                },
                "totalMinor": {
                  "type": "integer",
                  "minimum": 0,
                  "maximum": 9007199254740991
                },
                "options": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "id": {
                        "type": "string",
                        "format": "uuid",
                        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                      },
                      "name": {
                        "type": "string"
                      },
                      "priceMinor": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 9007199254740991
                      }
                    },
                    "required": [
                      "id",
                      "name"
                    ],
                    "additionalProperties": false
                  }
                }
              },
              "required": [
                "id",
                "name",
                "sizeName",
                "quantity",
                "note",
                "options"
              ],
              "additionalProperties": false
            }
          },
          "events": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                "from": {
                  "anyOf": [
                    {
                      "type": "string",
                      "enum": [
                        "PENDING",
                        "ACCEPTED",
                        "PREPARING",
                        "READY",
                        "OUT_FOR_DELIVERY",
                        "DELIVERED",
                        "REJECTED",
                        "EXPIRED",
                        "CANCELLED",
                        "DELIVERY_FAILED"
                      ]
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "to": {
                  "type": "string",
                  "enum": [
                    "PENDING",
                    "ACCEPTED",
                    "PREPARING",
                    "READY",
                    "OUT_FOR_DELIVERY",
                    "DELIVERED",
                    "REJECTED",
                    "EXPIRED",
                    "CANCELLED",
                    "DELIVERY_FAILED"
                  ]
                },
                "actorType": {
                  "type": "string",
                  "enum": [
                    "CUSTOMER",
                    "RESTAURANT",
                    "ADMIN",
                    "SYSTEM"
                  ]
                },
                "actorId": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "uuid",
                      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "reasonCode": {
                  "anyOf": [
                    {
                      "type": "string",
                      "enum": [
                        "TOO_BUSY",
                        "ITEM_UNAVAILABLE",
                        "CLOSING_SOON",
                        "OUT_OF_ZONE",
                        "OTHER",
                        "CUSTOMER_REQUEST",
                        "NO_DRIVER",
                        "DUPLICATE",
                        "SUSPECTED_FAKE",
                        "CUSTOMER_UNREACHABLE",
                        "WRONG_ADDRESS",
                        "CUSTOMER_REFUSED"
                      ]
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "note": {
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "createdAt": {
                  "type": "string",
                  "format": "date-time",
                  "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
                }
              },
              "required": [
                "id",
                "from",
                "to",
                "actorType",
                "reasonCode",
                "note",
                "createdAt"
              ],
              "additionalProperties": false
            }
          }
        },
        "required": [
          "id",
          "branchId",
          "restaurantId",
          "restaurantName",
          "orderNumber",
          "type",
          "status",
          "customerName",
          "note",
          "createdAt",
          "acceptedAt",
          "finishedAt",
          "estimatedReadyAt",
          "estimatedDeliveryAt",
          "prepMinutes",
          "etaMinutes",
          "items",
          "events"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "customer",
    "orders"
  ],
  "additionalProperties": false
}
```

</details>

### adminCustomerSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "name": {
      "type": [
        "string",
        "null"
      ]
    },
    "phone": {
      "type": [
        "string",
        "null"
      ]
    },
    "blockedAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
        },
        {
          "type": "null"
        }
      ]
    },
    "createdAt": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
    }
  },
  "required": [
    "id",
    "name",
    "phone",
    "blockedAt",
    "createdAt"
  ],
  "additionalProperties": false
}
```

</details>

### adminCustomerSearchQuerySchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "phone": {
      "type": "string"
    }
  },
  "required": [
    "phone"
  ],
  "additionalProperties": false
}
```

</details>

### adminCustomerSearchSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "customers": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "name": {
            "type": [
              "string",
              "null"
            ]
          },
          "phone": {
            "type": [
              "string",
              "null"
            ]
          },
          "blockedAt": {
            "anyOf": [
              {
                "type": "string",
                "format": "date-time",
                "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
              },
              {
                "type": "null"
              }
            ]
          },
          "createdAt": {
            "type": "string",
            "format": "date-time",
            "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
          }
        },
        "required": [
          "id",
          "name",
          "phone",
          "blockedAt",
          "createdAt"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "customers"
  ],
  "additionalProperties": false
}
```

</details>

### adminDashboardSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "activeOrderCount": {
      "anyOf": [
        {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991
        },
        {
          "type": "null"
        }
      ]
    },
    "needsAttentionCount": {
      "anyOf": [
        {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991
        },
        {
          "type": "null"
        }
      ]
    },
    "pendingRestaurantCount": {
      "anyOf": [
        {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991
        },
        {
          "type": "null"
        }
      ]
    },
    "offlineBranches": {
      "anyOf": [
        {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id": {
                "type": "string",
                "format": "uuid",
                "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
              },
              "restaurantId": {
                "type": "string",
                "format": "uuid",
                "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
              },
              "restaurantName": {
                "type": [
                  "string",
                  "null"
                ]
              },
              "lastSeenAt": {
                "anyOf": [
                  {
                    "type": "string",
                    "format": "date-time",
                    "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
                  },
                  {
                    "type": "null"
                  }
                ]
              }
            },
            "required": [
              "id",
              "restaurantId",
              "restaurantName",
              "lastSeenAt"
            ],
            "additionalProperties": false
          }
        },
        {
          "type": "null"
        }
      ]
    }
  },
  "required": [
    "activeOrderCount",
    "needsAttentionCount",
    "pendingRestaurantCount",
    "offlineBranches"
  ],
  "additionalProperties": false
}
```

</details>

### adminDocumentPathSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "documentId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "restaurantId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "documentId",
    "restaurantId"
  ]
}
```

</details>

### adminLoginSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "email": {
      "type": "string"
    },
    "password": {
      "type": "string",
      "minLength": 1
    },
    "totp": {
      "type": "string",
      "pattern": "^[0-9]{6}$"
    }
  },
  "required": [
    "email",
    "password",
    "totp"
  ]
}
```

</details>

### adminOrderListQuerySchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "enum": [
        "PENDING",
        "ACCEPTED",
        "PREPARING",
        "READY",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "REJECTED",
        "EXPIRED",
        "CANCELLED",
        "DELIVERY_FAILED"
      ]
    },
    "from": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
    },
    "to": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
    },
    "q": {
      "type": "string",
      "minLength": 1
    },
    "active": {
      "type": "string",
      "const": "true"
    }
  },
  "additionalProperties": false
}
```

</details>

### adminOrderMetricsQuerySchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "from": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
    },
    "to": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
    }
  },
  "additionalProperties": false
}
```

</details>

### adminOrderMetricsSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "orderCount": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "completionRateBps": {
      "type": "integer",
      "minimum": 0,
      "maximum": 10000
    },
    "acceptanceRateBps": {
      "type": "integer",
      "minimum": 0,
      "maximum": 10000
    },
    "averageResponseMs": {
      "anyOf": [
        {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991
        },
        {
          "type": "null"
        }
      ]
    },
    "cancellationByReason": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "reasonCode": {
            "anyOf": [
              {
                "type": "string",
                "enum": [
                  "CUSTOMER_REQUEST",
                  "ITEM_UNAVAILABLE",
                  "NO_DRIVER",
                  "DUPLICATE",
                  "SUSPECTED_FAKE",
                  "OTHER"
                ]
              },
              {
                "type": "null"
              }
            ]
          },
          "count": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "rateBps": {
            "type": "integer",
            "minimum": 0,
            "maximum": 10000
          }
        },
        "required": [
          "reasonCode",
          "count",
          "rateBps"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "orderCount",
    "completionRateBps",
    "acceptanceRateBps",
    "averageResponseMs",
    "cancellationByReason"
  ],
  "additionalProperties": false
}
```

</details>

### adminResourceParamsSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "id"
  ],
  "additionalProperties": false
}
```

</details>

### adminRestaurantListQuerySchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "enum": [
        "DRAFT",
        "PENDING_REVIEW",
        "APPROVED",
        "REJECTED",
        "SUSPENDED"
      ]
    }
  },
  "additionalProperties": false
}
```

</details>

### adminRestaurantProfileSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "commissionRateBps": {
      "type": "integer",
      "minimum": 0,
      "maximum": 10000
    },
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "name": {
      "type": [
        "string",
        "null"
      ]
    },
    "status": {
      "type": "string",
      "enum": [
        "DRAFT",
        "PENDING_REVIEW",
        "APPROVED",
        "REJECTED",
        "SUSPENDED"
      ]
    },
    "contactPhone": {
      "type": [
        "string",
        "null"
      ]
    },
    "logoKey": {
      "type": [
        "string",
        "null"
      ]
    },
    "coverImageKey": {
      "type": [
        "string",
        "null"
      ]
    },
    "reviewReason": {
      "type": [
        "string",
        "null"
      ]
    },
    "categoryIds": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "uuid",
        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
      }
    },
    "documentCount": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "branch": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "format": "uuid",
              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
            },
            "neighborhoodId": {
              "anyOf": [
                {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                {
                  "type": "null"
                }
              ]
            },
            "address": {
              "type": [
                "string",
                "null"
              ]
            },
            "latitude": {
              "type": [
                "number",
                "null"
              ]
            },
            "longitude": {
              "type": [
                "number",
                "null"
              ]
            },
            "minOrderMinor": {
              "type": "integer",
              "minimum": 0,
              "maximum": 9007199254740991
            },
            "pickupEnabled": {
              "type": "boolean"
            },
            "acceptingOrders": {
              "type": "boolean"
            },
            "openingPeriods": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "dayOfWeek": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 6
                  },
                  "opensAt": {
                    "type": "string",
                    "pattern": "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"
                  },
                  "closesAt": {
                    "type": "string",
                    "pattern": "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"
                  }
                },
                "required": [
                  "dayOfWeek",
                  "opensAt",
                  "closesAt"
                ],
                "additionalProperties": false
              }
            },
            "deliveryZones": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "neighborhoodId": {
                    "type": "string",
                    "format": "uuid",
                    "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                  },
                  "feeMinor": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 9007199254740991
                  },
                  "etaMinutes": {
                    "type": "integer",
                    "minimum": 0,
                    "maximum": 2147483647
                  },
                  "id": {
                    "type": "string",
                    "format": "uuid",
                    "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                  }
                },
                "required": [
                  "neighborhoodId",
                  "feeMinor",
                  "etaMinutes",
                  "id"
                ],
                "additionalProperties": false
              }
            }
          },
          "required": [
            "id",
            "neighborhoodId",
            "address",
            "latitude",
            "longitude",
            "minOrderMinor",
            "pickupEnabled",
            "acceptingOrders",
            "openingPeriods",
            "deliveryZones"
          ],
          "additionalProperties": false
        },
        {
          "type": "null"
        }
      ]
    }
  },
  "required": [
    "commissionRateBps",
    "id",
    "name",
    "status",
    "contactPhone",
    "logoKey",
    "coverImageKey",
    "reviewReason",
    "categoryIds",
    "documentCount",
    "branch"
  ],
  "additionalProperties": false
}
```

</details>

### adminSessionSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "role": {
      "type": "string",
      "enum": [
        "SUPER_ADMIN",
        "OPERATIONS",
        "FINANCE",
        "SUPPORT"
      ]
    },
    "currencyDisplayMode": {
      "type": "string",
      "enum": [
        "OLD",
        "NEW"
      ]
    }
  },
  "required": [
    "id",
    "role",
    "currencyDisplayMode"
  ],
  "additionalProperties": false
}
```

</details>

### adminSettingsPatchSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "reminderAfterSec": {
      "type": "integer",
      "minimum": 1,
      "maximum": 2147483647
    },
    "attentionAfterSec": {
      "type": "integer",
      "minimum": 1,
      "maximum": 2147483647
    },
    "expireAfterSec": {
      "type": "integer",
      "minimum": 1,
      "maximum": 2147483647
    },
    "defaultCommissionRateBps": {
      "type": "integer",
      "minimum": 0,
      "maximum": 10000
    },
    "currencyDisplayMode": {
      "type": "string",
      "enum": [
        "OLD",
        "NEW"
      ]
    }
  },
  "additionalProperties": false
}
```

</details>

### adminSettingsSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "reminderAfterSec": {
      "type": "integer",
      "minimum": 1,
      "maximum": 2147483647
    },
    "attentionAfterSec": {
      "type": "integer",
      "minimum": 1,
      "maximum": 2147483647
    },
    "expireAfterSec": {
      "type": "integer",
      "minimum": 1,
      "maximum": 2147483647
    },
    "defaultCommissionRateBps": {
      "type": "integer",
      "minimum": 0,
      "maximum": 10000
    },
    "currencyDisplayMode": {
      "type": "string",
      "enum": [
        "OLD",
        "NEW"
      ]
    }
  },
  "required": [
    "reminderAfterSec",
    "attentionAfterSec",
    "expireAfterSec",
    "defaultCommissionRateBps",
    "currencyDisplayMode"
  ],
  "additionalProperties": false
}
```

</details>

### adminUserListSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "users": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "email": {
            "type": "string",
            "format": "email",
            "pattern": "^(?:[A-Za-z0-9_'+\\-]+\\.)*[A-Za-z0-9_'+\\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$"
          },
          "role": {
            "type": "string",
            "enum": [
              "SUPER_ADMIN",
              "OPERATIONS",
              "FINANCE",
              "SUPPORT"
            ]
          },
          "isActive": {
            "type": "boolean"
          },
          "createdAt": {
            "type": "string",
            "format": "date-time",
            "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
          }
        },
        "required": [
          "id",
          "email",
          "role",
          "isActive",
          "createdAt"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "users"
  ],
  "additionalProperties": false
}
```

</details>

### adminUserRoleSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "role": {
      "type": "string",
      "enum": [
        "SUPER_ADMIN",
        "OPERATIONS",
        "FINANCE",
        "SUPPORT"
      ]
    }
  },
  "required": [
    "role"
  ],
  "additionalProperties": false
}
```

</details>

### adminUserSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "email": {
      "type": "string",
      "format": "email",
      "pattern": "^(?:[A-Za-z0-9_'+\\-]+\\.)*[A-Za-z0-9_'+\\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$"
    },
    "role": {
      "type": "string",
      "enum": [
        "SUPER_ADMIN",
        "OPERATIONS",
        "FINANCE",
        "SUPPORT"
      ]
    },
    "isActive": {
      "type": "boolean"
    },
    "createdAt": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
    }
  },
  "required": [
    "id",
    "email",
    "role",
    "isActive",
    "createdAt"
  ],
  "additionalProperties": false
}
```

</details>

### authTokensSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "accessToken": {
      "type": "string",
      "minLength": 1
    },
    "refreshToken": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_-]{43}$"
    }
  },
  "required": [
    "accessToken",
    "refreshToken"
  ]
}
```

</details>

### branchAcceptingOrdersResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "acceptingOrders": {
      "type": "boolean"
    },
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "acceptingOrders",
    "id"
  ],
  "additionalProperties": false
}
```

</details>

### branchAcceptingOrdersSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "acceptingOrders": {
      "type": "boolean"
    }
  },
  "required": [
    "acceptingOrders"
  ],
  "additionalProperties": false
}
```

</details>

### branchSettingsResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "minOrderMinor": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "pickupEnabled": {
      "type": "boolean"
    }
  },
  "required": [
    "minOrderMinor",
    "pickupEnabled"
  ],
  "additionalProperties": false
}
```

</details>

### browseListQuerySchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "neighborhoodId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "categoryId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "q": {
      "type": "string"
    },
    "cursor": {
      "type": "string",
      "pattern": "^(0|1):([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "neighborhoodId"
  ],
  "additionalProperties": false
}
```

</details>

### browseListResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "restaurants": {
      "maxItems": 20,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "branchId": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "name": {
            "type": [
              "string",
              "null"
            ]
          },
          "logoKey": {
            "type": [
              "string",
              "null"
            ]
          },
          "categories": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                "name": {
                  "type": "string"
                },
                "icon": {
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "sortOrder": {
                  "type": "integer",
                  "minimum": -9007199254740991,
                  "maximum": 9007199254740991
                }
              },
              "required": [
                "id",
                "name",
                "icon",
                "sortOrder"
              ],
              "additionalProperties": false
            }
          },
          "isOrderable": {
            "type": "boolean"
          },
          "reason": {
            "anyOf": [
              {
                "type": "string",
                "enum": [
                  "UNAPPROVED",
                  "PAUSED",
                  "CLOSED",
                  "OFFLINE",
                  "OUT_OF_ZONE",
                  "PICKUP_DISABLED",
                  "NO_AVAILABLE_ITEMS"
                ]
              },
              {
                "type": "null"
              }
            ]
          },
          "deliveryFeeMinor": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "minOrderMinor": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "etaMinutes": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          }
        },
        "required": [
          "id",
          "branchId",
          "name",
          "logoKey",
          "categories",
          "isOrderable",
          "reason",
          "deliveryFeeMinor",
          "minOrderMinor",
          "etaMinutes"
        ],
        "additionalProperties": false
      }
    },
    "nextCursor": {
      "anyOf": [
        {
          "type": "string",
          "pattern": "^(0|1):([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        },
        {
          "type": "null"
        }
      ]
    },
    "currencyDisplayMode": {
      "type": "string",
      "enum": [
        "OLD",
        "NEW"
      ]
    }
  },
  "required": [
    "restaurants",
    "nextCursor",
    "currencyDisplayMode"
  ],
  "additionalProperties": false
}
```

</details>

### citiesResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "id": {
        "type": "string",
        "format": "uuid",
        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
      },
      "name": {
        "type": "string",
        "minLength": 1,
        "maxLength": 120
      },
      "isActive": {
        "type": "boolean"
      },
      "governorateId": {
        "type": "string",
        "format": "uuid",
        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
      }
    },
    "required": [
      "id",
      "name",
      "isActive",
      "governorateId"
    ]
  }
}
```

</details>

### cityCreateSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120
    },
    "isActive": {
      "type": "boolean"
    },
    "governorateId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "name",
    "governorateId"
  ],
  "additionalProperties": false
}
```

</details>

### cityListQuerySchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "governorateId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "additionalProperties": false
}
```

</details>

### citySchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120
    },
    "isActive": {
      "type": "boolean"
    },
    "governorateId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "id",
    "name",
    "isActive",
    "governorateId"
  ]
}
```

</details>

### cityUpdateSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120
    },
    "isActive": {
      "type": "boolean"
    },
    "governorateId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "additionalProperties": false
}
```

</details>

### complaintParamsSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "id"
  ],
  "additionalProperties": false
}
```

</details>

### createComplaintSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "type": {
      "type": "string",
      "enum": [
        "NOT_RECEIVED",
        "OTHER"
      ]
    },
    "text": {
      "type": "string",
      "minLength": 1,
      "maxLength": 1000
    }
  },
  "required": [
    "type",
    "text"
  ],
  "additionalProperties": false
}
```

</details>

### createMenuItemSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "sectionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "name": {
      "type": "string",
      "minLength": 1
    },
    "description": {
      "type": [
        "string",
        "null"
      ]
    },
    "isAvailable": {
      "type": "boolean"
    },
    "sortOrder": {
      "type": "integer",
      "minimum": -2147483648,
      "maximum": 2147483647
    },
    "availableFrom": {
      "anyOf": [
        {
          "type": "string",
          "pattern": "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"
        },
        {
          "type": "null"
        }
      ]
    },
    "availableTo": {
      "anyOf": [
        {
          "type": "string",
          "pattern": "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"
        },
        {
          "type": "null"
        }
      ]
    },
    "sizes": {
      "minItems": 1,
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "minLength": 1
          },
          "priceMinor": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "sortOrder": {
            "type": "integer",
            "minimum": -2147483648,
            "maximum": 2147483647
          }
        },
        "required": [
          "priceMinor"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "sectionId",
    "name",
    "sizes"
  ],
  "additionalProperties": false
}
```

</details>

### createMenuOptionGroupSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1
    },
    "minSelect": {
      "type": "integer",
      "minimum": 0,
      "maximum": 2147483647
    },
    "maxSelect": {
      "type": "integer",
      "minimum": 0,
      "maximum": 2147483647
    },
    "sortOrder": {
      "type": "integer",
      "minimum": -2147483648,
      "maximum": 2147483647
    },
    "options": {
      "default": [],
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "minLength": 1
          },
          "priceMinor": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "isAvailable": {
            "type": "boolean"
          },
          "sortOrder": {
            "type": "integer",
            "minimum": -2147483648,
            "maximum": 2147483647
          }
        },
        "required": [
          "name",
          "priceMinor"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "name",
    "minSelect",
    "maxSelect"
  ],
  "additionalProperties": false
}
```

</details>

### createMenuOptionSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1
    },
    "priceMinor": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "isAvailable": {
      "type": "boolean"
    },
    "sortOrder": {
      "type": "integer",
      "minimum": -2147483648,
      "maximum": 2147483647
    }
  },
  "required": [
    "name",
    "priceMinor"
  ],
  "additionalProperties": false
}
```

</details>

### createMenuSectionSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1
    },
    "sortOrder": {
      "type": "integer",
      "minimum": -2147483648,
      "maximum": 2147483647
    }
  },
  "required": [
    "name"
  ],
  "additionalProperties": false
}
```

</details>

### createMenuSizeSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1
    },
    "priceMinor": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "sortOrder": {
      "type": "integer",
      "minimum": -2147483648,
      "maximum": 2147483647
    }
  },
  "required": [
    "name",
    "priceMinor"
  ],
  "additionalProperties": false
}
```

</details>

### customerAddressCreateSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "neighborhoodId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "street": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "landmark": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "building": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        },
        {
          "type": "null"
        }
      ]
    },
    "floor": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 50
        },
        {
          "type": "null"
        }
      ]
    },
    "notes": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 500
        },
        {
          "type": "null"
        }
      ]
    },
    "label": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 60
        },
        {
          "type": "null"
        }
      ]
    },
    "latitude": {
      "anyOf": [
        {
          "type": "number",
          "minimum": -90,
          "maximum": 90
        },
        {
          "type": "null"
        }
      ]
    },
    "longitude": {
      "anyOf": [
        {
          "type": "number",
          "minimum": -180,
          "maximum": 180
        },
        {
          "type": "null"
        }
      ]
    }
  },
  "required": [
    "neighborhoodId",
    "street",
    "landmark"
  ],
  "additionalProperties": false
}
```

</details>

### customerAddressListSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "neighborhoodId": {
        "type": "string",
        "format": "uuid",
        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
      },
      "street": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "landmark": {
        "type": "string",
        "minLength": 1,
        "maxLength": 200
      },
      "building": {
        "anyOf": [
          {
            "type": "string",
            "minLength": 1,
            "maxLength": 100
          },
          {
            "type": "null"
          }
        ]
      },
      "floor": {
        "anyOf": [
          {
            "type": "string",
            "minLength": 1,
            "maxLength": 50
          },
          {
            "type": "null"
          }
        ]
      },
      "notes": {
        "anyOf": [
          {
            "type": "string",
            "minLength": 1,
            "maxLength": 500
          },
          {
            "type": "null"
          }
        ]
      },
      "label": {
        "anyOf": [
          {
            "type": "string",
            "minLength": 1,
            "maxLength": 60
          },
          {
            "type": "null"
          }
        ]
      },
      "latitude": {
        "anyOf": [
          {
            "type": "number",
            "minimum": -90,
            "maximum": 90
          },
          {
            "type": "null"
          }
        ]
      },
      "longitude": {
        "anyOf": [
          {
            "type": "number",
            "minimum": -180,
            "maximum": 180
          },
          {
            "type": "null"
          }
        ]
      },
      "id": {
        "type": "string",
        "format": "uuid",
        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
      },
      "isDefault": {
        "type": "boolean"
      }
    },
    "required": [
      "neighborhoodId",
      "street",
      "landmark",
      "building",
      "floor",
      "notes",
      "label",
      "latitude",
      "longitude",
      "id",
      "isDefault"
    ],
    "additionalProperties": false
  }
}
```

</details>

### customerAddressParamsSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "addressId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "addressId"
  ],
  "additionalProperties": false
}
```

</details>

### customerAddressSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "neighborhoodId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "street": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "landmark": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "building": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        },
        {
          "type": "null"
        }
      ]
    },
    "floor": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 50
        },
        {
          "type": "null"
        }
      ]
    },
    "notes": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 500
        },
        {
          "type": "null"
        }
      ]
    },
    "label": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 60
        },
        {
          "type": "null"
        }
      ]
    },
    "latitude": {
      "anyOf": [
        {
          "type": "number",
          "minimum": -90,
          "maximum": 90
        },
        {
          "type": "null"
        }
      ]
    },
    "longitude": {
      "anyOf": [
        {
          "type": "number",
          "minimum": -180,
          "maximum": 180
        },
        {
          "type": "null"
        }
      ]
    },
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "isDefault": {
      "type": "boolean"
    }
  },
  "required": [
    "neighborhoodId",
    "street",
    "landmark",
    "building",
    "floor",
    "notes",
    "label",
    "latitude",
    "longitude",
    "id",
    "isDefault"
  ],
  "additionalProperties": false
}
```

</details>

### customerAddressUpdateSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "neighborhoodId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "street": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "landmark": {
      "type": "string",
      "minLength": 1,
      "maxLength": 200
    },
    "building": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 100
        },
        {
          "type": "null"
        }
      ]
    },
    "floor": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 50
        },
        {
          "type": "null"
        }
      ]
    },
    "notes": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 500
        },
        {
          "type": "null"
        }
      ]
    },
    "label": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 60
        },
        {
          "type": "null"
        }
      ]
    },
    "latitude": {
      "anyOf": [
        {
          "type": "number",
          "minimum": -90,
          "maximum": 90
        },
        {
          "type": "null"
        }
      ]
    },
    "longitude": {
      "anyOf": [
        {
          "type": "number",
          "minimum": -180,
          "maximum": 180
        },
        {
          "type": "null"
        }
      ]
    }
  },
  "additionalProperties": false
}
```

</details>

### customerComplaintResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "complaint": {
      "anyOf": [
        {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "format": "uuid",
              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
            },
            "orderId": {
              "type": "string",
              "format": "uuid",
              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
            },
            "type": {
              "type": "string",
              "enum": [
                "NOT_RECEIVED",
                "OTHER"
              ]
            },
            "text": {
              "type": "string",
              "maxLength": 1000
            },
            "status": {
              "type": "string",
              "enum": [
                "OPEN",
                "IN_PROGRESS",
                "RESOLVED"
              ]
            },
            "createdAt": {
              "type": "string",
              "format": "date-time",
              "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
            },
            "updatedAt": {
              "type": "string",
              "format": "date-time",
              "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
            }
          },
          "required": [
            "id",
            "orderId",
            "type",
            "text",
            "status",
            "createdAt",
            "updatedAt"
          ],
          "additionalProperties": false
        },
        {
          "type": "null"
        }
      ]
    }
  },
  "required": [
    "complaint"
  ],
  "additionalProperties": false
}
```

</details>

### customerComplaintSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "orderId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "type": {
      "type": "string",
      "enum": [
        "NOT_RECEIVED",
        "OTHER"
      ]
    },
    "text": {
      "type": "string",
      "maxLength": 1000
    },
    "status": {
      "type": "string",
      "enum": [
        "OPEN",
        "IN_PROGRESS",
        "RESOLVED"
      ]
    },
    "createdAt": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
    },
    "updatedAt": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
    }
  },
  "required": [
    "id",
    "orderId",
    "type",
    "text",
    "status",
    "createdAt",
    "updatedAt"
  ],
  "additionalProperties": false
}
```

</details>

### customerOtpRequestSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "phone": {
      "type": "string"
    }
  },
  "required": [
    "phone"
  ]
}
```

</details>

### customerOtpVerifySchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "phone": {
      "type": "string"
    },
    "code": {
      "type": "string",
      "pattern": "^[0-9]{6}$"
    }
  },
  "required": [
    "phone",
    "code"
  ]
}
```

</details>

### customerProfileSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "name": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        },
        {
          "type": "null"
        }
      ]
    },
    "phone": {
      "type": [
        "string",
        "null"
      ]
    }
  },
  "required": [
    "id",
    "name",
    "phone"
  ]
}
```

</details>

### customerProfileUpdateSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120
    }
  },
  "required": [
    "name"
  ],
  "additionalProperties": false
}
```

</details>

### deliveryZoneParamsSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "zoneId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "zoneId"
  ],
  "additionalProperties": false
}
```

</details>

### deliveryZonePatchSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "feeMinor": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "etaMinutes": {
      "type": "integer",
      "minimum": 0,
      "maximum": 2147483647
    }
  },
  "additionalProperties": false
}
```

</details>

### deliveryZoneResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "neighborhoodId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "feeMinor": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "etaMinutes": {
      "type": "integer",
      "minimum": 0,
      "maximum": 2147483647
    },
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "neighborhoodId",
    "feeMinor",
    "etaMinutes",
    "id"
  ],
  "additionalProperties": false
}
```

</details>

### deliveryZonesResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "zones": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "neighborhoodId": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "feeMinor": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "etaMinutes": {
            "type": "integer",
            "minimum": 0,
            "maximum": 2147483647
          },
          "id": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          }
        },
        "required": [
          "neighborhoodId",
          "feeMinor",
          "etaMinutes",
          "id"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "zones"
  ]
}
```

</details>

### deliveryZonesSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "zones": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "neighborhoodId": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "feeMinor": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "etaMinutes": {
            "type": "integer",
            "minimum": 0,
            "maximum": 2147483647
          }
        },
        "required": [
          "neighborhoodId",
          "feeMinor",
          "etaMinutes"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "zones"
  ],
  "additionalProperties": false
}
```

</details>

### documentIdPathSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "documentId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "documentId"
  ]
}
```

</details>

### documentLinkSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "url": {
      "type": "string",
      "format": "starts_with",
      "pattern": "^\\/admin\\/.*"
    },
    "expiresAt": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
    }
  },
  "required": [
    "url",
    "expiresAt"
  ]
}
```

</details>

### errorEnvelopeSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "error": {
      "type": "object",
      "properties": {
        "code": {
          "type": "string",
          "enum": [
            "ACCOUNT_UNAVAILABLE",
            "ACTIVE_ORDERS",
            "BELOW_MINIMUM",
            "CONFLICT",
            "DATABASE_UNAVAILABLE",
            "FORBIDDEN",
            "INTERNAL_ERROR",
            "INVALID_CREDENTIALS",
            "INVALID_OTP",
            "INVALID_OPTIONS",
            "INVALID_REFRESH_TOKEN",
            "INVALID_TRANSITION",
            "ITEM_UNAVAILABLE",
            "NOT_FOUND",
            "OTP_UNAVAILABLE",
            "OUT_OF_ZONE",
            "PASSWORD_CHANGE_REQUIRED",
            "PRICE_CHANGED",
            "RATE_LIMITED",
            "RESTAURANT_CLOSED",
            "TOO_MANY_ACTIVE_ORDERS",
            "UNAUTHENTICATED",
            "VALIDATION_ERROR"
          ]
        },
        "message": {
          "type": "string"
        },
        "details": {
          "type": "object",
          "propertyNames": {
            "type": "string"
          },
          "additionalProperties": {}
        }
      },
      "required": [
        "code",
        "message",
        "details"
      ]
    }
  },
  "required": [
    "error"
  ]
}
```

</details>

### financeLedgerResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "restaurantId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "currencyDisplayMode": {
      "type": "string",
      "enum": [
        "OLD",
        "NEW"
      ]
    },
    "entries": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "restaurantId": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "orderId": {
            "anyOf": [
              {
                "type": "string",
                "format": "uuid",
                "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
              },
              {
                "type": "null"
              }
            ]
          },
          "type": {
            "type": "string",
            "enum": [
              "COMMISSION_ACCRUED",
              "PAYMENT_RECEIVED",
              "ADJUSTMENT"
            ]
          },
          "amountMinor": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991
          },
          "paymentDate": {
            "anyOf": [
              {
                "type": "string",
                "format": "date",
                "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
              },
              {
                "type": "null"
              }
            ]
          },
          "paymentMethod": {
            "type": [
              "string",
              "null"
            ]
          },
          "reference": {
            "type": [
              "string",
              "null"
            ]
          },
          "reason": {
            "type": [
              "string",
              "null"
            ]
          },
          "createdAt": {
            "type": "string",
            "format": "date-time",
            "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
          }
        },
        "required": [
          "id",
          "restaurantId",
          "orderId",
          "type",
          "amountMinor",
          "paymentDate",
          "paymentMethod",
          "reference",
          "reason",
          "createdAt"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "restaurantId",
    "currencyDisplayMode",
    "entries"
  ],
  "additionalProperties": false
}
```

</details>

### foodCategoriesResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "id": {
        "type": "string",
        "format": "uuid",
        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
      },
      "name": {
        "type": "string",
        "minLength": 1,
        "maxLength": 120
      },
      "icon": {
        "anyOf": [
          {
            "type": "string",
            "minLength": 1,
            "maxLength": 160
          },
          {
            "type": "null"
          }
        ]
      },
      "sortOrder": {
        "type": "integer",
        "minimum": 0,
        "maximum": 2147483647
      },
      "isActive": {
        "type": "boolean"
      }
    },
    "required": [
      "id",
      "name",
      "icon",
      "sortOrder",
      "isActive"
    ]
  }
}
```

</details>

### foodCategoryCreateSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120
    },
    "isActive": {
      "type": "boolean"
    },
    "icon": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 160
        },
        {
          "type": "null"
        }
      ]
    },
    "sortOrder": {
      "type": "integer",
      "minimum": 0,
      "maximum": 2147483647
    }
  },
  "required": [
    "name"
  ],
  "additionalProperties": false
}
```

</details>

### foodCategorySchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120
    },
    "icon": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 160
        },
        {
          "type": "null"
        }
      ]
    },
    "sortOrder": {
      "type": "integer",
      "minimum": 0,
      "maximum": 2147483647
    },
    "isActive": {
      "type": "boolean"
    }
  },
  "required": [
    "id",
    "name",
    "icon",
    "sortOrder",
    "isActive"
  ]
}
```

</details>

### foodCategoryUpdateSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120
    },
    "isActive": {
      "type": "boolean"
    },
    "icon": {
      "anyOf": [
        {
          "type": "string",
          "minLength": 1,
          "maxLength": 160
        },
        {
          "type": "null"
        }
      ]
    },
    "sortOrder": {
      "type": "integer",
      "minimum": 0,
      "maximum": 2147483647
    }
  },
  "additionalProperties": false
}
```

</details>

### geoIdParamsSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "id"
  ],
  "additionalProperties": false
}
```

</details>

### geoListQuerySchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

</details>

### governorateCreateSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120
    },
    "isActive": {
      "type": "boolean"
    }
  },
  "required": [
    "name"
  ],
  "additionalProperties": false
}
```

</details>

### governorateSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120
    },
    "isActive": {
      "type": "boolean"
    }
  },
  "required": [
    "id",
    "name",
    "isActive"
  ]
}
```

</details>

### governorateUpdateSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120
    },
    "isActive": {
      "type": "boolean"
    }
  },
  "additionalProperties": false
}
```

</details>

### governoratesResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "id": {
        "type": "string",
        "format": "uuid",
        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
      },
      "name": {
        "type": "string",
        "minLength": 1,
        "maxLength": 120
      },
      "isActive": {
        "type": "boolean"
      }
    },
    "required": [
      "id",
      "name",
      "isActive"
    ]
  }
}
```

</details>

### healthResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "const": "ok"
    }
  },
  "required": [
    "status"
  ]
}
```

</details>

### ledgerEntrySchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "restaurantId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "orderId": {
      "anyOf": [
        {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        },
        {
          "type": "null"
        }
      ]
    },
    "type": {
      "type": "string",
      "enum": [
        "COMMISSION_ACCRUED",
        "PAYMENT_RECEIVED",
        "ADJUSTMENT"
      ]
    },
    "amountMinor": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991
    },
    "paymentDate": {
      "anyOf": [
        {
          "type": "string",
          "format": "date",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
        },
        {
          "type": "null"
        }
      ]
    },
    "paymentMethod": {
      "type": [
        "string",
        "null"
      ]
    },
    "reference": {
      "type": [
        "string",
        "null"
      ]
    },
    "reason": {
      "type": [
        "string",
        "null"
      ]
    },
    "createdAt": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
    }
  },
  "required": [
    "id",
    "restaurantId",
    "orderId",
    "type",
    "amountMinor",
    "paymentDate",
    "paymentMethod",
    "reference",
    "reason",
    "createdAt"
  ],
  "additionalProperties": false
}
```

</details>

### menuAvailabilityResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "isAvailable": {
      "type": "boolean"
    },
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "isAvailable",
    "id"
  ],
  "additionalProperties": false
}
```

</details>

### menuAvailabilitySchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "isAvailable": {
      "type": "boolean"
    }
  },
  "required": [
    "isAvailable"
  ],
  "additionalProperties": false
}
```

</details>

### menuDuplicateResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "name": {
      "type": "string"
    },
    "isAvailable": {
      "type": "boolean"
    }
  },
  "required": [
    "id",
    "name",
    "isAvailable"
  ],
  "additionalProperties": false
}
```

</details>

### menuItemMetadataResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "sectionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "name": {
      "type": "string"
    },
    "description": {
      "type": [
        "string",
        "null"
      ]
    },
    "imageKey": {
      "type": [
        "string",
        "null"
      ]
    },
    "isAvailable": {
      "type": "boolean"
    },
    "sortOrder": {
      "type": "integer",
      "minimum": -2147483648,
      "maximum": 2147483647
    },
    "availableFrom": {
      "anyOf": [
        {
          "type": "string",
          "pattern": "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"
        },
        {
          "type": "null"
        }
      ]
    },
    "availableTo": {
      "anyOf": [
        {
          "type": "string",
          "pattern": "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"
        },
        {
          "type": "null"
        }
      ]
    }
  },
  "required": [
    "id",
    "sectionId",
    "name",
    "description",
    "imageKey",
    "isAvailable",
    "sortOrder",
    "availableFrom",
    "availableTo"
  ],
  "additionalProperties": false
}
```

</details>

### menuItemPathSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "itemId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "itemId"
  ],
  "additionalProperties": false
}
```

</details>

### menuItemResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "sectionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "name": {
      "type": "string"
    },
    "description": {
      "type": [
        "string",
        "null"
      ]
    },
    "imageKey": {
      "type": [
        "string",
        "null"
      ]
    },
    "isAvailable": {
      "type": "boolean"
    },
    "sortOrder": {
      "type": "integer",
      "minimum": -2147483648,
      "maximum": 2147483647
    },
    "availableFrom": {
      "anyOf": [
        {
          "type": "string",
          "pattern": "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"
        },
        {
          "type": "null"
        }
      ]
    },
    "availableTo": {
      "anyOf": [
        {
          "type": "string",
          "pattern": "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"
        },
        {
          "type": "null"
        }
      ]
    },
    "sizes": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "menuItemId": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "name": {
            "type": "string"
          },
          "priceMinor": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "sortOrder": {
            "type": "integer",
            "minimum": -2147483648,
            "maximum": 2147483647
          }
        },
        "required": [
          "id",
          "menuItemId",
          "name",
          "priceMinor",
          "sortOrder"
        ],
        "additionalProperties": false
      }
    },
    "optionGroups": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "menuItemId": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "name": {
            "type": "string"
          },
          "minSelect": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "maxSelect": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "sortOrder": {
            "type": "integer",
            "minimum": -2147483648,
            "maximum": 2147483647
          },
          "options": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                "optionGroupId": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                "name": {
                  "type": "string"
                },
                "priceMinor": {
                  "type": "integer",
                  "minimum": 0,
                  "maximum": 9007199254740991
                },
                "isAvailable": {
                  "type": "boolean"
                },
                "sortOrder": {
                  "type": "integer",
                  "minimum": -2147483648,
                  "maximum": 2147483647
                }
              },
              "required": [
                "id",
                "optionGroupId",
                "name",
                "priceMinor",
                "isAvailable",
                "sortOrder"
              ],
              "additionalProperties": false
            }
          }
        },
        "required": [
          "id",
          "menuItemId",
          "name",
          "minSelect",
          "maxSelect",
          "sortOrder",
          "options"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "id",
    "sectionId",
    "name",
    "description",
    "imageKey",
    "isAvailable",
    "sortOrder",
    "availableFrom",
    "availableTo",
    "sizes",
    "optionGroups"
  ],
  "additionalProperties": false
}
```

</details>

### menuItemsResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "sectionId": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "name": {
            "type": "string"
          },
          "description": {
            "type": [
              "string",
              "null"
            ]
          },
          "imageKey": {
            "type": [
              "string",
              "null"
            ]
          },
          "isAvailable": {
            "type": "boolean"
          },
          "sortOrder": {
            "type": "integer",
            "minimum": -2147483648,
            "maximum": 2147483647
          },
          "availableFrom": {
            "anyOf": [
              {
                "type": "string",
                "pattern": "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"
              },
              {
                "type": "null"
              }
            ]
          },
          "availableTo": {
            "anyOf": [
              {
                "type": "string",
                "pattern": "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"
              },
              {
                "type": "null"
              }
            ]
          },
          "sizes": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                "menuItemId": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                "name": {
                  "type": "string"
                },
                "priceMinor": {
                  "type": "integer",
                  "minimum": 0,
                  "maximum": 9007199254740991
                },
                "sortOrder": {
                  "type": "integer",
                  "minimum": -2147483648,
                  "maximum": 2147483647
                }
              },
              "required": [
                "id",
                "menuItemId",
                "name",
                "priceMinor",
                "sortOrder"
              ],
              "additionalProperties": false
            }
          },
          "optionGroups": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                "menuItemId": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                "name": {
                  "type": "string"
                },
                "minSelect": {
                  "type": "integer",
                  "minimum": 0,
                  "maximum": 9007199254740991
                },
                "maxSelect": {
                  "type": "integer",
                  "minimum": 0,
                  "maximum": 9007199254740991
                },
                "sortOrder": {
                  "type": "integer",
                  "minimum": -2147483648,
                  "maximum": 2147483647
                },
                "options": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "id": {
                        "type": "string",
                        "format": "uuid",
                        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                      },
                      "optionGroupId": {
                        "type": "string",
                        "format": "uuid",
                        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                      },
                      "name": {
                        "type": "string"
                      },
                      "priceMinor": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 9007199254740991
                      },
                      "isAvailable": {
                        "type": "boolean"
                      },
                      "sortOrder": {
                        "type": "integer",
                        "minimum": -2147483648,
                        "maximum": 2147483647
                      }
                    },
                    "required": [
                      "id",
                      "optionGroupId",
                      "name",
                      "priceMinor",
                      "isAvailable",
                      "sortOrder"
                    ],
                    "additionalProperties": false
                  }
                }
              },
              "required": [
                "id",
                "menuItemId",
                "name",
                "minSelect",
                "maxSelect",
                "sortOrder",
                "options"
              ],
              "additionalProperties": false
            }
          }
        },
        "required": [
          "id",
          "sectionId",
          "name",
          "description",
          "imageKey",
          "isAvailable",
          "sortOrder",
          "availableFrom",
          "availableTo",
          "sizes",
          "optionGroups"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "items"
  ]
}
```

</details>

### menuOptionGroupParamsSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "groupId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "groupId"
  ],
  "additionalProperties": false
}
```

</details>

### menuOptionGroupResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "menuItemId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "name": {
      "type": "string"
    },
    "minSelect": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "maxSelect": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "sortOrder": {
      "type": "integer",
      "minimum": -2147483648,
      "maximum": 2147483647
    },
    "options": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "optionGroupId": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "name": {
            "type": "string"
          },
          "priceMinor": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "isAvailable": {
            "type": "boolean"
          },
          "sortOrder": {
            "type": "integer",
            "minimum": -2147483648,
            "maximum": 2147483647
          }
        },
        "required": [
          "id",
          "optionGroupId",
          "name",
          "priceMinor",
          "isAvailable",
          "sortOrder"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "id",
    "menuItemId",
    "name",
    "minSelect",
    "maxSelect",
    "sortOrder",
    "options"
  ],
  "additionalProperties": false
}
```

</details>

### menuOptionGroupsResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "groups": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "menuItemId": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "name": {
            "type": "string"
          },
          "minSelect": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "maxSelect": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "sortOrder": {
            "type": "integer",
            "minimum": -2147483648,
            "maximum": 2147483647
          },
          "options": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                "optionGroupId": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                "name": {
                  "type": "string"
                },
                "priceMinor": {
                  "type": "integer",
                  "minimum": 0,
                  "maximum": 9007199254740991
                },
                "isAvailable": {
                  "type": "boolean"
                },
                "sortOrder": {
                  "type": "integer",
                  "minimum": -2147483648,
                  "maximum": 2147483647
                }
              },
              "required": [
                "id",
                "optionGroupId",
                "name",
                "priceMinor",
                "isAvailable",
                "sortOrder"
              ],
              "additionalProperties": false
            }
          }
        },
        "required": [
          "id",
          "menuItemId",
          "name",
          "minSelect",
          "maxSelect",
          "sortOrder",
          "options"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "groups"
  ]
}
```

</details>

### menuOptionParamsSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "optionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "optionId"
  ],
  "additionalProperties": false
}
```

</details>

### menuOptionResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "optionGroupId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "name": {
      "type": "string"
    },
    "priceMinor": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "isAvailable": {
      "type": "boolean"
    },
    "sortOrder": {
      "type": "integer",
      "minimum": -2147483648,
      "maximum": 2147483647
    }
  },
  "required": [
    "id",
    "optionGroupId",
    "name",
    "priceMinor",
    "isAvailable",
    "sortOrder"
  ],
  "additionalProperties": false
}
```

</details>

### menuOptionsResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "options": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "optionGroupId": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "name": {
            "type": "string"
          },
          "priceMinor": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "isAvailable": {
            "type": "boolean"
          },
          "sortOrder": {
            "type": "integer",
            "minimum": -2147483648,
            "maximum": 2147483647
          }
        },
        "required": [
          "id",
          "optionGroupId",
          "name",
          "priceMinor",
          "isAvailable",
          "sortOrder"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "options"
  ]
}
```

</details>

### menuSectionPathSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "sectionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "sectionId"
  ],
  "additionalProperties": false
}
```

</details>

### menuSectionResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "name": {
      "type": "string"
    },
    "sortOrder": {
      "type": "integer",
      "minimum": -2147483648,
      "maximum": 2147483647
    }
  },
  "required": [
    "id",
    "name",
    "sortOrder"
  ],
  "additionalProperties": false
}
```

</details>

### menuSectionsResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "sections": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "name": {
            "type": "string"
          },
          "sortOrder": {
            "type": "integer",
            "minimum": -2147483648,
            "maximum": 2147483647
          }
        },
        "required": [
          "id",
          "name",
          "sortOrder"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "sections"
  ]
}
```

</details>

### menuSizePathSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "sizeId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "sizeId"
  ],
  "additionalProperties": false
}
```

</details>

### menuSizeResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "menuItemId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "name": {
      "type": "string"
    },
    "priceMinor": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "sortOrder": {
      "type": "integer",
      "minimum": -2147483648,
      "maximum": 2147483647
    }
  },
  "required": [
    "id",
    "menuItemId",
    "name",
    "priceMinor",
    "sortOrder"
  ],
  "additionalProperties": false
}
```

</details>

### menuSizesResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "sizes": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "menuItemId": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "name": {
            "type": "string"
          },
          "priceMinor": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "sortOrder": {
            "type": "integer",
            "minimum": -2147483648,
            "maximum": 2147483647
          }
        },
        "required": [
          "id",
          "menuItemId",
          "name",
          "priceMinor",
          "sortOrder"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "sizes"
  ]
}
```

</details>

### neighborhoodCreateSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120
    },
    "isActive": {
      "type": "boolean"
    },
    "cityId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "name",
    "cityId"
  ],
  "additionalProperties": false
}
```

</details>

### neighborhoodListQuerySchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "cityId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "additionalProperties": false
}
```

</details>

### neighborhoodSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120
    },
    "isActive": {
      "type": "boolean"
    },
    "cityId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "id",
    "name",
    "isActive",
    "cityId"
  ]
}
```

</details>

### neighborhoodUpdateSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 120
    },
    "isActive": {
      "type": "boolean"
    },
    "cityId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "additionalProperties": false
}
```

</details>

### neighborhoodsResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "id": {
        "type": "string",
        "format": "uuid",
        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
      },
      "name": {
        "type": "string",
        "minLength": 1,
        "maxLength": 120
      },
      "isActive": {
        "type": "boolean"
      },
      "cityId": {
        "type": "string",
        "format": "uuid",
        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
      }
    },
    "required": [
      "id",
      "name",
      "isActive",
      "cityId"
    ]
  }
}
```

</details>

### openingPeriodsSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "periods": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "dayOfWeek": {
            "type": "integer",
            "minimum": 0,
            "maximum": 6
          },
          "opensAt": {
            "type": "string",
            "pattern": "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"
          },
          "closesAt": {
            "type": "string",
            "pattern": "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"
          }
        },
        "required": [
          "dayOfWeek",
          "opensAt",
          "closesAt"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "periods"
  ],
  "additionalProperties": false
}
```

</details>

### orderCancellationSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "reasonCode": {
      "type": "string",
      "enum": [
        "TOO_BUSY",
        "ITEM_UNAVAILABLE",
        "CLOSING_SOON",
        "OUT_OF_ZONE",
        "OTHER",
        "CUSTOMER_REQUEST",
        "NO_DRIVER",
        "DUPLICATE",
        "SUSPECTED_FAKE",
        "CUSTOMER_UNREACHABLE",
        "WRONG_ADDRESS",
        "CUSTOMER_REFUSED"
      ]
    },
    "note": {
      "type": "string"
    }
  },
  "additionalProperties": false
}
```

</details>

### orderCreateSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "oneOf": [
    {
      "type": "object",
      "properties": {
        "branchId": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        },
        "items": {
          "minItems": 1,
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "menuItemId": {
                "type": "string",
                "format": "uuid",
                "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
              },
              "sizeId": {
                "type": "string",
                "format": "uuid",
                "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
              },
              "optionIds": {
                "type": "array",
                "items": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                }
              },
              "quantity": {
                "type": "integer",
                "minimum": 1,
                "maximum": 50
              },
              "note": {
                "anyOf": [
                  {
                    "type": "string",
                    "maxLength": 200
                  },
                  {
                    "type": "null"
                  }
                ]
              }
            },
            "required": [
              "menuItemId",
              "sizeId",
              "optionIds",
              "quantity"
            ]
          }
        },
        "note": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 300
            },
            {
              "type": "null"
            }
          ]
        },
        "expectedTotalMinor": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991
        },
        "type": {
          "type": "string",
          "const": "DELIVERY"
        },
        "addressId": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        }
      },
      "required": [
        "branchId",
        "items",
        "expectedTotalMinor",
        "type",
        "addressId"
      ]
    },
    {
      "type": "object",
      "properties": {
        "branchId": {
          "type": "string",
          "format": "uuid",
          "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
        },
        "items": {
          "minItems": 1,
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "menuItemId": {
                "type": "string",
                "format": "uuid",
                "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
              },
              "sizeId": {
                "type": "string",
                "format": "uuid",
                "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
              },
              "optionIds": {
                "type": "array",
                "items": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                }
              },
              "quantity": {
                "type": "integer",
                "minimum": 1,
                "maximum": 50
              },
              "note": {
                "anyOf": [
                  {
                    "type": "string",
                    "maxLength": 200
                  },
                  {
                    "type": "null"
                  }
                ]
              }
            },
            "required": [
              "menuItemId",
              "sizeId",
              "optionIds",
              "quantity"
            ]
          }
        },
        "note": {
          "anyOf": [
            {
              "type": "string",
              "maxLength": 300
            },
            {
              "type": "null"
            }
          ]
        },
        "expectedTotalMinor": {
          "type": "integer",
          "minimum": 0,
          "maximum": 9007199254740991
        },
        "type": {
          "type": "string",
          "const": "PICKUP"
        }
      },
      "required": [
        "branchId",
        "items",
        "expectedTotalMinor",
        "type"
      ]
    }
  ]
}
```

</details>

### orderIdempotencyKeySchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "string",
  "format": "uuid",
  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
}
```

</details>

### orderListResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "orders": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "branchId": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "restaurantId": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "restaurantName": {
            "type": [
              "string",
              "null"
            ]
          },
          "restaurantPhone": {
            "type": [
              "string",
              "null"
            ]
          },
          "orderNumber": {
            "type": "string"
          },
          "type": {
            "type": "string",
            "enum": [
              "DELIVERY",
              "PICKUP"
            ]
          },
          "status": {
            "type": "string",
            "enum": [
              "PENDING",
              "ACCEPTED",
              "PREPARING",
              "READY",
              "OUT_FOR_DELIVERY",
              "DELIVERED",
              "REJECTED",
              "EXPIRED",
              "CANCELLED",
              "DELIVERY_FAILED"
            ]
          },
          "customerId": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "customerName": {
            "type": [
              "string",
              "null"
            ]
          },
          "customerPhone": {
            "type": [
              "string",
              "null"
            ]
          },
          "addressSnapshot": {
            "anyOf": [
              {
                "type": "object",
                "propertyNames": {
                  "type": "string"
                },
                "additionalProperties": {}
              },
              {
                "type": "null"
              }
            ]
          },
          "note": {
            "type": [
              "string",
              "null"
            ]
          },
          "createdAt": {
            "type": "string",
            "format": "date-time",
            "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
          },
          "acceptedAt": {
            "anyOf": [
              {
                "type": "string",
                "format": "date-time",
                "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
              },
              {
                "type": "null"
              }
            ]
          },
          "finishedAt": {
            "anyOf": [
              {
                "type": "string",
                "format": "date-time",
                "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
              },
              {
                "type": "null"
              }
            ]
          },
          "estimatedReadyAt": {
            "anyOf": [
              {
                "type": "string",
                "format": "date-time",
                "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
              },
              {
                "type": "null"
              }
            ]
          },
          "estimatedDeliveryAt": {
            "anyOf": [
              {
                "type": "string",
                "format": "date-time",
                "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
              },
              {
                "type": "null"
              }
            ]
          },
          "serverTime": {
            "type": "string",
            "format": "date-time",
            "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
          },
          "pendingExpiresAt": {
            "anyOf": [
              {
                "type": "string",
                "format": "date-time",
                "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
              },
              {
                "type": "null"
              }
            ]
          },
          "currencyDisplayMode": {
            "type": "string",
            "enum": [
              "OLD",
              "NEW"
            ]
          },
          "prepMinutes": {
            "anyOf": [
              {
                "type": "integer",
                "minimum": -9007199254740991,
                "maximum": 9007199254740991
              },
              {
                "type": "null"
              }
            ]
          },
          "etaMinutes": {
            "anyOf": [
              {
                "type": "integer",
                "minimum": -9007199254740991,
                "maximum": 9007199254740991
              },
              {
                "type": "null"
              }
            ]
          },
          "needsAttention": {
            "type": "boolean"
          },
          "foodSubtotalMinor": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "discountMinor": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "deliveryFeeMinor": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "totalMinor": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "commissionMinor": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "commissionRateBps": {
            "type": "integer",
            "minimum": 0,
            "maximum": 10000
          },
          "items": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                "name": {
                  "type": "string"
                },
                "sizeName": {
                  "type": "string"
                },
                "quantity": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 50
                },
                "note": {
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "unitPriceMinor": {
                  "type": "integer",
                  "minimum": 0,
                  "maximum": 9007199254740991
                },
                "totalMinor": {
                  "type": "integer",
                  "minimum": 0,
                  "maximum": 9007199254740991
                },
                "options": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "id": {
                        "type": "string",
                        "format": "uuid",
                        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                      },
                      "name": {
                        "type": "string"
                      },
                      "priceMinor": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 9007199254740991
                      }
                    },
                    "required": [
                      "id",
                      "name"
                    ],
                    "additionalProperties": false
                  }
                }
              },
              "required": [
                "id",
                "name",
                "sizeName",
                "quantity",
                "note",
                "options"
              ],
              "additionalProperties": false
            }
          },
          "events": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                "from": {
                  "anyOf": [
                    {
                      "type": "string",
                      "enum": [
                        "PENDING",
                        "ACCEPTED",
                        "PREPARING",
                        "READY",
                        "OUT_FOR_DELIVERY",
                        "DELIVERED",
                        "REJECTED",
                        "EXPIRED",
                        "CANCELLED",
                        "DELIVERY_FAILED"
                      ]
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "to": {
                  "type": "string",
                  "enum": [
                    "PENDING",
                    "ACCEPTED",
                    "PREPARING",
                    "READY",
                    "OUT_FOR_DELIVERY",
                    "DELIVERED",
                    "REJECTED",
                    "EXPIRED",
                    "CANCELLED",
                    "DELIVERY_FAILED"
                  ]
                },
                "actorType": {
                  "type": "string",
                  "enum": [
                    "CUSTOMER",
                    "RESTAURANT",
                    "ADMIN",
                    "SYSTEM"
                  ]
                },
                "actorId": {
                  "anyOf": [
                    {
                      "type": "string",
                      "format": "uuid",
                      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "reasonCode": {
                  "anyOf": [
                    {
                      "type": "string",
                      "enum": [
                        "TOO_BUSY",
                        "ITEM_UNAVAILABLE",
                        "CLOSING_SOON",
                        "OUT_OF_ZONE",
                        "OTHER",
                        "CUSTOMER_REQUEST",
                        "NO_DRIVER",
                        "DUPLICATE",
                        "SUSPECTED_FAKE",
                        "CUSTOMER_UNREACHABLE",
                        "WRONG_ADDRESS",
                        "CUSTOMER_REFUSED"
                      ]
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "note": {
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "createdAt": {
                  "type": "string",
                  "format": "date-time",
                  "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
                }
              },
              "required": [
                "id",
                "from",
                "to",
                "actorType",
                "reasonCode",
                "note",
                "createdAt"
              ],
              "additionalProperties": false
            }
          }
        },
        "required": [
          "id",
          "branchId",
          "restaurantId",
          "restaurantName",
          "orderNumber",
          "type",
          "status",
          "customerName",
          "note",
          "createdAt",
          "acceptedAt",
          "finishedAt",
          "estimatedReadyAt",
          "estimatedDeliveryAt",
          "prepMinutes",
          "etaMinutes",
          "items",
          "events"
        ],
        "additionalProperties": false
      }
    },
    "currencyDisplayMode": {
      "type": "string",
      "enum": [
        "OLD",
        "NEW"
      ]
    }
  },
  "required": [
    "orders"
  ],
  "additionalProperties": false
}
```

</details>

### orderReadSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "branchId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "restaurantId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "restaurantName": {
      "type": [
        "string",
        "null"
      ]
    },
    "restaurantPhone": {
      "type": [
        "string",
        "null"
      ]
    },
    "orderNumber": {
      "type": "string"
    },
    "type": {
      "type": "string",
      "enum": [
        "DELIVERY",
        "PICKUP"
      ]
    },
    "status": {
      "type": "string",
      "enum": [
        "PENDING",
        "ACCEPTED",
        "PREPARING",
        "READY",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "REJECTED",
        "EXPIRED",
        "CANCELLED",
        "DELIVERY_FAILED"
      ]
    },
    "customerId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "customerName": {
      "type": [
        "string",
        "null"
      ]
    },
    "customerPhone": {
      "type": [
        "string",
        "null"
      ]
    },
    "addressSnapshot": {
      "anyOf": [
        {
          "type": "object",
          "propertyNames": {
            "type": "string"
          },
          "additionalProperties": {}
        },
        {
          "type": "null"
        }
      ]
    },
    "note": {
      "type": [
        "string",
        "null"
      ]
    },
    "createdAt": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
    },
    "acceptedAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
        },
        {
          "type": "null"
        }
      ]
    },
    "finishedAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
        },
        {
          "type": "null"
        }
      ]
    },
    "estimatedReadyAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
        },
        {
          "type": "null"
        }
      ]
    },
    "estimatedDeliveryAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
        },
        {
          "type": "null"
        }
      ]
    },
    "serverTime": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
    },
    "pendingExpiresAt": {
      "anyOf": [
        {
          "type": "string",
          "format": "date-time",
          "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
        },
        {
          "type": "null"
        }
      ]
    },
    "currencyDisplayMode": {
      "type": "string",
      "enum": [
        "OLD",
        "NEW"
      ]
    },
    "prepMinutes": {
      "anyOf": [
        {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        },
        {
          "type": "null"
        }
      ]
    },
    "etaMinutes": {
      "anyOf": [
        {
          "type": "integer",
          "minimum": -9007199254740991,
          "maximum": 9007199254740991
        },
        {
          "type": "null"
        }
      ]
    },
    "needsAttention": {
      "type": "boolean"
    },
    "foodSubtotalMinor": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "discountMinor": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "deliveryFeeMinor": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "totalMinor": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "commissionMinor": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "commissionRateBps": {
      "type": "integer",
      "minimum": 0,
      "maximum": 10000
    },
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "name": {
            "type": "string"
          },
          "sizeName": {
            "type": "string"
          },
          "quantity": {
            "type": "integer",
            "minimum": 1,
            "maximum": 50
          },
          "note": {
            "type": [
              "string",
              "null"
            ]
          },
          "unitPriceMinor": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "totalMinor": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "options": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                "name": {
                  "type": "string"
                },
                "priceMinor": {
                  "type": "integer",
                  "minimum": 0,
                  "maximum": 9007199254740991
                }
              },
              "required": [
                "id",
                "name"
              ],
              "additionalProperties": false
            }
          }
        },
        "required": [
          "id",
          "name",
          "sizeName",
          "quantity",
          "note",
          "options"
        ],
        "additionalProperties": false
      }
    },
    "events": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "from": {
            "anyOf": [
              {
                "type": "string",
                "enum": [
                  "PENDING",
                  "ACCEPTED",
                  "PREPARING",
                  "READY",
                  "OUT_FOR_DELIVERY",
                  "DELIVERED",
                  "REJECTED",
                  "EXPIRED",
                  "CANCELLED",
                  "DELIVERY_FAILED"
                ]
              },
              {
                "type": "null"
              }
            ]
          },
          "to": {
            "type": "string",
            "enum": [
              "PENDING",
              "ACCEPTED",
              "PREPARING",
              "READY",
              "OUT_FOR_DELIVERY",
              "DELIVERED",
              "REJECTED",
              "EXPIRED",
              "CANCELLED",
              "DELIVERY_FAILED"
            ]
          },
          "actorType": {
            "type": "string",
            "enum": [
              "CUSTOMER",
              "RESTAURANT",
              "ADMIN",
              "SYSTEM"
            ]
          },
          "actorId": {
            "anyOf": [
              {
                "type": "string",
                "format": "uuid",
                "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
              },
              {
                "type": "null"
              }
            ]
          },
          "reasonCode": {
            "anyOf": [
              {
                "type": "string",
                "enum": [
                  "TOO_BUSY",
                  "ITEM_UNAVAILABLE",
                  "CLOSING_SOON",
                  "OUT_OF_ZONE",
                  "OTHER",
                  "CUSTOMER_REQUEST",
                  "NO_DRIVER",
                  "DUPLICATE",
                  "SUSPECTED_FAKE",
                  "CUSTOMER_UNREACHABLE",
                  "WRONG_ADDRESS",
                  "CUSTOMER_REFUSED"
                ]
              },
              {
                "type": "null"
              }
            ]
          },
          "note": {
            "type": [
              "string",
              "null"
            ]
          },
          "createdAt": {
            "type": "string",
            "format": "date-time",
            "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
          }
        },
        "required": [
          "id",
          "from",
          "to",
          "actorType",
          "reasonCode",
          "note",
          "createdAt"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "id",
    "branchId",
    "restaurantId",
    "restaurantName",
    "orderNumber",
    "type",
    "status",
    "customerName",
    "note",
    "createdAt",
    "acceptedAt",
    "finishedAt",
    "estimatedReadyAt",
    "estimatedDeliveryAt",
    "prepMinutes",
    "etaMinutes",
    "items",
    "events"
  ],
  "additionalProperties": false
}
```

</details>

### patchMenuItemSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "sectionId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "name": {
      "type": "string",
      "minLength": 1
    },
    "description": {
      "type": [
        "string",
        "null"
      ]
    },
    "isAvailable": {
      "type": "boolean"
    },
    "sortOrder": {
      "type": "integer",
      "minimum": -2147483648,
      "maximum": 2147483647
    },
    "availableFrom": {
      "anyOf": [
        {
          "type": "string",
          "pattern": "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"
        },
        {
          "type": "null"
        }
      ]
    },
    "availableTo": {
      "anyOf": [
        {
          "type": "string",
          "pattern": "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"
        },
        {
          "type": "null"
        }
      ]
    }
  },
  "additionalProperties": false
}
```

</details>

### patchMenuOptionGroupSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1
    },
    "minSelect": {
      "type": "integer",
      "minimum": 0,
      "maximum": 2147483647
    },
    "maxSelect": {
      "type": "integer",
      "minimum": 0,
      "maximum": 2147483647
    },
    "sortOrder": {
      "type": "integer",
      "minimum": -2147483648,
      "maximum": 2147483647
    }
  },
  "additionalProperties": false
}
```

</details>

### patchMenuOptionSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1
    },
    "priceMinor": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "isAvailable": {
      "type": "boolean"
    },
    "sortOrder": {
      "type": "integer",
      "minimum": -2147483648,
      "maximum": 2147483647
    }
  },
  "additionalProperties": false
}
```

</details>

### patchMenuSectionSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1
    },
    "sortOrder": {
      "type": "integer",
      "minimum": -2147483648,
      "maximum": 2147483647
    }
  },
  "additionalProperties": false
}
```

</details>

### patchMenuSizeSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1
    },
    "priceMinor": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "sortOrder": {
      "type": "integer",
      "minimum": -2147483648,
      "maximum": 2147483647
    }
  },
  "additionalProperties": false
}
```

</details>

### priceChangedDetailsSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "foodSubtotalMinor": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "discountMinor": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "deliveryFeeMinor": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "totalMinor": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "menuItemId": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "sizeId": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "quantity": {
            "type": "integer",
            "minimum": 1,
            "maximum": 50
          },
          "unitPriceMinor": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "totalMinor": {
            "type": "integer",
            "minimum": 0,
            "maximum": 9007199254740991
          },
          "optionIds": {
            "type": "array",
            "items": {
              "type": "string",
              "format": "uuid",
              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
            }
          }
        },
        "required": [
          "menuItemId",
          "sizeId",
          "quantity",
          "unitPriceMinor",
          "totalMinor",
          "optionIds"
        ]
      }
    }
  },
  "required": [
    "foodSubtotalMinor",
    "discountMinor",
    "deliveryFeeMinor",
    "totalMinor",
    "items"
  ]
}
```

</details>

### publicFoodCategoriesSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "id": {
        "type": "string",
        "format": "uuid",
        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
      },
      "name": {
        "type": "string",
        "minLength": 1,
        "maxLength": 120
      },
      "icon": {
        "anyOf": [
          {
            "type": "string",
            "minLength": 1,
            "maxLength": 160
          },
          {
            "type": "null"
          }
        ]
      },
      "sortOrder": {
        "type": "integer",
        "minimum": 0,
        "maximum": 2147483647
      }
    },
    "required": [
      "id",
      "name",
      "icon",
      "sortOrder"
    ]
  }
}
```

</details>

### publicGeoSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "id": {
        "type": "string",
        "format": "uuid",
        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
      },
      "name": {
        "type": "string",
        "minLength": 1,
        "maxLength": 120
      },
      "cities": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "format": "uuid",
              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
            },
            "name": {
              "type": "string",
              "minLength": 1,
              "maxLength": 120
            },
            "neighborhoods": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "id": {
                    "type": "string",
                    "format": "uuid",
                    "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                  },
                  "name": {
                    "type": "string",
                    "minLength": 1,
                    "maxLength": 120
                  }
                },
                "required": [
                  "id",
                  "name"
                ]
              }
            }
          },
          "required": [
            "id",
            "name",
            "neighborhoods"
          ]
        }
      }
    },
    "required": [
      "id",
      "name",
      "cities"
    ]
  }
}
```

</details>

### publicImagePathSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "restaurantId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "assetId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "width": {
      "type": "string",
      "enum": [
        "320",
        "640"
      ]
    }
  },
  "required": [
    "restaurantId",
    "assetId",
    "width"
  ]
}
```

</details>

### publicRestaurantDetailParamsSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "id"
  ],
  "additionalProperties": false
}
```

</details>

### publicRestaurantDetailQuerySchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "neighborhoodId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "neighborhoodId"
  ],
  "additionalProperties": false
}
```

</details>

### publicRestaurantDetailResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "branchId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "name": {
      "type": [
        "string",
        "null"
      ]
    },
    "logoKey": {
      "type": [
        "string",
        "null"
      ]
    },
    "coverImageKey": {
      "type": [
        "string",
        "null"
      ]
    },
    "contactPhone": {
      "type": [
        "string",
        "null"
      ]
    },
    "categories": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "name": {
            "type": "string"
          },
          "icon": {
            "type": [
              "string",
              "null"
            ]
          },
          "sortOrder": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991
          }
        },
        "required": [
          "id",
          "name",
          "icon",
          "sortOrder"
        ],
        "additionalProperties": false
      }
    },
    "isOrderable": {
      "type": "boolean"
    },
    "reason": {
      "anyOf": [
        {
          "type": "string",
          "enum": [
            "UNAPPROVED",
            "PAUSED",
            "CLOSED",
            "OFFLINE",
            "OUT_OF_ZONE",
            "PICKUP_DISABLED",
            "NO_AVAILABLE_ITEMS"
          ]
        },
        {
          "type": "null"
        }
      ]
    },
    "deliveryFeeMinor": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "minOrderMinor": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "etaMinutes": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "pickupEnabled": {
      "type": "boolean"
    },
    "currencyDisplayMode": {
      "type": "string",
      "enum": [
        "OLD",
        "NEW"
      ]
    },
    "sections": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "name": {
            "type": "string"
          },
          "sortOrder": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991
          },
          "items": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                "name": {
                  "type": "string"
                },
                "description": {
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "imageKey": {
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "isAvailable": {
                  "type": "boolean"
                },
                "sortOrder": {
                  "type": "integer",
                  "minimum": -9007199254740991,
                  "maximum": 9007199254740991
                },
                "availableFrom": {
                  "anyOf": [
                    {
                      "type": "string",
                      "pattern": "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "availableTo": {
                  "anyOf": [
                    {
                      "type": "string",
                      "pattern": "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "sizes": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "id": {
                        "type": "string",
                        "format": "uuid",
                        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                      },
                      "name": {
                        "type": "string"
                      },
                      "priceMinor": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 9007199254740991
                      },
                      "sortOrder": {
                        "type": "integer",
                        "minimum": -9007199254740991,
                        "maximum": 9007199254740991
                      }
                    },
                    "required": [
                      "id",
                      "name",
                      "priceMinor",
                      "sortOrder"
                    ],
                    "additionalProperties": false
                  }
                },
                "optionGroups": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "id": {
                        "type": "string",
                        "format": "uuid",
                        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                      },
                      "name": {
                        "type": "string"
                      },
                      "minSelect": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 9007199254740991
                      },
                      "maxSelect": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 9007199254740991
                      },
                      "sortOrder": {
                        "type": "integer",
                        "minimum": -9007199254740991,
                        "maximum": 9007199254740991
                      },
                      "options": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "properties": {
                            "id": {
                              "type": "string",
                              "format": "uuid",
                              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                            },
                            "name": {
                              "type": "string"
                            },
                            "priceMinor": {
                              "type": "integer",
                              "minimum": 0,
                              "maximum": 9007199254740991
                            },
                            "sortOrder": {
                              "type": "integer",
                              "minimum": -9007199254740991,
                              "maximum": 9007199254740991
                            },
                            "isAvailable": {
                              "type": "boolean"
                            }
                          },
                          "required": [
                            "id",
                            "name",
                            "priceMinor",
                            "sortOrder",
                            "isAvailable"
                          ],
                          "additionalProperties": false
                        }
                      }
                    },
                    "required": [
                      "id",
                      "name",
                      "minSelect",
                      "maxSelect",
                      "sortOrder",
                      "options"
                    ],
                    "additionalProperties": false
                  }
                }
              },
              "required": [
                "id",
                "name",
                "description",
                "imageKey",
                "isAvailable",
                "sortOrder",
                "availableFrom",
                "availableTo",
                "sizes",
                "optionGroups"
              ],
              "additionalProperties": false
            }
          }
        },
        "required": [
          "id",
          "name",
          "sortOrder",
          "items"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "id",
    "branchId",
    "name",
    "logoKey",
    "coverImageKey",
    "contactPhone",
    "categories",
    "isOrderable",
    "reason",
    "deliveryFeeMinor",
    "minOrderMinor",
    "etaMinutes",
    "pickupEnabled",
    "currencyDisplayMode",
    "sections"
  ],
  "additionalProperties": false
}
```

</details>

### readOrderParamsSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "id"
  ],
  "additionalProperties": false
}
```

</details>

### recordAdjustmentSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "amountMinor": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991
    },
    "reason": {
      "type": "string",
      "minLength": 1
    }
  },
  "required": [
    "amountMinor",
    "reason"
  ],
  "additionalProperties": false
}
```

</details>

### recordPaymentSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "amountMinor": {
      "type": "integer",
      "exclusiveMinimum": 0,
      "maximum": 9007199254740991
    },
    "paymentDate": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    },
    "paymentMethod": {
      "type": "string",
      "minLength": 1
    },
    "reference": {
      "type": "string",
      "minLength": 1
    }
  },
  "required": [
    "amountMinor",
    "paymentDate",
    "paymentMethod",
    "reference"
  ],
  "additionalProperties": false
}
```

</details>

### refreshTokenSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "refreshToken": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_-]{43}$"
    }
  },
  "required": [
    "refreshToken"
  ]
}
```

</details>

### resolveNonDeliveryComplaintSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

</details>

### restaurantBalancesResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "currencyDisplayMode": {
      "type": "string",
      "enum": [
        "OLD",
        "NEW"
      ]
    },
    "restaurants": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "restaurantId": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "name": {
            "type": [
              "string",
              "null"
            ]
          },
          "balanceMinor": {
            "type": "integer",
            "minimum": -9007199254740991,
            "maximum": 9007199254740991
          }
        },
        "required": [
          "restaurantId",
          "name",
          "balanceMinor"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "currencyDisplayMode",
    "restaurants"
  ],
  "additionalProperties": false
}
```

</details>

### restaurantBranchParamsSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "branchId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "branchId"
  ],
  "additionalProperties": false
}
```

</details>

### restaurantBranchSettingsSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "minOrderMinor": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "pickupEnabled": {
      "type": "boolean"
    }
  },
  "additionalProperties": false
}
```

</details>

### restaurantCommissionSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "commissionRateBps": {
      "type": "integer",
      "minimum": 0,
      "maximum": 10000
    }
  },
  "required": [
    "commissionRateBps"
  ],
  "additionalProperties": false
}
```

</details>

### restaurantCommissionsResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "commissionRateBps": {
        "type": "integer",
        "minimum": 0,
        "maximum": 10000
      },
      "id": {
        "type": "string",
        "format": "uuid",
        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
      },
      "name": {
        "type": [
          "string",
          "null"
        ]
      }
    },
    "required": [
      "commissionRateBps",
      "id",
      "name"
    ],
    "additionalProperties": false
  }
}
```

</details>

### restaurantDocumentPathSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "type": {
      "type": "string",
      "enum": [
        "BUSINESS_REGISTRATION",
        "LICENSE"
      ]
    }
  },
  "required": [
    "type"
  ]
}
```

</details>

### restaurantDocumentSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "type": {
      "type": "string",
      "enum": [
        "BUSINESS_REGISTRATION",
        "LICENSE"
      ]
    },
    "createdAt": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
    }
  },
  "required": [
    "id",
    "type",
    "createdAt"
  ]
}
```

</details>

### restaurantDocumentsResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "id": {
        "type": "string",
        "format": "uuid",
        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
      },
      "type": {
        "type": "string",
        "enum": [
          "BUSINESS_REGISTRATION",
          "LICENSE"
        ]
      },
      "createdAt": {
        "type": "string",
        "format": "date-time",
        "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
      }
    },
    "required": [
      "id",
      "type",
      "createdAt"
    ]
  }
}
```

</details>

### restaurantIdParamsSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "restaurantId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "restaurantId"
  ],
  "additionalProperties": false
}
```

</details>

### restaurantImagePathSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "kind": {
      "type": "string",
      "enum": [
        "logo",
        "cover"
      ]
    }
  },
  "required": [
    "kind"
  ]
}
```

</details>

### restaurantImageUploadSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "key": {
      "type": "string"
    },
    "images": {
      "type": "object",
      "properties": {
        "320": {
          "type": "string"
        },
        "640": {
          "type": "string"
        }
      },
      "required": [
        "320",
        "640"
      ]
    }
  },
  "required": [
    "key",
    "images"
  ]
}
```

</details>

### restaurantListResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "commissionRateBps": {
        "type": "integer",
        "minimum": 0,
        "maximum": 10000
      },
      "id": {
        "type": "string",
        "format": "uuid",
        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
      },
      "name": {
        "type": [
          "string",
          "null"
        ]
      },
      "status": {
        "type": "string",
        "enum": [
          "DRAFT",
          "PENDING_REVIEW",
          "APPROVED",
          "REJECTED",
          "SUSPENDED"
        ]
      },
      "contactPhone": {
        "type": [
          "string",
          "null"
        ]
      },
      "logoKey": {
        "type": [
          "string",
          "null"
        ]
      },
      "coverImageKey": {
        "type": [
          "string",
          "null"
        ]
      },
      "reviewReason": {
        "type": [
          "string",
          "null"
        ]
      }
    },
    "required": [
      "commissionRateBps",
      "id",
      "name",
      "status",
      "contactPhone",
      "logoKey",
      "coverImageKey",
      "reviewReason"
    ],
    "additionalProperties": false
  }
}
```

</details>

### restaurantLoginSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "phone": {
      "type": "string"
    },
    "password": {
      "type": "string",
      "minLength": 1
    },
    "newPassword": {
      "type": "string",
      "minLength": 8
    }
  },
  "required": [
    "phone",
    "password"
  ]
}
```

</details>

### restaurantMenuSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "sections": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string",
            "format": "uuid",
            "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
          },
          "name": {
            "type": "string"
          },
          "sortOrder": {
            "type": "integer",
            "minimum": -2147483648,
            "maximum": 2147483647
          },
          "items": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                "sectionId": {
                  "type": "string",
                  "format": "uuid",
                  "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                },
                "name": {
                  "type": "string"
                },
                "description": {
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "imageKey": {
                  "type": [
                    "string",
                    "null"
                  ]
                },
                "isAvailable": {
                  "type": "boolean"
                },
                "sortOrder": {
                  "type": "integer",
                  "minimum": -2147483648,
                  "maximum": 2147483647
                },
                "availableFrom": {
                  "anyOf": [
                    {
                      "type": "string",
                      "pattern": "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "availableTo": {
                  "anyOf": [
                    {
                      "type": "string",
                      "pattern": "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$"
                    },
                    {
                      "type": "null"
                    }
                  ]
                },
                "sizes": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "id": {
                        "type": "string",
                        "format": "uuid",
                        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                      },
                      "menuItemId": {
                        "type": "string",
                        "format": "uuid",
                        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                      },
                      "name": {
                        "type": "string"
                      },
                      "priceMinor": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 9007199254740991
                      },
                      "sortOrder": {
                        "type": "integer",
                        "minimum": -2147483648,
                        "maximum": 2147483647
                      }
                    },
                    "required": [
                      "id",
                      "menuItemId",
                      "name",
                      "priceMinor",
                      "sortOrder"
                    ],
                    "additionalProperties": false
                  }
                },
                "optionGroups": {
                  "type": "array",
                  "items": {
                    "type": "object",
                    "properties": {
                      "id": {
                        "type": "string",
                        "format": "uuid",
                        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                      },
                      "menuItemId": {
                        "type": "string",
                        "format": "uuid",
                        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                      },
                      "name": {
                        "type": "string"
                      },
                      "minSelect": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 9007199254740991
                      },
                      "maxSelect": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 9007199254740991
                      },
                      "sortOrder": {
                        "type": "integer",
                        "minimum": -2147483648,
                        "maximum": 2147483647
                      },
                      "options": {
                        "type": "array",
                        "items": {
                          "type": "object",
                          "properties": {
                            "id": {
                              "type": "string",
                              "format": "uuid",
                              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                            },
                            "optionGroupId": {
                              "type": "string",
                              "format": "uuid",
                              "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
                            },
                            "name": {
                              "type": "string"
                            },
                            "priceMinor": {
                              "type": "integer",
                              "minimum": 0,
                              "maximum": 9007199254740991
                            },
                            "isAvailable": {
                              "type": "boolean"
                            },
                            "sortOrder": {
                              "type": "integer",
                              "minimum": -2147483648,
                              "maximum": 2147483647
                            }
                          },
                          "required": [
                            "id",
                            "optionGroupId",
                            "name",
                            "priceMinor",
                            "isAvailable",
                            "sortOrder"
                          ],
                          "additionalProperties": false
                        }
                      }
                    },
                    "required": [
                      "id",
                      "menuItemId",
                      "name",
                      "minSelect",
                      "maxSelect",
                      "sortOrder",
                      "options"
                    ],
                    "additionalProperties": false
                  }
                }
              },
              "required": [
                "id",
                "sectionId",
                "name",
                "description",
                "imageKey",
                "isAvailable",
                "sortOrder",
                "availableFrom",
                "availableTo",
                "sizes",
                "optionGroups"
              ],
              "additionalProperties": false
            }
          }
        },
        "required": [
          "id",
          "name",
          "sortOrder",
          "items"
        ],
        "additionalProperties": false
      }
    }
  },
  "required": [
    "sections"
  ],
  "additionalProperties": false
}
```

</details>

### restaurantOrderListQuerySchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "enum": [
        "PENDING",
        "ACCEPTED",
        "PREPARING",
        "READY",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "REJECTED",
        "EXPIRED",
        "CANCELLED",
        "DELIVERY_FAILED"
      ]
    },
    "from": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
    },
    "to": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$"
    },
    "finishedOn": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    }
  },
  "additionalProperties": false
}
```

</details>

### restaurantOrderTransitionSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "to": {
      "type": "string",
      "enum": [
        "PENDING",
        "ACCEPTED",
        "PREPARING",
        "READY",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
        "REJECTED",
        "EXPIRED",
        "CANCELLED",
        "DELIVERY_FAILED"
      ]
    },
    "prepMinutes": {
      "type": "integer",
      "minimum": -9007199254740991,
      "maximum": 9007199254740991
    },
    "reasonCode": {
      "type": "string",
      "enum": [
        "TOO_BUSY",
        "ITEM_UNAVAILABLE",
        "CLOSING_SOON",
        "OUT_OF_ZONE",
        "OTHER",
        "CUSTOMER_REQUEST",
        "NO_DRIVER",
        "DUPLICATE",
        "SUSPECTED_FAKE",
        "CUSTOMER_UNREACHABLE",
        "WRONG_ADDRESS",
        "CUSTOMER_REFUSED"
      ]
    },
    "note": {
      "type": "string"
    }
  },
  "required": [
    "to"
  ],
  "additionalProperties": false
}
```

</details>

### restaurantProfilePatchSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "minLength": 1
    },
    "contactPhone": {
      "type": "string"
    },
    "categoryIds": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "uuid",
        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
      }
    },
    "neighborhoodId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "address": {
      "type": "string",
      "minLength": 1
    },
    "latitude": {
      "anyOf": [
        {
          "type": "number",
          "minimum": -90,
          "maximum": 90
        },
        {
          "type": "null"
        }
      ]
    },
    "longitude": {
      "anyOf": [
        {
          "type": "number",
          "minimum": -180,
          "maximum": 180
        },
        {
          "type": "null"
        }
      ]
    }
  },
  "additionalProperties": false
}
```

</details>

### restaurantRegisterSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "phone": {
      "type": "string"
    },
    "code": {
      "type": "string",
      "pattern": "^[0-9]{6}$"
    },
    "password": {
      "type": "string",
      "minLength": 8
    }
  },
  "required": [
    "phone",
    "code",
    "password"
  ]
}
```

</details>

### restaurantReportQuerySchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "period": {
      "type": "string",
      "enum": [
        "day",
        "week",
        "month"
      ]
    },
    "date": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    }
  },
  "required": [
    "period",
    "date"
  ],
  "additionalProperties": false
}
```

</details>

### restaurantReportSummarySchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "period": {
      "type": "string",
      "enum": [
        "day",
        "week",
        "month"
      ]
    },
    "date": {
      "type": "string",
      "format": "date",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))$"
    },
    "orderValueMinor": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "completedSalesMinor": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "cashCollectedMinor": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "commissionMinor": {
      "type": "integer",
      "minimum": 0,
      "maximum": 9007199254740991
    },
    "currencyDisplayMode": {
      "type": "string",
      "enum": [
        "OLD",
        "NEW"
      ]
    }
  },
  "required": [
    "period",
    "date",
    "orderValueMinor",
    "completedSalesMinor",
    "cashCollectedMinor",
    "commissionMinor",
    "currencyDisplayMode"
  ],
  "additionalProperties": false
}
```

</details>

### restaurantReviewResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "enum": [
        "DRAFT",
        "PENDING_REVIEW",
        "APPROVED",
        "REJECTED",
        "SUSPENDED"
      ]
    },
    "reviewReason": {
      "type": "string"
    }
  },
  "required": [
    "status",
    "reviewReason"
  ]
}
```

</details>

### restaurantReviewSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "reason": {
      "type": "string",
      "minLength": 1
    }
  },
  "required": [
    "reason"
  ],
  "additionalProperties": false
}
```

</details>

### restaurantSessionSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "restaurantId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "role": {
      "type": "string",
      "enum": [
        "OWNER",
        "MANAGER",
        "CASHIER",
        "KITCHEN"
      ]
    },
    "restaurantStatus": {
      "type": "string",
      "enum": [
        "DRAFT",
        "PENDING_REVIEW",
        "APPROVED",
        "REJECTED",
        "SUSPENDED"
      ]
    },
    "currencyDisplayMode": {
      "type": "string",
      "enum": [
        "OLD",
        "NEW"
      ]
    },
    "expireAfterSec": {
      "type": "integer",
      "exclusiveMinimum": 0,
      "maximum": 9007199254740991
    },
    "serverTime": {
      "type": "string",
      "format": "date-time",
      "pattern": "^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"
    },
    "acceptingOrders": {
      "type": "boolean"
    }
  },
  "required": [
    "restaurantId",
    "role",
    "restaurantStatus",
    "currencyDisplayMode",
    "expireAfterSec",
    "serverTime",
    "acceptingOrders"
  ],
  "additionalProperties": false
}
```

</details>

### restaurantStaffCreateSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "phone": {
      "type": "string"
    },
    "temporaryPassword": {
      "type": "string",
      "minLength": 8
    },
    "role": {
      "type": "string",
      "enum": [
        "MANAGER",
        "CASHIER",
        "KITCHEN"
      ]
    }
  },
  "required": [
    "phone",
    "temporaryPassword",
    "role"
  ],
  "additionalProperties": false
}
```

</details>

### restaurantStaffListSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "id": {
        "type": "string",
        "format": "uuid",
        "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
      },
      "phone": {
        "type": "string"
      },
      "role": {
        "type": "string",
        "enum": [
          "MANAGER",
          "CASHIER",
          "KITCHEN"
        ]
      },
      "isActive": {
        "type": "boolean"
      },
      "passwordChangeRequired": {
        "type": "boolean"
      }
    },
    "required": [
      "id",
      "phone",
      "role",
      "isActive",
      "passwordChangeRequired"
    ]
  }
}
```

</details>

### restaurantStaffMemberSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    },
    "phone": {
      "type": "string"
    },
    "role": {
      "type": "string",
      "enum": [
        "MANAGER",
        "CASHIER",
        "KITCHEN"
      ]
    },
    "isActive": {
      "type": "boolean"
    },
    "passwordChangeRequired": {
      "type": "boolean"
    }
  },
  "required": [
    "id",
    "phone",
    "role",
    "isActive",
    "passwordChangeRequired"
  ]
}
```

</details>

### restaurantStaffParamsSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "staffId": {
      "type": "string",
      "format": "uuid",
      "pattern": "^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"
    }
  },
  "required": [
    "staffId"
  ],
  "additionalProperties": false
}
```

</details>

### restaurantStaffUpdateSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "role": {
      "type": "string",
      "enum": [
        "MANAGER",
        "CASHIER",
        "KITCHEN"
      ]
    }
  },
  "required": [
    "role"
  ],
  "additionalProperties": false
}
```

</details>

### restaurantSubmissionResponseSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "const": "PENDING_REVIEW"
    }
  },
  "required": [
    "status"
  ]
}
```

</details>

### reviewComplaintSchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "enum": [
        "OPEN",
        "IN_PROGRESS",
        "RESOLVED"
      ]
    },
    "internalNotes": {
      "type": [
        "string",
        "null"
      ]
    },
    "verifyNonDelivery": {
      "type": "boolean",
      "const": true
    }
  },
  "additionalProperties": false
}
```

</details>

### signedDocumentQuerySchema

<details>
<summary>JSON Schema</summary>

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "expires": {
      "type": "string",
      "pattern": "^[0-9]{1,16}$"
    },
    "signature": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_-]{43}$"
    }
  },
  "required": [
    "expires",
    "signature"
  ]
}
```

</details>
