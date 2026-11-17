import AsyncStorage from "@react-native-async-storage/async-storage";
import { createCustomerStore } from "./store";

export const { state: customerStore, flush: flushCustomerStore } =
  createCustomerStore(AsyncStorage);
export const customerStorageReady = customerStore.persist.rehydrate();
