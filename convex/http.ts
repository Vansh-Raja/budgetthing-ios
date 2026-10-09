import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { sha256Hex } from "./apiImportShared";

const http = httpRouter();
const MAX_BODY_BYTES = 128 * 1024;

function jsonResponse(status: number, body: any, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

function bearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function requestHashes(request: Request) {
  const ip = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")
    ?? "unknown";
  const ua = request.headers.get("user-agent") ?? "unknown";
  return {
    ipHash: await sha256Hex(ip),
    userAgentHash: await sha256Hex(ua),
  };
}

function methodNotAllowed() {
  return jsonResponse(405, { error: "method_not_allowed" });
}

http.route({
  path: "/v1/health",
  method: "GET",
  handler: httpAction(async () => {
    // Public liveness check with no data and no credentials; readable cross-origin so the PWA
    // can verify connectivity when navigator.onLine is unreliable.
    return jsonResponse(200, {
      status: "ok",
      service: "budgetthing-import-api",
      version: "1",
    }, { "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
  }),
});

http.route({
  path: "/v1/import/metadata",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const rawKey = bearerToken(request);
    if (!rawKey) return jsonResponse(401, { error: "unauthorized" });
    const hashes = await requestHashes(request);
    const result = await ctx.runMutation(internal.apiImportHttp.metadataForToken, {
      rawKey,
      ...hashes,
    });
    return jsonResponse(result.statusCode, result.body, result.headers);
  }),
});

http.route({
  path: "/v1/imports",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const rawKey = bearerToken(request);
    if (!rawKey) return jsonResponse(401, { error: "unauthorized" });

    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey) return jsonResponse(400, { error: "missing_idempotency_key" });

    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
      return jsonResponse(413, { error: "payload_too_large", maxBytes: MAX_BODY_BYTES });
    }

    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      return jsonResponse(400, { error: "invalid_json" });
    }

    const hashes = await requestHashes(request);
    const result = await ctx.runMutation(internal.apiImportHttp.createImportsForToken, {
      rawKey,
      idempotencyKey,
      body,
      ...hashes,
    });
    return jsonResponse(result.statusCode, result.body, result.headers);
  }),
});

http.route({
  path: "/v1/imports/status",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const rawKey = bearerToken(request);
    if (!rawKey) return jsonResponse(401, { error: "unauthorized" });

    const url = new URL(request.url);
    const source = url.searchParams.get("source")?.trim();
    const externalId = url.searchParams.get("externalId")?.trim();
    if (!source || !externalId) {
      return jsonResponse(400, { error: "source_and_externalId_required" });
    }

    const hashes = await requestHashes(request);
    const result = await ctx.runMutation(internal.apiImportHttp.statusForToken, {
      rawKey,
      source,
      externalId,
      ...hashes,
    });
    return jsonResponse(result.statusCode, result.body, result.headers);
  }),
});

http.route({
  path: "/v1/imports",
  method: "GET",
  handler: httpAction(async () => methodNotAllowed()),
});

export default http;
