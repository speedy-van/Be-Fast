import {
  complaintTypes,
  createComplaintSchema,
  customerComplaintResponseSchema,
  customerComplaintSchema,
  type OrderReadResponse,
} from "@be-fast/contracts";
import {
  customerOrdersText as text,
  formatDamascusDateTime,
  messages,
} from "@be-fast/i18n";
import { useRef, useState } from "react";
import { View } from "react-native";
import { serviceError, type CustomerRequest } from "../api";
import { AppText, Button, Choices, Field, Status, styles } from "../ui";
import { useOrderRead } from "./use-order-read";

const types = complaintTypes.map((id) => ({
  id,
  label: text.complaintTypes[id],
}));

export function OrderComplaint({
  order,
  request,
}: {
  order: OrderReadResponse;
  request: CustomerRequest;
}) {
  const path = `/customer/orders/${order.id}/complaint`;
  const complaint = useOrderRead(
    request,
    path,
    customerComplaintResponseSchema,
  );
  const current = complaint.data?.complaint;
  const allowedTypes =
    order.status === "DELIVERED"
      ? types
      : types.filter(({ id }) => id === "OTHER");
  const [kind, setKind] = useState<(typeof complaintTypes)[number]>("OTHER");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string>();
  const [sending, setSending] = useState(false);
  const active = useRef(false);

  async function send() {
    if (active.current) return;
    const payload = createComplaintSchema.safeParse({
      type: kind,
      text: details,
    });
    if (!payload.success) {
      setError(messages.errors.validationError);
      return;
    }
    active.current = true;
    setSending(true);
    setError(undefined);
    try {
      const created = await request(
        path,
        { method: "POST", body: payload.data },
        customerComplaintSchema,
      );
      complaint.replace({ complaint: created });
      setDetails("");
    } catch (cause) {
      setError(serviceError(cause));
      await complaint.refresh();
    } finally {
      active.current = false;
      setSending(false);
    }
  }

  return (
    <View style={styles.card}>
      <AppText title accessibilityRole="header">
        {text.complaint}
      </AppText>
      <Status
        busy={complaint.loading}
        error={complaint.error}
        message={
          complaint.error && complaint.updatedAt !== undefined
            ? text.stale(
                formatDamascusDateTime(
                  new Date(complaint.updatedAt).toISOString(),
                ),
              )
            : undefined
        }
        retry={complaint.refresh}
      />
      {current && (
        <>
          <AppText>{text.complaintStatuses[current.status]}</AppText>
          <AppText muted>{current.text}</AppText>
          {current.status !== "RESOLVED" && (
            <Button
              label={text.checkComplaint}
              disabled={complaint.loading}
              onPress={() => void complaint.refresh()}
            />
          )}
        </>
      )}
      {complaint.data && (!current || current.status === "RESOLVED") && (
        <>
          <Choices
            label={text.complaintKind}
            values={allowedTypes}
            selected={kind}
            onSelect={setKind}
            disabled={sending}
          />
          <Field
            label={text.complaintPlaceholder}
            value={details}
            onChangeText={setDetails}
            maxLength={1000}
            multiline
            editable={!sending}
          />
          <Button
            label={text.sendComplaint}
            primary
            onPress={() => void send()}
            disabled={
              sending || complaint.loading || details.trim().length === 0
            }
          />
        </>
      )}
      <Status busy={sending} error={error} />
    </View>
  );
}
