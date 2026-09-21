import express from "express";
import cors from "cors";
import { OpenAI } from "openai";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const app = express();
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(
    `\n[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`
  );
  next();
});

const openai = new OpenAI({
  apiKey: process.env.TYPHOON_API_KEY,
  baseURL: "https://api.opentyphoon.ai/v1",
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Helper จัดการข้อมูล Array ให้อ่านเข้าใจง่าย
const formatList = (val) => {
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
};

// ฟังก์ชันแปลงข้อความวัตถุดิบและสารก่อภูมิแพ้ให้แตกเป็น Bullet Points สมบูรณ์ รองรับทั้ง TH และ EN
const formatIngredientsToBullets = (text, lang = "th") => {
  if (!text) return text;

  if (lang === "th") {
    const thMatch = text.match(
      /([\s\S]*?(?:ดังนี้ครับ|ดังนี้ค่ะ|ได้แก่)[:\s]*)([\s\S]*?)(\s*(?:โดยมี|สารก่อภูมิแพ้)[\s\S]*)/i
    );
    if (thMatch) {
      const prefix = thMatch[1];
      const rawIngredients = thMatch[2].trim();
      const allergenSuffix = thMatch[3].trim();

      const items = rawIngredients
        .replace(/\s+และ\s+/g, ", ")
        .split(/,\s*|\n/)
        .map((item) => item.trim().replace(/^[-•*]\s*/, ""))
        .filter((item) => item.length > 0 && item !== "และ");

      if (items.length > 0) {
        const bulletList = items.map((item) => `- ${item}`).join("\n");
        return `${prefix}\n${bulletList}\n\n${allergenSuffix}`;
      }
    }
  } else {
    const enMatch = text.match(
      /([\s\S]*?(?:ingredients|allergens).*?:\s*)([\s\S]*?)(\s*(?:There are|Please note|Allergens)[\s\S]*)/i
    );
    if (enMatch) {
      const prefix = enMatch[1];
      const rawItems = enMatch[2].trim();
      const suffix = enMatch[3].trim();

      const items = rawItems
        .replace(/\s+and\s+/gi, ", ")
        .split(/,\s*|\n/)
        .map((item) => item.trim().replace(/^[-•*]\s*/, ""))
        .filter((item) => item.length > 0 && item.toLowerCase() !== "and");

      if (items.length > 0) {
        const bulletList = items.map((item) => `- ${item}`).join("\n");
        return `${prefix}\n${bulletList}\n\n${suffix}`;
      }
    }
  }

  return text;
};

app.post("/api/chat", async (req, res) => {
  try {
    const {
      message,
      restaurantId,
      history = [],
      currentCart = [],
      language = "th",
    } = req.body;

    if (!message || !restaurantId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const sanitizedHistory = history
      .filter(
        (msg) => msg && typeof msg.text === "string" && msg.text.trim() !== ""
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
          "id, name, name_th, price, description, description_th, image, ingredients, ingredients_th, allergens, allergens_th, dietary_tags, dietary_tags_th, category"
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
        return `- [ITEM_REF: ${item.id}] | Category: [${cat}] | TH: ${item.name_th || item.name} (Ingredients: ${ingTh} | Allergens: ${algTh}) | EN: ${item.name} (Ingredients: ${ingEn} | Allergens: ${algEn}) | Price: ${item.price} Baht`;
      })
      .join("\n");

    const cartContext =
      currentCart && currentCart.length > 0
        ? currentCart
            .map(
              (c) =>
                `- ${c.name || c.name_th} x${c.quantity || 1}${c.notes || c.note ? ` (Note: ${c.notes || c.note})` : ""}`
            )
            .join("\n")
        : "Empty Cart";

    // STEP 3: System Prompt แยกภาษา
    let messagesForModel = [];

    if (language === "en") {
      const systemPromptEn = `You are Chef AI, an expert, polite, and health-conscious restaurant concierge.

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
1. ALLERGIES & RECOMMENDATIONS (e.g. "allergic to eggs/milk, what can I eat?"):
   - ONLY recommend 100% SAFE items. NEVER recommend items with allergens even with warnings.
   - DIVERSIFY CATEGORIES: Prioritize MAIN DISHES (Rice dishes, Noodle dishes, Meats) first. Do NOT recommend exclusively drinks or desserts.
   - Balance: 2-3 Main Dishes + 1-2 Side dishes/Drinks/Desserts (Total 3-5 safe items).
   - Mention clean dish names in text (DO NOT write [ITEM_REF: id] in text). Put integer IDs in "recommendedItemIds".
   - Include a polite cross-contamination warning.

2. CHECKING AVAILABILITY (e.g. "Do you have Gyudon?"):
   - Confirm availability and price. Put integer ID in "recommendedItemIds": [id].
   - DO NOT list ingredients unless explicitly requested.

3. INGREDIENTS & ALLERGENS:
   - For [Dish Name], here are all the ingredients: [comma-separated ingredients]. Allergens: [allergens].
   - Set "recommendedItemIds": [].

4. ORDERING:
   - When the user wants to order, set "action": "CONFIRM_ORDER_ITEMS".
   - Populate "orderItems" with objects containing: "id" (exact integer ID), "quantity" (number), and "notes" (special requests or allergen notes).

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

คำสั่งเรื่องโครงสร้างการตอบกลับ (สำคัญที่สุด):
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
1. เมื่อลูกค้าแพ้อาหาร หรือถามหาเมนูแนะนำ (เช่น "แพ้ไข่ กินอะไรได้บ้าง"):
   - แนะนำเฉพาะเมนูที่ปลอดภัย 100% เท่านั้น ห้ามแนะนำเมนูที่มีสารก่อภูมิแพ้โดยเด็ดขาด
   - เน้นเมนูอาหารจานหลัก (ข้าว, เส้น, เมนูเนื้อสัตว์) ก่อนเป็นอันดับแรก ห้ามแนะนำเฉพาะของหวานหรือเครื่องดื่มอย่างเดียว
   - สัดส่วน: เมนูจานหลัก 2-3 อย่าง + ของทานเล่น/เครื่องดื่ม/ของหวาน 1-2 อย่าง (รวม 3-5 เมนู)
   - ระบุชื่อเมนูอย่างสุภาพในข้อความ โดยห้ามใส่รหัส [ITEM_REF: id] ลงในข้อความเด็ดขาด
   - นำตัวเลข ID ไปใส่ใน "recommendedItemIds" เพื่อแสดงการ์ดเมนู
   - แจ้งเตือนเรื่องความเสี่ยงจากการปนเปื้อนในครัวอย่างสุภาพปิดท้าย

2. เมื่อลูกค้าถามหาเมนู หรือถามว่ามีเมนูนี้ไหม (เช่น "มี ข้าวหน้าเนื้อ ไหม"):
   - ให้ตอบยืนยันสั้นๆ ว่ามีหรือไม่มี พร้อมระบุราคา
   - ดึง ID ของเมนูนั้นๆ มาใส่ใน "recommendedItemIds": [id] เพื่อให้หน้าจอแสดงการ์ดเมนู
   - ห้ามแจกแจงวัตถุดิบและสารก่อภูมิแพ้โดยเด็ดขาด หากลูกค้าไม่ได้ถามถึงส่วนผสมโดยตรง

3. เมื่อลูกค้าถามถึง "ส่วนผสม", "ส่วนประกอบ" โดยตรง:
   - "สำหรับเมนู... มีส่วนประกอบและวัตถุดิบทั้งหมดดังนี้ครับ: [วัตถุดิบแยกด้วยจุลภาค] โดยมีสารก่อภูมิแพ้คือ [สารก่อภูมิแพ้]"
   - ตั้งค่า "recommendedItemIds": []

4. เมื่อลูกค้าสั่งอาหาร (ORDERING):
   - ตั้งค่า "action": "CONFIRM_ORDER_ITEMS"
   - ใส่รายการลงใน "orderItems" โดยระบุ "id" (ตัวเลขรหัสเมนู), "quantity" (จำนวน), และ "notes" (ข้อความกำกับหรือข้อจำกัดแพ้อาหาร)

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
        " "
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
      parsedData = {
        user_text_th: message,
        user_text_en: message,
        text_th: cleanFallbackText,
        text_en: cleanFallbackText,
        recommendedItemIds: [],
        action: null,
        orderItems: [],
        targetDishName: null,
        newNote: null,
      };
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
      message.toLowerCase().includes(word)
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

    // 🌟 จุดแก้สำคัญ: ผูกข้อมูล ชื่อเมนู ราคา รูปภาพ เข้ากับ orderItems ให้ครบถ้วน 🌟
    if (Array.isArray(parsedData.orderItems)) {
      parsedData.orderItems = parsedData.orderItems.map((item) => {
        const targetId = item.id !== undefined ? item.id : item.itemId;
        const found = (menuItems || []).find(
          (m) => String(m.id) === String(targetId)
        );
        return {
          id: targetId,
          itemId: targetId,
          name: found ? (found.name_th || found.name) : (item.name || "Menu Item"),
          name_th: found ? (found.name_th || found.name) : (item.name_th || item.name || "Menu Item"),
          name_en: found ? (found.name || found.name_th) : (item.name || "Menu Item"),
          price: found && found.price !== undefined ? Number(found.price) : (Number(item.price) || 0),
          quantity: Number(item.quantity) || 1,
          notes: item.notes || item.note || "",
          note: item.notes || item.note || "",
          image: found ? (found.image || found.image_url || "") : (item.image || "")
        };
      });
    }

    let recommendedItems = [];
    if (
      Array.isArray(parsedData.recommendedItemIds) &&
      parsedData.recommendedItemIds.length > 0
    ) {
      recommendedItems = (menuItems || []).filter((item) =>
        parsedData.recommendedItemIds.map(String).includes(String(item.id))
      );
    }

    // ล้างรหัสหลุด [ITEM_REF: id] ออกจากข้อความ และจัด Bullet Points ทั้งสองภาษา
    let textTh = (parsedData.text_th || parsedData.text || "")
      .replace(
        /\s*[\(\[\{]?(?:รหัส\vert{}id\vert{}code\vert{}item_ref)\s*[:#-]?\s*\d+[\)\]\}]?/gi,
        ""
      )
      .replace(/[^\S\r\n]{2,}/g, " ")
      .trim();

    let textEn = (parsedData.text_en || parsedData.text || "")
      .replace(
        /\s*[\(\[\{]?(?:รหัส\vert{}id\vert{}code\vert{}item_ref)\s*[:#-]?\s*\d+[\)\]\}]?/gi,
        ""
      )
      .replace(/[^\S\r\n]{2,}/g, " ")
      .trim();

    textTh = formatIngredientsToBullets(textTh, "th");
    textEn = formatIngredientsToBullets(textEn, "en");

    console.log("[Formatted Text TH]:\n", textTh);
    console.log("[Formatted Text EN]:\n", textEn);

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
});

app.get("/api/restaurant/:id", async (req, res) => {
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
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://127.0.0.1:${PORT}`);
});