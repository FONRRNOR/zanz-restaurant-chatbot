<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import { X, ChevronDown, Bot, Sparkles, ArrowRight } from "@lucide/vue";

const props = defineProps({
  isOpen: Boolean,
  language: {
    type: String,
    default: "th",
  },
});

const emit = defineEmits(["save", "skip", "reset", "open-chatbot"]);

const isResetting = ref(false);

// ค่าเริ่มต้นแบบไม่มีการกรอง (Clear/Empty State)
const defaultPreferences = {
  diets: [],
  allergies: [],
  spiceLevel: 3, // 3 = เผ็ดมาก/ทานได้ทุกระดับ (ไม่ติดเงื่อนไขกรองความเผ็ด)
};

const userPreferences = ref({ ...defaultPreferences });

// ล็อค Scroll ของหน้าหลักด้านหลัง เมื่อ Modal แสดงขึ้นมา
watch(
  () => props.isOpen,
  (val) => {
    if (typeof document !== "undefined") {
      if (val) {
        document.body.style.overflow = "hidden";
        document.body.style.touchAction = "none";

        const saved = sessionStorage.getItem("customer_preferences");
        if (saved) {
          try {
            userPreferences.value = JSON.parse(saved);
          } catch {
            userPreferences.value = { ...defaultPreferences };
          }
        } else {
          userPreferences.value = { ...defaultPreferences };
        }
      } else {
        document.body.style.overflow = "";
        document.body.style.touchAction = "";
      }
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  if (typeof document !== "undefined") {
    document.body.style.overflow = "";
    document.body.style.touchAction = "";
  }
});

// เริ่มต้นหุบทั้งหมด
const activeSection = ref(null);

const toggleSection = (sectionKey) => {
  activeSection.value = activeSection.value === sectionKey ? null : sectionKey;
};

// JavaScript Hooks สำหรับการคลี่/หุบ
const onEnter = (el) => {
  el.style.height = "0px";
  el.style.opacity = "0";
  void el.offsetHeight;
  el.style.height = `${el.scrollHeight}px`;
  el.style.opacity = "1";
};

const onAfterEnter = (el) => {
  el.style.height = "auto";
};

const onLeave = (el) => {
  el.style.height = `${el.scrollHeight}px`;
  el.style.opacity = "1";
  void el.offsetHeight;
  el.style.height = "0px";
  el.style.opacity = "0";
};

// ฐานข้อมูลคำแนะนำ
const masterDiets = [
  { id: "Vegetarian", th: "มังสวิรัติ", en: "Vegetarian" },
  { id: "Vegan", th: "วีแกน (เจ)", en: "Vegan" },
  { id: "Gluten-Free", th: "ไร้กลูเตน", en: "Gluten-Free" },
  { id: "Halal", th: "ฮาลาล", en: "Halal" },
  { id: "Keto", th: "คีโต", en: "Keto" },
  { id: "Pescatarian", th: "เพสคาทาเรียน", en: "Pescatarian" },
  { id: "Low-Sodium", th: "โซเดียมต่ำ", en: "Low-Sodium" },
];

const masterAllergies = [
  { id: "Dairy", th: "นมและเนย", en: "Dairy" },
  { id: "Eggs", th: "ไข่", en: "Eggs" },
  { id: "Soy", th: "ถั่วเหลือง", en: "Soy" },
  { id: "Wheat", th: "แป้งสาลีและกลูเตน", en: "Wheat" },
  { id: "Peanuts", th: "ถั่วลิสง", en: "Peanuts" },
  { id: "Tree Nuts", th: "ถั่วเปลือกแข็ง", en: "Tree Nuts" },
  { id: "Fish", th: "เนื้อปลา", en: "Fish" },
  { id: "Shellfish", th: "กุ้ง หอย ปู", en: "Shellfish" },
  { id: "Sesame", th: "งา", en: "Sesame" },
];

const spiceLevels = [
  { val: 0, th: "ไม่เผ็ด", en: "None" },
  { val: 1, th: "เผ็ดน้อย", en: "Mild" },
  { val: 2, th: "ปานกลาง", en: "Medium" },
  { val: 3, th: "เผ็ดมาก", en: "Spicy" },
];

const dietInput = ref("");
const allergyInput = ref("");
const isDietFocused = ref(false);
const isAllergyFocused = ref(false);

const dietInputRef = ref(null);
const allergyInputRef = ref(null);

// Suggestions
const dietSuggestions = computed(() => {
  const query = dietInput.value.trim().toLowerCase();
  if (!query) return [];
  return masterDiets.filter((item) => {
    const isSelected = userPreferences.value.diets.some(
      (d) => d.toLowerCase() === item.en.toLowerCase(),
    );
    if (isSelected) return false;
    return (
      item.en.toLowerCase().includes(query) ||
      item.th.toLowerCase().includes(query)
    );
  });
});

const allergySuggestions = computed(() => {
  const query = allergyInput.value.trim().toLowerCase();
  if (!query) return [];
  return masterAllergies.filter((item) => {
    const isSelected = userPreferences.value.allergies.some(
      (a) => a.toLowerCase() === item.en.toLowerCase(),
    );
    if (isSelected) return false;
    return (
      item.en.toLowerCase().includes(query) ||
      item.th.toLowerCase().includes(query)
    );
  });
});

const handleDietBlur = () => {
  window.setTimeout(() => {
    isDietFocused.value = false;
  }, 250);
};

const handleAllergyBlur = () => {
  window.setTimeout(() => {
    isAllergyFocused.value = false;
  }, 250);
};

// มีการเลือกหรือตั้งค่าฟิลเตอร์ใดๆ ไว้หรือไม่ (ใช้แสดงปุ่ม Reset)
const hasActivePreferences = computed(() => {
  return (
    userPreferences.value.diets.length > 0 ||
    dietInput.value.trim().length > 0 ||
    userPreferences.value.allergies.length > 0 ||
    allergyInput.value.trim().length > 0 ||
    userPreferences.value.spiceLevel !== 3
  );
});

// เงื่อนไขแสดงปุ่ม "บันทึกและดูเมนู": ต้องมี Tag ใน diets หรือกำลังพิมพ์ค้างอยู่ในช่อง diet
const canApplyFilters = computed(() => {
  return (
    userPreferences.value.diets.length > 0 || dietInput.value.trim().length > 0
  );
});

onMounted(() => {
  const saved = sessionStorage.getItem("customer_preferences");
  if (saved) {
    try {
      userPreferences.value = JSON.parse(saved);
    } catch {
      userPreferences.value = { ...defaultPreferences };
    }
  }
});

const addDiet = (val) => {
  const text = (val || dietInput.value).trim();
  if (text) {
    const isExist = userPreferences.value.diets.some(
      (d) => d.toLowerCase() === text.toLowerCase(),
    );
    if (!isExist) {
      userPreferences.value.diets.push(text);
    }
  }
  dietInput.value = "";
  nextTick(() => {
    dietInputRef.value?.focus();
  });
};

const removeDiet = (index) => {
  userPreferences.value.diets.splice(index, 1);
  nextTick(() => {
    dietInputRef.value?.focus();
  });
};

const addAllergy = (val) => {
  const text = (val || allergyInput.value).trim();
  if (text) {
    const isExist = userPreferences.value.allergies.some(
      (a) => a.toLowerCase() === text.toLowerCase(),
    );
    if (!isExist) {
      userPreferences.value.allergies.push(text);
    }
  }
  allergyInput.value = "";
  nextTick(() => {
    allergyInputRef.value?.focus();
  });
};

const removeAllergy = (index) => {
  userPreferences.value.allergies.splice(index, 1);
  nextTick(() => {
    allergyInputRef.value?.focus();
  });
};

const resetAll = (e) => {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }
  isResetting.value = true;
  console.log("[RecommendationModal] >>> Reset button clicked in modal <<<");

  userPreferences.value = {
    diets: [],
    allergies: [],
    spiceLevel: 3,
  };
  dietInput.value = "";
  allergyInput.value = "";
  activeSection.value = null;

  sessionStorage.removeItem("customer_preferences");

  emit("reset");

  // ป้องกัน event อื่นที่อาจจะยิงตามมาจากการปล่อยเมาส์หรือคลิกผ่าน
  setTimeout(() => {
    isResetting.value = false;
  }, 500);
};

const handleSave = (e) => {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }

  // ถ้ากำลังอยู่ในช่วงกด Reset ให้ตัดทิ้งทันที
  if (isResetting.value) {
    console.warn(
      "[RecommendationModal] Blocked save call because isResetting is true",
    );
    return;
  }

  if (dietInput.value.trim()) addDiet();
  if (allergyInput.value.trim()) addAllergy();

  sessionStorage.setItem(
    "customer_preferences",
    JSON.stringify(userPreferences.value),
  );
  emit("save", userPreferences.value);
};

const handleSkip = (e) => {
  if (e) {
    e.stopPropagation();
    e.preventDefault();
  }

  // ป้องกันไม่ให้ทำงานถ้าเพิ่งกด Reset
  if (isResetting.value) {
    console.warn(
      "[RecommendationModal] Blocked skip call because isResetting is true",
    );
    return;
  }

  // ลบค่าฟิลเตอร์ออกจาก Storage ไปเลย (ไม่บันทึก defaultPreferences ทับ)
  sessionStorage.removeItem("customer_preferences");

  // ยิง event 'skip' เปล่าๆ ออกไป ไม่ต้องส่ง payload
  emit("skip");
};

const handleOpenChatbot = () => {
  console.log("[RecommendationModal] Emitting open-chatbot event");
  emit("open-chatbot");
};
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 select-none overscroll-none"
    @wheel.stop
    @touchmove.stop
  >
    <!-- Modal Card -->
    <div
      class="bg-white rounded-3xl w-full max-w-xl h-[85vh] flex flex-col border border-stone-200 shadow-2xl overflow-hidden isolation-auto"
    >
      <!-- Header -->
      <div
        class="px-7 py-5 border-b border-stone-100 flex justify-between items-center bg-white shrink-0"
      >
        <div>
          <h2
            class="text-xl sm:text-2xl font-black text-stone-900 leading-tight"
          >
            {{ language === "en" ? "Dietary & Filters" : "ตัวกรองเมนูอาหาร" }}
          </h2>
          <p class="text-sm text-stone-500 mt-1">
            {{
              language === "en"
                ? "Select or type your preferences below"
                : "เลือกหรือระบุความต้องการในการทานอาหารของคุณ"
            }}
          </p>
        </div>

        <div class="flex items-center gap-3">
          <!-- ใช้ visibility ซ่อนแทนการขยับ Layout -->
          <button
            type="button"
            @click.stop.prevent="resetAll"
            :class="[
              'text-sm font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 px-4 py-2 rounded-full transition cursor-pointer',
              hasActivePreferences
                ? 'opacity-100 pointer-events-auto'
                : 'opacity-0 pointer-events-none',
            ]"
          >
            {{ language === "en" ? "Reset" : "ล้างค่า" }}
          </button>

          <button
            type="button"
            @click.stop.prevent="handleSkip"
            class="text-stone-600 hover:text-stone-800 text-sm font-bold bg-stone-100 hover:bg-stone-200 px-4 py-2 rounded-full transition cursor-pointer"
          >
            {{ language === "en" ? "Skip" : "ข้าม" }}
          </button>
        </div>
      </div>

      <!-- Accordion Body -->
      <div
        class="p-6 overflow-y-auto flex-1 space-y-4 native-scroll bg-stone-50/40 overscroll-contain"
        @wheel.stop
        @touchmove.stop
      >
        <!-- Accordion 1: รูปแบบอาหาร (Diets) -->
        <div
          class="rounded-2xl border shadow-sm transition-all duration-300 relative z-20"
          :class="
            activeSection === 'diet'
              ? 'bg-emerald-50/80 border-emerald-300 ring-2 ring-emerald-500/10'
              : 'bg-emerald-50/40 border-emerald-200/70 hover:bg-emerald-50/60'
          "
        >
          <button
            type="button"
            @click="toggleSection('diet')"
            class="w-full px-6 py-5 flex items-center justify-between transition text-left cursor-pointer"
          >
            <div>
              <h3
                class="text-base sm:text-lg font-black text-emerald-950 flex items-center gap-2"
              >
                <span>{{
                  language === "en"
                    ? "Dietary Preferences"
                    : "รูปแบบอาหารที่คุณทาน"
                }}</span>
              </h3>
              <p class="text-sm text-emerald-800/80 mt-1">
                <span
                  v-if="userPreferences.diets.length > 0"
                  class="font-bold text-emerald-900"
                >
                  {{ userPreferences.diets.join(", ") }}
                </span>
                <span v-else>
                  {{
                    language === "en"
                      ? "None specified (Click to configure)"
                      : "ยังไม่ได้ระบุ (แตะเพื่อเลือก)"
                  }}
                </span>
              </p>
            </div>

            <ChevronDown
              :size="20"
              class="text-emerald-600/70 transition-transform duration-500 ease-out shrink-0 ml-3"
              :class="
                activeSection === 'diet' ? 'rotate-180 text-emerald-800' : ''
              "
            />
          </button>

          <Transition
            name="accordion"
            @enter="onEnter"
            @after-enter="onAfterEnter"
            @leave="onLeave"
          >
            <div v-show="activeSection === 'diet'" class="accordion-content">
              <div class="p-6 pt-2 border-t border-emerald-100/80">
                <p class="text-sm text-emerald-900/70 mb-3">
                  {{
                    language === "en"
                      ? "Type to search and select from suggestions:"
                      : "พิมพ์เพื่อค้นหาและเลือกจากรายการแนะนำ:"
                  }}
                </p>

                <div class="relative">
                  <div
                    @click="dietInputRef?.focus()"
                    class="flex flex-wrap items-center gap-2 p-2.5 bg-white border border-emerald-200 rounded-2xl focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-500/20 transition min-h-[52px] cursor-text shadow-sm"
                  >
                    <span
                      v-for="(diet, index) in userPreferences.diets"
                      :key="'diet-' + index"
                      class="inline-flex items-center gap-2 px-3.5 py-1.5 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-sm"
                    >
                      {{ diet }}
                      <button
                        type="button"
                        @click.stop="removeDiet(index)"
                        class="hover:bg-emerald-700 rounded-full p-0.5 transition cursor-pointer"
                      >
                        <X :size="14" />
                      </button>
                    </span>

                    <div class="flex-1 min-w-[140px] flex items-center">
                      <input
                        ref="dietInputRef"
                        v-model="dietInput"
                        type="text"
                        @focus="isDietFocused = true"
                        @blur="handleDietBlur"
                        @keydown.enter.prevent="addDiet()"
                        @keydown.comma.prevent="addDiet()"
                        :placeholder="
                          userPreferences.diets.length === 0
                            ? language === 'en'
                              ? 'Type e.g. Vegan, Keto...'
                              : 'พิมพ์ เช่น วีแกน, เจ, คีโต...'
                            : language === 'en'
                              ? 'Type more...'
                              : 'พิมพ์เพิ่ม...'
                        "
                        class="w-full bg-transparent text-base text-stone-900 placeholder-emerald-800/40 outline-none px-2"
                      />
                    </div>
                  </div>

                  <div
                    v-if="isDietFocused && dietSuggestions.length > 0"
                    class="absolute left-0 right-0 top-full mt-2 bg-white border-2 border-emerald-300 rounded-2xl shadow-2xl z-50 overflow-hidden divide-y divide-emerald-50"
                  >
                    <div
                      v-for="sug in dietSuggestions"
                      :key="sug.id"
                      @mousedown.prevent="addDiet(sug.en)"
                      class="px-5 py-3.5 text-sm flex items-center justify-between hover:bg-emerald-100/70 cursor-pointer transition"
                    >
                      <span class="font-bold text-emerald-950 text-base">
                        {{ language === "th" ? sug.th : sug.en }}
                      </span>
                      <span
                        class="text-emerald-800 font-bold text-xs bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-300"
                      >
                        {{ sug.en }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Transition>
        </div>

        <!-- Accordion 2: การแพ้อาหาร (Allergies) -->
        <div
          class="rounded-2xl border shadow-sm transition-all duration-300 relative z-10"
          :class="
            activeSection === 'allergy'
              ? 'bg-amber-50/85 border-amber-300 ring-2 ring-amber-500/10'
              : 'bg-amber-50/40 border-amber-200/70 hover:bg-amber-50/60'
          "
        >
          <button
            type="button"
            @click="toggleSection('allergy')"
            class="w-full px-6 py-5 flex items-center justify-between transition text-left cursor-pointer"
          >
            <div>
              <h3 class="text-base sm:text-lg font-black text-amber-950">
                {{
                  language === "en"
                    ? "Food Allergies"
                    : "การแพ้อาหาร หรือส่วนผสมที่เลี่ยง"
                }}
              </h3>
              <p class="text-sm text-amber-900/80 mt-1">
                <span
                  v-if="userPreferences.allergies.length > 0"
                  class="font-bold text-amber-950"
                >
                  {{ userPreferences.allergies.join(", ") }}
                </span>
                <span v-else>
                  {{
                    language === "en"
                      ? "None specified (Click to configure)"
                      : "ไม่มี (แตะเพื่อระบุสิ่งที่ไม่ต้องการ)"
                  }}
                </span>
              </p>
            </div>

            <ChevronDown
              :size="20"
              class="text-amber-700/70 transition-transform duration-500 ease-out shrink-0 ml-3"
              :class="
                activeSection === 'allergy' ? 'rotate-180 text-amber-900' : ''
              "
            />
          </button>

          <Transition
            name="accordion"
            @enter="onEnter"
            @after-enter="onAfterEnter"
            @leave="onLeave"
          >
            <div v-show="activeSection === 'allergy'" class="accordion-content">
              <div class="p-6 pt-2 border-t border-amber-100/80">
                <p class="text-sm text-amber-900/80 mb-3">
                  {{
                    language === "en"
                      ? "Type to search allergens to hide:"
                      : "พิมพ์เพื่อค้นหาและเลือกส่วนผสมที่ต้องการซ่อน:"
                  }}
                </p>

                <div class="relative">
                  <div
                    @click="allergyInputRef?.focus()"
                    class="flex flex-wrap items-center gap-2 p-2.5 bg-white border border-amber-200 rounded-2xl focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500/20 transition min-h-[54px] cursor-text shadow-sm"
                  >
                    <span
                      v-for="(allergy, index) in userPreferences.allergies"
                      :key="'allergy-' + index"
                      class="inline-flex items-center gap-2 px-3.5 py-1.5 bg-amber-500 text-stone-900 rounded-xl text-sm font-bold shadow-xs transition"
                    >
                      {{ allergy }}
                      <button
                        type="button"
                        @click.stop="removeAllergy(index)"
                        class="hover:bg-amber-600/40 rounded-full p-0.5 transition text-stone-900 cursor-pointer"
                      >
                        <X :size="14" />
                      </button>
                    </span>

                    <div class="flex-1 min-w-[140px] flex items-center">
                      <input
                        ref="allergyInputRef"
                        v-model="allergyInput"
                        type="text"
                        @focus="isAllergyFocused = true"
                        @blur="handleAllergyBlur"
                        @keydown.enter.prevent="addAllergy()"
                        @keydown.comma.prevent="addAllergy()"
                        :placeholder="
                          userPreferences.allergies.length === 0
                            ? language === 'en'
                              ? 'Type e.g. Peanuts, Shrimp...'
                              : 'พิมพ์ เช่น ถั่ว, กุ้ง, นม, ชูรส...'
                            : language === 'en'
                              ? 'Type more...'
                              : 'พิมพ์เพิ่ม...'
                        "
                        class="w-full bg-transparent text-base text-stone-900 placeholder-amber-900/40 outline-none px-2 py-1"
                      />
                    </div>
                  </div>

                  <div
                    v-if="isAllergyFocused && allergySuggestions.length > 0"
                    class="absolute left-0 right-0 top-full mt-2 bg-white border-2 border-amber-300 rounded-2xl shadow-2xl z-50 overflow-hidden divide-y divide-amber-50"
                  >
                    <div
                      v-for="sug in allergySuggestions"
                      :key="sug.id"
                      @mousedown.prevent="addAllergy(sug.en)"
                      class="px-5 py-3.5 text-sm flex items-center justify-between hover:bg-amber-100/80 cursor-pointer transition"
                    >
                      <span class="font-bold text-amber-950 text-base">
                        {{ language === "th" ? sug.th : sug.en }}
                      </span>
                      <span
                        class="text-amber-900 font-bold text-xs bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-300"
                      >
                        {{ sug.en }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Transition>
        </div>

        <!-- Accordion 3: ระดับความเผ็ด (Spice Tolerance) -->
        <div
          class="rounded-2xl border shadow-sm transition-all duration-300 relative z-0"
          :class="
            activeSection === 'spice'
              ? 'bg-orange-50/85 border-orange-300 ring-2 ring-orange-500/10'
              : 'bg-orange-50/40 border-orange-200/70 hover:bg-orange-50/60'
          "
        >
          <button
            type="button"
            @click="toggleSection('spice')"
            class="w-full px-6 py-5 flex items-center justify-between transition text-left cursor-pointer"
          >
            <div>
              <h3 class="text-base sm:text-lg font-black text-orange-950">
                {{
                  language === "en"
                    ? "Spice Tolerance"
                    : "ระดับความเผ็ดที่รับได้"
                }}
              </h3>
              <p class="text-sm text-orange-900 mt-1 font-bold">
                {{
                  spiceLevels.find(
                    (s) => s.val === userPreferences.spiceLevel,
                  )?.[language === "en" ? "en" : "th"]
                }}
              </p>
            </div>

            <ChevronDown
              :size="20"
              class="text-orange-600/70 transition-transform duration-500 ease-out shrink-0 ml-3"
              :class="
                activeSection === 'spice' ? 'rotate-180 text-orange-900' : ''
              "
            />
          </button>

          <Transition
            name="accordion"
            @enter="onEnter"
            @after-enter="onAfterEnter"
            @leave="onLeave"
          >
            <div v-show="activeSection === 'spice'" class="accordion-content">
              <div class="p-6 pt-2 border-t border-orange-100/80">
                <div
                  class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-orange-100/60 p-2 rounded-2xl border border-orange-200/50"
                >
                  <button
                    v-for="level in spiceLevels"
                    :key="level.val"
                    type="button"
                    @click="userPreferences.spiceLevel = level.val"
                    class="py-3 text-sm font-black rounded-xl text-center transition duration-200 cursor-pointer"
                    :class="
                      userPreferences.spiceLevel === level.val
                        ? 'bg-white text-orange-700 shadow-sm border border-orange-200'
                        : 'text-orange-950/70 hover:text-orange-950 hover:bg-white/50'
                    "
                  >
                    {{ language === "en" ? level.en : level.th }}
                  </button>
                </div>
              </div>
            </div>
          </Transition>
        </div>

        <!-- Divider คั่นกลาง -->
        <div class="relative py-4 flex items-center justify-center">
          <div class="w-full border-t-2 border-dashed border-stone-200"></div>
          <span
            class="absolute bg-white px-4 py-1 rounded-full border-2 border-stone-200 text-xs font-black uppercase tracking-wider text-stone-500 shadow-xs"
          >
            {{ language === "en" ? "OR" : "หรือ" }}
          </span>
        </div>

        <!-- AI Chatbot Section -->
        <div class="text-center px-4 pb-2 pt-1 flex flex-col items-center">
          <div class="inline-flex items-center gap-1.5">
            <h4
              class="text-base sm:text-lg font-black text-stone-900 tracking-tight"
            >
              {{
                language === "en"
                  ? "Still not sure what to eat?"
                  : "เลือกไม่ถูก หรือยังไม่แน่ใจ?"
              }}
            </h4>
          </div>

          <p class="text-sm text-stone-500 mt-1 max-w-sm leading-relaxed">
            {{
              language === "en"
                ? "Let our intelligent AI Chatbot recommend the best matches for you in seconds."
                : "ให้ AI Chatbot ช่วยคิด ค้นหา และแนะนำเมนูเด็ดที่เหมาะกับคุณที่สุดได้ทันที"
            }}
          </p>

          <div class="mt-4 w-full sm:w-auto">
            <button
              type="button"
              @click="handleOpenChatbot"
              class="group relative inline-flex items-center justify-center gap-2.5 w-full sm:w-auto px-7 py-3.5 rounded-2xl font-black text-white text-base bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 transition-all duration-200 cursor-pointer"
            >
              <Bot
                :size="20"
                class="transition-transform group-hover:scale-110"
              />
              <span>
                {{
                  language === "en"
                    ? "Chat with AI Assistant"
                    : "คุยกับ AI Chatbot เลย"
                }}
              </span>
              <ArrowRight
                :size="18"
                class="transition-transform duration-200 group-hover:translate-x-1"
              />
            </button>
          </div>
        </div>
      </div>

      <!-- Footer Actions -->
      <div
        class="px-7 py-5 border-t border-stone-100 bg-white flex justify-end gap-3 shrink-0"
      >
        <button
          type="button"
          @click.stop.prevent="handleSkip"
          class="px-6 py-3 rounded-2xl text-base font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition cursor-pointer"
        >
          {{ language === "en" ? "Cancel" : "ยกเลิก" }}
        </button>

        <!-- ซ่อนปุ่มนี้ถ้ายังไม่ได้กรอกส่วน Dietary (canApplyFilters === false) -->
        <button
          v-if="canApplyFilters"
          type="button"
          @click.stop.prevent="handleSave"
          class="px-7 py-3 rounded-2xl text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition active:scale-95 cursor-pointer animate-in fade-in zoom-in-95 duration-200"
        >
          {{ language === "en" ? "Apply Filters" : "บันทึกและดูเมนู" }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.accordion-enter-active,
.accordion-leave-active {
  transition:
    height 0.45s cubic-bezier(0.25, 1, 0.5, 1),
    opacity 0.35s ease;
  overflow: hidden;
}

.native-scroll {
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

.native-scroll::-webkit-scrollbar {
  width: 6px;
}
.native-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.native-scroll::-webkit-scrollbar-thumb {
  background-color: #d6d3d1;
  border-radius: 9999px;
}
</style>
