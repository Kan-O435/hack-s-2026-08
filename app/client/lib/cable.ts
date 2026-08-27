import { createConsumer, type Consumer } from "@rails/actioncable";

export function createRoomConsumer(token: string): Consumer {
  const wsBase = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(
    /^http/,
    "ws",
  );
  return createConsumer(`${wsBase}/cable?token=${encodeURIComponent(token)}`);
}
