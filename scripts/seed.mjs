// Trigger the seed route against a running instance (local or deployed).
// Usage: node scripts/seed.mjs [baseUrl] [count]
const base = process.argv[2] || process.env.SEED_BASE_URL || "http://localhost:3000";
const count = process.argv[3] || "6";

const res = await fetch(`${base.replace(/\/$/, "")}/api/seed?count=${count}`, { method: "POST" });
const text = await res.text();
console.log("HTTP", res.status);
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text.slice(0, 2000));
}
if (!res.ok) process.exit(1);
