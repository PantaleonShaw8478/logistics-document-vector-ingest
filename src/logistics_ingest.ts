import { createHash } from "node:crypto";
import { InfraiClient } from "./infrai_client.ts";
import { chunkDocument, decideDisposition, type IngestRequest } from "./shipment_policy.ts";

export type IngestResult = {
  shipmentId: string;
  disposition: ReturnType<typeof decideDisposition>;
  chunksIndexed: number;
  collection: string;
};

export async function ingestLogisticsDocument(
  input: IngestRequest,
  infrai: InfraiClient,
  collection = "logistics-documents"
): Promise<IngestResult> {
  const parsed = await infrai.parsePdf(input.document.pdf);
  const chunks = chunkDocument(parsed.text);
  if (chunks.length === 0) throw new Error("The parsed document contained no indexable text");

  const embeddings = await infrai.embed(chunks);
  await infrai.ensureCollection(collection, embeddings[0].length);

  const disposition = decideDisposition(input);
  const vectors = chunks.map((text, index) => ({
    id: `${input.shipmentId}:${input.event.occurredAt}:${index}`,
    embedding: embeddings[index],
    metadata: {
      shipment_id: input.shipmentId,
      event_type: input.event.type,
      occurred_at: input.event.occurredAt,
      facility: input.event.facility,
      document_kind: input.document.kind,
      disposition,
      exception_code: input.exception?.code ?? null,
      exception_owner: input.exception?.owner ?? null,
      text
    }
  }));
  const requestId = createHash("sha256")
    .update(`${input.shipmentId}:${input.event.occurredAt}:${input.document.kind}`)
    .digest("hex");
  await infrai.upsert(collection, vectors, `shipment:${requestId}`);

  return { shipmentId: input.shipmentId, disposition, chunksIndexed: vectors.length, collection };
}
