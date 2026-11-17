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
  errors: {
    accountUnavailable: "الحساب غير متاح.",
    conflict: "تعذّر إكمال العملية بسبب تعارض في البيانات.",
    databaseUnavailable: "قاعدة البيانات غير متاحة حالياً.",
    forbidden: "لا تملك صلاحية تنفيذ هذا الإجراء.",
    internalError: "حدث خطأ داخلي. حاول مرة أخرى.",
    invalidCredentials: "بيانات تسجيل الدخول غير صحيحة.",
    invalidOtp: "رمز التحقق غير صحيح أو انتهت صلاحيته.",
    invalidRefreshToken: "انتهت جلسة تسجيل الدخول. سجّل الدخول من جديد.",
    otpUnavailable: "تعذّر إرسال رمز التحقق حالياً.",
    pageNotFound: "الصفحة غير موجودة.",
    passwordChangeRequired: "عيّن كلمة مرور جديدة لإكمال تسجيل الدخول.",
    rateLimited: "محاولات كثيرة. انتظر قليلاً ثم حاول مرة أخرى.",
    unauthenticated: "يلزم تسجيل الدخول.",
    validationError: "بعض البيانات المدخلة غير صالحة.",
  },
} as const;
