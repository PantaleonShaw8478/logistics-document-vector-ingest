import { z } from "zod";

export const ingestRequestSchema = z.object({
  shipmentId: z.string().min(1),
  event: z.object({
    type: z.enum(["picked_up", "in_transit", "delivered", "exception"]),
    occurredAt: z.string().datetime(),
    facility: z.string().min(1),
    note: z.string().max(2_000).optional()
  }),
  document: z.object({
    kind: z.enum(["shipment_event", "proof_of_delivery", "exception_report"]),
    pdf: z.string().min(1)
  }),
  exception: z.object({
    code: z.string().min(1),
    owner: z.string().min(1)
  }).optional()
}).superRefine((value, context) => {
  if (value.event.type === "exception" && !value.exception) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["exception"],
      message: "exception details are required for exception events"
    });
  }
});

export type IngestRequest = z.infer<typeof ingestRequestSchema>;
export type ShipmentDisposition = "in_transit" | "ready_to_close" | "needs_review";

export function decideDisposition(input: IngestRequest): ShipmentDisposition {
  if (input.event.type === "exception") return "needs_review";
  if (input.event.type === "delivered" && input.document.kind === "proof_of_delivery") {
    return "ready_to_close";
  }
  return "in_transit";
}

export function chunkDocument(text: string, maximumCharacters = 1_200): string[] {
  const paragraphs = text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > maximumCharacters) {
      chunks.push(current);
      current = "";
    }
    if (paragraph.length <= maximumCharacters) {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
      continue;
    }
    if (current) chunks.push(current);
    for (let offset = 0; offset < paragraph.length; offset += maximumCharacters) {
      chunks.push(paragraph.slice(offset, offset + maximumCharacters));
    }
  }

  if (current) chunks.push(current);
  return chunks;
}
