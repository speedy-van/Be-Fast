import { createApi } from "./app.js";
import { readAuthSecret, readDatabaseUrl } from "./config.js";
import { createConfiguredStorage } from "./storage-config.js";

const host = process.env.HOST;
const port = Number(process.env.PORT);
if (!host || !Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("HOST and a valid PORT are required.");
}

const api = createApi(readDatabaseUrl(), {
  logger: true,
  storage: createConfiguredStorage(process.env),
  auth: {
    secret: readAuthSecret(),
    developmentOtp: process.env.NODE_ENV === "development",
  },
});
await api.listen({ host, port });
