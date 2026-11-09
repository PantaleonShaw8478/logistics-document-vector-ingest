import assert from "node:assert/strict";
import test from "node:test";
import { decideDisposition, ingestRequestSchema } from "../src/shipment_policy.ts";

const eventBase = {
  occurredAt: "2026-09-27T09:15:00.000Z",
  facility: "Shanghai Pudong depot"
};

test("closes a delivery only when its document is proof of delivery", () => {
  const withPod = ingestRequestSchema.parse({
    shipmentId: "SHP-2048",
    event: { ...eventBase, type: "delivered" },
    document: { kind: "proof_of_delivery", pdf: "https://example.com/pod.pdf" }
  });
  const withEventScan = ingestRequestSchema.parse({
    shipmentId: "SHP-2048",
    event: { ...eventBase, type: "delivered" },
    document: { kind: "shipment_event", pdf: "https://example.com/event.pdf" }
  });

  assert.equal(decideDisposition(withPod), "ready_to_close");
  assert.equal(decideDisposition(withEventScan), "in_transit");
});

test("routes a documented exception to review", () => {
  const exception = ingestRequestSchema.parse({
    shipmentId: "SHP-4096",
    event: { ...eventBase, type: "exception", note: "Carton damaged at transfer" },
    document: { kind: "exception_report", pdf: "https://example.com/exception.pdf" },
    exception: { code: "DAMAGED_CARTON", owner: "claims-desk" }
  });

  assert.equal(decideDisposition(exception), "needs_review");
});
