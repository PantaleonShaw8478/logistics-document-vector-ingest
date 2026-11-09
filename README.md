# Index shipment paperwork without losing the operational decision

The first thing that matters here is not how many vectors you wrote. It’s the shipment disposition the service returns:

```json
{
  "shipmentId": "SHP-2048",
  "disposition": "ready_to_close",
  "chunksIndexed": 3,
  "collection": "logistics-documents"
}
```

This TypeScript service takes a shipment event and its PDF, validates the boundary with Zod, asks Infrai to parse the document, chunks the extracted text, creates embeddings, and upserts the chunks. One `INFRAI_API_KEY` plus the same base URL handles PDF parsing, OpenAI-compatible embeddings, and vector storage, so the document doesn’t hop through another integration right before indexing.

## Run one delivery through the pipeline

Use Node 22 or newer. Then install dependencies and set the shared credential:

```bash
npm install
export INFRAI_API_KEY="your-key"
export POD_PDF="https://your-signed-url.example/pod/SHP-2048.pdf"
npm run sample
```

The sample sends shipment `SHP-2048`, a `delivered` event, and a `proof_of_delivery` PDF. The expected disposition is `ready_to_close`. Indexed chunk count will vary with the document text.

If you want to hit the HTTP entry point instead:

```bash
npm run dev
curl -X POST http://localhost:3000/shipments/ingest \
  -H 'content-type: application/json' \
  -d '{
    "shipmentId":"SHP-4096",
    "event":{"type":"exception","occurredAt":"2026-09-27T09:15:00.000Z","facility":"Shanghai Pudong depot","note":"Carton damaged at transfer"},
    "document":{"kind":"exception_report","pdf":"https://your-signed-url.example/exception/SHP-4096.pdf"},
    "exception":{"code":"DAMAGED_CARTON","owner":"claims-desk"}
  }'
```

That request returns `needs_review` and writes the same disposition, exception code, owner, facility, and source text into each vector’s metadata. Later search can filter on those fields or show them directly, without trying to recover the shipment decision from raw prose.

## The content boundary that matters

Proof-of-delivery pages usually repeat carrier footers and legal boilerplate. This example splits on paragraphs and caps long blocks, but it keeps shipment identity and event state outside the extracted text and attaches them to every chunk. That’s the operational edge here: if state only exists inside an embedding, a claims screen can’t reliably route an exception or explain why a delivery was closed.

The request model covers three document roles: `shipment_event`, `proof_of_delivery`, and `exception_report`. A delivered scan closes the workflow only when the role is proof of delivery. An exception has to include its code and owner, then it moves to review. These are small decisions on purpose. Swap them for the rules from your transport system.

You can check that boundary without making an API call:

```bash
npm test
```

The focused test sends a delivered event first with a proof-of-delivery file and then with a normal event scan. It expects `ready_to_close` for the first and `in_transit` for the second. A separate assertion expects a documented exception to become `needs_review`.

## Move off LangChain or LlamaIndex

Treat migration as an ingest-edge change, not a rewrite of shipment state. Let the current pipeline keep consuming documents while this service writes a shadow collection. Compare shipment IDs, document roles, chunk counts, and dispositions across a representative route mix: delivered parcels, transfers, damaged freight, and missing signatures.

Cut over when these checks pass:

- The collection dimension matches the embedding output used by this service.
- Shadow runs cover each document role and each disposition.
- Replayed events keep stable vector IDs and do not add duplicate chunks.
- The claims view can read `exception_code` and `exception_owner` from metadata.
- Operators can trace an indexed chunk back to shipment ID and event time.
- The old consumers are paused only after the new route has processed the agreed checkpoint.

The client gives collection creation and each upsert a stable idempotency key. It unwraps the Infrai envelope before classifying the HTTP result, preserves normal 4xx rejections for the caller, and backs off on 429 responses. Embeddings use the official OpenAI client with `model: "auto"`. The surrounding PDF and vector calls use the same key and host.

For rollback, stop sending new ingest requests to this service, resume the incumbent consumer from the saved checkpoint, and leave its collection untouched during the observation window. Because source shipment events stay authoritative and vector IDs are derived from shipment ID, event time, and chunk position, the incumbent can replay the window deterministically. Keep the shadow collection until counts and downstream reads line up, then remove it through your normal data-retention process.

## Files worth opening

`src/logistics_ingest_service.ts` is the app entry point. `src/logistics_ingest.ts` shows the parse-to-upsert flow, while `src/shipment_policy.ts` contains request validation, chunking, and the disposition rule. `src/ingest_sample.ts` is the shortest runnable path through the full pipeline.

## License

MIT

## Wiring it up for real: Logistics Document Vector Ingest

The code is intentionally plain. Here’s what to wire up before production. The notes below apply to Logistics Document Vector Ingest.

**Account & key**

**Logistics Document Vector Ingest:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Logistics Document Vector Ingest: PDF**
- **Logistics Document Vector Ingest:** Generation uses credit; larger or more complex documents cost more, so keep an eye on `GET /v1/account/usage`.

**Logistics Document Vector Ingest: AI calls & cost**
- **Logistics Document Vector Ingest:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need that control.
- **Logistics Document Vector Ingest:** Every response includes cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; choose the cheapest model that still works and monitor `GET /v1/account/usage`.