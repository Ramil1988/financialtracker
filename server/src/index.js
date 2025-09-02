import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { auth } from "express-oauth2-jwt-bearer";
import { JsonStorage } from "./storage.js";

dotenv.config();

const PORT = process.env.PORT || 8080;
const DATA_FILE = process.env.DATA_FILE || "./data/data.json";

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").filter(Boolean);

const app = express();

app.use(express.json());
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

const jwtCheck = auth({
  audience: process.env.AUTH0_AUDIENCE,
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL,
  tokenSigningAlg: "RS256",
});

const storage = new JsonStorage(DATA_FILE);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Authenticated endpoints
app.get("/api/me", jwtCheck, (req, res) => {
  res.json({ sub: req.auth.payload.sub, scope: req.auth.payload.scope || "" });
});

app.get("/api/snapshots", jwtCheck, (req, res) => {
  const sub = req.auth.payload.sub;
  const data = storage.getUserData(sub);
  res.json({ snapshots: data.snapshots || [] });
});

app.post("/api/snapshots", jwtCheck, (req, res) => {
  const sub = req.auth.payload.sub;
  const { snapshot } = req.body;
  if (!snapshot || !snapshot.date || typeof snapshot.netWorth !== "number") {
    return res.status(400).json({ error: "Invalid snapshot payload" });
  }
  const data = storage.getUserData(sub);
  data.snapshots = data.snapshots || [];
  data.snapshots.push(snapshot);
  storage.saveUserData(sub, data);
  res.status(201).json({ ok: true });
});

app.delete("/api/snapshots/:date", jwtCheck, (req, res) => {
  const sub = req.auth.payload.sub;
  const date = req.params.date;
  const data = storage.getUserData(sub);
  data.snapshots = (data.snapshots || []).filter((s) => s.date !== date);
  storage.saveUserData(sub, data);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});

