import { z } from "zod";
import * as contracts from "./index.js";

const menuSection = contracts.restaurantMenuSchema.shape.sections.element;
const menuItem = menuSection.shape.items.element;
const menuSize = menuItem.shape.sizes.element;
const optionGroup = menuItem.shape.optionGroups.element;
const menuOption = optionGroup.shape.options.element;
const deliveryZone =
  contracts.adminRestaurantProfileSchema.shape.branch.unwrap().shape
    .deliveryZones.element;
const minor = z.int().nonnegative();

const schemas = {
  ...contracts,
  healthResponseSchema: z.object({ status: z.literal("ok") }),
  priceChangedDetailsSchema: z.object({
    foodSubtotalMinor: minor,
    discountMinor: minor,
    deliveryFeeMinor: minor,
    totalMinor: minor,
    items: z.array(
      z.object({
        menuItemId: z.uuid(),
        sizeId: z.uuid(),
        quantity: z.int().min(1).max(50),
        unitPriceMinor: minor,
        totalMinor: minor,
        optionIds: z.array(z.uuid()),
      }),
    ),
  }),
  governoratesResponseSchema: z.array(contracts.governorateSchema),
  citiesResponseSchema: z.array(contracts.citySchema),
  neighborhoodsResponseSchema: z.array(contracts.neighborhoodSchema),
  foodCategoriesResponseSchema: z.array(contracts.foodCategorySchema),
  restaurantListResponseSchema: z.array(
    contracts.adminRestaurantProfileSummarySchema,
  ),
  restaurantCommissionsResponseSchema: z.array(
    contracts.adminRestaurantCommissionRecordSchema,
  ),
  restaurantDocumentsResponseSchema: z.array(
    contracts.restaurantDocumentSchema,
  ),
  restaurantReviewResponseSchema: z.object({
    status: z.enum(contracts.restaurantStatuses),
    reviewReason: z.string(),
  }),
  restaurantSubmissionResponseSchema: z.object({
    status: z.literal("PENDING_REVIEW"),
  }),
  branchSettingsResponseSchema:
    contracts.restaurantBranchSettingsSchema.required(),
  deliveryZoneResponseSchema: deliveryZone,
  deliveryZonesResponseSchema: z.object({ zones: z.array(deliveryZone) }),
  menuSectionResponseSchema: menuSection.omit({ items: true }),
  menuSectionsResponseSchema: z.object({
    sections: z.array(menuSection.omit({ items: true })),
  }),
  menuItemResponseSchema: menuItem,
  menuItemMetadataResponseSchema: menuItem.omit({
    sizes: true,
    optionGroups: true,
  }),
  menuItemsResponseSchema: z.object({ items: z.array(menuItem) }),
  menuSizeResponseSchema: menuSize,
  menuSizesResponseSchema: z.object({ sizes: z.array(menuSize) }),
  menuOptionGroupResponseSchema: optionGroup,
  menuOptionGroupsResponseSchema: z.object({ groups: z.array(optionGroup) }),
  menuOptionResponseSchema: menuOption,
  menuOptionsResponseSchema: z.object({ options: z.array(menuOption) }),
  menuDuplicateResponseSchema: menuItem.pick({
    id: true,
    name: true,
    isAvailable: true,
  }),
  menuAvailabilityResponseSchema: contracts.menuAvailabilitySchema.extend({
    id: z.uuid(),
  }),
};

type SchemaName = {
  [Key in keyof typeof schemas]: (typeof schemas)[Key] extends z.ZodType
    ? Key
    : never;
}[keyof typeof schemas];

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

interface RouteFields {
  params?: SchemaName;
  query?: SchemaName;
  body?: SchemaName;
  upload?: boolean;
  response?: SchemaName;
  binary?: boolean;
  status?: string;
  access?: string;
  note?: string;
}

interface Route extends RouteFields {
  method: Method;
  path: string;
}

function route(method: Method, path: string, fields: RouteFields = {}): Route {
  return { method, path, ...fields };
}

const owner = "OWNER";
const managers = "OWNER، MANAGER";
const pauseRoles = "OWNER، MANAGER، CASHIER";
const restaurantRoles = "OWNER، MANAGER، CASHIER، KITCHEN";
const adminRoles = "SUPER_ADMIN، OPERATIONS، FINANCE، SUPPORT";
const superAdmin = "SUPER_ADMIN";
const operations = "SUPER_ADMIN، OPERATIONS";
const finance = "SUPER_ADMIN، FINANCE";
const adminOrderReaders = "SUPER_ADMIN، OPERATIONS، SUPPORT";
const adminCustomerReaders = "SUPER_ADMIN، SUPPORT";
const orderId = { params: "readOrderParamsSchema" } as const;
const addressId = { params: "customerAddressParamsSchema" } as const;
const restaurantId = { params: "restaurantIdParamsSchema" } as const;
const branchId = { params: "restaurantBranchParamsSchema" } as const;
const zoneId = { params: "deliveryZoneParamsSchema" } as const;
const adminId = { params: "adminResourceParamsSchema" } as const;
const complaintId = { params: "complaintParamsSchema" } as const;
const sectionId = { params: "menuSectionPathSchema" } as const;
const itemId = { params: "menuItemPathSchema" } as const;
const sizeId = { params: "menuSizePathSchema" } as const;
const groupId = { params: "menuOptionGroupParamsSchema" } as const;
const optionId = { params: "menuOptionParamsSchema" } as const;
const staffId = { params: "restaurantStaffParamsSchema" } as const;

const publicRoutes = [
  route("GET", "/health", {
    response: "healthResponseSchema",
    note: "يعيد `503 DATABASE_UNAVAILABLE` عند تعذّر فحص القاعدة.",
  }),
  route("GET", "/public/geo", {
    query: "geoListQuerySchema",
    response: "publicGeoSchema",
  }),
  route("GET", "/public/categories", {
    query: "geoListQuerySchema",
    response: "publicFoodCategoriesSchema",
  }),
  route("GET", "/public/restaurants", {
    query: "browseListQuerySchema",
    response: "browseListResponseSchema",
  }),
  route("GET", "/public/restaurants/:id", {
    params: "publicRestaurantDetailParamsSchema",
    query: "publicRestaurantDetailQuerySchema",
    response: "publicRestaurantDetailResponseSchema",
  }),
  route("GET", "/public/images/:restaurantId/:assetId/:width", {
    params: "publicImagePathSchema",
    binary: true,
  }),
];

const authRoutes = [
  route("POST", "/auth/customer/otp/request", {
    body: "customerOtpRequestSchema",
    status: "204",
    note: "قد يعيد `429 RATE_LIMITED` أو `503 OTP_UNAVAILABLE`.",
  }),
  route("POST", "/auth/customer/otp/verify", {
    body: "customerOtpVerifySchema",
    response: "authTokensSchema",
    note: "يعيد `401 INVALID_OTP` عند تعذّر قبول الرمز.",
  }),
  route("POST", "/auth/restaurant/otp/request", {
    body: "customerOtpRequestSchema",
    status: "204",
    note: "قد يعيد `429 RATE_LIMITED` أو `503 OTP_UNAVAILABLE`.",
  }),
  route("POST", "/auth/restaurant/register", {
    body: "restaurantRegisterSchema",
    response: "authTokensSchema",
    status: "201",
    note: "تسجيل مالك المطعم برمز OTP وكلمة مرور.",
  }),
  route("POST", "/auth/restaurant/login", {
    body: "restaurantLoginSchema",
    response: "authTokensSchema",
    note: "إعادة الطلب مع `newPassword` عند `403 PASSWORD_CHANGE_REQUIRED` في أول دخول للموظف.",
  }),
  route("POST", "/auth/admin/login", {
    body: "adminLoginSchema",
    response: "authTokensSchema",
    note: "يُرفض البريد أو كلمة المرور أو رمز TOTP غير الصالح أو المعاد استخدامه بـ`401 INVALID_CREDENTIALS`.",
  }),
  route("POST", "/auth/refresh", {
    body: "refreshTokenSchema",
    response: "authTokensSchema",
    note: "يدوّر رمز التجديد. إعادة استعمال رمز سابق تبطل عائلته.",
  }),
  route("POST", "/auth/logout", { body: "refreshTokenSchema", status: "204" }),
];

const orderCreateFailures = [
  "RESTAURANT_CLOSED",
  "OUT_OF_ZONE",
  "ITEM_UNAVAILABLE",
  "BELOW_MINIMUM",
  "PRICE_CHANGED",
  "INVALID_OPTIONS",
  "TOO_MANY_ACTIVE_ORDERS",
] as const satisfies readonly contracts.ErrorCode[];

const customerRoutes = [
  route("GET", "/customer/me", { response: "customerProfileSchema" }),
  route("PATCH", "/customer/me", {
    body: "customerProfileUpdateSchema",
    response: "customerProfileSchema",
    note: "تعيين الاسم مرة واحدة.",
  }),
  route("DELETE", "/customer/me", {
    status: "204",
    note: "يعيد `409 ACTIVE_ORDERS` عند وجود طلب نشط. يخفي بيانات الحساب والطلبات في معاملة واحدة.",
  }),
  route("GET", "/customer/addresses", {
    response: "customerAddressListSchema",
  }),
  route("GET", "/customer/addresses/:addressId", {
    ...addressId,
    response: "customerAddressSchema",
  }),
  route("POST", "/customer/addresses", {
    body: "customerAddressCreateSchema",
    response: "customerAddressSchema",
    status: "201",
  }),
  route("PATCH", "/customer/addresses/:addressId", {
    ...addressId,
    body: "customerAddressUpdateSchema",
    response: "customerAddressSchema",
  }),
  route("PATCH", "/customer/addresses/:addressId/default", {
    ...addressId,
    response: "customerAddressSchema",
  }),
  route("DELETE", "/customer/addresses/:addressId", {
    ...addressId,
    status: "204",
  }),
  route("GET", "/customer/orders", { response: "orderListResponseSchema" }),
  route("GET", "/customer/orders/:id", {
    ...orderId,
    response: "orderReadSchema",
  }),
  route("POST", "/customer/orders", {
    body: "orderCreateSchema",
    response: "orderReadSchema",
    status: "200 أو 201",
    note: `ترويسة [\`Idempotency-Key\`](#orderidempotencykeyschema) مطلوبة. \`200\` لإعادة طلب و\`201\` للإنشاء. أخطاء \`409\` تشمل ${orderCreateFailures.map((code) => `\`${code}\``).join("، ")}. يعيد \`PRICE_CHANGED\` [تفصيل السعر الجديد](#pricechangeddetailsschema) في \`error.details\`.`,
  }),
  route("POST", "/customer/orders/:id/cancel", {
    ...orderId,
    body: "orderCancellationSchema",
    response: "orderReadSchema",
    note: "يمكن حذف جسم الطلب. إلغاء العميل من `PENDING` فقط.",
  }),
  route("POST", "/customer/orders/:id/complaint", {
    ...orderId,
    body: "createComplaintSchema",
    response: "customerComplaintSchema",
    status: "201",
  }),
  route("GET", "/customer/orders/:id/complaint", {
    ...orderId,
    response: "customerComplaintResponseSchema",
  }),
];

const restaurantRoutes = [
  route("GET", "/restaurant/session", {
    access: restaurantRoles,
    response: "restaurantSessionSchema",
  }),
  route("GET", "/restaurant/profile", {
    access: owner,
    response: "adminRestaurantProfileSchema",
  }),
  route("PATCH", "/restaurant/profile", {
    access: owner,
    body: "restaurantProfilePatchSchema",
    response: "adminRestaurantProfileSchema",
  }),
  route("POST", "/restaurant/profile/submit", {
    access: owner,
    response: "restaurantSubmissionResponseSchema",
  }),
  route("GET", "/restaurant/branches/:branchId/profile", {
    ...branchId,
    access: owner,
    response: "adminRestaurantProfileSchema",
  }),
  route("PATCH", "/restaurant/branches/:branchId/profile", {
    ...branchId,
    access: owner,
    body: "restaurantProfilePatchSchema",
    response: "adminRestaurantProfileSchema",
  }),
  route("GET", "/restaurant/branch/opening-periods", {
    access: managers,
    response: "openingPeriodsSchema",
  }),
  route("PUT", "/restaurant/branch/opening-periods", {
    access: managers,
    body: "openingPeriodsSchema",
    response: "openingPeriodsSchema",
  }),
  route("GET", "/restaurant/branch/settings", {
    access: managers,
    response: "branchSettingsResponseSchema",
  }),
  route("PATCH", "/restaurant/branch/settings", {
    access: managers,
    body: "restaurantBranchSettingsSchema",
    response: "branchSettingsResponseSchema",
  }),
  route("PATCH", "/restaurant/branch/accepting-orders", {
    access: pauseRoles,
    body: "branchAcceptingOrdersSchema",
    response: "branchAcceptingOrdersResponseSchema",
  }),
  route("GET", "/restaurant/branch/delivery-zones", {
    access: managers,
    response: "deliveryZonesResponseSchema",
  }),
  route("PUT", "/restaurant/branch/delivery-zones", {
    access: managers,
    body: "deliveryZonesSchema",
    response: "deliveryZonesResponseSchema",
  }),
  route("GET", "/restaurant/delivery-zones/:zoneId", {
    ...zoneId,
    access: managers,
    response: "deliveryZoneResponseSchema",
  }),
  route("PATCH", "/restaurant/delivery-zones/:zoneId", {
    ...zoneId,
    access: managers,
    body: "deliveryZonePatchSchema",
    response: "deliveryZoneResponseSchema",
  }),
  route("DELETE", "/restaurant/delivery-zones/:zoneId", {
    ...zoneId,
    access: managers,
    status: "204",
  }),
  route("POST", "/restaurant/profile/images/:kind", {
    access: owner,
    params: "restaurantImagePathSchema",
    upload: true,
    response: "restaurantImageUploadSchema",
    status: "201",
  }),
  route("GET", "/restaurant/documents", {
    access: owner,
    response: "restaurantDocumentsResponseSchema",
  }),
  route("GET", "/restaurant/documents/:documentId", {
    access: owner,
    params: "documentIdPathSchema",
    response: "restaurantDocumentSchema",
  }),
  route("POST", "/restaurant/documents/:type", {
    access: owner,
    params: "restaurantDocumentPathSchema",
    upload: true,
    response: "restaurantDocumentSchema",
    status: "201",
  }),
  route("GET", "/restaurant/staff", {
    access: owner,
    response: "restaurantStaffListSchema",
  }),
  route("POST", "/restaurant/staff", {
    access: owner,
    body: "restaurantStaffCreateSchema",
    response: "restaurantStaffMemberSchema",
    status: "201",
  }),
  route("PATCH", "/restaurant/staff/:staffId", {
    ...staffId,
    access: owner,
    body: "restaurantStaffUpdateSchema",
    response: "restaurantStaffMemberSchema",
  }),
  route("DELETE", "/restaurant/staff/:staffId", {
    ...staffId,
    access: owner,
    status: "204",
    note: "يعطّل الحساب.",
  }),
  route("GET", "/restaurant/orders", {
    access: restaurantRoles,
    query: "restaurantOrderListQuerySchema",
    response: "orderListResponseSchema",
  }),
  route("GET", "/restaurant/orders/active", {
    access: restaurantRoles,
    response: "orderListResponseSchema",
    note: "يحدّث `lastSeenAt` للفرع عند السحب.",
  }),
  route("GET", "/restaurant/orders/:id", {
    ...orderId,
    access: restaurantRoles,
    response: "orderReadSchema",
  }),
  route("POST", "/restaurant/orders/:id/transition", {
    ...orderId,
    access: restaurantRoles,
    body: "restaurantOrderTransitionSchema",
    response: "orderReadSchema",
    note: "يشترط تفويض الدور للحالة الهدف، ثم تطبّق آلة الحالات. يعيد `409 INVALID_TRANSITION` للحالة السابقة غير الصالحة.",
  }),
  route("GET", "/restaurant/reports/summary", {
    access: owner,
    query: "restaurantReportQuerySchema",
    response: "restaurantReportSummarySchema",
  }),
  route("GET", "/restaurant/finance/ledger", {
    access: owner,
    response: "financeLedgerResponseSchema",
  }),
];

const menuRoutes = [
  route("GET", "/restaurant/menu", {
    access: restaurantRoles,
    response: "restaurantMenuSchema",
  }),
  route("GET", "/restaurant/menu/sections", {
    access: restaurantRoles,
    response: "menuSectionsResponseSchema",
  }),
  route("GET", "/restaurant/menu/sections/:sectionId", {
    ...sectionId,
    access: restaurantRoles,
    response: "menuSectionResponseSchema",
  }),
  route("POST", "/restaurant/menu/sections", {
    access: managers,
    body: "createMenuSectionSchema",
    response: "menuSectionResponseSchema",
    status: "201",
  }),
  route("PATCH", "/restaurant/menu/sections/:sectionId", {
    ...sectionId,
    access: managers,
    body: "patchMenuSectionSchema",
    response: "menuSectionResponseSchema",
  }),
  route("DELETE", "/restaurant/menu/sections/:sectionId", {
    ...sectionId,
    access: managers,
    status: "204",
  }),
  route("GET", "/restaurant/menu/items", {
    access: restaurantRoles,
    response: "menuItemsResponseSchema",
  }),
  route("GET", "/restaurant/menu/items/:itemId", {
    ...itemId,
    access: restaurantRoles,
    response: "menuItemResponseSchema",
  }),
  route("POST", "/restaurant/menu/items", {
    access: managers,
    body: "createMenuItemSchema",
    response: "menuItemResponseSchema",
    status: "201",
  }),
  route("PATCH", "/restaurant/menu/items/:itemId", {
    ...itemId,
    access: managers,
    body: "patchMenuItemSchema",
    response: "menuItemMetadataResponseSchema",
  }),
  route("DELETE", "/restaurant/menu/items/:itemId", {
    ...itemId,
    access: managers,
    status: "204",
  }),
  route("PATCH", "/restaurant/menu/items/:itemId/availability", {
    ...itemId,
    access: restaurantRoles,
    body: "menuAvailabilitySchema",
    response: "menuAvailabilityResponseSchema",
  }),
  route("POST", "/restaurant/menu/items/:itemId/duplicate", {
    ...itemId,
    access: managers,
    response: "menuDuplicateResponseSchema",
    status: "201",
  }),
  route("POST", "/restaurant/menu/items/:itemId/image", {
    ...itemId,
    access: managers,
    upload: true,
    response: "restaurantImageUploadSchema",
    status: "201",
  }),
  route("GET", "/restaurant/menu/items/:itemId/sizes", {
    ...itemId,
    access: restaurantRoles,
    response: "menuSizesResponseSchema",
  }),
  route("POST", "/restaurant/menu/items/:itemId/sizes", {
    ...itemId,
    access: managers,
    body: "createMenuSizeSchema",
    response: "menuSizeResponseSchema",
    status: "201",
  }),
  route("GET", "/restaurant/menu/sizes/:sizeId", {
    ...sizeId,
    access: restaurantRoles,
    response: "menuSizeResponseSchema",
  }),
  route("PATCH", "/restaurant/menu/sizes/:sizeId", {
    ...sizeId,
    access: managers,
    body: "patchMenuSizeSchema",
    response: "menuSizeResponseSchema",
  }),
  route("DELETE", "/restaurant/menu/sizes/:sizeId", {
    ...sizeId,
    access: managers,
    status: "204",
  }),
  route("GET", "/restaurant/menu/items/:itemId/option-groups", {
    ...itemId,
    access: restaurantRoles,
    response: "menuOptionGroupsResponseSchema",
  }),
  route("POST", "/restaurant/menu/items/:itemId/option-groups", {
    ...itemId,
    access: managers,
    body: "createMenuOptionGroupSchema",
    response: "menuOptionGroupResponseSchema",
    status: "201",
  }),
  route("GET", "/restaurant/menu/option-groups/:groupId", {
    ...groupId,
    access: restaurantRoles,
    response: "menuOptionGroupResponseSchema",
  }),
  route("PATCH", "/restaurant/menu/option-groups/:groupId", {
    ...groupId,
    access: managers,
    body: "patchMenuOptionGroupSchema",
    response: "menuOptionGroupResponseSchema",
  }),
  route("DELETE", "/restaurant/menu/option-groups/:groupId", {
    ...groupId,
    access: managers,
    status: "204",
  }),
  route("GET", "/restaurant/menu/option-groups/:groupId/options", {
    ...groupId,
    access: restaurantRoles,
    response: "menuOptionsResponseSchema",
  }),
  route("POST", "/restaurant/menu/option-groups/:groupId/options", {
    ...groupId,
    access: managers,
    body: "createMenuOptionSchema",
    response: "menuOptionResponseSchema",
    status: "201",
  }),
  route("GET", "/restaurant/menu/options/:optionId", {
    ...optionId,
    access: restaurantRoles,
    response: "menuOptionResponseSchema",
  }),
  route("PATCH", "/restaurant/menu/options/:optionId", {
    ...optionId,
    access: managers,
    body: "patchMenuOptionSchema",
    response: "menuOptionResponseSchema",
  }),
  route("PATCH", "/restaurant/menu/options/:optionId/availability", {
    ...optionId,
    access: restaurantRoles,
    body: "menuAvailabilitySchema",
    response: "menuAvailabilityResponseSchema",
  }),
  route("DELETE", "/restaurant/menu/options/:optionId", {
    ...optionId,
    access: managers,
    status: "204",
  }),
];

const geoResources = [
  [
    "governorates",
    "geoListQuerySchema",
    "governoratesResponseSchema",
    "governorateSchema",
    "governorateCreateSchema",
    "governorateUpdateSchema",
  ],
  [
    "cities",
    "cityListQuerySchema",
    "citiesResponseSchema",
    "citySchema",
    "cityCreateSchema",
    "cityUpdateSchema",
  ],
  [
    "neighborhoods",
    "neighborhoodListQuerySchema",
    "neighborhoodsResponseSchema",
    "neighborhoodSchema",
    "neighborhoodCreateSchema",
    "neighborhoodUpdateSchema",
  ],
  [
    "categories",
    "geoListQuerySchema",
    "foodCategoriesResponseSchema",
    "foodCategorySchema",
    "foodCategoryCreateSchema",
    "foodCategoryUpdateSchema",
  ],
] as const;

const adminGeoRoutes = geoResources.flatMap(
  ([resource, query, listSchema, rowSchema, createSchema, updateSchema]) => {
    const collection = `/admin/${resource}`;
    const path = `${collection}/:id`;
    const params = "geoIdParamsSchema";
    return [
      route("GET", collection, {
        access: operations,
        query,
        response: listSchema,
      }),
      route("GET", path, { access: operations, params, response: rowSchema }),
      route("POST", collection, {
        access: operations,
        body: createSchema,
        response: rowSchema,
        status: "201",
      }),
      route("PATCH", path, {
        access: operations,
        params,
        body: updateSchema,
        response: rowSchema,
      }),
      route("DELETE", path, {
        access: operations,
        params,
        response: rowSchema,
        status: "200 أو 204",
        note: "يعيد الصف المعطّل بـ`200` عند وجود مراجع إليه أو `204` عند الحذف.",
      }),
    ];
  },
);

const adminRoutes = [
  route("GET", "/admin/session", {
    access: adminRoles,
    response: "adminSessionSchema",
  }),
  route("GET", "/admin/dashboard", {
    access: adminRoles,
    response: "adminDashboardSchema",
    note: "تعاد الحقول غير المفوّض بها بقيمة `null`.",
  }),
  route("GET", "/admin/audit-log", {
    access: superAdmin,
    query: "adminAuditLogQuerySchema",
    response: "adminAuditLogSchema",
  }),
  route("GET", "/admin/customers", {
    access: adminCustomerReaders,
    query: "adminCustomerSearchQuerySchema",
    response: "adminCustomerSearchSchema",
  }),
  route("GET", "/admin/customers/:id", {
    ...adminId,
    access: adminCustomerReaders,
    response: "adminCustomerDetailSchema",
  }),
  route("PATCH", "/admin/customers/:id/block", {
    ...adminId,
    access: superAdmin,
    body: "adminCustomerBlockSchema",
    response: "adminCustomerSchema",
  }),
  route("GET", "/admin/users", {
    access: superAdmin,
    response: "adminUserListSchema",
  }),
  route("PATCH", "/admin/users/:id/role", {
    ...adminId,
    access: superAdmin,
    body: "adminUserRoleSchema",
    response: "adminUserSchema",
  }),
  route("GET", "/admin/settings", {
    access: superAdmin,
    response: "adminSettingsSchema",
  }),
  route("PATCH", "/admin/settings", {
    access: superAdmin,
    body: "adminSettingsPatchSchema",
    response: "adminSettingsSchema",
  }),
  route("GET", "/admin/restaurants", {
    access: operations,
    query: "adminRestaurantListQuerySchema",
    response: "restaurantListResponseSchema",
  }),
  route("GET", "/admin/restaurants/:restaurantId", {
    ...restaurantId,
    access: operations,
    response: "adminRestaurantProfileSchema",
  }),
  route("GET", "/admin/restaurants/commissions", {
    access: finance,
    response: "restaurantCommissionsResponseSchema",
  }),
  route("PATCH", "/admin/restaurants/:restaurantId/commission", {
    ...restaurantId,
    access: finance,
    body: "restaurantCommissionSchema",
    response: "restaurantCommissionSchema",
  }),
  ...["approve", "reject", "suspend", "resume"].map((action) =>
    route("POST", `/admin/restaurants/:restaurantId/${action}`, {
      ...restaurantId,
      access: operations,
      body: "restaurantReviewSchema",
      response: "restaurantReviewResponseSchema",
    }),
  ),
  route("GET", "/admin/restaurants/:restaurantId/documents", {
    ...restaurantId,
    access: operations,
    response: "restaurantDocumentsResponseSchema",
  }),
  route("GET", "/admin/restaurants/:restaurantId/documents/:documentId/link", {
    access: operations,
    params: "adminDocumentPathSchema",
    response: "documentLinkSchema",
  }),
  route("GET", "/admin/restaurants/:restaurantId/documents/:documentId", {
    access: operations,
    params: "adminDocumentPathSchema",
    query: "signedDocumentQuerySchema",
    binary: true,
    note: "يعيد `404 NOT_FOUND` عند انقضاء الرابط أو عدم صحة توقيعه.",
  }),
  route("GET", "/admin/orders", {
    access: adminOrderReaders,
    query: "adminOrderListQuerySchema",
    response: "orderListResponseSchema",
  }),
  route("GET", "/admin/orders/needs-attention", {
    access: adminOrderReaders,
    response: "orderListResponseSchema",
  }),
  route("GET", "/admin/orders/metrics", {
    access: adminOrderReaders,
    query: "adminOrderMetricsQuerySchema",
    response: "adminOrderMetricsSchema",
  }),
  route("GET", "/admin/orders/:id", {
    ...orderId,
    access: adminOrderReaders,
    response: "orderReadSchema",
  }),
  route("POST", "/admin/orders/:id/cancel", {
    ...orderId,
    access: operations,
    body: "orderCancellationSchema",
    response: "orderReadSchema",
    note: "يمكن حذف جسم الطلب من `PENDING`. يلزم سبب عند الإلغاء بعد القبول.",
  }),
  route("GET", "/admin/complaints", {
    access: adminOrderReaders,
    query: "adminComplaintListQuerySchema",
    response: "adminComplaintListSchema",
  }),
  route("GET", "/admin/complaints/:id", {
    ...complaintId,
    access: adminOrderReaders,
    response: "adminComplaintSchema",
  }),
  route("PATCH", "/admin/complaints/:id", {
    ...complaintId,
    access: adminOrderReaders,
    body: "reviewComplaintSchema",
    response: "adminComplaintSchema",
  }),
  route("POST", "/admin/complaints/:id/resolve-non-delivery", {
    ...complaintId,
    access: superAdmin,
    body: "resolveNonDeliveryComplaintSchema",
    response: "adminComplaintSchema",
    note: "حسم عدم الاستلام المثبت وترحيل قيده العكسي معاً. يمكن حذف جسم الطلب.",
  }),
  route("GET", "/admin/finance/restaurants", {
    access: finance,
    response: "restaurantBalancesResponseSchema",
  }),
  route("GET", "/admin/finance/restaurants/:restaurantId/ledger", {
    ...restaurantId,
    access: finance,
    response: "financeLedgerResponseSchema",
  }),
  route("POST", "/admin/finance/restaurants/:restaurantId/payments", {
    ...restaurantId,
    access: finance,
    body: "recordPaymentSchema",
    response: "ledgerEntrySchema",
    status: "201",
  }),
  route("POST", "/admin/finance/restaurants/:restaurantId/adjustments", {
    ...restaurantId,
    access: finance,
    body: "recordAdjustmentSchema",
    response: "ledgerEntrySchema",
    status: "201",
  }),
  ...adminGeoRoutes,
];

const groups = [
  { title: "الصحة والتصفح العام", access: "عام", routes: publicRoutes },
  { title: "المصادقة", access: "بيانات المصادقة في الطلب", routes: authRoutes },
  { title: "تطبيق العميل", access: "`customer`", routes: customerRoutes },
  { title: "تطبيق المطعم", access: "`restaurant`", routes: restaurantRoutes },
  { title: "منيو المطعم", access: "`restaurant`", routes: menuRoutes },
  { title: "الإدارة", access: "`admin`", routes: adminRoutes },
];

export const apiRoutes = groups.flatMap(({ routes }) => routes);

function link(name: SchemaName | undefined) {
  return name ? `[\`${name}\`](#${name.toLowerCase()})` : "—";
}

function roles(access: string) {
  return access
    .split("، ")
    .map((role) => `\`${role}\``)
    .join("، ");
}

export function renderApiDocs(): string {
  const referenced = new Set<SchemaName>([
    "errorEnvelopeSchema",
    "orderIdempotencyKeySchema",
    "priceChangedDetailsSchema",
  ]);
  const lines = [
    "# واجهة Be Fast البرمجية",
    "",
    "يُولّد الملف بالأمر `corepack pnpm docs:api` من سجل المسارات وعقود Zod في `packages/contracts`. للتحقق من مطابقته للمصدر شغّل `corepack pnpm docs:api --check`.",
    "",
    "المسارات التي تبدأ بـ`/customer` و`/restaurant` و`/admin` تتطلب ترويسة `Authorization: Bearer <access token>` بنوع الحساب الموافق. بعض عمليات الطلب تطبّق شروطاً إضافية من آلة الحالات. تُرسل أجسام الطلبات بتنسيق JSON، ورفع الصور باستخدام `multipart/form-data` بجزء ملف واحد من JPEG أو PNG أو WebP بحد 5 MiB.",
    "",
    `تستعمل الأخطاء غلاف ${link("errorEnvelopeSchema")}. تفشل المدخلات غير الصالحة عادة بـ\`400\`، وتعيد المصادقة أو الصلاحية \`401\` أو \`403\`، ويعيد المورد غير المتاح لذلك الحساب \`404\`. تستعمل حدود المعدّل \`429\` عند تجاوزها.`,
    "",
    `أكواد الخطأ المشتركة ${contracts.errorCodes.map((code) => `\`${code}\``).join("، ")}.`,
    "",
  ];
  for (const group of groups) {
    lines.push(
      `## ${group.title}`,
      "",
      "| الطريقة والمسار | الدور أو نوع الدخول | معاملات المسار | الاستعلام | الجسم | نجاح الاستجابة | ملاحظات |",
      "| --- | --- | --- | --- | --- | --- | --- |",
    );
    for (const entry of group.routes) {
      for (const name of [
        entry.params,
        entry.query,
        entry.body,
        entry.response,
      ]) {
        if (name) referenced.add(name);
      }
      const status = entry.status ?? "200";
      const response = entry.binary
        ? "`image/webp`"
        : entry.response
          ? link(entry.response)
          : "بلا جسم";
      const body = entry.upload ? "`multipart/form-data`" : link(entry.body);
      lines.push(
        `| \`${entry.method} ${entry.path}\` | ${entry.access ? roles(entry.access) : group.access} | ${link(entry.params)} | ${link(entry.query)} | ${body} | ${status} · ${response} | ${entry.note ?? "—"} |`,
      );
    }
    lines.push("");
  }
  lines.push(
    "## مخططات العقود",
    "",
    "تصف المخططات البيانات المتبادلة. يفرض الخادم أيضاً قواعد الملكية والعزل والتحققات متعددة الحقول والتحويلات، مثل تطبيع الهاتف. الحقول المنتهية بـ`Minor` مبالغ صحيحة في الوحدة الصغرى.",
    "",
  );
  for (const name of [...referenced].sort()) {
    const jsonSchema = z.toJSONSchema(schemas[name], {
      io: "input",
      unrepresentable: "any",
    });
    lines.push(
      `### ${name}`,
      "",
      "<details>",
      "<summary>JSON Schema</summary>",
      "",
      "```json",
      JSON.stringify(jsonSchema, null, 2),
      "```",
      "",
      "</details>",
      "",
    );
  }
  return lines.join("\n");
}
