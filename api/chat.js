import { createClient } from "@supabase/supabase-js";
import { OpenAI } from "openai";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
);

const openai = new OpenAI({
  apiKey: process.env.TYPHOON_API_KEY,
  baseURL: "https://api.opentyphoon.ai/v1",
});

function formatList(val) {
  if (!val || val === "None" || val === "[]") return "ไม่มีระบุ";
  if (Array.isArray(val)) return val.length > 0 ? val.join(", ") : "ไม่มีระบุ";
  try {
    const parsed = JSON.parse(val);
    if (Array.isArray(parsed))
      return parsed.length > 0 ? parsed.join(", ") : "ไม่มีระบุ";
  } catch (e) {}
  const cleaned = String(val)
    .replace(/[\[\]"]/g, "")
    .trim();
  return cleaned && cleaned !== "None" ? cleaned : "ไม่มีระบุ";
}

function cleanItemRefs(text) {
  if (!text) return "";
  return text
    .replace(
      /\s*[\(\[\{]?\s*(?:item_ref|รหัส|id|code)\s*[:#-]?\s*\d+\s*[\)\]\}]?/gi,
      "",
    )
    .replace(/[^\S\r\n]{2,}/g, " ")
    .trim();
}

function getStrictAllergyTokens(message = "", userAllergies = []) {
  const text = `${message} ${(userAllergies || []).join(" ")}`.toLowerCase();
  const tokensToBlock = new Set();

  if (/(milk|dairy|lactose|butter|cheese|cream|นม|เนย|ชีส|ครีม)/i.test(text)) {
    [
      "dairy",
      "milk",
      "butter",
      "cheese",
      "cream",
      "creamy",
      "yogurt",
      "whey",
      "นม",
      "เนย",
      "ชีส",
      "ครีม",
      "วิปครีม",
      "มาการีน",
    ].forEach((t) => tokensToBlock.add(t));
  }

  if (/(egg|eggs|mayo|mayonnaise|ไข่|มายองเนส)/i.test(text)) {
    ["egg", "eggs", "mayo", "mayonnaise", "ไข่"].forEach((t) =>
      tokensToBlock.add(t),
    );
  }

  if (/(nut|nuts|peanut|peanuts|walnut|almond|cashew|ถั่ว)/i.test(text)) {
    ["nut", "peanut", "walnut", "almond", "cashew", "ถั่ว"].forEach((t) =>
      tokensToBlock.add(t),
    );
  }

  if (
    /(seafood|shrimp|prawn|crab|squid|fish|shellfish|อาหารทะเล|กุ้ง|ปู|ปลา|หมึก)/i.test(
      text,
    )
  ) {
    [
      "seafood",
      "shrimp",
      "prawn",
      "crab",
      "squid",
      "shellfish",
      "อาหารทะเล",
      "กุ้ง",
      "ปู",
      "หอย",
      "หมึก",
    ].forEach((t) => tokensToBlock.add(t));
  }

  if (/(gluten|wheat|flour|bread|แป้งสาลี|กลูเตน)/i.test(text)) {
    ["gluten", "wheat", "flour", "bread", "แป้งสาลี", "กลูเตน"].forEach((t) =>
      tokensToBlock.add(t),
    );
  }

  return Array.from(tokensToBlock);
}

function isItemSafeFromAllergens(item, blockedTokens) {
  if (!blockedTokens || blockedTokens.length === 0) return true;

  const itemData = [
    item.name,
    item.name_th,
    item.description,
    item.description_th,
    formatList(item.allergens),
    formatList(item.allergens_th),
    formatList(item.ingredients),
    formatList(item.ingredients_th),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const token of blockedTokens) {
    if (itemData.includes(token)) return false;
  }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const {
      message,
      restaurantId,
      history = [],
      currentCart = [],
      language = "th",
      customerPreferences = {},
    } = req.body;

    if (!message || !restaurantId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const sanitizedHistory = history
      .filter(
        (msg) => msg && typeof msg.text === "string" && msg.text.trim() !== "",
      )
      .slice(-6)
      .map((msg) => ({
        role: msg.role === "bot" ? "assistant" : msg.role,
        content: msg.text.replace(/<[^>]*>?/gm, "").trim(),
      }));

    const recentContext = sanitizedHistory
      .slice(-4)
      .map((h) => `${h.role}: ${h.content}`)
      .join("\n");

    const gatekeeperPrompt = `You are a strict text classifier. Determine if the user's message is related to food, dining, menus, ordering, allergens, dietary preferences, ingredients, or restaurant service.

${recentContext ? `Recent conversation context:\n${recentContext}\n` : ""}
User message: "${message}"

Respond ONLY with "YES" if relevant.
Respond ONLY with "NO" if completely off-topic.`;

    const intentCheckResponse = await openai.chat.completions.create({
      model: "typhoon-v2.5-30b-a3b-instruct",
      messages: [{ role: "system", content: gatekeeperPrompt }],
      temperature: 0.1,
      max_completion_tokens: 2000,
    });

    const intent =
      intentCheckResponse.choices[0]?.message?.content?.trim().toUpperCase() ||
      "";

    if (!intent.includes("YES")) {
      return res.json({
        user_text_th: message,
        user_text_en: message,
        text_th:
          "ขออภัยครับ เชฟ AI สามารถให้คำแนะนำเฉพาะเมนูอาหาร วัตถุดิบ สารก่อภูมิแพ้ ตัวเลือกโภชนาการ และการสั่งอาหารของทางร้านเท่านั้นครับ",
        text_en:
          "I apologize, but as Chef AI, I can only assist with our restaurant's menu, ingredients, allergens, dietary options, and ordering.",
        items: [],
        action: null,
        orderItems: [],
        targetDishName: null,
        newNote: null,
      });
    }

    const { data: rawMenuItems, error: dbError } = await supabase
      .from("menu_items")
      .select(
        "id, name, name_th, price, description, description_th, image, ingredients, ingredients_th, allergens, allergens_th, dietary_tags, dietary_tags_th, taste_profiles, taste_profiles_th, category",
      )
      .eq("restaurant_id", restaurantId)
      .eq("availability", "available");

    if (dbError) throw dbError;

    const blockedTokens = getStrictAllergyTokens(
      message,
      customerPreferences.allergies || [],
    );
    const safeMenuItems =
      blockedTokens.length > 0
        ? (rawMenuItems || []).filter((item) =>
            isItemSafeFromAllergens(item, blockedTokens),
          )
        : rawMenuItems || [];

    const menuContext = safeMenuItems
      .map((item) => {
        const algTh = formatList(item.allergens_th || item.allergens);
        const ingTh = formatList(item.ingredients_th || item.ingredients);
        const algEn = formatList(item.allergens);
        const ingEn = formatList(item.ingredients);
        const cat = item.category || "General";
        const tasteProfilesTh = formatList(
          item.taste_profiles_th || item.taste_profiles,
        );
        const tasteProfilesEn = formatList(item.taste_profiles);
        return `- [ITEM_REF: ${item.id}] | Category: [${cat}] | TH: ${item.name_th || item.name} (Taste Profiles: ${tasteProfilesTh} | Ingredients: ${ingTh} | Allergens: ${algTh}) | EN: ${item.name} (Taste Profiles: ${tasteProfilesEn} | Ingredients: ${ingEn} | Allergens: ${algEn}) | Price: ${item.price} Baht`;
      })
      .join("\n");

    const cartContext =
      currentCart && currentCart.length > 0
        ? currentCart
            .map(
              (c) =>
                `- ${c.name || c.name_th} x${c.quantity || 1}${c.notes || c.note ? ` (Note: ${c.notes || c.note})` : ""}`,
            )
            .join("\n")
        : "Empty Cart";

    const customerPrefsContext = `
CUSTOMER RESTRICTIONS / ALLERGIES:
- Active Blocked Ingredients/Allergens: ${JSON.stringify(blockedTokens)}
- Dietary Restrictions: ${JSON.stringify(customerPreferences.diets || [])}
- Spice Tolerance Level: ${customerPreferences.spiceLevel ?? 3}
`;

    // 🟢 บังคับโครงสร้างและ Action ให้ชัดเจน 100%
    const systemPrompt = `You are Chef AI, an expert, polite restaurant assistant.
${customerPrefsContext}

CRITICAL INSTRUCTIONS:
1. RESPONSE FORMAT:
   - Output ONLY a single valid JSON object.
   - Do NOT write any conversational text, pleasantries, or explanations outside the JSON object.
   - Never wrap with markdown backticks (no \`\`\`json).

2. ORDERING DISHES:
   - When the user asks to ORDER dishes (e.g., "I would like to order...", "เอา...", "ขอสั่ง..."):
     * You MUST set "action": "CONFIRM_ORDER_ITEMS".
     * You MUST populate "orderItems" array: [{"id": <integer_id>, "name": "<dish_name>", "quantity": <integer_qty>, "price": <price_number>}]
     * You MUST ALSO include those item IDs in "recommendedItemIds": [id1, id2, ...] so that cards display on screen.
   - If user is only asking questions or browsing:
     * Set "action": null.
     * Set "orderItems": [].
     * Put suggested item IDs in "recommendedItemIds".

3. ALLERGIES & MENU ITEMS:
   - Only recommend dishes from "AVAILABLE MENU ITEMS".
   - Never mention internal codes like "ITEM_REF" or "ID" in the message text.

JSON FORMAT:
{
  "user_text_th": "User query translated to Thai",
  "user_text_en": "User query in English",
  "text_th": "Friendly natural Thai response with line breaks",
  "text_en": "Friendly natural English response with line breaks",
  "recommendedItemIds": [],
  "action": "CONFIRM_ORDER_ITEMS" or null,
  "orderItems": []
}

AVAILABLE MENU ITEMS:
${menuContext}

CURRENT CART:
${cartContext}`;

    const response = await openai.chat.completions.create({
      model: "typhoon-v2.5-30b-a3b-instruct",
      messages: [
        { role: "system", content: systemPrompt },
        ...sanitizedHistory,
        { role: "user", content: message },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
      max_completion_tokens: 2000,
    });

    let rawResponse = response.choices[0]?.message?.content || "{}";
    rawResponse = rawResponse
      .replace(
        /[\u00A0\u1680\u180e\u2000-\u2009\u200a\u202f\u205f\u3000\u200b\u200c\u200d\uFEFF]/g,
        " ",
      )
      .trim();

    // 🟢 ดึงเฉพาะ JSON Object เท่านั้น ตัดข้อความแปลกปลอมที่โมเดลแอบพิมพ์ด้านนอกทิ้ง
    let parsedData = {};
    try {
      const jsonStart = rawResponse.indexOf("{");
      const jsonEnd = rawResponse.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonOnly = rawResponse.substring(jsonStart, jsonEnd + 1);
        parsedData = JSON.parse(jsonOnly);
      } else {
        throw new Error("No JSON bracket found");
      }
    } catch (e) {
      console.error("JSON Parse Error:", e);
      parsedData = {
        text_th: "ขออภัยครับ กรุณาลองใหม่อีกครั้ง",
        text_en: "I apologize, please try again.",
        recommendedItemIds: [],
        action: null,
        orderItems: [],
      };
    }

    // 🟢 แปลง orderItems ให้เป็น Format มาตรฐาน มีทั้ง id, name, price, quantity
    let normalizedOrderItems = [];
    if (
      Array.isArray(parsedData.orderItems) &&
      parsedData.orderItems.length > 0
    ) {
      normalizedOrderItems = parsedData.orderItems.map((oi) => {
        const targetId = oi.id !== undefined ? oi.id : oi.itemId;
        const matched = (rawMenuItems || []).find(
          (m) => String(m.id) === String(targetId),
        );
        return {
          id: targetId,
          itemId: targetId,
          name: matched ? matched.name : oi.name || "Menu Item",
          name_th: matched
            ? matched.name_th || matched.name
            : oi.name_th || oi.name || "Menu Item",
          price: matched ? Number(matched.price) : Number(oi.price) || 0,
          quantity: Number(oi.quantity) || 1,
          image: matched?.image || oi.image || "",
        };
      });
    }

    // รวม IDs สำหรับการ์ดแสดงผล
    let recommendedIds = Array.isArray(parsedData.recommendedItemIds)
      ? [...parsedData.recommendedItemIds]
      : [];
    if (normalizedOrderItems.length > 0) {
      normalizedOrderItems.forEach((oi) => {
        if (!recommendedIds.map(String).includes(String(oi.id))) {
          recommendedIds.push(oi.id);
        }
      });
    }

    let recommendedItems = (rawMenuItems || []).filter((item) =>
      recommendedIds.map(String).includes(String(item.id)),
    );

    let textTh = cleanItemRefs(parsedData.text_th || "");
    let textEn = cleanItemRefs(parsedData.text_en || "");

    // 🟢 เลือกข้อความตอบกลับตามภาษาของผู้ใช้จริง
    const chosenText = language === "en" ? textEn || textTh : textTh || textEn;

    return res.status(200).json({
      user_text_th: parsedData.user_text_th || message,
      user_text_en: parsedData.user_text_en || message,
      text_th: textTh,
      text_en: textEn,
      text: chosenText,
      items: recommendedItems,
      action:
        normalizedOrderItems.length > 0
          ? "CONFIRM_ORDER_ITEMS"
          : parsedData.action || null,
      orderItems: normalizedOrderItems,
      targetDishName: parsedData.targetDishName || null,
      newNote: parsedData.newNote || null,
    });
  } catch (error) {
    console.error("Vercel Function Error:", error);
    return res.status(500).json({ error: "Failed to connect to AI" });
  }
}
