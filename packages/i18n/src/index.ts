export { adminShellText } from "./admin-shell.js";
export { customerApp } from "./customer-app.js";
export { customerCatalog, describeCatalogUpdate } from "./customer-catalog.js";
export { customerAccountText, deletedCustomerName } from "./customer-account.js";
export { customerOrdersText } from "./customer-orders.js";
export { restaurantApp } from "./restaurant-app.js";
export { restaurantMenuText } from "./restaurant-menu.js";
export { restaurantOrders } from "./restaurant-orders.js";
export { adminManagement } from "./admin-management.js";
export {
  adminOperations,
  formatAdminDateTime,
  formatAdminCalendarDate,
  formatAdminRate,
  formatAdminDateTime as formatDamascusDateTime,
} from "./admin-operations.js";

export const messages = {
  apps: {
    admin: "لوحة إدارة بي فاست",
    customer: "بي فاست للعملاء",
    restaurant: "بي فاست للمطاعم",
  },
  menu: {
    copySuffix: " (نسخة)",
    regularSize: "عادي",
  },
  finance: {
    nonDeliveryReversal: "عكس عمولة طلب ثبت عدم استلامه.",
  },
  errors: {
    accountUnavailable: "الحساب غير متاح.",
    activeOrders: "لا يمكن حذف الحساب قبل انتهاء طلباتك النشطة.",
    belowMinimum: "قيمة الطعام أقل من الحد الأدنى للطلب.",
    conflict: "تعذّر إكمال العملية بسبب تعارض في البيانات.",
    databaseUnavailable: "قاعدة البيانات غير متاحة حالياً.",
    forbidden: "لا تملك صلاحية تنفيذ هذا الإجراء.",
    internalError: "حدث خطأ داخلي. حاول مرة أخرى.",
    invalidCredentials: "بيانات تسجيل الدخول غير صحيحة.",
    invalidOtp: "رمز التحقق غير صحيح أو انتهت صلاحيته.",
    invalidOptions: "خيارات الصنف لا تستوفي شروط الاختيار.",
    invalidRefreshToken: "انتهت جلسة تسجيل الدخول. سجّل الدخول من جديد.",
    invalidTransition: "لا يمكن تغيير الطلب إلى هذه الحالة.",
    itemUnavailable: "أحد الأصناف غير متوفر حالياً.",
    otpUnavailable: "تعذّر إرسال رمز التحقق حالياً.",
    outOfZone: "طريقة الاستلام أو عنوان التوصيل غير متاح لهذا المطعم.",
    pageNotFound: "الصفحة غير موجودة.",
    passwordChangeRequired: "عيّن كلمة مرور جديدة لإكمال تسجيل الدخول.",
    priceChanged: "تغيّر سعر الطلب. راجع المبلغ الجديد وأكّد الطلب مجدداً.",
    rateLimited: "محاولات كثيرة. انتظر قليلاً ثم حاول مرة أخرى.",
    restaurantClosed: "المطعم غير متاح لاستقبال الطلبات الآن.",
    tooManyActiveOrders: "لديك طلبان نشطان بالفعل.",
    unauthenticated: "يلزم تسجيل الدخول.",
    validationError: "بعض البيانات المدخلة غير صالحة.",
  },
} as const;
