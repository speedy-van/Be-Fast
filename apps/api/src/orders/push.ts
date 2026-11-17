import type { OrderStatus } from "@be-fast/domain";
import type { FastifyBaseLogger } from "fastify";

export interface PushProvider {
  newOrder(restaurantId: string, orderId: string): Promise<void>;
  orderStatusChanged(
    customerId: string,
    orderId: string,
    status: OrderStatus,
  ): Promise<void>;
  orderReminder(restaurantId: string, orderId: string): Promise<void>;
}

export class DevPushProvider implements PushProvider {
  constructor(private readonly logger: FastifyBaseLogger) {}

  async newOrder(restaurantId: string, orderId: string) {
    this.logger.info({ restaurantId, orderId }, "New restaurant order.");
  }

  async orderStatusChanged(
    customerId: string,
    orderId: string,
    status: OrderStatus,
  ) {
    this.logger.info(
      { customerId, orderId, status },
      "Customer order status changed.",
    );
  }

  async orderReminder(restaurantId: string, orderId: string) {
    this.logger.info(
      { restaurantId, orderId },
      "Pending restaurant order reminder.",
    );
  }
}

export async function notifyPush(
  logger: FastifyBaseLogger,
  send: () => Promise<void>,
) {
  try {
    await send();
  } catch {
    logger.warn("Order notification failed.");
  }
}
