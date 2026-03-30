type LeadLike = {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  [key: string]: any;
};

function substitute(text: string, lead?: LeadLike) {
  if (!lead || !text) return text;
  let out = text;
  const variables = {
    name: lead.name || "",
    email: lead.email || "",
    phone: lead.phone || "",
    company: lead.company || "",
    ...lead,
  };

  for (const [key, value] of Object.entries(variables)) {
    if (typeof value === "string" || typeof value === "number") {
      const valStr = String(value);
      const bracket = new RegExp(`\\[${key}\\]`, "gi");
      const mustache = new RegExp(`{{${key}}}`, "gi");
      out = out.replace(bracket, valStr).replace(mustache, valStr);
    }
  }
  return out;
}

function getClickSendAuthHeader() {
  // ClickSend REST API v3 uses Basic Auth where:
  // - username: your ClickSend API username
  // - password: your ClickSend unique key (API key)
  const username = process.env.CLICKSEND_USERNAME;
  const password = process.env.CLICKSEND_PASSWORD || process.env.CLICKSEND_API_KEY;
  if (!username || !password) return null;

  const token = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${token}`;
}

function getClickSendFrom() {
  // Sender ID can be a number (recommended) or alpha tag depending on your ClickSend config.
  // We keep it configurable via env to match the existing `from` concept.
  return process.env.CLICKSEND_FROM_NUMBER || process.env.CLICKSEND_SENDER_ID || null;
}

function deriveMmsSubjectFromBody(body: string) {
  const normalized = (body || "").replace(/\s+/g, " ").trim();
  // ClickSend MMS subject is required and must be <= 20 characters.
  return normalized.slice(0, 20) || "MMS";
}

export async function sendSms(params: {
  to: string;
  body: string;
  lead?: LeadLike;
}) {
  const authHeader = getClickSendAuthHeader();
  const from = getClickSendFrom();
  const finalBody = substitute(params.body, params.lead);

  if (!authHeader || !from) {
    console.log("MOCK SMS SEND (ClickSend):", { to: params.to, from, body: finalBody });
    return { success: true, mock: true };
  }

  const response = await fetch("https://rest.clicksend.com/v3/sms/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify({
      // Keep the payload minimal; ClickSend will apply your default sender settings if needed.
      messages: [{ to: params.to, from, body: finalBody }],
      shorten_urls: false,
    }),
  });

  const data = (await response.json().catch(() => null)) as any;
  if (!response.ok) {
    const msg =
      data?.response_msg || data?.data?.messages?.[0]?.status || `ClickSend SMS HTTP ${response.status}`;
    throw new Error(`ClickSend SMS failed: ${msg}`);
  }

  const message = data?.data?.messages?.[0];
  return { success: true, sid: message?.message_id ?? null };
}

export async function sendMms(params: {
  to: string;
  body: string;
  mediaUrl: string;
  lead?: LeadLike;
}) {
  const authHeader = getClickSendAuthHeader();
  const from = getClickSendFrom();
  const finalBody = substitute(params.body, params.lead);
  const subject = deriveMmsSubjectFromBody(finalBody);

  if (!authHeader || !from) {
    console.log("MOCK MMS SEND (ClickSend):", {
      to: params.to,
      from,
      subject,
      body: finalBody,
      mediaUrl: params.mediaUrl,
    });
    return { success: true, mock: true };
  }

  const response = await fetch("https://rest.clicksend.com/v3/mms/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify({
      media_file: params.mediaUrl,
      messages: [
        {
          source: "streamsai",
          to: params.to,
          from,
          subject,
          body: finalBody,
        },
      ],
    }),
  });

  const data = (await response.json().catch(() => null)) as any;
  if (!response.ok) {
    const msg =
      data?.response_msg || data?.data?.messages?.[0]?.status || `ClickSend MMS HTTP ${response.status}`;
    throw new Error(`ClickSend MMS failed: ${msg}`);
  }

  const message = data?.data?.messages?.[0];
  return { success: true, sid: message?.message_id ?? null };
}

