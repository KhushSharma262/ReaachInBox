import Redis from "ioredis";
const r = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
r.ping().then(p => { console.log("Redis:", p); return r.quit(); }).catch(e => { console.error("FAILED:", e.message); process.exit(1); });
