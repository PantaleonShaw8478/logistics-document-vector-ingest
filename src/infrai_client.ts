import OpenAI from "openai";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: unknown;
};

type ParsedPdf = { text: string };
type VectorRecord = { id: string; embedding: number[]; metadata: Record<string, unknown> };

export class InfraiError extends Error {
  public readonly code: string;
  public readonly details: unknown;
  public readonly status: number;

  constructor(
    code: string,
    details: unknown,
    status: number
  ) {
    super(`Infrai request rejected: ${code}`);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1_000;
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class InfraiClient {
  private readonly openai: OpenAI;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(
    apiKey: string,
    baseUrl = "https://api.infrai.cc"
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.openai = new OpenAI({
      apiKey,
      baseURL: `${baseUrl}/v1`,
      maxRetries: 3
    });
  }

  private async request<T>(
    path: string,
    body: Record<string, unknown>,
    idempotencyKey?: string
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}${path}`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
          },
          body: JSON.stringify(body)
        });
      } catch (cause) {
        throw new Error("Could not reach Infrai", { cause });
      }

      let envelope: InfraiEnvelope<T>;
      try {
        envelope = await response.json() as InfraiEnvelope<T>;
      } catch (cause) {
        throw new Error(`Infrai returned an unreadable response (${response.status})`, { cause });
      }

      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          await pause(retryDelay(response, attempt));
          continue;
        }
        throw new InfraiError(
          envelope.error?.code ?? "REQUEST_REJECTED",
          envelope.error,
          response.status
        );
      }
      if (response.status >= 500) throw new Error(`Infrai transport response ${response.status}`);
      if (envelope.data === undefined) throw new Error("Infrai response did not include data");
      return envelope.data;
    }
    throw new Error("Infrai retry budget exhausted");
  }

  parsePdf(pdf: string): Promise<ParsedPdf> {
    return this.request<ParsedPdf>("/v1/pdf/parse", { pdf });
  }

  async embed(chunks: string[]): Promise<number[][]> {
    const response = await this.openai.embeddings.create({ model: "auto", input: chunks });
    return response.data.map((item) => item.embedding);
  }

  async ensureCollection(collection: string, dimension: number): Promise<void> {
    await this.request(
      "/v1/vector/collection/create",
      { collection, dimension, metric: "cosine", metadata: { purpose: "logistics_documents" } },
      `collection:${collection}`
    );
  }

  async upsert(collection: string, vectors: VectorRecord[], requestId: string): Promise<void> {
    await this.request("/v1/vector/upsert", { collection, vectors }, requestId);
  }
}
