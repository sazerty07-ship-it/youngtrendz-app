const BOL_TOKEN_URL = "https://login.bol.com/token";
const BOL_API_URL = "https://api.bol.com/retailer";
const BOL_MEDIA_TYPE = "application/vnd.retailer.v10+json";
const ALLOWED_ORIGIN = "https://sazerty07-ship-it.github.io";

let cachedBolToken = null;
let cachedBolTokenExpiresAt = 0;
let tokenRequestInFlight = null;

function json(data, status = 200, origin = ALLOWED_ORIGIN) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin,
      "Vary": "Origin",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

async function getBolToken(env) {
  const now = Date.now();
  if (cachedBolToken && now < cachedBolTokenExpiresAt - 30000) {
    return cachedBolToken;
  }
  if (tokenRequestInFlight) return tokenRequestInFlight;

  tokenRequestInFlight = (async () => {
    const credentials = btoa(env.BOL_CLIENT_ID + ":" + env.BOL_CLIENT_SECRET);
    const response = await fetch(BOL_TOKEN_URL, {
      method: "POST",
      headers: {
        "Authorization": "Basic " + credentials,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body: "grant_type=client_credentials"
    });

    if (!response.ok) {
      // Do not return credentials or upstream response bodies to the browser.
      throw new Error("Bol.com authentication failed (HTTP " + response.status + "). Check the API credentials and Retailer API access.");
    }

    const data = await response.json();
    if (!data.access_token || !Number.isFinite(data.expires_in)) {
      throw new Error("Bol.com returned an invalid access token response.");
    }

    cachedBolToken = data.access_token;
    cachedBolTokenExpiresAt = Date.now() + data.expires_in * 1000;
    return cachedBolToken;
  })();

  try {
    return await tokenRequestInFlight;
  } finally {
    tokenRequestInFlight = null;
  }
}

function isAuthorized(request, env) {
  const header = request.headers.get("Authorization") || "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!supplied || !env.APP_ACCESS_TOKEN) return false;

  // Constant-time comparison for equal-length values.
  const a = new TextEncoder().encode(supplied);
  const b = new TextEncoder().encode(env.APP_ACCESS_TOKEN);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;

    if (request.method === "OPTIONS") {
      if (origin !== ALLOWED_ORIGIN) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) });
    }

    const url = new URL(request.url);

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "youngtrendz-bol-backend", mode: "read-only-orders" }, 200, allowedOrigin);
    }

    if (origin && origin !== ALLOWED_ORIGIN) {
      return json({ error: "Origin not allowed." }, 403, allowedOrigin);
    }

    if (url.pathname === "/api/orders" && request.method === "GET") {
      if (!isAuthorized(request, env)) {
        return json({ error: "Niet aangemeld. Controleer je app-toegangscode." }, 401, allowedOrigin);
      }

      if (!env.BOL_CLIENT_ID || !env.BOL_CLIENT_SECRET) {
        return json({ error: "Bol.com API-gegevens zijn nog niet ingesteld op de backend." }, 503, allowedOrigin);
      }

      const status = url.searchParams.get("status") || "OPEN";
      const fulfilment = url.searchParams.get("fulfilment-method") || "FBR";
      const page = Number(url.searchParams.get("page") || "1");

      if (!["OPEN", "SHIPPED", "ALL"].includes(status) ||
          !["FBR", "FBB", "ALL"].includes(fulfilment) ||
          !Number.isInteger(page) || page < 1 || page > 10) {
        return json({ error: "Ongeldige filterinstellingen." }, 400, allowedOrigin);
      }

      try {
        const token = await getBolToken(env);
        const endpoint = new URL(BOL_API_URL + "/orders");
        endpoint.searchParams.set("status", status);
        endpoint.searchParams.set("fulfilment-method", fulfilment);
        endpoint.searchParams.set("page", String(page));

        const upstream = await fetch(endpoint.toString(), {
          headers: {
            "Authorization": "Bearer " + token,
            "Accept": BOL_MEDIA_TYPE
          }
        });

        if (!upstream.ok) {
          return json({
            error: "Bol.com kon de bestellingen niet ophalen.",
            bolStatus: upstream.status
          }, upstream.status >= 500 ? 502 : upstream.status, allowedOrigin);
        }

        const data = await upstream.json();
        return json(data, 200, allowedOrigin);
      } catch (error) {
        return json({
          error: error instanceof Error ? error.message : "Onbekende backendfout."
        }, 502, allowedOrigin);
      }
    }

    return json({ error: "Endpoint niet gevonden." }, 404, allowedOrigin);
  }
};
