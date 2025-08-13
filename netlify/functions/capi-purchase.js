// Função serverless do Netlify: envia Purchase via CAPI com deduplicação (event_id)
// e hash (SHA-256) de email/telefone no SERVIDOR (requisito do Meta).

const crypto = require("crypto");

// Em Node 18+ no Netlify, fetch é global (não precisa node-fetch)
const PIXEL_ID = process.env.META_PIXEL_ID;
const CAPI_TOKEN = process.env.META_CAPI_TOKEN;

const sha256Lower = (s) =>
  crypto.createHash("sha256").update(String(s).trim().toLowerCase()).digest("hex");

const resOK = (body) => ({
  statusCode: 200,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
  },
  body: JSON.stringify(body || { ok: true }),
});

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return resOK();

  try {
    if (!PIXEL_ID || !CAPI_TOKEN) {
      return { statusCode: 500, body: "META_PIXEL_ID/META_CAPI_TOKEN não configurados" };
    }

    const { name, email, phone, value, event_id, test_event_code } = JSON.parse(event.body || "{}");

    // Monta user_data com hash
    const user_data = {};
    if (email) user_data.em = sha256Lower(email);
    if (phone) {
      const digits = String(phone).replace(/\D/g, "");
      const with55 = digits.startsWith("55") ? digits : `55${digits}`;
      user_data.ph = sha256Lower(with55);
    }

    // Qualidade extra de correspondência
    user_data.client_user_agent = event.headers["user-agent"] || "";
    user_data.client_ip_address = event.headers["x-nf-client-connection-ip"] || event.headers["client-ip"] || "";

    const payload = {
      data: [
        {
          event_name: "Purchase",
          event_time: Math.floor(Date.now() / 1000),
          action_source: "website",
          event_id: String(event_id || ""), // MESMO ID do evento do Pixel
          user_data,
          custom_data: { currency: "BRL", value: Number(value || 0) }
        }
      ],
    };

    if (test_event_code) payload.test_event_code = String(test_event_code);

    const url = `https://graph.facebook.com/v19.0/${PIXEL_ID}/events?access_token=${CAPI_TOKEN}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json();

    return resOK({ sent: true, meta: j });
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: "Erro ao enviar ao Meta" };
  }
};
