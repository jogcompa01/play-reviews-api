const https  = require("https");
const SECRET = process.env.API_SECRET || "gameloft2024";

function fetch(url, opts) {
  return new Promise((resolve, reject) => {
    const isPost = opts && opts.method === "POST";
    const urlObj = new URL(url);
    const reqOpts = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname + urlObj.search,
      method:   isPost ? "POST" : "GET",
      headers:  opts && opts.headers ? opts.headers : {},
    };
    if (isPost && opts.body) {
      reqOpts.headers["Content-Length"] = Buffer.byteLength(opts.body);
    }
    const req = https.request(reqOpts, res => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location, { headers: opts && opts.headers }).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    req.on("error", reject);
    if (isPost && opts.body) req.write(opts.body);
    req.end();
  });
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

async function getToken(appId, lang, country) {
  const url = `https://play.google.com/store/apps/details?id=${encodeURIComponent(appId)}&hl=${lang}&gl=${country.toUpperCase()}`;
  const r   = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": `${lang}-${country.toUpperCase()}` } });
  const m   = r.body.match(/SNlM0e[^"']{0,10}["']([^"']{10,}?)["']/);
  const bl  = r.body.match(/cfb2h[^"']{0,10}["']([^"']+?)["']/) || r.body.match(/(boq_playuiserver[^"']+)/);
  return { at: m ? m[1] : "", bl: bl ? bl[1] : "" };
}

async function fetchReviews(appId, lang, country, num, token) {
  const t    = await getToken(appId, lang, country);
  const fSid = "-" + Math.floor(Math.random() * 9e18).toString();
  const blParam = t.bl ? `&bl=${encodeURIComponent(t.bl)}` : "";
  const path = `/_/PlayStoreUi/data/batchexecute?rpcids=qnKhOb&hl=${lang}&gl=${country.toUpperCase()}${blParam}&f.sid=${fSid}&authuser=0`;

  const inner = JSON.stringify([null, null, [
    2, 1, null, 1, String(num), null,
    [token || null, null],
    null, null, null, null, null, null, null, null,
    null, null, null, null,
    [appId, 1]   // sort NEWEST
  ]]);
  const f_req  = JSON.stringify([[["qnKhOb", inner, null, "generic"]]]);
  const body   = "f.req=" + encodeURIComponent(f_req) + (t.at ? "&at=" + encodeURIComponent(t.at) : "&at=");

  const r = await fetch("https://play.google.com" + path, {
    method: "POST",
    body,
    headers: {
      "Content-Type":  "application/x-www-form-urlencoded",
      "User-Agent":    UA,
      "Origin":        "https://play.google.com",
      "Referer":       `https://play.google.com/store/apps/details?id=${appId}&hl=${lang}&gl=${country.toUpperCase()}`,
      "X-Same-Domain": "1",
      "Accept-Language": `${lang}-${country.toUpperCase()}`,
    }
  });

  console.log(`[${country}] HTTP=${r.status} at=${t.at ? "yes" : "no"} bl=${t.bl ? "yes" : "no"}`);
  if (r.status !== 200) throw new Error("HTTP " + r.status);

  const json  = r.body.replace(/^\)\]\}'\n?/, "").trim();
  const outer = JSON.parse(json);
  let innerStr = null;
  for (const e of outer) {
    if (Array.isArray(e) && e[1] === "qnKhOb" && typeof e[2] === "string") { innerStr = e[2]; break; }
  }
  if (!innerStr) throw new Error("qnKhOb not found. raw=" + r.body.substring(0, 200));

  const data  = JSON.parse(innerStr);
  const items = Array.isArray(data[0]) ? data[0] : [];
  const next  = (data[1] && data[1][1]) || null;

  const reviews = items.map(item => {
    if (!Array.isArray(item) || typeof item[2] !== "number") return null;
    return {
      reviewId:   item[0] || "",
      userName:   (item[1] && item[1][0]) || "",
      score:      Number(item[2]),
      title:      "",
      content:    (item[4] || "").replace(/\n/g, " "),
      reviewDate: item[5] && item[5][0] ? new Date(item[5][0]*1000).toLocaleDateString("id-ID") : "",
      thumbsUp:   item[6] || 0,
      appVersion: item[10] || "",
      replyText:  ((item[7] && item[7][1]) || "").replace(/\n/g, " "),
      replyDate:  item[7] && item[7][2] && item[7][2][0] ? new Date(item[7][2][0]*1000).toLocaleDateString("id-ID") : "",
      device:     (item[13] && item[13][0]) || "",
    };
  }).filter(Boolean);

  return { reviews, nextToken: next };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { appId, lang, country, num, secret } = req.query;
  if (secret !== SECRET) return res.status(403).json({ error: "Unauthorized" });
  if (!appId)            return res.status(400).json({ error: "appId required" });

  try {
    const result = await fetchReviews(
      appId, lang || "en", (country || "us").toLowerCase(),
      Math.min(parseInt(num) || 100, 200), null
    );
    return res.status(200).json({
      ok: true, appId,
      country: country || "us",
      lang: lang || "en",
      count: result.reviews.length,
      reviews: result.reviews,
    });
  } catch(err) {
    console.error(err.message);
    return res.status(500).json({ error: err.message });
  }
};
