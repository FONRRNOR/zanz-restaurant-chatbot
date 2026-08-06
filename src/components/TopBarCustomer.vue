<script setup>
import { ref, computed, onMounted, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { supabase } from "../supabaseClient";
// 💡 เพิ่มไอคอน X สำหรับปุ่มเคลียร์คำค้นหา
import { Search, List, Bell, FileText, X } from "@lucide/vue";
import { useAppState } from "../services/appState";

const { state } = useAppState();
const route = useRoute();
const router = useRouter();

const categoryContainer = ref(null);
const restaurantName = ref(
  route.query.restaurantName || state.restaurantName || "Loading...",
);
const tableNumber = computed(
  () =>
    route.query.tableId ||
    state.tableNumber ||
    localStorage.getItem("zank-table-number") ||
    "Unknown",
);
const zone = ref("A");

// --- 🌟 ระบบค้นหา (Search) 🌟 ---
const isSearchOpen = ref(false);
const searchInputRef = ref(null);

if (state.searchQuery === undefined) {
  state.searchQuery = "";
}

const toggleSearch = async () => {
  isSearchOpen.value = !isSearchOpen.value;
  if (isSearchOpen.value) {
    await nextTick();
    searchInputRef.value?.focus();
  } else {
    state.searchQuery = "";
  }
};
// ---------------------------------

// 💡 ตัวแปรควบคุมจุดสีแดง (เช็คว่ามีออเดอร์ที่ค้างอยู่หรือไม่)
const hasActiveOrder = ref(false);

onMounted(async () => {
  state.language = "en"; // ตั้งค่าเริ่มต้นภาษา
  state.selectedCategory = "All";

  const restaurantId = route.query.restaurantId;
  const tableId = route.query.tableId || state.tableNumber;

  // 1. ตรวจสอบชื่อร้าน
  if (restaurantId) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("restaurant_name")
        .eq("restaurant_id", restaurantId)
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data && data.restaurant_name) {
        restaurantName.value = data.restaurant_name;
        state.restaurantName = data.restaurant_name;
      } else {
        restaurantName.value = "Our Restaurant";
      }
    } catch (error) {
      console.error("Error fetching restaurant name:", error.message);
      restaurantName.value = "Our Restaurant";
    }
  } else {
    restaurantName.value = "Our Restaurant";
  }

  // 2. 💡 ตรวจสอบว่ามีออเดอร์ที่ค้างอยู่บนโต๊ะนี้ไหม เพื่อโชว์จุดสีแดง
  if (tableId && tableId !== "Unknown") {
    const { data: activeOrder } = await supabase
      .from("orders")
      .select("id")
      .eq("table_number", tableId)
      .in("status", ["pending", "cooking", "served"]) // หากมีสถานะเหล่านี้ ถือว่ายังมีออเดอร์ค้างอยู่
      .limit(1)
      .maybeSingle();

    if (activeOrder) {
      hasActiveOrder.value = true;
    }
  }
});

watch(
  () => state.selectedCategory,
  async (newCategory) => {
    await nextTick();
    if (categoryContainer.value) {
      const activeBtn = categoryContainer.value.querySelector(
        `[data-category="${newCategory}"]`,
      );
      if (activeBtn) {
        activeBtn.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "center",
        });
      }
    }
  },
);

const handleToggleLang = () => {
  state.language = state.language === "en" ? "th" : "en";
};

const selectCategory = (categoryName) => {
  state.selectedCategory = categoryName;
};

const categoriesWithCount = computed(() => {
  const items = state.menuItems || [];
  const counts = items.reduce((acc, item) => {
    const cat = item.category || "Other";
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  const result = Object.keys(counts).map((key) => ({
    name: key,
    count: counts[key],
  }));

  result.unshift({ name: "All", count: items.length });
  return result;
});

// 💡 แก้ไขฟังก์ชัน goToStatus เพื่อป้องกัน Error และไม่ให้มี Alert แจ้งเตือน
const goToStatus = async () => {
  const tableId = route.query.tableId;

  // หากไม่มีโต๊ะ ให้หยุดทำงานไปเลยโดยไม่แจ้งเตือน
  if (!tableId) return;

  // ค้นหาออเดอร์ล่าสุดของโต๊ะ
  const { data, error } = await supabase
    .from("orders")
    .select("id")
    .eq("table_number", tableId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle(); 

  // หากเกิด error หรือไม่มี data (ไม่มีออเดอร์) ให้หยุดทำงานไปเลย
  if (error || !data) return;

  // ถ้ามีออเดอร์ ถึงจะทำการเปลี่ยนหน้าไป
  router.push(`/customer/order-status/mobile/${tableId}`);
};
</script>

<template>
  <header
    class="sticky top-0 z-20 bg-white border-b border-stone-100 px-4 pt-4 pb-3 shadow-[0_2px_10px_rgba(0,0,0,0.03)]"
  >
    <h1 class="text-center text-xl font-extrabold text-stone-900 mb-4">
      {{ restaurantName }}
    </h1>

    <div class="flex items-center justify-between mb-4">
      <div
        class="flex items-center border border-stone-200 rounded-md px-4 py-1.5 bg-white shadow-sm"
      >
        <span class="text-stone-900 font-bold text-sm tracking-wide">
          Table {{ tableNumber }}
        </span>
        <span class="mx-2 text-stone-300">|</span>
        <span class="text-stone-500 font-medium text-sm"> {{ zone }}</span>
      </div>

      <div class="flex items-center gap-4 text-stone-400">
        <div class="flex gap-4 text-stone-400 flex-shrink-0">
          <button
            @click="toggleSearch"
            class="hover:text-stone-800 transition-colors"
          >
            <Search :size="20" />
          </button>
        </div>

        <button
          @click="handleToggleLang"
          class="text-stone-400 hover:text-stone-800 font-extrabold !text-[17px] transition-colors active:scale-95 uppercase tracking-wider px-1"
        >
          {{ state.language === "th" ? "TH" : "EN" }}
        </button>

        <!-- 💡 ปุ่มสถานะออเดอร์ -->
        <button
          @click="goToStatus"
          class="relative hover:text-stone-800 transition-colors"
        >
          <FileText :size="20" />
          <!-- 💡 จุดสีแดง: โชว์ก็ต่อเมื่อมีออเดอร์ค้างบนโต๊ะจริงๆ -->
          <span
            v-if="hasActiveOrder"
            class="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"
          ></span>
        </button>
      </div>
    </div>

    <!-- ช่องค้นหา -->
    <div v-show="isSearchOpen" class="mb-3 transition-all duration-300">
      <div class="relative flex items-center">
        <Search class="absolute left-3 text-stone-400" :size="16" />
        <input
          ref="searchInputRef"
          v-model="state.searchQuery"
          type="text"
          :placeholder="
            state.language === 'th' ? 'ค้นหาเมนู...' : 'Search menu...'
          "
          class="w-full bg-stone-50 border border-stone-200 rounded-lg pl-9 pr-10 py-2 text-sm text-stone-900 focus:outline-none focus:border-stone-400 focus:ring-1 focus:ring-stone-400 transition-all"
        />
        <button
          v-if="state.searchQuery"
          @click="state.searchQuery = ''"
          class="absolute right-3 text-stone-400 hover:text-stone-600 transition-colors"
        >
          <X :size="16" />
        </button>
      </div>
    </div>

    <!-- Category -->
    <div class="flex items-center gap-4 pt-1">
      <div
        ref="categoryContainer"
        class="flex items-center overflow-x-auto hide-scrollbar py-1 scroll-smooth"
      >
        <div class="flex gap-5">
          <button
            v-for="cat in categoriesWithCount"
            :key="cat.name"
            :data-category="cat.name"
            @click="selectCategory(cat.name)"
            :class="[
              'relative pl-3 py-1 font-semibold text-sm whitespace-nowrap transition-all duration-200',
              state.selectedCategory === cat.name
                ? 'text-stone-900 before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-[3px] before:h-[70%] before:bg-red-500 before:rounded-full'
                : 'text-stone-300 hover:text-stone-600',
            ]"
          >
            {{ cat.name }}
            <span
              :class="
                state.selectedCategory === cat.name
                  ? 'text-stone-900 font-medium'
                  : 'text-stone-300'
              "
            >
              · {{ cat.count }}
            </span>
          </button>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>