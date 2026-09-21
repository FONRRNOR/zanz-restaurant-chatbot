<script setup>
import { ref, watch, onMounted, nextTick, computed } from "vue";
import { Bot, Send, Trash2 } from "lucide-vue-next";
import { useAppState } from "../../services/appState";

const props = defineProps({
  isOpen: Boolean,
  language: {
    type: String,
    default: "th",
  },
  restaurantId: {
    type: String,
    required: true,
  },
  restaurantName: {
    type: String,
    default: "",
  },
  storeType: {
    type: String,
    default: "general",
  },
  cart: {
    type: Array,
    default: () => [],
  },
});

// กำหนด emit เพื่อส่งคำสั่งออกไปยัง Parent component (หน้าหลัก)
const emit = defineEmits([
  "close",
  "addToCart",
  "removeFromCart",
  "updateCartNote",
]);

// ดึง State กลางจากหน้าหลักมาใช้งานโดยตรง
const { state } = useAppState();

// 🌟 Sync ภาษาตามหน้าหลักแบบ 100% 🌟
const currentLanguage = computed(
  () => state.language || props.language || "th",
);

// ดึงชื่อร้านค้า
const dynamicRestaurantName = computed(() => {
  return (
    props.restaurantName ||
    state.restaurantName ||
    sessionStorage.getItem("customer_restaurant_name") ||
    "Restaurant"
  );
});

const chatInput = ref("");
const currentStoreType = ref(props.storeType);
const chatMessages = ref([]);
const messagesEndRef = ref(null);
const isLoading = ref(false);

const showModal = ref(false);
const selectedItem = ref(null);

// ใช้ Storage Key แยกตาม restaurantId เพื่อไม่ให้ประวัติหาย
const storageKey = computed(() => `chat_history_${props.restaurantId}`);

// ข้อความต้อนรับ
const getInitialWelcomeText = (lang) => {
  const name = dynamicRestaurantName.value;
  return lang === "th"
    ? `สวัสดีครับ ผมคือบอท AI จากร้าน **${name}**\nให้ผมช่วยแนะนำเมนูอาหารจาก:\n- รสชาติที่คุณชอบ\n- วัตถุดิบที่อยากทาน\n- ข้อจำกัดเรื่องอาหาร หรือการแพ้อาหาร\nวันนี้อยากรับประทานอะไรดีครับ`
    : `Hello! I am the AI Chat bot from **${name}**.\nI can help you find dishes by:\n- Taste\n- Ingredients\n- Dietary preferences or allergens\nWhat are you craving today?`;
};

// ตรวจจับข้อความต้อนรับ
const isWelcomeMessage = (text) => {
  if (!text) return false;
  return (
    text.includes("ผมคือบอท AI") ||
    text.includes("AI Chat bot") ||
    text.includes("รสชาติที่คุณชอบ") ||
    text.includes("Taste")
  );
};

// 🌟 สลับภาษาให้ทุกข้อความในห้องแชท ทั้งข้อความต้อนรับ, ข้อความลูกค้า และข้อความ AI 🌟
const getDisplayMessage = (message) => {
  if (!message) return "";

  // 1. ถ้าเป็นข้อความแรกสุด (Welcome Message) ให้สลับภาษาตามหน้าหลักทันที
  if (message.isWelcome || isWelcomeMessage(message.text_th || message.text)) {
    return getInitialWelcomeText(currentLanguage.value);
  }

  // 2. ข้อความทั้งหมด (ทั้ง User และ Bot) จะถูกเลือกแสดงตามภาษาปัจจุบัน
  if (currentLanguage.value === "th") {
    return message.text_th || message.text || "";
  } else {
    return message.text_en || message.text || "";
  }
};

const allSuggestions = [
  {
    id: "bestseller",
    types: ["all"],
    labelTh: "เมนูยอดฮิต",
    labelEn: "Best Sellers",
    queryTh: "แนะนำเมนูยอดฮิตหรือขายดีที่สุดให้หน่อย",
    queryEn: "Recommend your best-selling items",
  },
  {
    id: "allergens",
    types: ["all"],
    labelTh: "สารก่อภูมิแพ้",
    labelEn: "Allergens",
    queryTh: "มีเมนูไหนมีส่วนผสมของนม เนย ถั่ว แป้งสาลี หรืออาหารทะเลไหม?",
    queryEn: "Do any items contain dairy, nuts, gluten, or seafood?",
  },
  {
    id: "vegan_veggie",
    types: ["vegan", "cafe", "healthy", "general"],
    labelTh: "เจ / มังสวิรัติ",
    labelEn: "Vegan / Veggie",
    queryTh: "มีเมนูมังสวิรัติ หรือเจที่ไม่ใส่เนื้อสัตว์/น้ำปลาไหม?",
    queryEn: "Do you have vegetarian or vegan options?",
  },
  {
    id: "healthy_sugar",
    types: ["cafe", "healthy"],
    labelTh: "หวานน้อย / สุขภาพ",
    labelEn: "Low Sugar / Healthy",
    queryTh: "มีเมนูไหนหวานน้อย หรือเหมาะกับคนรักสุขภาพบ้าง?",
    queryEn: "Any low-sugar or healthy options?",
  },
  {
    id: "spicy_kids",
    types: ["thai_food", "general", "street_food", "restaurant"],
    labelTh: "ไม่เผ็ด / เมนูเด็ก",
    labelEn: "Non-Spicy / Kids",
    queryTh: "มีเมนูไหนไม่เผ็ด หรือเหมาะสำหรับเด็กทานได้บ้าง?",
    queryEn: "Which dishes are non-spicy or suitable for kids?",
  },
  {
    id: "quick_meal",
    types: ["street_food", "thai_food", "general"],
    labelTh: "จานเดียวจานด่วน",
    labelEn: "Quick Meals",
    queryTh: "มีเมนูอาหารจานเดียวทานง่ายและทำไวไหม?",
    queryEn: "Any quick one-dish meals available?",
  },
];

const activeSuggestions = computed(() => {
  const currentType = currentStoreType.value || "general";
  return allSuggestions
    .filter(
      (item) => item.types.includes("all") || item.types.includes(currentType),
    )
    .slice(0, 5);
});

const loadChatHistory = () => {
  try {
    const saved = sessionStorage.getItem(storageKey.value);
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    return null;
  }
};

// บันทึกประวัติลง Storage เสมอ
watch(
  chatMessages,
  (newVal) => {
    try {
      if (newVal && newVal.length > 0) {
        const toSave = newVal.filter((m) => !m.isLoading);
        sessionStorage.setItem(storageKey.value, JSON.stringify(toSave));
      }
    } catch (e) {
      console.error(e);
    }
  },
  { deep: true },
);

const scrollToBottom = () => {
  nextTick(() => {
    messagesEndRef.value?.scrollIntoView({ behavior: "smooth" });
  });
};

const setInitialMessage = () => {
  chatMessages.value = [
    {
      role: "bot",
      isWelcome: true,
      text_th: getInitialWelcomeText("th"),
      text_en: getInitialWelcomeText("en"),
      items: [],
    },
  ];
  scrollToBottom();
};

const clearChatHistory = () => {
  sessionStorage.removeItem(storageKey.value);
  setInitialMessage();
};

const fetchRestaurantData = async () => {
  try {
    const response = await fetch(`/api/restaurant/${props.restaurantId}`);
    if (response.ok) {
      const data = await response.json();
      if (data.type || data.storeType || data.category) {
        currentStoreType.value = data.type || data.storeType || data.category;
      }
    }
  } catch (error) {
    console.warn("Error fetching extra restaurant data:", error);
  }

  const savedMessages = loadChatHistory();
  if (savedMessages && savedMessages.length > 0) {
    chatMessages.value = savedMessages;
    scrollToBottom();
  } else {
    setInitialMessage();
  }
};

onMounted(() => {
  fetchRestaurantData();
});

watch(
  () => props.storeType,
  (newType) => {
    if (newType) currentStoreType.value = newType;
  },
);

const openItemDetail = (item) => {
  selectedItem.value = item;
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
  selectedItem.value = null;
};

const getMenuName = (item) => {
  if (!item) return "";
  return currentLanguage.value === "th" && item.name_th
    ? item.name_th
    : item.name;
};

const getMenuDescription = (item) => {
  if (!item) return "";
  return currentLanguage.value === "th" && item.description_th
    ? item.description_th
    : item.description;
};

// Format ข้อความ: ป้องกันไม่ให้กระทบข้อความต้อนรับ และทำวัตถุดิบเป็นตัวหนาสีเขียว
const formatMessage = (text) => {
  if (!text) return "";

  let formatted = text.replace(
    /\*\*(.*?)\*\*/g,
    '<strong class="text-emerald-700 font-bold">$1</strong>',
  );

  const isIngredientResponse =
    /(?:ดังนี้ครับ|ดังนี้ค่ะ|มีส่วนประกอบและวัตถุดิบ|ingredients:)/i.test(
      formatted,
    );

  if (/(?:สารก่อภูมิแพ้|allergens)/i.test(formatted)) {
    formatted = formatted.replace(
      /((?:สารก่อภูมิแพ้คือ|สารก่อภูมิแพ้ได้แก่|Allergens:\s*))([\s\S]*?)(?=(?:\s*โปรดระวัง|\s*ครับ|\s*ค่ะ|$))/gi,
      (match, label, allergenSection) => {
        const highlighted = allergenSection.replace(
          /(แป้งสาลี|ถั่วเหลือง|ถั่วลิสง|อาหารทะเล|กุ้ง|ปู|ปลา|นม|เนย|ไข่|งา|Gluten|Wheat|Soy|Peanuts|Nuts|Dairy|Milk|Eggs|Seafood|Fish)/gi,
          '<span class="text-rose-600 font-bold">$1</span>',
        );
        return `${label}${highlighted}`;
      },
    );
  }

  const lines = formatted.split("\n");
  let inList = false;
  let result = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[-*•]\s+/.test(trimmed)) {
      if (!inList) {
        inList = true;
        const listClass = isIngredientResponse
          ? "list-disc pl-5 my-2 space-y-1 text-emerald-700 marker:text-emerald-600 font-bold"
          : "list-disc pl-5 my-1.5 space-y-1 text-stone-700 marker:text-stone-400";

        result.push(`<ul class="${listClass}">`);
      }
      result.push(`<li>${trimmed.replace(/^[-*•]\s+/, "")}</li>`);
    } else {
      if (inList) {
        inList = false;
        result.push("</ul>");
      }
      result.push(line);
    }
  }

  if (inList) {
    result.push("</ul>");
  }

  return result
    .join("\n")
    .replace(/(?<!<\/li>|<\/ul>)\n(?!<ul|<\/ul>|<li)/g, "<br>");
};

// ฟังก์ชันส่งข้อความ: รองรับทั้งพิมพ์เอง และการกดปุ่ม Suggestion
async function sendAiMessage(queryParam = null) {
  let userText = "";
  let queryTh = "";
  let queryEn = "";

  if (typeof queryParam === "object" && queryParam !== null) {
    queryTh = queryParam.queryTh;
    queryEn = queryParam.queryEn;
    userText = currentLanguage.value === "th" ? queryTh : queryEn;
  } else {
    userText = (queryParam || chatInput.value || "").trim();
    queryTh = userText;
    queryEn = userText;
  }

  if (!userText || isLoading.value) return;

  isLoading.value = true;

  const userMsgIndex =
    chatMessages.value.push({
      role: "user",
      text_th: queryTh,
      text_en: queryEn,
      text: userText,
      items: [],
    }) - 1;

  chatInput.value = "";
  scrollToBottom();

  const loadingIndex =
    chatMessages.value.push({
      role: "bot",
      text_th: "เชฟกำลังเตรียมข้อมูลให้สักครู่...",
      text_en: "Chef is thinking...",
      isLoading: true,
      items: [],
    }) - 1;
  scrollToBottom();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: userText,
        restaurantId: props.restaurantId,
        history: chatMessages.value
          .filter((msg) => !msg.isLoading)
          .slice(-6)
          .map((msg) => ({
            role: msg.role === "bot" ? "assistant" : msg.role,
            text: msg.text_th || msg.text,
          })),
        currentCart: props.cart,
        language: currentLanguage.value,
      }),
    });

    if (!response.ok) throw new Error("Network response was not ok");

    const data = await response.json();

    if (data.user_text_th && data.user_text_en) {
      chatMessages.value[userMsgIndex].text_th = data.user_text_th;
      chatMessages.value[userMsgIndex].text_en = data.user_text_en;
    }

    // 🌟 แมปจำนวน quantity และ notes จาก orderItems เข้าไปในการ์ด items 🌟
    let displayItems = Array.isArray(data.items) ? [...data.items] : [];

    if (
      data.action === "CONFIRM_ORDER_ITEMS" &&
      Array.isArray(data.orderItems) &&
      data.orderItems.length > 0
    ) {
      displayItems = displayItems.map((cardItem) => {
        const matchedOrder = data.orderItems.find(
          (ord) => String(ord.id || ord.itemId) === String(cardItem.id),
        );
        return {
          ...cardItem,
          orderQuantity: matchedOrder ? matchedOrder.quantity : null,
          orderNotes: matchedOrder
            ? matchedOrder.notes || matchedOrder.note
            : null,
        };
      });

      // 🌟 ส่งเข้าตะกร้าของร้านค้าหน้าร้าน 🌟
      data.orderItems.forEach((orderItem) => {
        emit("addToCart", {
          id: orderItem.id || orderItem.itemId,
          name: orderItem.name,
          name_th: orderItem.name_th || orderItem.name,
          price: orderItem.price || 0,
          quantity: orderItem.quantity || 1,
          notes: orderItem.notes || orderItem.note || "",
          image: orderItem.image || "",
        });
      });
    }

    chatMessages.value[loadingIndex] = {
      role: "bot",
      text_th: data.text_th || data.text,
      text_en: data.text_en || data.text,
      items: displayItems,
      isLoading: false,
    };
    scrollToBottom();
  } catch (error) {
    console.error("Frontend Fetch Error:", error);
    chatMessages.value[loadingIndex] = {
      role: "bot",
      text_th:
        "ขออภัยครับ เกิดข้อผิดพลาดในการเชื่อมต่อกับเชฟ AI โปรดลองใหม่อีกครั้ง",
      text_en: "Sorry, failed to connect with Chef AI. Please try again.",
      items: [],
      isLoading: false,
    };
    scrollToBottom();
  } finally {
    isLoading.value = false;
  }
}

const formatIngredients = (ing) => {
  if (!ing) return "";
  return typeof ing === "string"
    ? ing
    : Array.isArray(ing)
      ? ing.join(", ")
      : "";
};

const formatAllergens = (alg) => {
  if (!alg) return "";
  return typeof alg === "string"
    ? alg
    : Array.isArray(alg)
      ? alg.join(", ")
      : "";
};

const getMenuAllergens = (item) => {
  if (!item) return "";
  return currentLanguage.value === "th" && item.allergens_th
    ? item.allergens_th
    : item.allergens;
};
</script>

<template>
  <Transition name="fade">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-5 bg-black/60 backdrop-blur-sm"
      @click="$emit('close')"
    >
      <div
        @click.stop
        class="bg-white w-full sm:max-w-[420px] h-[85vh] sm:h-[600px] rounded-t-3xl sm:rounded-3xl overflow-hidden flex flex-col shadow-2xl relative"
      >
        <!-- Header -->
        <div
          class="p-4 flex items-center justify-between border-b border-stone-100 bg-white z-10 shadow-sm"
        >
          <div class="flex items-center gap-3">
            <div
              class="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-600 text-white shadow-md"
            >
              <Bot :size="24" />
            </div>
            <div>
              <h2 class="font-bold text-stone-900 text-lg leading-tight">
                {{ currentLanguage === "th" ? "บอท AI" : "AI Chat Bot" }}
              </h2>
              <p class="text-xs text-stone-500 font-medium">
                {{ dynamicRestaurantName }}
              </p>
            </div>
          </div>

          <div class="flex items-center gap-1.5">
            <button
              @click="clearChatHistory"
              class="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 hover:text-red-500 hover:bg-red-50 active:scale-95 transition-all cursor-pointer"
              :title="currentLanguage === 'th' ? 'ล้างการสนทนา' : 'Clear Chat'"
            >
              <Trash2 :size="16" />
            </button>
            <button
              @click="$emit('close')"
              class="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-700 hover:bg-stone-200 active:scale-95 transition-all font-bold cursor-pointer"
              aria-label="Close"
            >
              <span class="text-2xl leading-none">✕</span>
            </button>
          </div>
        </div>

        <!-- Messages Area -->
        <div
          class="flex-1 space-y-4 overflow-y-auto p-4 bg-stone-50 scroll-smooth"
        >
          <div
            v-for="(message, index) in chatMessages"
            :key="index"
            :class="
              message.role === 'user'
                ? 'ml-auto bg-emerald-800 text-white'
                : 'bg-white border border-stone-200 text-stone-800'
            "
            class="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm break-words"
          >
            <div
              v-if="message.isLoading"
              class="flex items-center gap-2 text-stone-400 py-1"
            >
              <span class="inline-block animate-pulse">●</span>
              <span class="inline-block animate-pulse [animation-delay:200ms]"
                >●</span
              >
              <span class="inline-block animate-pulse [animation-delay:400ms]"
                >●</span
              >
              <span class="text-xs ml-1">{{
                currentLanguage === "th"
                  ? "เชฟกำลังเตรียมข้อมูล..."
                  : "Chef is thinking..."
              }}</span>
            </div>

            <!-- แสดงผลข้อความที่ Sync ทั้ง Welcome, User และ Bot ตามภาษาหน้าหลัก -->
            <div
              v-else
              v-html="formatMessage(getDisplayMessage(message))"
            ></div>

            <!-- การ์ดแนะนำเมนูอาหาร (พร้อมวงกลมแสดงจำนวนที่สั่ง) -->
            <div
              v-if="message.items && message.items.length > 0"
              class="mt-3 space-y-2"
            >
              <div
                v-for="item in message.items"
                :key="item.id || item.menu_id"
                @click="openItemDetail(item)"
                class="flex w-full items-center justify-between rounded-xl bg-stone-50 border border-stone-100 p-2.5 text-left text-stone-900 hover:bg-emerald-50 hover:border-emerald-200 transition-colors cursor-pointer group gap-3 relative overflow-hidden"
              >
                <!-- รูปภาพเมนู -->
                <div
                  class="w-12 h-12 rounded-lg bg-stone-200 flex-shrink-0 overflow-hidden"
                >
                  <img
                    v-if="item.image || item.image_url"
                    :src="item.image || item.image_url"
                    class="w-full h-full object-cover"
                  />
                  <div
                    v-else
                    class="w-full h-full flex items-center justify-center text-[9px] text-stone-400 font-bold"
                  >
                    No Img
                  </div>
                </div>

                <!-- ข้อมูลชื่อและราคา -->
                <div
                  class="min-w-0 flex-1 flex flex-col justify-center overflow-hidden"
                >
                  <div class="flex items-baseline gap-1.5 overflow-hidden">
                    <strong
                      class="text-sm font-bold group-hover:text-emerald-700 transition-colors truncate"
                    >
                      {{ getMenuName(item) }}
                    </strong>
                    <span
                      class="text-xs text-stone-500 font-medium flex-shrink-0"
                    >
                      {{ item.price || item.priceNum || 0 }}
                      {{ currentLanguage === "th" ? "บาท" : "Baht" }}
                    </span>
                  </div>
                  <span
                    v-if="
                      currentLanguage === 'th' &&
                      item.name &&
                      item.name_th &&
                      item.name !== item.name_th
                    "
                    class="text-xs text-stone-500 font-medium truncate mt-0.5"
                  >
                    {{ item.name }}
                  </span>
                </div>

                <!-- 🌟 วงกลมบอกจำนวนที่สั่ง (Quantity Badge) อยู่ฝั่งขวาสุด 🌟 -->
                <div
                  v-if="item.orderQuantity"
                  class="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-black text-white font-bold text-md shadow-sm ring-2 ring-white"
                  :title="`จำนวน ${item.orderQuantity} ที่`"
                >
                  {{ item.orderQuantity }}
                </div>
              </div>
            </div>
          </div>

          <div ref="messagesEndRef"></div>
        </div>

        <!-- Quick Suggestion Buttons -->
        <div
          class="p-2 bg-white border-t border-stone-100 flex gap-1 overflow-x-auto no-scrollbar shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]"
        >
          <button
            v-for="item in activeSuggestions"
            :key="item.id"
            style="font-size: 15px; line-height: 14px"
            class="whitespace-nowrap px-5 py-2 bg-stone-100 hover:bg-emerald-100 hover:text-emerald-700 rounded-full text-stone-700 font-medium transition-colors cursor-pointer shrink-0 disabled:opacity-50"
            :disabled="isLoading"
            @click="sendAiMessage(item)"
          >
            {{ currentLanguage === "th" ? item.labelTh : item.labelEn }}
          </button>
        </div>

        <!-- Input Bar -->
        <form
          class="p-2.5 bg-white border-t border-stone-100 flex items-center gap-1.5"
          @submit.prevent="sendAiMessage()"
        >
          <input
            v-model="chatInput"
            :disabled="isLoading"
            class="min-w-0 flex-1 bg-stone-100 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all placeholder:text-stone-400 disabled:opacity-60"
            :placeholder="
              currentLanguage === 'th' ? 'พิมพ์ถามเชฟ AI...' : 'Ask Chef AI...'
            "
          />
          <button
            type="submit"
            :disabled="isLoading || !chatInput.trim()"
            class="w-9 h-9 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center flex-shrink-0 shadow-sm active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Send"
          >
            <Send :size="16" />
          </button>
        </form>
      </div>
    </div>
  </Transition>

  <!-- Modal Item Detail -->
  <Transition name="fade">
    <div
      v-if="showModal"
      class="fixed inset-0 z-[60] flex items-center justify-center p-5 bg-black/60 backdrop-blur-sm"
      @click="closeModal"
    >
      <Transition name="zoom">
        <div
          v-if="showModal && selectedItem"
          @click.stop
          class="bg-white w-full max-w-[340px] max-h-[85vh] rounded-3xl overflow-y-auto flex flex-col shadow-2xl relative"
        >
          <div class="relative h-60 w-full bg-stone-100 flex-shrink-0">
            <img
              v-if="selectedItem.image || selectedItem.image_url"
              :src="selectedItem.image || selectedItem.image_url"
              class="w-full h-full object-cover"
            />
            <div
              v-else
              class="w-full h-full flex items-center justify-center text-stone-400 text-sm font-medium"
            >
              {{
                currentLanguage === "th" ? "ไม่มีรูปภาพ" : "No Image Available"
              }}
            </div>
            <button
              @click="closeModal"
              class="absolute top-4 right-4 w-7 h-7 bg-black/40 hover:bg-black/50 rounded-full flex items-center justify-center text-white font-bold cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div class="p-5 pb-8 text-left space-y-4">
            <div class="flex justify-between items-start">
              <div>
                <h2 class="text-xl font-bold text-stone-900 leading-snug">
                  {{ getMenuName(selectedItem) }}
                </h2>
                <p
                  v-if="
                    currentLanguage === 'th' &&
                    selectedItem.name &&
                    selectedItem.name_th &&
                    selectedItem.name !== selectedItem.name_th
                  "
                  class="text-sm text-stone-500 font-medium mt-0.5"
                >
                  {{ selectedItem.name }}
                </p>
              </div>

              <span
                class="text-lg font-bold text-emerald-700 whitespace-nowrap ml-2"
              >
                {{
                  (
                    selectedItem.price ||
                    selectedItem.priceNum ||
                    0
                  ).toLocaleString()
                }}
                {{ currentLanguage === "th" ? "บาท" : "Baht" }}
              </span>
            </div>

            <div v-if="getMenuDescription(selectedItem)">
              <p class="text-sm text-stone-600 leading-relaxed">
                {{ getMenuDescription(selectedItem) }}
              </p>
            </div>

            <div
              v-if="selectedItem.ingredients || selectedItem.ingredients_th"
              class="border-t border-stone-100 pt-3"
            >
              <p class="text-[13px] text-stone-400 font-medium mb-1">
                {{
                  currentLanguage === "th"
                    ? "ส่วนผสมและองค์ประกอบ"
                    : "Ingredients & Components"
                }}
              </p>
              <p class="text-[14px] text-stone-900 leading-relaxed">
                {{
                  formatIngredients(
                    currentLanguage === "th" && selectedItem.ingredients_th
                      ? selectedItem.ingredients_th
                      : selectedItem.ingredients,
                  )
                }}
              </p>
            </div>

            <div class="border-t border-stone-100 pt-3">
              <p class="text-[13px] text-stone-400 font-medium mb-1">
                {{
                  currentLanguage === "th"
                    ? "สารก่อภูมิแพ้"
                    : "Allergen Information *"
                }}
              </p>
              <p class="text-[14px] text-stone-900">
                {{
                  formatAllergens(getMenuAllergens(selectedItem)) ||
                  (currentLanguage === "th"
                    ? "ไม่มีข้อมูลสารก่อภูมิแพ้"
                    : "None")
                }}
              </p>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </Transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
