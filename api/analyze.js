const https = require("https");
 
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
 
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
 
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
 
  const apiKey = process.env.VITE_API_KEY;
 
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }
 
  try {
    const body = JSON.stringify(req.body);
 
    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(body),
      },
    };
 
    const result = await new Promise((resolve, reject) => {
      const request = https.request(options, (response) => {
        let data = "";
        response.on("data", (chunk) => { data += chunk; });
        response.on("end", () => {
          try {
            resolve({ status: response.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ status: response.statusCode, body: { error: data } });
          }
        });
      });
      request.on("error", reject);
      request.write(body);
      request.end();
    });
 
    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
