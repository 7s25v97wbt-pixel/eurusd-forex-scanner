
exports.handler = async function (event) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  };

  function reply(statusCode, data) {
    return {
      statusCode,
      headers,
      body: JSON.stringify(data)
    };
  }

  // Read the secret API key from Netlify's server environment.
  const apiKey = process.env.TWELVE_DATA_API_KEY;

  if (!apiKey || !apiKey.trim()) {
    return reply(503, {
      error: "API key is missing. Add TWELVE_DATA_API_KEY in Netlify and redeploy."
    });
  }

  const params = event.queryStringParameters || {};
  const symbol = params.symbol || "EUR/USD";
  const interval = params.interval || "15min";

  const requestedSize = Number.parseInt(params.outputsize || "250", 10);
  const outputsize = Number.isFinite(requestedSize)
    ? Math.min(Math.max(requestedSize, 10), 500)
    : 250;

  if (symbol !== "EUR/USD") {
    return reply(400, { error: "Only EUR/USD is supported." });
  }

  if (!["15min", "1h"].includes(interval)) {
    return reply(400, {
      error: "Only 15min and 1h intervals are supported."
    });
  }

  const url = new URL("https://api.twelvedata.com/time_series");

  url.search = new URLSearchParams({
    symbol: "EUR/USD",
    interval,
    outputsize: String(outputsize),
    format: "JSON",
    apikey: apiKey.trim()
  }).toString();

  try {
    const response = await fetch(url.toString());
    const data = await response.json();

    if (!response.ok || data.status === "error" || data.code) {
      return reply(502, {
        error: data.message || "Twelve Data could not provide market data."
      });
    }

    if (!Array.isArray(data.values)) {
      return reply(502, {
        error: "Twelve Data returned an unexpected response."
      });
    }

    return reply(200, data);

  } catch (error) {
    return reply(502, {
      error: "Unable to connect to Twelve Data. Please try again."
    });
  }
};
