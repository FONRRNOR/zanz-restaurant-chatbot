<script setup>
import { ref, computed, watch } from "vue";
import { X, Search, Sparkles, Check, RotateCcw } from "@lucide/vue";
import { supabase } from "../../supabaseClient";

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false,
  },
  items: {
    type: Array,
    default: () => [],
  },
  language: {
    type: String,
    default: "th",
  },
});

const emit = defineEmits(["close", "updated", "alert"]);

const searchQuery = ref("");
const isSaving = ref(false);
const selectedIds = ref(new Set());

// Sync รายการที่เลือกเมื่อเปิด Modal
watch(
  () => props.isOpen,
  (val) => {
    if (val) {
      searchQuery.value = "";
      const currentRecommended = props.items
        .filter((item) => item.isRecommended)
        .map((item) => item.id);
      selectedIds.value = new Set(currentRecommended);
    }
  },
);

// กรองเมนูตามคำค้นหา
const filteredList = computed(() => {
  if (!searchQuery.value.trim()) return props.items;
  const q = searchQuery.value.toLowerCase();
  return props.items.filter((item) => {
    const nameEn = (item.name || "").toLowerCase();
    const nameTh = (item.nameTh || "").toLowerCase();
    const cat = (item.category || "").toLowerCase();
    return nameEn.includes(q) || nameTh.includes(q) || cat.includes(q);
  });
});

// สลับสถานะการเลือกเมนู
function toggleItem(id) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  selectedIds.value = next;
}

// ปุ่มยกเลิกการเลือกทั้งหมด
function clearAllSelections() {
  selectedIds.value = new Set();
}

// บันทึกสถานะลง Supabase
async function saveRecommendations() {
  isSaving.value = true;
  try {
    const savedUserJson = sessionStorage.getItem("zank-active-user");
    if (!savedUserJson) throw new Error("No active session found.");
    const localUser = JSON.parse(savedUserJson);

    const recommendedList = Array.from(selectedIds.value);

    // 1. Reset เมนูทั้งหมดของร้านเป็น false
    const { error: resetError } = await supabase
      .from("menu_items")
      .update({ is_recommended: false })
      .eq("restaurant_id", localUser.restaurant_id)
      .is("is_deleted", false);

    if (resetError) throw resetError;

    // 2. อัปเดตเฉพาะเมนูที่ถูกเลือกเป็น true
    if (recommendedList.length > 0) {
      const { error: updateError } = await supabase
        .from("menu_items")
        .update({ is_recommended: true })
        .in("id", recommendedList);

      if (updateError) throw updateError;
    }

    emit(
      "alert",
      props.language === "en"
        ? "Recommended menus updated successfully!"
        : "อัปเดตเมนูแนะนำสำเร็จแล้ว!",
      "success",
    );
    emit("updated");
    emit("close");
  } catch (err) {
    emit(
      "alert",
      props.language === "en"
        ? "Failed to save: " + err.message
        : "เกิดข้อผิดพลาดในการบันทึกข้อมูล",
      "error",
    );
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 select-none"
  >
    <!-- Modal Card กว้างขวาง รองรับ Card Grid View เต็มตา -->
    <div
      class="bg-white rounded-3xl w-full max-w-5xl h-[90vh] flex flex-col border border-stone-200 overflow-hidden shadow-2xl gpu-layer"
    >
      <!-- Header -->
      <div
        class="px-6 py-4 border-b border-stone-100 flex items-center justify-between bg-white shrink-0"
      >
        <div class="flex items-center gap-3">
          <div>
            <h2
              class="text-xl sm:text-2xl font-black text-stone-900 tracking-tight"
            >
              {{
                language === "en"
                  ? "Manage Recommended Menus"
                  : "จัดการเมนูแนะนำ"
              }}
            </h2>
            <p class="text-xs sm:text-sm text-stone-500">
              {{
                language === "en"
                  ? "Tap on cards to toggle recommendations"
                  : "กดที่การ์ดเมนูเพื่อเลือกหรือยกเลิกเมนูแนะนำ"
              }}
            </p>
          </div>
        </div>

        <button
          type="button"
          @click="$emit('close')"
          class="p-2 text-stone-400 hover:text-stone-700 rounded-full hover:bg-stone-100 transition"
        >
          <X :size="22" />
        </button>
      </div>

      <!-- Controls & Actions Bar -->
      <div
        class="px-6 py-3 border-b border-stone-100 bg-stone-50 flex flex-wrap items-center justify-between gap-3 shrink-0"
      >
        <div class="relative flex-1 min-w-[240px]">
          <Search
            class="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
            :size="18"
          />
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="
              language === 'en'
                ? 'Search dishes or categories...'
                : 'ค้นหาชื่อเมนู หรือหมวดหมู่...'
            "
            class="w-full pl-10 pr-4 py-2 bg-white border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-amber-500"
          />
        </div>

        <div class="flex items-center gap-3">
          <span
            class="text-xs sm:text-sm font-bold px-3 py-2 bg-amber-50 text-amber-900 border border-amber-200/60 rounded-xl"
          >
            {{ selectedIds.size }}
            {{ language === "en" ? "selected" : "รายการที่เลือก" }}
          </span>

          <!-- ปุ่มยกเลิกการเลือกทั้งหมด -->
          <button
            v-if="selectedIds.size > 0"
            type="button"
            @click="clearAllSelections"
            class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition"
          >
            <RotateCcw :size="14" />
            {{ language === "en" ? "Deselect All" : "ยกเลิกการเลือกทั้งหมด" }}
          </button>
        </div>
      </div>

      <!-- Card Grid View เลื่อนลื่นไม่มีกระตุก -->
      <div
        class="flex-1 overflow-y-auto p-4 sm:p-6 native-scroll bg-stone-100/40"
      >
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            v-for="item in filteredList"
            :key="item.id"
            @click="toggleItem(item.id)"
            class="group relative bg-white rounded-2xl border-2 overflow-hidden cursor-pointer flex flex-col transition-transform active:scale-[0.98]"
            :class="
              selectedIds.has(item.id)
                ? 'border-amber-500 ring-2 ring-amber-500/20'
                : 'border-stone-200/80 hover:border-stone-300'
            "
          >
            <!-- รูปภาพขนาดใหญ่ คมชัด -->
            <div class="relative h-44 w-full bg-stone-100 overflow-hidden">
              <img
                :src="
                  item.image ||
                  'https://via.placeholder.com/300x200?text=No+Image'
                "
                :alt="item.name"
                class="w-full h-full object-cover"
                loading="lazy"
              />

              <!-- Check Indicator มุมขวาบน -->
              <div
                class="absolute top-3 right-3 w-8 h-8 rounded-xl flex items-center justify-center border-2 transition shadow-sm"
                :class="
                  selectedIds.has(item.id)
                    ? 'bg-amber-500 border-white text-white'
                    : 'bg-black/30 border-white/80 text-transparent backdrop-blur-none'
                "
              >
                <Check :size="18" stroke-width="3" />
              </div>

              <!-- Badge หมวดหมู่ -->
              <span
                class="absolute bottom-3 left-3 px-2.5 py-1 bg-black/60 text-white rounded-lg text-xs font-semibold"
              >
                {{ item.category }}
              </span>
            </div>

            <!-- ข้อมูลเมนู ตัวหนังสือใหญ่ชัดเจน -->
            <div class="p-4 flex flex-col flex-1 justify-between bg-white">
              <div>
                <h3
                  class="text-base sm:text-lg font-black text-stone-900 line-clamp-1"
                >
                  {{ language === "th" ? item.nameTh || item.name : item.name }}
                </h3>
                <p
                  v-if="item.nameTh && language === 'en'"
                  class="text-xs text-stone-400 font-medium line-clamp-1 mt-0.5"
                >
                  {{ item.nameTh }}
                </p>
                <p
                  v-else-if="item.name && language === 'th'"
                  class="text-xs text-stone-400 font-medium line-clamp-1 mt-0.5"
                >
                  {{ item.name }}
                </p>
              </div>

              <div
                class="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between"
              >
                <span class="text-base font-black text-amber-600">
                  {{ item.price }} ฿
                </span>

                <!-- สถานะการเลือกที่ตัวการ์ด -->
                <span
                  class="text-xs font-bold px-2.5 py-1 rounded-lg"
                  :class="
                    selectedIds.has(item.id)
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-stone-100 text-stone-400'
                  "
                >
                  {{
                    selectedIds.has(item.id)
                      ? language === "en"
                        ? "Recommended"
                        : "แนะนำแล้ว"
                      : language === "en"
                        ? "Tap to select"
                        : "แตะเพื่อเลือก"
                  }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="filteredList.length === 0"
          class="py-20 text-center text-stone-400"
        >
          <p class="text-base font-bold">
            {{ language === "en" ? "No dishes found" : "ไม่พบรายการเมนู" }}
          </p>
        </div>
      </div>

      <!-- Footer Actions -->
      <div
        class="px-6 py-4 border-t border-stone-100 bg-white flex items-center gap-3 shrink-0"
      >
        <div class="flex items-center justify-end gap-3 w-full">
          <button
            type="button"
            @click="$emit('close')"
            class="px-5 py-2.5 rounded-xl text-sm font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition"
          >
            {{ language === "en" ? "Cancel" : "ยกเลิก" }}
          </button>
          <button
            type="button"
            :disabled="isSaving"
            @click="saveRecommendations"
            class="px-6 py-2.5 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-md transition disabled:opacity-50"
          >
            {{
              isSaving
                ? language === "en"
                  ? "Saving..."
                  : "กำลังบันทึก..."
                : language === "en"
                  ? "Save Recommendations"
                  : "บันทึกเมนูแนะนำ"
            }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gpu-layer {
  transform: translateZ(0);
  backface-visibility: hidden;
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
