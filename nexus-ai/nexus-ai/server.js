"use strict";
// NEXUS AI: server lokal tanpa dependensi (butuh Node.js 18+).
// Kunci API hanya dibaca di sini dan tidak pernah dikirim ke browser.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { SYS, MODES } = require("./config");

function loadEnv() {
  try {
    const text = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* .env opsional */ }
}
loadEnv();

const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const MAX_TOKENS = Number(process.env.MAX_TOKENS) || 4096;
const MAX_BODY = 1024 * 1024;

const json = (res, status, obj) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error("too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function cleanMessages(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const m of arr.slice(-20)) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    if (typeof m.content !== "string" || !m.content.trim()) continue;
    const content = m.content.slice(0, 20000);
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += "\n\n" + content;
    else out.push({ role: m.role, content });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

function upstreamError(status, message) {
  if (status === 401) return "Kunci API ditolak. Periksa ANTHROPIC_API_KEY di file .env.";
  if (status === 429) return "Batas permintaan API tercapai. Tunggu sebentar lalu coba lagi.";
  if (status === 529) return "Layanan API sedang sibuk. Coba lagi sebentar lagi.";
  return "API error (" + status + "): " + (message || "tidak diketahui");
}

async function chat(req, res) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return json(res, 500, { error: "ANTHROPIC_API_KEY belum diisi. Salin .env.example menjadi .env, isi kunci API, lalu jalankan ulang server." });
  }
  let body;
  try { body = JSON.parse(await readBody(req)); }
  catch { return json(res, 400, { error: "Permintaan tidak valid." }); }

  const mode = MODES.find(m => m.id === body.mode) || MODES[0];
  const messages = cleanMessages(body.messages);
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return json(res, 400, { error: "Pesan terakhir harus dari pengguna." });
  }

  const ctrl = new AbortController();
  res.on("close", () => ctrl.abort());

  let up;
  try {
    up = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        stream: true,
        system: SYS + "\n\nMODE AKTIF: " + mode.name + ". " + mode.focus,
        messages
      })
    });
  } catch {
    if (ctrl.signal.aborted) return;
    return json(res, 502, { error: "Tidak bisa terhubung ke API Anthropic. Periksa koneksi internet." });
  }

  if (!up.ok) {
    let msg = "";
    try { msg = (await up.json()).error.message; } catch { /* abaikan */ }
    return json(res, up.status === 401 || up.status === 429 ? up.status : 502, { error: upstreamError(up.status, msg) });
  }

  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const send = o => res.write("data: " + JSON.stringify(o) + "\n\n");
  try {
    const dec = new TextDecoder();
    let buf = "";
    for await (const chunk of up.body) {
      buf += dec.decode(chunk, { stream: true });
      let k;
      while ((k = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, k);
        buf = buf.slice(k + 2);
        const line = block.split("\n").find(l => l.startsWith("data:"));
        if (!line) continue;
        let ev;
        try { ev = JSON.parse(line.slice(5)); } catch { continue; }
        if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") send({ text: ev.delta.text });
        else if (ev.type === "error") send({ error: "API error: " + ((ev.error && ev.error.message) || "tidak diketahui") });
      }
    }
  } catch {
    if (!ctrl.signal.aborted) send({ error: "Koneksi ke API terputus. Kirim ulang pesanmu." });
  }
  res.end();
}

const server = http.createServer((req, res) => {
  // Tolak Host selain localhost (mencegah DNS rebinding).
  const host = (req.headers.host || "").replace(/:\d+$/, "");
  if (host !== "localhost" && host !== "127.0.0.1") return json(res, 403, { error: "Akses ditolak." });

  const url = req.url.split("?")[0];
  if (req.method === "GET" && url === "/") {
    return fs.readFile(path.join(__dirname, "public", "index.html"), (err, data) => {
      if (err) return json(res, 500, { error: "index.html tidak ditemukan." });
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    });
  }
  if (req.method === "GET" && url === "/api/config") {
    return json(res, 200, { modes: MODES.map(({ focus, ...m }) => m), model: MODEL });
  }
  if (req.method === "POST" && url === "/api/chat") {
    return chat(req, res).catch(() => { if (!res.headersSent) json(res, 500, { error: "Kesalahan server." }); else res.end(); });
  }
  json(res, 404, { error: "Tidak ditemukan." });
});

server.on("error", e => {
  console.error(e.code === "EADDRINUSE" ? "Port " + PORT + " sudah dipakai. Ubah PORT di .env." : e.message);
  if (require.main === module) process.exit(1);
});
module.exports = server;

server.listen(PORT, "127.0.0.1", () => {
  console.log("NEXUS AI berjalan di http://localhost:" + PORT + "  (model: " + MODEL + ")");
  if (!process.env.ANTHROPIC_API_KEY) console.log("Peringatan: ANTHROPIC_API_KEY belum diisi. Lihat README.md.");
});
