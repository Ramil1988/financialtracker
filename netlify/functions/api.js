import { MongoClient, ServerApiVersion } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose";

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "financial_tracker";
const AUTH0_ISSUER_BASE_URL = process.env.AUTH0_ISSUER_BASE_URL; // e.g. https://YOUR_DOMAIN.auth0.com/
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE; // e.g. https://financial-tracker.api
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

let cachedClient;
let cachedDb;
let cachedJWKS;
let indexesEnsured = false;

async function getDb() {
  if (!MONGODB_URI) throw new Error("MONGODB_URI not set");
  if (cachedDb) return cachedDb;
  cachedClient = new MongoClient(MONGODB_URI, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
  });
  await cachedClient.connect();
  cachedDb = cachedClient.db(MONGODB_DB);
  // Ensure indexes once per cold start
  if (!indexesEnsured) {
    try {
      const col = cachedDb.collection("snapshots");
      await col.createIndex({ sub: 1, date: 1 }, { unique: true, name: "uniq_user_date" });
      await col.createIndex({ sub: 1 }, { name: "by_user" });
      indexesEnsured = true;
    } catch (_) {}
  }
  return cachedDb;
}

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes("*") || !origin || ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": allow ? (ALLOWED_ORIGINS.includes("*") ? "*" : origin) : "null",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
    "Vary": "Origin",
  };
}

function json(statusCode, body, origin) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    body: JSON.stringify(body),
  };
}

async function authenticate(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    const err = new Error("Missing bearer token");
    err.statusCode = 401;
    throw err;
  }
  const token = auth.slice("Bearer ".length);
  if (!AUTH0_ISSUER_BASE_URL || !AUTH0_AUDIENCE) {
    const err = new Error("Auth0 env not configured");
    err.statusCode = 500;
    throw err;
  }
  if (!cachedJWKS) {
    const issuer = AUTH0_ISSUER_BASE_URL.endsWith("/")
      ? AUTH0_ISSUER_BASE_URL
      : AUTH0_ISSUER_BASE_URL + "/";
    cachedJWKS = createRemoteJWKSet(new URL(`${issuer}.well-known/jwks.json`));
  }
  const { payload } = await jwtVerify(token, cachedJWKS, {
    issuer: AUTH0_ISSUER_BASE_URL.endsWith("/")
      ? AUTH0_ISSUER_BASE_URL
      : AUTH0_ISSUER_BASE_URL + "/",
    audience: AUTH0_AUDIENCE,
  });
  return payload; // includes sub
}

function subPathFrom(event) {
  try {
    const url = new URL(event.rawUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    const apiIdx = parts.indexOf("api");
    if (apiIdx !== -1) {
      return "/" + parts.slice(apiIdx + 1).join("/");
    }
    const fnIdx = parts.indexOf("functions");
    const nameIdx = parts.indexOf("api");
    if (fnIdx !== -1 && nameIdx !== -1 && nameIdx > fnIdx) {
      return "/" + parts.slice(nameIdx + 1).join("/");
    }
  } catch (_) {}
  return "/"; // default
}

export async function handler(event) {
  const origin = event.headers?.origin || event.headers?.Origin;

  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders(origin) };
  }

  // Health endpoint (no auth)
  if (event.httpMethod === "GET" && (event.path?.endsWith("/health") || subPathFrom(event) === "/health")) {
    return json(200, { status: "ok" }, origin);
  }

  // Auth
  let user;
  try {
    user = await authenticate(event);
  } catch (e) {
    const code = e.statusCode || 401;
    return json(code, { error: e.message }, origin);
  }

  const path = subPathFrom(event);
  const db = await getDb();
  const col = db.collection("snapshots");

  try {
    if (event.httpMethod === "GET" && path === "/me") {
      return json(200, { sub: user.sub }, origin);
    }

    if (event.httpMethod === "GET" && path === "/snapshots") {
      const docs = await col
        .find({ sub: user.sub })
        .project({ _id: 0, sub: 0 })
        .sort({ date: 1 })
        .toArray();
      return json(200, { snapshots: docs }, origin);
    }

    if (event.httpMethod === "POST" && path === "/snapshots") {
      const body = JSON.parse(event.body || "{}");
      const { snapshot } = body;
      if (!snapshot || !snapshot.date || typeof snapshot.netWorth !== "number") {
        return json(400, { error: "Invalid snapshot payload" }, origin);
      }
      const now = new Date();
      const { date, ...rest } = snapshot;
      await col.updateOne(
        { sub: user.sub, date },
        {
          $set: { ...rest, updatedAt: now },
          $setOnInsert: { sub: user.sub, date, createdAt: now },
        },
        { upsert: true }
      );
      return json(201, { ok: true }, origin);
    }

    if (event.httpMethod === "DELETE" && path.startsWith("/snapshots/")) {
      const date = decodeURIComponent(path.split("/snapshots/")[1] || "");
      await col.deleteOne({ sub: user.sub, date });
      return json(200, { ok: true }, origin);
    }

    return json(404, { error: "Not found" }, origin);
  } catch (e) {
    console.error(e);
    return json(500, { error: "Server error" }, origin);
  }
}
