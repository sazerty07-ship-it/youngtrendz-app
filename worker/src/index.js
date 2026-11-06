const BOL_TOKEN_URL = "https://login.bol.com/token";
const BOL_API_URL = "https://api.bol.com/retailer";
const BOL_MEDIA_TYPE = "application/vnd.retailer.v10+json";
const ALLOWED_ORIGINS = new Set([
  "https://sazerty07-ship-it.github.io",
  "https://youngtrendz-app.s-azerty07.workers.dev"
]);

let cachedBolToken = null;
let cachedBolTokenExpiresAt = 0;
let tokenRequestInFlight = null;

function json(data, status = 200, origin = "https://sazerty07-ship-it.github.io") {
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

async function getBolToken(env) {
  const now = Date.now();
  if (cachedBolToken && now < cachedBolTokenExpiresAt - 30000) return cachedBolToken;
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
      throw new Error("Bol.com-authenticatie mislukt (HTTP " + response.status + "). Controleer de Retailer API-gegevens.");
    }
    const data = await response.json();
    if (!data.access_token || !Number.isFinite(data.expires_in)) {
      throw new Error("Bol.com gaf een ongeldig tokenantwoord terug.");
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
  const a = new TextEncoder().encode(supplied);
  const b = new TextEncoder().encode(env.APP_ACCESS_TOKEN);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function readJson(request) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 20000) throw new Error("Aanvraag is te groot.");
  try {
    return await request.json();
  } catch {
    throw new Error("Ongeldige JSON-aanvraag.");
  }
}

function validateOrderItems(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new Error("Geef één of meer geldige orderitems op.");
  }
  return value.map(item => {
    const orderItemId = String(item?.orderItemId || "").trim();
    const quantity = item?.quantity === undefined ? undefined : Number(item.quantity);
    if (!/^\d{5,20}$/.test(orderItemId)) throw new Error("Ongeldig orderItemId.");
    if (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000)) {
      throw new Error("Ongeldige hoeveelheid voor een orderitem.");
    }
    return quantity === undefined ? { orderItemId } : { orderItemId, quantity };
  });
}

async function bolFetch(env, path, options = {}) {
  const token = await getBolToken(env);
  return fetch(BOL_API_URL + path, {
    ...options,
    headers: {
      "Authorization": "Bearer " + token,
      "Accept": BOL_MEDIA_TYPE,
      ...(options.body ? { "Content-Type": BOL_MEDIA_TYPE } : {}),
      ...(options.headers || {})
    }
  });
}

async function upstreamJson(response, origin, label) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return json({
      error: label + " mislukt bij bol.com.",
      bolStatus: response.status,
      details: data?.title || data?.detail || data?.violations?.[0]?.message || null
    }, response.status >= 500 ? 502 : response.status, origin);
  }
  return json(data, response.status, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://sazerty07-ship-it.github.io";

    if (request.method === "OPTIONS") {
      if (!ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) });
    }

    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "youngtrendz-bol-backend", mode: "shipping-workflow" }, 200, allowedOrigin);
    }
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return json({ error: "Origin niet toegestaan." }, 403, allowedOrigin);
    }

    if (url.pathname === "/api/auth-check" && request.method === "GET") {
      const header = request.headers.get("Authorization") || "";
      const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
      return json({
        authorized: isAuthorized(request, env),
        appAccessTokenConfigured: Boolean(env.APP_ACCESS_TOKEN),
        authorizationHeaderReceived: Boolean(supplied)
      }, 200, allowedOrigin);
    }

    if (!url.pathname.startsWith("/api/")) {
      if ((request.method === "GET" || request.method === "HEAD") && env.ASSETS) return env.ASSETS.fetch(request);
      return json({ error: "Endpoint niet gevonden." }, 404, allowedOrigin);
    }

    if (!isAuthorized(request, env)) {
      return json({ error: "Niet aangemeld. Controleer je app-toegangscode." }, 401, allowedOrigin);
    }
    if (!env.BOL_CLIENT_ID || !env.BOL_CLIENT_SECRET) {
      return json({ error: "Bol.com API-gegevens ontbreken op de backend." }, 503, allowedOrigin);
    }

    try {
      if (url.pathname === "/api/orders" && request.method === "GET") {
        const status = url.searchParams.get("status") || "OPEN";
        const fulfilment = url.searchParams.get("fulfilment-method") || "FBR";
        const page = Number(url.searchParams.get("page") || "1");
        if (!["OPEN", "SHIPPED", "ALL"].includes(status) ||
            !["FBR", "FBB", "ALL"].includes(fulfilment) ||
            !Number.isInteger(page) || page < 1 || page > 10) {
          return json({ error: "Ongeldige filterinstellingen." }, 400, allowedOrigin);
        }
        const endpoint = new URL(BOL_API_URL + "/orders");
        endpoint.searchParams.set("status", status);
        endpoint.searchParams.set("fulfilment-method", fulfilment);
        endpoint.searchParams.set("page", String(page));
        const response = await bolFetch(env, "/orders?" + endpoint.searchParams.toString());
        return await upstreamJson(response, allowedOrigin, "Bestellingen ophalen");
      }

      if (url.pathname === "/api/delivery-options" && request.method === "POST") {
        const body = await readJson(request);
        const orderItems = validateOrderItems(body.orderItems);
        const response = await bolFetch(env, "/shipping-labels/delivery-options", {
          method: "POST",
          body: JSON.stringify({ orderItems })
        });
        return await upstreamJson(response, allowedOrigin, "Verzendopties ophalen");
      }

      if (url.pathname === "/api/shipping-labels" && request.method === "POST") {
        const body = await readJson(request);
        const orderItems = validateOrderItems(body.orderItems);
        const shippingLabelOfferId = String(body.shippingLabelOfferId || "").trim();
        if (!shippingLabelOfferId || shippingLabelOfferId.length > 200) {
          return json({ error: "Ongeldige shippingLabelOfferId." }, 400, allowedOrigin);
        }
        const response = await bolFetch(env, "/shipping-labels", {
          method: "POST",
          body: JSON.stringify({ orderItems, shippingLabelOfferId })
        });
        return await upstreamJson(response, allowedOrigin, "Label aanvragen");
      }

      if (url.pathname === "/api/process-status" && request.method === "GET") {
        const id = String(url.searchParams.get("id") || "").trim();
        if (!/^[A-Za-z0-9-]{5,100}$/.test(id)) return json({ error: "Ongeldig processStatusId." }, 400, allowedOrigin);
        const token = await getBolToken(env);
        const response = await fetch("https://api.bol.com/shared/process-status/" + encodeURIComponent(id), {
          headers: { "Authorization": "Bearer " + token, "Accept": BOL_MEDIA_TYPE }
        });
        return await upstreamJson(response, allowedOrigin, "Processtatus ophalen");
      }

      const labelMatch = url.pathname.match(/^\/api\/shipping-labels\/([A-Za-z0-9-]{5,100})$/);
      if (labelMatch && request.method === "GET") {
        const token = await getBolToken(env);
        const response = await fetch(BOL_API_URL + "/shipping-labels/" + encodeURIComponent(labelMatch[1]), {
          headers: { "Authorization": "Bearer " + token, "Accept": "application/vnd.retailer.v10+pdf" }
        });
        if (!response.ok) return json({ error: "PDF-label ophalen mislukt bij bol.com.", bolStatus: response.status }, response.status >= 500 ? 502 : response.status, allowedOrigin);
        const headers = new Headers({
          "Content-Type": "application/pdf",
          "Content-Disposition": 'inline; filename="youngtrendz-label.pdf"',
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": allowedOrigin,
          "Access-Control-Expose-Headers": "X-Track-And-Trace-Code, X-Transporter-Code, Content-Disposition",
          "Vary": "Origin",
          "X-Content-Type-Options": "nosniff"
        });
        for (const name of ["X-Track-And-Trace-Code", "X-Transporter-Code"]) {
          const value = response.headers.get(name);
          if (value) headers.set(name, value);
        }
        return new Response(response.body, { status: 200, headers });
      }

      if (url.pathname === "/api/shipments" && request.method === "POST") {
        const body = await readJson(request);
        const orderItems = validateOrderItems(body.orderItems);
        const shippingLabelId = String(body.shippingLabelId || "").trim();
        if (!shippingLabelId || shippingLabelId.length > 200) {
          return json({ error: "Ongeldige shippingLabelId." }, 400, allowedOrigin);
        }
        // This call registers the shipment and triggers the bol.com label charge.
        const response = await bolFetch(env, "/shipments", {
          method: "POST",
          body: JSON.stringify({ orderItems, shippingLabelId })
        });
        return await upstreamJson(response, allowedOrigin, "Zending registreren");
      }

      return json({ error: "Endpoint niet gevonden." }, 404, allowedOrigin);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Onbekende backendfout." }, 400, allowedOrigin);
    }
  }
};
