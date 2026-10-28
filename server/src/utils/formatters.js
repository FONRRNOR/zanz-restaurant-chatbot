export const formatList = (val) => {
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

export const formatIngredientsToBullets = (text, lang = "th") => {
  if (!text) return text;

  if (lang === "th") {
    const thMatch = text.match(
      /([\s\S]*?(?:ดังนี้ครับ|ดังนี้ค่ะ|ได้แก่|ประกอบด้วย)[:\s]*)([\s\S]*?)(\s*(?:โดยมี|สารก่อภูมิแพ้|แพ)[\s\S]*|$)/i,
    );
    if (thMatch) {
      const prefix = thMatch[1].trim();
      const rawIngredients = thMatch[2].trim();
      const allergenSuffix = thMatch[3] ? thMatch[3].trim() : "";

      const items = rawIngredients
        .replace(/\r?\n/g, ", ")
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
    const enMatch = text.match(
      /([\s\S]*?(?:ingredients|as follows|contains).*?[:\s]*)([\s\S]*?)(\s*(?:Allergens|Please note|There are|This dish contains)[\s\S]*|$)/i,
    );
    if (enMatch) {
      const prefix = enMatch[1].trim();
      const rawItems = enMatch[2].trim();
      const suffix = enMatch[3] ? enMatch[3].trim() : "";

      const items = rawItems
        .replace(/\r?\n/g, ", ")
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
};
