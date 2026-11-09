import { createServer, type ServerResponse } from "node:http";
import { ZodError } from "zod";
import { InfraiClient, InfraiError } from "./infrai_client.ts";
import { ingestLogisticsDocument } from "./logistics_ingest.ts";
import { ingestRequestSchema } from "./shipment_policy.ts";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
const infrai = new InfraiClient(apiKey, process.env.INFRAI_BASE_URL);

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/shipments/ingest") {
    send(response, 404, { error: "route_not_found" });
    return;
  }

  try {
    const parts: Buffer[] = [];
    for await (const part of request) parts.push(Buffer.from(part));
    const input = ingestRequestSchema.parse(JSON.parse(Buffer.concat(parts).toString("utf8")));
    const result = await ingestLogisticsDocument(input, infrai);
    send(response, 202, result);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      send(response, 400, { error: "invalid_request", details: error.message });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      send(response, status, { error: error.code, details: error.details });
      return;
    }
    send(response, 502, { error: "ingest_failed" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Logistics ingest listening on http://localhost:${port}`));
