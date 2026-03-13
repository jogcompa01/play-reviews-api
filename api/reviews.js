const gplay  = require("google-play-scraper");
const SECRET = process.env.API_SECRET || "gameloft2024";

// Format date as dd/MM/yyyy consistently
function fmtDate(d) {
  if (!d) return "";
  var dt = new Date(d);
  if (isNaN(dt)) return "";
  var dd = String(dt.getDate()).padStart(2,"0");
  var mm = String(dt.getMonth()+1).padStart(2,"0");
  var yyyy = dt.getFullYear();
  return dd + "/" + mm + "/" + yyyy;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { appId, lang, country, num, secret } = req.query;
  if (secret !== SECRET) return res.status(403).json({ error: "Unauthorized" });
  if (!appId)            return res.status(400).json({ error: "appId required" });

  const countryCode = (country || "us").toLowerCase();
  const langCode    = lang || "en";
  const numReviews  = Math.min(parseInt(num) || 200, 200);

  try {
    const result = await gplay.reviews({
      appId:    appId,
      lang:     langCode,
      country:  countryCode,
      sort:     gplay.sort.NEWEST,
      num:      numReviews,
      throttle: 1,
    });

    const reviews = (result.data || []).map(r => ({
      reviewId:   r.id          || "",
      userName:   r.userName    || "",
      score:      r.score       || 0,
      title:      r.title       || "",
      content:    (r.text       || "").replace(/\n/g, " "),
      reviewDate: fmtDate(r.date),
      thumbsUp:   r.thumbsUp    || 0,
      appVersion: r.version     || "",
      replyText:  (r.replyText  || "").replace(/\n/g, " "),
      replyDate:  fmtDate(r.replyDate),
      device:     "",
    }));

    console.log(`[${countryCode}/${langCode}] ${appId}: ${reviews.length} reviews`);
    return res.status(200).json({
      ok: true, appId,
      country: countryCode,
      lang: langCode,
      count: reviews.length,
      reviews
    });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ error: err.message });
  }
};
