import { InfraiClient } from "./infrai_client.ts";
import { ingestLogisticsDocument } from "./logistics_ingest.ts";
import { ingestRequestSchema } from "./shipment_policy.ts";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before running the sample");

const input = ingestRequestSchema.parse({
  shipmentId: "SHP-2048",
  event: {
    type: "delivered",
    occurredAt: "2026-09-27T09:15:00.000Z",
    facility: "Shanghai Pudong depot",
    note: "Signed by receiving desk"
  },
  document: {
    kind: "proof_of_delivery",
    pdf: process.env.POD_PDF ?? "https://example.com/pod/SHP-2048.pdf"
  }
});

const result = await ingestLogisticsDocument(input, new InfraiClient(apiKey, process.env.INFRAI_BASE_URL));
console.log(JSON.stringify(result, null, 2));
