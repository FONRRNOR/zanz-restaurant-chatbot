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

// 🟢 ตรวจจับคำแพ้อาหารจากข้อความแชท + ตั้งค่าของผู้ใช้ พร้อมแมปคำพ้องความหมายทั้งหมด
function getStrictAllergyTokens(message = "", userAllergies = []) {
  const text = `${message} ${(userAllergies || []).join(" ")}`.toLowerCase();
  const tokensToBlock = new Set();

  // กลุ่ม นม / Dairy / เนย / ชีส / ครีม
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

  // กลุ่ม ไข่ / Egg / มายองเนส
  if (/(egg|eggs|mayo|mayonnaise|ไข่|มายองเนส)/i.test(text)) {
    ["egg", "eggs", "mayo", "mayonnaise", "ไข่", "ไข่ดาว", "ไข่เจียว"].forEach(
      (t) => tokensToBlock.add(t),
    );
  }

  // กลุ่ม ถั่ว / Nuts / Peanuts
  if (/(nut|nuts|peanut|peanuts|walnut|almond|cashew|ถั่ว)/i.test(text)) {
    ["nut", "peanut", "walnut", "almond", "cashew", "ถั่ว"].forEach((t) =>
      tokensToBlock.add(t),
    );
  }

  // กลุ่ม อาหารทะเล / Seafood / กุ้ง / ปู / ปลา
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

  // กลุ่ม แป้งสาลี / Gluten / Wheat
  if (/(gluten|wheat|flour|bread|แป้งสาลี|กลูเตน)/i.test(text)) {
    ["gluten", "wheat", "flour", "bread", "แป้งสาลี", "กลูเตน"].forEach((t) =>
      tokensToBlock.add(t),
    );
  }

  return Array.from(tokensToBlock);
}

// 🟢 ตรวจสอบว่าเมนูนี้มีคำต้องห้ามหรือไม่
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
    // ใช้ Regex แบบดักจับคำ หรือส่วนของคำ
    const regex = new RegExp(
      `(^|[^a-zA-Z0-9ก-๙])${token}([^a-zA-Z0-9ก-๙]|$)`,
      "i",
    );
    if (regex.test(itemData) || itemData.includes(token)) {
      return false; // มีสารก่อภูมิแพ้ -> ตัดทิ้งทันที
    }
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

    // 🔴 1. ตรวจสอบสารก่อภูมิแพ้ และดึงคำต้องห้ามทั้งหมดออกมา
    const blockedTokens = getStrictAllergyTokens(
      message,
      customerPreferences.allergies || [],
    );

    // 🔴 2. กรองเมนูที่ไม่ปลอดภัยทิ้งทันที ถ้าลูกค้าบอกแพ้นม/ไข่ จานที่มี Butter/Dairy/Egg จะถูกคัดออกไม่ให้ AI เห็น
    const isAllergyInquiry = blockedTokens.length > 0;
    const safeMenuItems = isAllergyInquiry
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

    let systemPrompt = "";
    if (language === "en") {
      systemPrompt = `You are Chef AI, an expert, polite, and health-conscious restaurant concierge.
${customerPrefsContext}

CRITICAL RULES:
1. RECOMMENDATIONS & MENU DISPLAY:
   - NOTE: MILK = DAIRY = BUTTER = CREAM = CHEESE. EGGS = MAYONNAISE.
   - The "AVAILABLE MENU ITEMS" list provided below has ALREADY been pre-filtered to 100% safe dishes.
   - Recommend 3-5 dishes strictly from "AVAILABLE MENU ITEMS".
   - You MUST extract the integer IDs of all recommended items and put them into "recommendedItemIds": [id1, id2, ...] so the menu cards appear on screen.
   - NEVER mention or invent any dish not present in "AVAILABLE MENU ITEMS".

2. TEXT FORMATTING & CLEANLINESS:
   - NEVER mention internal codes such as "ITEM_REF", "ID", or item numbers anywhere in your text response.
   - Format each recommended dish clearly on its own line:
     - **Dish Name**: Appetizing reason why it fits.

OUTPUT FORMAT: raw JSON object only.
{
  "user_text_th": "User query translated into Thai",
  "user_text_en": "User query in English",
  "text_th": "Natural Thai response with line breaks",
  "text_en": "Natural English response with line breaks",
  "recommendedItemIds": [],
  "action": null,
  "orderItems": []
}
AVAILABLE MENU ITEMS:\n${menuContext}\nCURRENT CART:\n${cartContext}`;
    } else {
      systemPrompt = `คุณคือ เชฟ AI ผู้เชี่ยวชาญด้านอาหารและผู้ช่วยประจำร้านอาหาร
${customerPrefsContext}

กฎสำคัญที่สุด (MANDATORY RULES):
1. การแนะนำเมนูและสารก่อภูมิแพ้:
   - หมายเหตุสำคัญ: นม = DAIRY = เนย (BUTTER) = ครีม (CREAM) = ชีส (CHEESE) และ ไข่ (EGG) = มายองเนส
   - รายการใน "รายการเมนูอาหารที่มี" ได้รับการกรองให้ปลอดภัย 100% แล้ว
   - ให้แนะนำเมนูจาก "รายการเมนูอาหารที่มี" เท่านั้น ห้ามคิดเมนูอื่นขึ้นมาเอง
   - คุณต้องดึงรหัส ID ของเมนูที่แนะนำทั้งหมดใส่ลงใน "recommendedItemIds": [id1, id2, ...] เสมอ เพื่อให้การ์ดเมนูแสดงที่หน้าจอ

2. การจัดรูปแบบข้อความ:
   - ห้ามพูดคำว่า "ITEM_REF", "รหัสสินค้า", "ID" ออกมาในข้อความตอบกลับเด็ดขาด
   - จัดรูปแบบรายการอาหารโดยขึ้นบรรทัดใหม่อย่างเป็นระเบียบ

คำสั่งเรื่องโครงสร้าง: ตอบกลับเป็น raw JSON object เท่านั้น
{
  "user_text_th": "ข้อความคำถามของลูกค้าภาษาไทย",
  "user_text_en": "ข้อความคำถามของลูกค้าแปลเป็นภาษาอังกฤษ",
  "text_th": "ข้อความตอบกลับภาษาไทยอย่างเป็นธรรมชาติและสุภาพ โดยขึ้นบรรทัดใหม่อย่างเป็นระเบียบ",
  "text_en": "ข้อความตอบกลับแปลเป็นภาษาอังกฤษ",
  "recommendedItemIds": [],
  "action": null,
  "orderItems": []
}
รายการเมนูอาหารที่มี:\n${menuContext}\nตะกร้าปัจจุบัน:\n${cartContext}`;
    }

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

    let parsedData = {};
    try {
      parsedData = JSON.parse(rawResponse);
    } catch (e) {
      const cleanFallback = rawResponse.replace(/```json|```/g, "").trim();
      parsedData = { text_th: cleanFallback, text_en: cleanFallback };
    }

    // กรองเอาเฉพาะเมนูที่ปลอดภัยจริง ๆ
    let recommendedItems = [];
    if (
      Array.isArray(parsedData.recommendedItemIds) &&
      parsedData.recommendedItemIds.length > 0
    ) {
      recommendedItems = safeMenuItems.filter((item) =>
        parsedData.recommendedItemIds.map(String).includes(String(item.id)),
      );
    }

    let textTh = cleanItemRefs(parsedData.text_th || parsedData.text || "");
    let textEn = cleanItemRefs(parsedData.text_en || parsedData.text || "");

    return res.status(200).json({
      user_text_th: parsedData.user_text_th || message,
      user_text_en: parsedData.user_text_en || message,
      text_th: textTh,
      text_en: textEn,
      text: language === "en" ? textEn : textTh,
      items: recommendedItems,
      action: parsedData.action || null,
      orderItems: Array.isArray(parsedData.orderItems)
        ? parsedData.orderItems
        : [],
      targetDishName: parsedData.targetDishName || null,
      newNote: parsedData.newNote || null,
    });
  } catch (error) {
    console.error("Vercel Function Error:", error);
    return res.status(500).json({ error: "Failed to connect to AI" });
  }
}
