const gplay  = require("google-play-scraper");
const SECRET = process.env.API_SECRET || "gameloft2024";

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { appId, lang, country, num, secret } = req.query;
  if (secret !== SECRET) return res.status(403).json({ error: "Unauthorized" });
  if (!appId)            return res.status(400).json({ error: "appId required" });

  try {
    const result = await gplay.reviews({
      appId:   appId,
      lang:    lang    || "en",
      country: country || "us",
      sort:    gplay.sort.NEWEST,
      num:     Math.min(parseInt(num) || 100, 200),
    });
    const reviews = (result.data || []).map(r => ({
      reviewId:   r.id          || "",
      userName:   r.userName    || "",
      score:      r.score       || 0,
      title:      r.title       || "",
      content:    (r.text       || "").replace(/\n/g, " "),
      reviewDate: r.date ? new Date(r.date).toLocaleDateString("id-ID") : "",
      thumbsUp:   r.thumbsUp    || 0,
      appVersion: r.version     || "",
      replyText:  (r.replyText  || "").replace(/\n/g, " "),
      replyDate:  r.replyDate ? new Date(r.replyDate).toLocaleDateString("id-ID") : "",
      device:     "",
    }));
    return res.status(200).json({ ok: true, appId, country: country||"us", lang: lang||"en", count: reviews.length, reviews });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ error: err.message });
  }
};
