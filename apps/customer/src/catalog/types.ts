import type { DisplayMode } from "@be-fast/domain";

export interface Region {
  governorateId: string;
  governorateName: string;
  cityId: string;
  cityName: string;
  neighborhoodId: string;
  neighborhoodName: string;
}

export interface CartLine {
  key: string;
  menuItemId: string;
  sizeId: string;
  optionIds: string[];
  quantity: number;
  note?: string;
  name: string;
  sizeName: string;
  optionNames: string[];
  sizePriceMinor: number;
  optionPricesMinor: number[];
}

export interface Cart {
  restaurantId: string;
  branchId: string;
  restaurantName: string;
  pickupEnabled: boolean;
  deliveryFeeMinor: number;
  minOrderMinor: number;
  etaMinutes: number;
  currencyDisplayMode: DisplayMode;
  items: CartLine[];
}
