<script setup>
import { ref, watch, onMounted, nextTick, computed } from "vue";
import { Send, Trash2, Sparkles } from "lucide-vue-next";
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
  tableNumber: {
    type: [String, Number],
    default: "",
  },
});

const emit = defineEmits([
  "close",
  "addToCart",
  "addMultipleToCart",
  "removeFromCart",
  "updateCartNote",
]);

const { state } = useAppState();

const currentLanguage = computed(
  () => state.language || props.language || "th",
);

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

const storageKey = computed(() => `chat_history_${props.restaurantId}`);

const getInitialWelcomeText = (lang) => {
  const name = dynamicRestaurantName.value;
  return lang === "th"
    ? `สวัสดีครับ! ผมคือ Chef AI ผู้ช่วยอัจฉริยะประจำร้าน ${name}\nให้ผมช่วยแนะนำเมนูเด็ดจาก:\n- รสชาติที่คุณชื่นชอบ\n- วัตถุดิบพิเศษที่คุณอยากทาน\n- ข้อจำกัดหรืออาการแพ้อาหาร\nวันนี้รับรายการใดดีครับ?`
    : `Hello! I'm Chef AI, your intelligent dining assistant at ${name}.\nI can help you find dishes by:\n- Taste preferences\n- Ingredients\n- Dietary restrictions or allergens\nWhat are you craving today?`;
};

const isWelcomeMessage = (text) => {
  if (!text) return false;
  return (
    text.includes("Chef AI") ||
    text.includes("ผมคือบอท AI") ||
    text.includes("AI Chat bot") ||
    text.includes("รสชาติที่คุณชอบ") ||
    text.includes("Taste")
  );
};

const getDisplayMessage = (message) => {
  if (!message) return "";
  if (message.isWelcome || isWelcomeMessage(message.text_th || message.text)) {
    return getInitialWelcomeText(currentLanguage.value);
  }
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
    queryTh: "แนะนำเมนูยอดฮิตหรือขายดีที่สุดให้หน่อยครับ",
    queryEn: "Recommend your best-selling items",
  },
  {
    id: "allergens",
    types: ["all"],
    labelTh: "ตรวจสอบสารก่อภูมิแพ้",
    labelEn: "Allergen Info",
    queryTh: "มีเมนูไหนมีส่วนผสมของนม เนย ถั่ว แป้งสาลี หรืออาหารทะเลไหม?",
    queryEn: "Do any items contain dairy, nuts, gluten, or seafood?",
  },
  {
    id: "vegan_veggie",
    types: ["vegan", "cafe", "healthy", "general"],
    labelTh: "เจ / มังสวิรัติ",
    labelEn: "Vegan / Veggie",
    queryTh: "มีเมนูมังสวิรัติ หรือเจที่ไม่ใส่เนื้อสัตว์ไหมครับ?",
    queryEn: "Do you have vegetarian or vegan options?",
  },
  {
    id: "healthy_sugar",
    types: ["cafe", "healthy"],
    labelTh: "หวานน้อย / สุขภาพ",
    labelEn: "Low Sugar",
    queryTh: "มีเมนูไหนหวานน้อย หรือเหมาะกับคนรักสุขภาพบ้าง?",
    queryEn: "Any low-sugar or healthy options?",
  },
  {
    id: "spicy_kids",
    types: ["thai_food", "general", "street_food", "restaurant"],
    labelTh: "ไม่เผ็ด / เมนูเด็ก",
    labelEn: "Non-Spicy",
    queryTh: "มีเมนูไหนไม่เผ็ด หรือเหมาะสำหรับเด็กทานได้บ้าง?",
    queryEn: "Which dishes are non-spicy or suitable for kids?",
  },
  {
    id: "quick_meal",
    types: ["street_food", "thai_food", "general"],
    labelTh: "จานด่วนทานง่าย",
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

onMounted(async () => {
  await fetchRestaurantData();
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

const formatMessage = (text) => {
  if (!text) return "";

  let formatted = text.replace(
    /\*\*(.*?)\*\*/g,
    '<strong class="text-stone-700 font-bold">$1</strong>',
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
      text_th: "Chef AI กำลังคัดสรรข้อมูลให้...",
      text_en: "Chef AI is preparing recommendations...",
      isLoading: true,
      items: [],
    }) - 1;
  scrollToBottom();

  try {
    let customerPreferences = {};
    try {
      const savedPrefs = sessionStorage.getItem("customer_preferences");
      if (savedPrefs) {
        customerPreferences = JSON.parse(savedPrefs);
      }
    } catch (e) {
      console.error("Failed to load customer preferences", e);
    }

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
        customerPreferences: customerPreferences,
      }),
    });

    if (!response.ok) throw new Error("Network response was not ok");

    const data = await response.json();

    if (data.user_text_th && data.user_text_en) {
      chatMessages.value[userMsgIndex].text_th = data.user_text_th;
      chatMessages.value[userMsgIndex].text_en = data.user_text_en;
    }

    let displayItems = Array.isArray(data.items) ? [...data.items] : [];

    if (
      (data.action === "CONFIRM_ORDER_ITEMS" ||
        (data.orderItems && data.orderItems.length > 0)) &&
      Array.isArray(data.orderItems)
    ) {
      const itemsToAddToCart = [];

      data.orderItems.forEach((orderItem) => {
        const exactQty = Number(orderItem.quantity) || 1;

        const targetCard = displayItems.find(
          (di) => String(di.id) === String(orderItem.id || orderItem.itemId),
        );
        if (targetCard) {
          targetCard.quantity = exactQty;
          targetCard.orderQuantity = exactQty;
        } else if (displayItems.length > 0) {
          displayItems.forEach((di) => {
            if (String(di.id) === String(orderItem.id || orderItem.itemId)) {
              di.quantity = exactQty;
              di.orderQuantity = exactQty;
            }
          });
        }

        itemsToAddToCart.push({
          id: orderItem.id || orderItem.itemId,
          name: orderItem.name,
          name_th: orderItem.name_th || orderItem.name,
          price: orderItem.price || 0,
          quantity: exactQty,
          notes: orderItem.notes || orderItem.note || "",
          image: orderItem.image || "",
        });
      });

      if (itemsToAddToCart.length > 0) {
        emit("addMultipleToCart", itemsToAddToCart);
      }
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
        "ขออภัยครับ เกิดข้อผิดพลาดในการเชื่อมต่อกับ Chef AI โปรดลองใหม่อีกครั้ง",
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

const tableNumber = computed(() => {
  return (
    props.tableNumber ||
    state.tableNumber ||
    state.table ||
    sessionStorage.getItem("customer_table_number") ||
    sessionStorage.getItem("table_number") ||
    "1"
  );
});
</script>

<template>
  <Transition name="fade">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-5 bg-stone-900/50 backdrop-blur-md"
      @click="$emit('close')"
    >
      <div
        @click.stop
        class="bg-white w-full sm:max-w-[440px] h-[90vh] sm:h-[640px] rounded-t-[2.5rem] sm:rounded-[2.5rem] overflow-hidden flex flex-col shadow-2xl relative border border-stone-100"
      >
        <!-- Header -->
        <div
          class="px-5 py-4 flex items-center justify-between border-b border-stone-100 bg-white/90 backdrop-blur-md z-10 sticky top-0"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 p-0.5 shadow-md shadow-emerald-600/20 flex items-center justify-center overflow-hidden shrink-0"
            >
              <div
                class="w-full h-full bg-white rounded-[14px] flex items-center justify-center p-1.5"
              >
                <img
                  src="/logo/ZANK_LOGO2.png"
                  alt="Logo"
                  class="w-full h-full object-contain"
                />
              </div>
            </div>
            <div>
              <div class="flex items-center gap-1.5">
                <h2 class="font-black text-stone-900 text-base tracking-tight">
                  Chef AI
                </h2>
                <div class="flex items-center gap-2">
                  <span class="text-stone-900 font-black text-sm leading-none"
                    >•</span
                  >
                  <h2
                    class="font-black text-stone-900 text-base tracking-tight"
                  >
                    {{ currentLanguage === "th" ? "โต๊ะ" : "Table" }}
                    {{ tableNumber || state.tableNumber || "1" }}
                  </h2>
                </div>
              </div>
              <p
                class="text-sm text-stone-400 font-medium truncate max-w-[200px]"
              >
                {{ dynamicRestaurantName }}
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <button
              @click="clearChatHistory"
              class="w-9 h-9 rounded-xl bg-stone-50 hover:bg-rose-50 flex items-center justify-center text-stone-400 hover:text-rose-500 active:scale-95 transition-all cursor-pointer border border-stone-100"
              :title="currentLanguage === 'th' ? 'ล้างการสนทนา' : 'Clear Chat'"
            >
              <Trash2 :size="16" />
            </button>
            <button
              @click="$emit('close')"
              class="w-9 h-9 rounded-xl bg-stone-50 hover:bg-stone-100 flex items-center justify-center text-stone-600 active:scale-95 transition-all font-bold cursor-pointer border border-stone-100"
              aria-label="Close"
            >
              <span class="text-lg leading-none">✕</span>
            </button>
          </div>
        </div>

        <!-- Messages Area -->
        <div
          class="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5 bg-gradient-to-b from-stone-50/50 to-stone-100/50 scroll-smooth"
        >
          <div
            v-for="(message, index) in chatMessages"
            :key="index"
            :class="
              message.role === 'user'
                ? 'ml-auto bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/10 rounded-2xl rounded-tr-sm'
                : 'bg-white border border-stone-100 text-stone-800 shadow-sm rounded-2xl rounded-tl-sm'
            "
            class="max-w-[88%] px-4 py-3 text-sm leading-relaxed break-words"
          >
            <div
              v-if="message.isLoading"
              class="flex items-center gap-2 text-stone-400 py-1"
            >
              <span
                class="inline-block animate-bounce font-bold text-emerald-600"
                >.</span
              >
              <span
                class="inline-block animate-bounce [animation-delay:200ms] font-bold text-emerald-600"
                >.</span
              >
              <span
                class="inline-block animate-bounce [animation-delay:400ms] font-bold text-emerald-600"
                >.</span
              >
              <span class="text-xs ml-1 font-medium text-stone-400">{{
                currentLanguage === "th"
                  ? "Chef AI กำลังคิดเมนู..."
                  : "Chef AI is thinking..."
              }}</span>
            </div>

            <div
              v-else
              :class="message.role === 'user' ? 'text-white' : ''"
              v-html="formatMessage(getDisplayMessage(message))"
            ></div>

            <!-- เมนูแนะนำ (Card) -->
            <div
              v-if="message.items && message.items.length > 0"
              class="mt-3.5 space-y-2.5 pt-2 border-t border-stone-100/80"
            >
              <div
                v-for="item in message.items"
                :key="item.id || item.menu_id"
                @click="openItemDetail(item)"
                class="flex w-full items-center justify-between rounded-2xl bg-stone-50/80 border border-stone-200/60 p-2.5 text-left text-stone-900 hover:bg-emerald-50/60 hover:border-emerald-200 transition-all cursor-pointer group gap-3 relative shadow-xs"
              >
                <!-- ส่วนซ้าย: รูปภาพ + ชื่อ + ราคา -->
                <div class="flex items-center gap-3 min-w-0 flex-1">
                  <!-- รูปภาพเมนู -->
                  <div
                    class="w-14 h-14 rounded-xl bg-stone-200 flex-shrink-0 overflow-hidden shadow-xs relative"
                  >
                    <img
                      v-if="item.image || item.image_url"
                      :src="item.image || item.image_url"
                      class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div
                      v-else
                      class="w-full h-full flex items-center justify-center text-[10px] text-stone-400 font-bold bg-stone-100"
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
                        class="text-sm font-bold text-stone-800 group-hover:text-emerald-700 transition-colors truncate"
                      >
                        {{ getMenuName(item) }}
                      </strong>
                    </div>
                    <div class="flex items-center gap-2 mt-0.5">
                      <span class="text-xs font-black text-emerald-600">
                        {{
                          (item.price || item.priceNum || 0).toLocaleString()
                        }}
                        {{ currentLanguage === "th" ? "บาท" : "Baht" }}
                      </span>
                      <span
                        v-if="
                          currentLanguage === 'th' &&
                          item.name &&
                          item.name_th &&
                          item.name !== item.name_th
                        "
                        class="text-[11px] text-stone-400 truncate"
                      >
                        ({{ item.name }})
                      </span>
                    </div>
                  </div>
                </div>

                <!-- 🟢 วงกลมบอกจำนวนสีดำ จัดให้อยู่ตรงกลางพอดี -->
                <div
                  v-if="item.quantity > 0 || item.orderQuantity > 0"
                  class="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-black text-white font-bold text-xs ml-2 text-center leading-none"
                  :title="`จำนวน ${item.quantity || item.orderQuantity} ที่`"
                >
                  {{ item.quantity || item.orderQuantity }}
                </div>
              </div>
            </div>
          </div>

          <div ref="messagesEndRef"></div>
        </div>

        <!-- Quick Suggestion Buttons (ปรับลดความสูงและเพิ่ม padding ด้านข้าง) -->
        <div
          class="px-2 py-1.5 bg-white border-t border-stone-100 flex gap-1.5 overflow-x-auto no-scrollbar shadow-xs shrink-0"
        >
          <button
            v-for="item in activeSuggestions"
            :key="item.id"
            class="whitespace-nowrap px-5 py-1 bg-stone-100/80 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 border border-transparent rounded-full text-stone-600 text-xs font-bold transition-all cursor-pointer shrink-0 disabled:opacity-50 active:scale-95 shadow-2xs"
            :disabled="isLoading"
            @click="sendAiMessage(item)"
          >
            {{ currentLanguage === "th" ? item.labelTh : item.labelEn }}
          </button>
        </div>

        <!-- Input Bar -->
        <form
          class="p-3 bg-white border-t border-stone-100 flex items-center gap-2 shrink-0"
          @submit.prevent="sendAiMessage()"
        >
          <input
            v-model="chatInput"
            :disabled="isLoading"
            class="min-w-0 flex-1 bg-stone-100/80 rounded-xl px-4 py-3 text-xs font-medium text-stone-800 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:bg-white transition-all placeholder:text-stone-400 disabled:opacity-60 border border-stone-200/50"
            :placeholder="
              currentLanguage === 'th'
                ? 'พิมพ์ถาม Chef AI...'
                : 'Ask Chef AI...'
            "
          />
          <button
            type="submit"
            :disabled="isLoading || !chatInput.trim()"
            class="w-11 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Send"
          >
            <Send :size="18" />
          </button>
        </form>
      </div>
    </div>
  </Transition>

  <!-- Modal Item Detail -->
  <Transition name="fade">
    <div
      v-if="showModal"
      class="fixed inset-0 z-[60] flex items-center justify-center p-5 bg-stone-900/60 backdrop-blur-md"
      @click="closeModal"
    >
      <Transition name="zoom">
        <div
          v-if="showModal && selectedItem"
          @click.stop
          class="bg-white w-full max-w-[360px] max-h-[85vh] rounded-[2rem] overflow-y-auto flex flex-col shadow-2xl relative border border-stone-100"
        >
          <div class="relative h-64 w-full bg-stone-100 flex-shrink-0">
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
              class="absolute top-4 right-4 w-8 h-8 bg-stone-900/50 hover:bg-stone-900/70 backdrop-blur-md rounded-full flex items-center justify-center text-white font-bold cursor-pointer transition-all"
            >
              ✕
            </button>
          </div>

          <div class="p-6 pb-8 text-left space-y-4">
            <div class="flex justify-between items-start gap-3">
              <div>
                <h2 class="text-xl font-black text-stone-900 leading-snug">
                  {{ getMenuName(selectedItem) }}
                </h2>
                <p
                  v-if="
                    currentLanguage === 'th' &&
                    selectedItem.name &&
                    selectedItem.name_th &&
                    selectedItem.name !== selectedItem.name_th
                  "
                  class="text-xs text-stone-400 font-medium mt-0.5"
                >
                  {{ selectedItem.name }}
                </p>
              </div>

              <span
                class="text-lg font-black text-emerald-600 whitespace-nowrap bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-100"
              >
                {{
                  (
                    selectedItem.price ||
                    selectedItem.priceNum ||
                    0
                  ).toLocaleString()
                }}
                {{ currentLanguage === "th" ? "฿" : "Baht" }}
              </span>
            </div>

            <div v-if="getMenuDescription(selectedItem)">
              <p
                class="text-sm text-stone-600 leading-relaxed bg-stone-50 p-3 rounded-2xl border border-stone-100"
              >
                {{ getMenuDescription(selectedItem) }}
              </p>
            </div>

            <!-- ระดับความเผ็ด -->
            <div
              v-if="
                selectedItem.spice_level !== undefined &&
                selectedItem.spice_level !== null
              "
              class="border-t border-stone-100 pt-3 text-xs flex items-center justify-between gap-2 overflow-visible"
            >
              <div class="flex items-center gap-1.5 whitespace-nowrap min-w-0">
                <span class="font-medium text-stone-500 shrink-0">
                  {{
                    currentLanguage === "th" ? "ระดับความเผ็ด:" : "Spiciness:"
                  }}
                </span>
                <span class="font-bold text-stone-800 whitespace-nowrap">
                  {{
                    Number(selectedItem.spice_level) === 0
                      ? currentLanguage === "th"
                        ? "ไม่เผ็ด (Level 0)"
                        : "Non-spicy (Level 0)"
                      : Number(selectedItem.spice_level) === 1
                        ? currentLanguage === "th"
                          ? "เผ็ดน้อย (Level 1)"
                          : "Mild (Level 1)"
                        : Number(selectedItem.spice_level) === 2
                          ? currentLanguage === "th"
                            ? "เผ็ดปานกลาง (Level 2)"
                            : "Medium (Level 2)"
                          : Number(selectedItem.spice_level) === 3
                            ? currentLanguage === "th"
                              ? "เผ็ดมาก (Level 3)"
                              : "Hot (Level 3)"
                            : Number(selectedItem.spice_level) === 4
                              ? currentLanguage === "th"
                                ? "เผ็ดจัด (Level 4)"
                                : "Extra Hot (Level 4)"
                              : currentLanguage === "th"
                                ? "เผ็ดสุดขีด (Level 5)"
                                : "Extreme (Level 5)"
                  }}
                </span>
              </div>

              <div
                class="relative w-32 h-6 flex items-center justify-end shrink-0"
              >
                <img
                  :src="`/spice-levels/level-${Number(selectedItem.spice_level) || 0}.png`"
                  :alt="`Spice level ${selectedItem.spice_level}`"
                  class="h-5 w-auto object-contain transform scale-[2.8] origin-right pointer-events-none drop-shadow-xs"
                />
              </div>
            </div>

            <div
              v-if="selectedItem.ingredients || selectedItem.ingredients_th"
              class="border-t border-stone-100 pt-3"
            >
              <p
                class="text-xs text-stone-400 font-bold mb-1 uppercase tracking-wider"
              >
                {{
                  currentLanguage === "th"
                    ? "ส่วนผสมและองค์ประกอบ"
                    : "Ingredients"
                }}
              </p>
              <p class="text-sm text-stone-800 font-medium leading-relaxed">
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
              <p
                class="text-xs text-stone-400 font-bold mb-1 uppercase tracking-wider"
              >
                {{
                  currentLanguage === "th"
                    ? "สารก่อภูมิแพ้"
                    : "Allergen Information"
                }}
              </p>
              <p class="text-sm text-rose-600 font-semibold">
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
