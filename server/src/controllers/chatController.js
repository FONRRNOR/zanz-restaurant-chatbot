import { openai, supabase } from "../config/supabase.js";
import { formatList, formatIngredientsToBullets } from "../utils/formatters.js";

export const handleChat = async (req, res) => {
  try {
    const {
      message,
      restaurantId,
      history = [],
      currentCart = [],
      language = "th",
      customerPreferences = {},
    } = req.body;

    console.log("\n========= [DEBUG] Incoming Request Body =========");
    console.log("Message:", message);
    console.log("Restaurant ID:", restaurantId);
    console.log("Language:", language);
    console.log("Current Cart Items:", currentCart.length);
    console.log("Customer Preferences:", customerPreferences);
    console.log("================================================");

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

    // STEP 1: Gatekeeper ตรวจสอบความเกี่ยวข้อง
    const recentContext = sanitizedHistory
      .slice(-3)
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

    // STEP 2: ดึงข้อมูลเมนูอาหาร
    let menuItems = [];
    try {
      const { data, error: dbError } = await supabase
        .from("menu_items")
        .select(
          "id, name, name_th, price, description, description_th, image, ingredients, ingredients_th, allergens, allergens_th, dietary_tags, dietary_tags_th, taste_profiles, taste_profiles_th, category",
        )
        .eq("restaurant_id", restaurantId)
        .eq("availability", "available");

      if (dbError) throw dbError;
      menuItems = data || [];
    } catch (dbErr) {
      console.error("Database Access Error (SRS-95):", dbErr);
      return res.json({
        user_text_th: message,
        user_text_en: message,
        text_th:
          "ขณะนี้ไม่สามารถเข้าถึงข้อมูลเมนูอาหารได้ โปรดลองใหม่อีกครั้งในภายหลังครับ",
        text_en:
          "Menu information is currently unavailable. Please try again later.",
        items: [],
        action: null,
        orderItems: [],
        targetDishName: null,
        newNote: null,
      });
    }

    const menuContext = (menuItems || [])
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

    // 🌟 ส่วนข้อมูลความต้องการและข้อจำกัดของลูกค้า
    const customerPrefsContext = `
CUSTOMER PREFERENCES / RESTRICTIONS:
- Allergies to Avoid (CRITICAL - DO NOT RECOMMEND items containing these): ${JSON.stringify(customerPreferences.allergies || [])}
- Dietary Restrictions: ${JSON.stringify(customerPreferences.diets || [])}
- Spice Tolerance Level (0 = None, 1 = Mild, 2 = Medium, 3 = Spicy): ${customerPreferences.spiceLevel ?? 3}
`;

    // STEP 3: System Prompt แยกภาษา (เพิ่ม customerPrefsContext เข้าไป)
    let messagesForModel = [];

    if (language === "en") {
      const systemPromptEn = `You are Chef AI, an expert, polite, and health-conscious restaurant concierge.

${customerPrefsContext}

CRITICAL INSTRUCTION FOR CONTEXT:
- Always look at the "Recent conversation context" or chat history provided. If the user refers to "this menu", "it", or asks about ingredients/allergens right after discussing a specific dish, you MUST identify that dish from the conversation history and answer based on it.

OUTPUT FORMAT INSTRUCTION:
You MUST reply ONLY with a single valid raw JSON object. Never include markdown codeblocks (\`\`\`json).
Format:
{
  "user_text_th": "User query translated into Thai",
  "user_text_en": "User query in English",
  "text_th": "Natural Thai response",
  "text_en": "Natural English response",
  "recommendedItemIds": [],
  "action": null,
  "orderItems": []
}

RULES:
1. ALLERGIES & TASTE PROFILES & RECOMMENDATIONS:
   - ONLY recommend 100% SAFE items. NEVER recommend items with allergies listed in CUSTOMER PREFERENCES.
   - Match recommendations based on the user's requested taste profiles (e.g., spicy, sweet, savory) and ensure spice levels do not exceed their Spice Tolerance Level.
   - DIVERSIFY CATEGORIES: Prioritize MAIN DISHES first.
   - Balance: 2-3 Main Dishes + 1-2 Side dishes/Drinks/Desserts (Total 3-5 safe items).
   - Put integer IDs in "recommendedItemIds".

2. CHECKING AVAILABILITY (e.g., "Do you have [Dish Name]?"):
   - Look through the "AVAILABLE MENU ITEMS" list. Confirm availability and price.
   - CRITICAL: Never mention internal codes like "ITEM_REF" or "Item Ref" in your text response. 
   - Write a natural, mouth-watering description explaining why this dish is great (e.g., highlighting its fresh ingredients, cooking style, or flavor profile) alongside its price.
   - CRITICAL: You MUST extract the exact integer ID of the matched item and put it into "recommendedItemIds": [id] so the UI can display its menu card.

3. INGREDIENTS & ALLERGENS:
   - When the user asks for ingredients, components, or about "this menu's ingredients" (referencing the dish discussed in previous history), you MUST extract the correct dish and structure your response as follows:
     "The ingredients for [Dish Name] are as follows: [ingredient 1], [ingredient 2], [ingredient 3]. Allergens: [list allergens or None]."
   - Set "recommendedItemIds": [].
   - NEVER use emojis.

4. ORDERING:
   - Set "action": "CONFIRM_ORDER_ITEMS".
   - Populate "orderItems" with "id", "quantity", and "notes".

AVAILABLE MENU ITEMS:
${menuContext}

CURRENT CART:
${cartContext}`;

      messagesForModel = [
        { role: "system", content: systemPromptEn },
        ...sanitizedHistory,
        { role: "user", content: message },
      ];
    } else {
      const systemPromptTh = `คุณคือ เชฟ AI ผู้เชี่ยวชาญด้านอาหารและผู้ช่วยประจำร้านอาหาร

${customerPrefsContext}

คำสั่งสำคัญเรื่องความต่อเนื่องของบทสนทนา:
- ให้ตรวจสอบประวัติการสนทนาก่อนหน้าเสมอ หากลูกค้าใช้คำว่า "เมนูนี้", "อันนี้" หรือถามต่อจากเมนูที่เพิ่งคุยกันไป ให้ AI ดึงชื่อเมนูจากประวัติการสนทนามาใช้งานต่อเนื่องทันที

คำสั่งเรื่องโครงสร้างการตอบกลับ:
คุณต้องตอบกลับเป็น raw JSON object เท่านั้น ห้ามใส่ markdown codeblock (\`\`\`json) เด็ดขาด
โครงสร้าง JSON:
{
  "user_text_th": "ข้อความคำถามของลูกค้าภาษาไทย",
  "user_text_en": "ข้อความคำถามของลูกค้าแปลเป็นภาษาอังกฤษ",
  "text_th": "ข้อความตอบกลับภาษาไทยอย่างเป็นธรรมชาติและสุภาพ",
  "text_en": "ข้อความตอบกลับแปลเป็นภาษาอังกฤษ",
  "recommendedItemIds": [],
  "action": null,
  "orderItems": []
}

กฎการตอบคำถาม:
1. เมื่อลูกค้าแพ้อาหาร หรือถามหาเมนูแนะนำ: 
   - ห้ามแนะนำเมนูที่มีส่วนผสมของสารก่อภูมิแพ้ตรงกับ "Allergies to Avoid" เด็ดขาด (ปลอดภัย 100%)
   - คัดเลือกเมนูที่ตรงกับโปรไฟล์รสชาติ (Taste Profiles) ที่ลูกค้าพิมพ์ถาม หรือตรงตามรูปแบบอาหาร (Diets) และระดับความเผ็ดไม่เกิน Spice Tolerance Level ที่กำหนด
   - นำรหัส ID เมนูที่ปลอดภัยใส่ใน "recommendedItemIds"
2. เมื่อลูกค้าถามหาเมนู หรือถามว่ามีเมนูนี้ไหม (เช่น "มี [ชื่อเมนู] ไหม"):
   - ให้ตรวจดูจากรายชื่อเมนู ยืนยันว่ามี พร้อมระบุราคา
   - สำคัญมาก: ห้ามพูดคำว่า "ITEM_REF" หรือ "รหัสสินค้า" ออกมาในข้อความตอบกลับเด็ดขาด ให้พูดคุยด้วยภาษามนุษย์ที่เป็นธรรมชาติ
   - ให้เพิ่มคำอธิบายสั้นๆ ที่ชวนให้น่ารับประทาน (เช่น บรรยายความอร่อย วัตถุดิบคุณภาพ หรือความพิเศษของเมนูนั้นๆ) เพื่อแนะนำให้ลูกค้ารู้สึกอยากลอง
   - คุณต้องดึงรหัส ID ของเมนูที่ตรงกัน ไปใส่ใน "recommendedItemIds": [id] เสมอ เพื่อให้หน้าจอแสดงการ์ดเมนูอาหารขึ้นมา
3. เมื่อลูกค้าถามถึง "ส่วนผสม", "ส่วนประกอบ" หรือถามถึงเมนูต่อเนื่องจากประวัติการสนทนา (เช่น "ingredients for this menu"):
   - ให้ระบุชื่อเมนูจากประวัติการสนทนาก่อนหน้า แล้วตอบกลับด้วยโครงสร้างนี้เท่านั้น:
     "ส่วนผสมของ [ชื่อเมนู] มีดังนี้ครับ ได้แก่ [วัตถุดิบ 1], [วัตถุดิบ 2], [วัตถุดิบ 3] โดยมีสารก่อภูมิแพ้: [ระบุสารก่อภูมิแพ้ หรือ ไม่มี]"
   - ตั้งค่า "recommendedItemIds": [] เสมอ
   - ห้ามใส่อีโมจิเด็ดขาด
4. เมื่อลูกค้าสั่งอาหาร: ตั้งค่า "action": "CONFIRM_ORDER_ITEMS" และใส่ข้อมูลใน "orderItems"

รายการเมนูอาหารที่มี:
${menuContext}

ตะกร้าปัจจุบัน:
${cartContext}`;

      messagesForModel = [
        { role: "system", content: systemPromptTh },
        ...sanitizedHistory,
        { role: "user", content: message },
      ];
    }

    const response = await openai.chat.completions.create({
      model: "typhoon-v2.5-30b-a3b-instruct",
      messages: messagesForModel,
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

    console.log("Raw Typhoon Output:\n", rawResponse);

    let parsedData = {
      user_text_th: message,
      user_text_en: message,
      text_th: "",
      text_en: "",
      recommendedItemIds: [],
      action: null,
      orderItems: [],
      targetDishName: null,
      newNote: null,
    };

    try {
      let jsonString = rawResponse;
      if (!jsonString.endsWith("}")) {
        const lastBrace = jsonString.lastIndexOf("}");
        if (lastBrace !== -1) {
          jsonString = jsonString.substring(0, lastBrace + 1);
        } else {
          jsonString += '"}';
        }
      }

      const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON bracket found");
      parsedData = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.warn("JSON fallback triggered:", e.message);
      const cleanFallbackText = rawResponse.replace(/```json|```/g, "").trim();
      parsedData.text_th = cleanFallbackText;
      parsedData.text_en = cleanFallbackText;
    }

    // BACKEND AUTO-ORDER RECOVERY
    const orderKeywords = [
      "เอา",
      "สั่ง",
      "รับ",
      "ขอลอง",
      "เพิ่ม",
      "ซื้อ",
      "order",
      "buy",
      "add",
    ];
    const userIntendedToOrder = orderKeywords.some((word) =>
      message.toLowerCase().includes(word),
    );

    if (
      userIntendedToOrder &&
      (!parsedData.orderItems || parsedData.orderItems.length === 0)
    ) {
      const lastContextText = sanitizedHistory
        .map((h) => h.content)
        .reverse()
        .join(" ");

      const matchedDish = (menuItems || []).find((item) => {
        const nameTh = item.name_th;
        const nameEn = item.name;
        return (
          (nameTh && lastContextText.includes(nameTh)) ||
          (nameEn &&
            lastContextText.toLowerCase().includes(nameEn.toLowerCase()))
        );
      });

      if (matchedDish) {
        const qtyMatch = message.match(/(\d+)\s*(?:ที่|จาน|ชิ้น|กล่อง|order)/);
        const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

        parsedData.action = "CONFIRM_ORDER_ITEMS";
        parsedData.orderItems = [
          {
            id: matchedDish.id,
            name: matchedDish.name_th || matchedDish.name,
            price: matchedDish.price,
            quantity: quantity,
            notes: "",
            image: matchedDish.image || "",
          },
        ];
      }
    }

    if (Array.isArray(parsedData.orderItems)) {
      parsedData.orderItems = parsedData.orderItems.map((item) => {
        const targetId = item.id !== undefined ? item.id : item.itemId;
        const found = (menuItems || []).find(
          (m) => String(m.id) === String(targetId),
        );

        const displayName = found
          ? language === "en"
            ? found.name || found.name_th
            : found.name_th || found.name
          : item.name || "Menu Item";

        return {
          id: targetId,
          itemId: targetId,
          name: displayName,
          name_th: found
            ? found.name_th || found.name
            : item.name_th || item.name || "Menu Item",
          name_en: found
            ? found.name || found.name_th
            : item.name || "Menu Item",
          price:
            found && found.price !== undefined
              ? Number(found.price)
              : Number(item.price) || 0,
          quantity: Number(item.quantity) || 1,
          notes: item.notes || item.note || "",
          note: item.notes || item.note || "",
          image: found
            ? found.image || found.image_url || ""
            : item.image || "",
        };
      });
    }

    let recommendedItems = [];
    if (
      Array.isArray(parsedData.recommendedItemIds) &&
      parsedData.recommendedItemIds.length > 0
    ) {
      recommendedItems = (menuItems || []).filter((item) =>
        parsedData.recommendedItemIds.map(String).includes(String(item.id)),
      );
    }

    let textTh = (parsedData.text_th || parsedData.text || "")
      .replace(
        /\s*[\(\[\{]?\s*(?:รหัส|id|code|item_ref)\s*[:#-]?\s*\d+\s*[\)\]\}]?/gi,
        "",
      )
      .replace(/[^\S\r\n]{2,}/g, " ")
      .trim();

    let textEn = (parsedData.text_en || parsedData.text || "")
      .replace(
        /\s*[\(\[\{]?\s*(?:รหัส|id|code|item_ref)\s*[:#-]?\s*\d+\s*[\)\]\}]?/gi,
        "",
      )
      .replace(/[^\S\r\n]{2,}/g, " ")
      .trim();

    textTh = formatIngredientsToBullets(textTh, "th");
    textEn = formatIngredientsToBullets(textEn, "en");

    console.log("[Formatted Text TH]:\n", textTh);
    console.log("[Formatted Text EN]:\n", textEn);
    console.log("------------------------------------------------\n");

    res.json({
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
    console.error("Route Error:", error);
    res.status(500).json({ error: "Failed to connect to AI" });
  }
};

export const getRestaurantInfo = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("profiles")
      .select("restaurant_name")
      .eq("restaurant_id", id)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Restaurant not found" });
    res.json({ name: data.restaurant_name });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch restaurant info" });
  }
};
