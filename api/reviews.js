// Play Store review scraper — no npm dependencies needed
// Uses direct HTTP to batchexecute (works from Vercel IPs, not Google Cloud)

const https = require("https");
const SECRET = process.env.API_SECRET || "gameloft2024";

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      }
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    }).on("error", reject);
  });
}

function httpsPost(hostname, path, body, headers) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname, path,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
        ...headers
      }
    };
    const req = https.request(opts, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function getAtToken(appId, lang, country) {
  const url = "https://play.google.com/store/apps/details?id=" + encodeURIComponent(appId) + "&hl=" + lang + "&gl=" + country.toUpperCase();
  const r = await httpsGet(url);
  const m = r.body.match(/SNlM0e[^,\]]{0,30}["']([A-Za-z0-9_\-]+)["']/);
  console.log("at token:", m ? "FOUND" : "NOT FOUND", "| html length:", r.body.length);
  return m ? m[1] : "";
}

async function fetchReviews(appId, lang, country, num) {
  const at = await getAtToken(appId, lang, country);
  
  const fSid = "-" + Math.floor(Math.random() * 9e18 + 1e18).toString();
  const path = "/_/PlayStoreUi/data/batchexecute?rpcids=qnKhOb&source-path=" + encodeURIComponent("/store/apps/details") + "&f.sid=" + fSid + "&hl=" + lang + "&gl=" + country.toUpperCase() + "&authuser=0";

  const innerArr = [null, null, [2, 1, null, 1, String(num || 40), null, [null, null],
    null, null, null, null, null, null, null, null,
    null, null, null, null, [appId, 1]]];
  const f_req = JSON.stringify([[["qnKhOb", JSON.stringify(innerArr), null, "generic"]]]);
  const postBody = "f.req=" + encodeURIComponent(f_req) + (at ? "&at=" + encodeURIComponent(at) : "&at=");

  const r = await httpsPost("play.google.com", path, postBody, {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Origin": "https://play.google.com",
    "Referer": "https://play.google.com/store/apps/details?id=" + appId,
    "X-Same-Domain": "1",
  });

  console.log("batchexecute HTTP:", r.status, "| at:", at ? "yes" : "empty");
  if (r.status !== 200) throw new Error("HTTP " + r.status);

  const json = r.body.replace(/^\)\]\}'\n?/, "").trim();
  const outer = JSON.parse(json);
  let innerStr = null;
  for (const entry of outer) {
    if (Array.isArray(entry) && entry[1] === "qnKhOb" && typeof entry[2] === "string") {
      innerStr = entry[2]; break;
    }
  }
  if (!innerStr) throw new Error("qnKhOb not found: " + r.body.substring(0, 300));

  const data = JSON.parse(innerStr);
  const items = (data && Array.isArray(data[0])) ? data[0] : [];

  return items.map(item => {
    if (!Array.isArray(item) || typeof item[2] !== "number") return null;
    return {
      reviewId:   item[0] || "",
      userName:   (item[1] && item[1][0]) || "",
      score:      Number(item[2]),
      title:      "",
      content:    (item[4] || "").replace(/\n/g, " "),
      reviewDate: (item[5] && item[5][0]) ? new Date(item[5][0] * 1000).toLocaleDateString("id-ID") : "",
      thumbsUp:   item[6] || 0,
      appVersion: item[10] || "",
      replyText:  ((item[7] && item[7][1]) || "").replace(/\n/g, " "),
      replyDate:  (item[7] && item[7][2] && item[7][2][0]) ? new Date(item[7][2][0] * 1000).toLocaleDateString("id-ID") : "",
      device:     (item[13] && item[13][0]) || "",
    };
  }).filter(Boolean);
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { appId, lang, country, num, secret } = req.query;
  if (secret !== SECRET) return res.status(403).json({ error: "Unauthorized" });
  if (!appId) return res.status(400).json({ error: "appId required" });

  try {
    const reviews = await fetchReviews(
      appId, lang || "en", country || "us",
      Math.min(parseInt(num) || 100, 200)
    );
    return res.status(200).json({
      ok: true, appId, country: country || "us",
      lang: lang || "en", count: reviews.length, reviews
    });
  } catch (err) {
    console.error("Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
