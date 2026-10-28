import { createClient } from "@supabase/supabase-js";
import { OpenAI } from "openai";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
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
  const cleaned = String(val).replace(/[\[\]"]/g, "").trim();
  return cleaned && cleaned !== "None" ? cleaned : "ไม่มีระบุ";
}

function formatIngredientsToBullets(text, lang = "th") {
  if (!text) return text;
  const cleanedText = text.replace(/\r?\n|\r/g, " ");

  if (lang === "th") {
    const thMatch = cleanedText.match(
      /([\s\S]*?(?:ดังนี้ครับ|ดังนี้ค่ะ|ได้แก่|ประกอบด้วย)[:\s]*)([\s\S]*?)(\s*(?:โดยมี|สารก่อภูมิแพ้|แพ)[\s\S]*|$)/i
    );
    if (thMatch) {
      const prefix = thMatch[1].trim();
      const rawIngredients = thMatch[2].trim();
      const allergenSuffix = thMatch[3] ? thMatch[3].trim() : "";
      const items = rawIngredients
        .replace(/\s+และ\s+/g, ", ")
        .split(/,\s*/)
        .map((item) => item.trim().replace(/^[-•*]\s*/, ""))
        .filter((item) => item.length > 0 && item !== "และ");

      if (items.length > 0) {
        const bulletList = items.map((item) => `- **${item}**`).join("\n");
        return `${prefix}\n${bulletList}${allergenSuffix ? `\n\n${allergenSuffix}` : ""}`;
      }
    }
  } else {
    const enMatch = cleanedText.match(
      /([\s\S]*?(?:ingredients|as follows|contains).*?[:\s]*)([\s\S]*?)(\s*(?:Allergens|Please note|There are|This dish contains)[\s\S]*|$)/i
    );
    if (enMatch) {
      const prefix = enMatch[1].trim();
      const rawItems = enMatch[2].trim();
      const suffix = enMatch[3] ? enMatch[3].trim() : "";
      const items = rawItems
        .replace(/\s+and\s+/gi, ", ")
        .split(/,\s*/)
        .map((item) => item.trim().replace(/^[-•*]\s*/, ""))
        .filter((item) => item.length > 0 && item.toLowerCase() !== "and");

      if (items.length > 0) {
        const bulletList = items.map((item) => `- **${item}**`).join("\n");
        return `${prefix}\n${bulletList}${suffix ? `\n\n${suffix}` : ""}`;
      }
    }
  }
  return text;
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
      .filter((msg) => msg && typeof msg.text === "string" && msg.text.trim() !== "")
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
      intentCheckResponse.choices[0]?.message?.content?.trim().toUpperCase() || "";

    if (!intent.includes("YES")) {
      return res.json({
        user_text_th: message,
        user_text_en: message,
        text_th: "ขออภัยครับ เชฟ AI สามารถให้คำแนะนำเฉพาะเมนูอาหาร วัตถุดิบ สารก่อภูมิแพ้ ตัวเลือกโภชนาการ และการสั่งอาหารของทางร้านเท่านั้นครับ",
        text_en: "I apologize, but as Chef AI, I can only assist with our restaurant's menu, ingredients, allergens, dietary options, and ordering.",
        items: [],
        action: null,
        orderItems: [],
        targetDishName: null,
        newNote: null,
      });
    }

    const { data: menuItems, error: dbError } = await supabase
      .from("menu_items")
      .select("id, name, name_th, price, description, description_th, image, ingredients, ingredients_th, allergens, allergens_th, dietary_tags, dietary_tags_th, taste_profiles, taste_profiles_th, category")
      .eq("restaurant_id", restaurantId)
      .eq("availability", "available");

    if (dbError) throw dbError;

    const menuContext = (menuItems || [])
      .map((item) => {
        const algTh = formatList(item.allergens_th || item.allergens);
        const ingTh = formatList(item.ingredients_th || item.ingredients);
        const algEn = formatList(item.allergens);
        const ingEn = formatList(item.ingredients);
        const cat = item.category || "General";
        const tasteProfilesTh = formatList(item.taste_profiles_th || item.taste_profiles);
        const tasteProfilesEn = formatList(item.taste_profiles);
        return `- [ITEM_REF: ${item.id}] | Category: [${cat}] | TH: ${item.name_th || item.name} (Taste Profiles: ${tasteProfilesTh} | Ingredients: ${ingTh} | Allergens: ${algTh}) | EN: ${item.name} (Taste Profiles: ${tasteProfilesEn} | Ingredients: ${ingEn} | Allergens: ${algEn}) | Price: ${item.price} Baht`;
      })
      .join("\n");

    const cartContext =
      currentCart && currentCart.length > 0
        ? currentCart
            .map((c) => `- ${c.name || c.name_th} x${c.quantity || 1}${c.notes || c.note ? ` (Note: ${c.notes || c.note})` : ""}`)
            .join("\n")
        : "Empty Cart";

    const customerPrefsContext = `
CUSTOMER PREFERENCES / RESTRICTIONS:
- Allergies to Avoid: ${JSON.stringify(customerPreferences.allergies || [])}
- Dietary Restrictions: ${JSON.stringify(customerPreferences.diets || [])}
- Spice Tolerance Level: ${customerPreferences.spiceLevel ?? 3}
`;

    let systemPrompt = "";
    if (language === "en") {
      systemPrompt = `You are Chef AI, an expert restaurant concierge.
${customerPrefsContext}
OUTPUT FORMAT: raw JSON object only.
{
  "user_text_th": "User query translated into Thai",
  "user_text_en": "User query in English",
  "text_th": "Natural Thai response",
  "text_en": "Natural English response",
  "recommendedItemIds": [],
  "action": null,
  "orderItems": []
}
AVAILABLE MENU ITEMS:\n${menuContext}\nCURRENT CART:\n${cartContext}`;
    } else {
      systemPrompt = `คุณคือ เชฟ AI ผู้เชี่ยวชาญด้านอาหารและผู้ช่วยประจำร้านอาหาร
${customerPrefsContext}
คำสั่งเรื่องโครงสร้าง: ตอบกลับเป็น raw JSON object เท่านั้น ห้ามใส่ markdown codeblock
{
  "user_text_th": "ข้อความคำถามของลูกค้าภาษาไทย",
  "user_text_en": "ข้อความคำถามของลูกค้าแปลเป็นภาษาอังกฤษ",
  "text_th": "ข้อความตอบกลับภาษาไทยอย่างเป็นธรรมชาติและสุภาพ",
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
    rawResponse = rawResponse.replace(/[\u00A0\u1680\u180e\u2000-\u2009\u200a\u202f\u205f\u3000\u200b\u200c\u200d\uFEFF]/g, " ").trim();

    let parsedData = {};
    try {
      parsedData = JSON.parse(rawResponse);
    } catch (e) {
      const cleanFallback = rawResponse.replace(/```json|```/g, "").trim();
      parsedData = { text_th: cleanFallback, text_en: cleanFallback };
    }

    let recommendedItems = [];
    if (Array.isArray(parsedData.recommendedItemIds) && parsedData.recommendedItemIds.length > 0) {
      recommendedItems = (menuItems || []).filter((item) =>
        parsedData.recommendedItemIds.map(String).includes(String(item.id))
      );
    }

    let textTh = formatIngredientsToBullets(parsedData.text_th || parsedData.text || "", "th");
    let textEn = formatIngredientsToBullets(parsedData.text_en || parsedData.text || "", "en");

    return res.status(200).json({
      user_text_th: parsedData.user_text_th || message,
      user_text_en: parsedData.user_text_en || message,
      text_th: textTh,
      text_en: textEn,
      text: language === "en" ? textEn : textTh,
      items: recommendedItems,
      action: parsedData.action || null,
      orderItems: Array.isArray(parsedData.orderItems) ? parsedData.orderItems : [],
      targetDishName: parsedData.targetDishName || null,
      newNote: parsedData.newNote || null,
    });
  } catch (error) {
    console.error("Vercel Function Error:", error);
    return res.status(500).json({ error: "Failed to connect to AI" });
  }
}