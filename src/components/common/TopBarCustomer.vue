<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Search, FileText, X } from "lucide-vue-next";
import { supabase } from "../../supabaseClient";
import { useAppState } from "../../services/appState";

const { state } = useAppState();
const route = useRoute();
const router = useRouter();

const categoryContainer = ref(null);
const restaurantName = ref(
  route.query.restaurantName || state.restaurantName || "Loading...",
);

// ดึง tableId และ restaurantId แบบมี Fallback ครบทุกช่องทาง
const tableNumber = computed(
  () =>
    route.query.tableId ||
    state.tableNumber ||
    sessionStorage.getItem("customer_table_id") ||
    localStorage.getItem("zank-table-number") ||
    "01",
);

const currentRestaurantId = computed(
  () =>
    route.query.restaurantId ||
    sessionStorage.getItem("customer_restaurant_id") ||
    state.restaurantId ||
    "",
);

const zone = ref("A");

// --- 🌟 ดักการแตะเบิ้ล (Double Tap Zoom) บนอุปกรณ์พกพา/Safari 🌟 ---
let lastTouchEnd = 0;
const preventDoubleTapZoom = (event) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) {
    event.preventDefault();
  }
  lastTouchEnd = now;
};

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

// ตัวแปรควบคุมจุดสีแดง
const hasActiveOrder = ref(false);
let orderChannel = null;

// ฟังก์ชันเช็คว่ามีออเดอร์ค้างของร้านและโต๊ะนี้จริงหรือไม่
const checkActiveOrders = async () => {
  const resId = currentRestaurantId.value;
  const tabId = tableNumber.value;

  if (!tabId || tabId === "Unknown" || !resId) {
    hasActiveOrder.value = false;
    return;
  }

  const { data: activeOrder, error } = await supabase
    .from("orders")
    .select("id")
    .eq("restaurant_id", resId)
    .eq("table_number", tabId)
    .neq("status", "paid")
    .neq("status", "cancelled")
    .limit(1)
    .maybeSingle();

  if (!error && activeOrder) {
    hasActiveOrder.value = true;
  } else {
    hasActiveOrder.value = false;
  }
};

// ฟังก์ชันเปิด Realtime Subscription แบบปลอดภัย ไม่ชนกับ Channel เดิม
const setupOrderSubscription = async (resId, tabId) => {
  if (!resId || !tabId || tabId === "Unknown") return;

  if (orderChannel) {
    await supabase.removeChannel(orderChannel);
    orderChannel = null;
  }

  const channelName = `topbar-order-${resId}-${tabId}-${Date.now()}`;

  orderChannel = supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "orders",
        filter: `table_number=eq.${tabId}`,
      },
      (payload) => {
        if (
          payload.new?.restaurant_id === resId ||
          payload.old?.restaurant_id === resId
        ) {
          checkActiveOrders();
        }
      },
    )
    .subscribe();
};

onMounted(async () => {
  document.addEventListener("touchend", preventDoubleTapZoom, {
    passive: false,
  });

  state.language = state.language || "en";

  // ตั้งค่าเริ่มต้นเป็นหมวดหมู่แรกถ้ามีข้อมูล
  if (!state.selectedCategory || state.selectedCategory === "All") {
    if (state.menuItems && state.menuItems.length > 0) {
      state.selectedCategory = state.menuItems[0].category || "Other";
    }
  }

  const restaurantId = currentRestaurantId.value;
  const tableId = tableNumber.value;

  if (restaurantId)
    sessionStorage.setItem("customer_restaurant_id", restaurantId);
  if (tableId && tableId !== "Unknown")
    sessionStorage.setItem("customer_table_id", tableId);

  // ดึงชื่อร้าน
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

  await checkActiveOrders();
  await setupOrderSubscription(restaurantId, tableId);
});

onUnmounted(async () => {
  document.removeEventListener("touchend", preventDoubleTapZoom);

  if (orderChannel) {
    await supabase.removeChannel(orderChannel);
    orderChannel = null;
  }
});

// เลื่อน Tab ด้านบนให้อยู่กึ่งกลางหน้าจอเสมอเมื่อ Category เปลี่ยน
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

// อัปเดต selectedCategory เมื่อโหลดเมนูเสร็จครั้งแรก
watch(
  () => state.menuItems,
  (newItems) => {
    if (
      newItems &&
      newItems.length > 0 &&
      (!state.selectedCategory || state.selectedCategory === "All")
    ) {
      state.selectedCategory = newItems[0].category || "Other";
    }
  },
  { immediate: true },
);

const handleToggleLang = () => {
  state.language = state.language === "en" ? "th" : "en";
};

// เลื่อนหน้าจอไปยัง Section เมนูที่เลือกโดยไม่ดึง TopBar ให้หลุดจอ
const selectCategory = (categoryKey) => {
  state.selectedCategory = categoryKey;
  state.isManualScrolling = true;

  const container = document.getElementById("main-menu-scroll-container");
  const targetSection = document.getElementById(
    `category-section-${categoryKey}`,
  );

  if (container && targetSection) {
    const targetScrollTop =
      targetSection.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop;

    container.scrollTo({
      top: targetScrollTop,
      behavior: "smooth",
    });
  }

  setTimeout(() => {
    state.isManualScrolling = false;
  }, 600);
};

// categoriesWithCount เฉพาะหมวดหมู่จริง (ตัด All ออกแล้ว)
const categoriesWithCount = computed(() => {
  const items = state.menuItems || [];
  const isTh = state.language === "th";

  const categoryMap = new Map();

  items.forEach((item) => {
    const key = item.category || "Other";
    const label = isTh
      ? item.category_th || item.category || "อื่นๆ"
      : item.category || "Other";

    if (!categoryMap.has(key)) {
      categoryMap.set(key, { key, label, count: 0 });
    }
    categoryMap.get(key).count += 1;
  });

  return Array.from(categoryMap.values());
});

const goToStatus = () => {
  const resId =
    currentRestaurantId.value ||
    sessionStorage.getItem("customer_restaurant_id") ||
    route.query.restaurantId;

  const tabId =
    tableNumber.value !== "Unknown"
      ? tableNumber.value
      : sessionStorage.getItem("customer_table_id") ||
        route.query.tableId ||
        "01";

  if (resId) sessionStorage.setItem("customer_restaurant_id", resId);
  if (tabId) sessionStorage.setItem("customer_table_id", tabId);

  const hasParamRoute =
    router.hasRoute("CustomerOrderStatusMobile") ||
    router
      .getRoutes()
      .some((r) => r.path.includes("/customer/order-status/mobile/:"));

  const targetPath = hasParamRoute
    ? `/customer/order-status/mobile/${tabId}`
    : `/customer/order-status/mobile`;

  router.push({
    path: targetPath,
    query: {
      restaurantId: resId,
      tableId: tabId,
    },
  });
};
</script>

<template>
  <header
    class="w-full bg-white border-b border-stone-100 px-4 pt-4 pb-3 shadow-[0_2px_10px_rgba(0,0,0,0.03)] no-zoom-touch flex-shrink-0 z-20"
  >
    <h1 class="text-center text-xl font-extrabold text-stone-900 mb-4">
      {{ restaurantName }}
    </h1>

    <div class="flex items-center justify-between mb-4">
      <div
        class="flex items-center border border-stone-200 rounded-md px-4 py-1.5 bg-white shadow-sm"
      >
        <span class="text-stone-900 font-bold text-sm tracking-wide">
          {{ state.language === "th" ? "โต๊ะ" : "Table" }} {{ tableNumber }}
        </span>
        <span class="mx-2 text-stone-300">|</span>
        <span class="text-stone-500 font-medium text-sm"> {{ zone }}</span>
      </div>

      <div class="flex items-center gap-4 text-stone-400">
        <div class="flex gap-4 text-stone-400 flex-shrink-0">
          <button
            @click="toggleSearch"
            class="hover:text-stone-800 transition-colors"
            aria-label="Search"
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

        <!-- ปุ่มสถานะออเดอร์ -->
        <button
          @click="goToStatus"
          class="relative hover:text-stone-800 transition-colors"
          aria-label="Order Status"
        >
          <FileText :size="20" />
          <span
            v-if="hasActiveOrder"
            class="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white"
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
          class="w-full bg-stone-50 border border-stone-200 rounded-lg pl-9 pr-10 py-2 text-sm text-stone-900 focus:outline-none focus:border-stone-400 focus:ring-1 focus:ring-stone-400 transition-all text-base"
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

    <!-- Category (ไม่มีปุ่ม All แล้ว) -->
    <div class="flex items-center gap-4 pt-1">
      <div
        ref="categoryContainer"
        class="flex items-center overflow-x-auto hide-scrollbar py-1 scroll-smooth"
      >
        <div class="flex gap-5">
          <button
            v-for="cat in categoriesWithCount"
            :key="cat.key"
            :data-category="cat.key"
            @click="selectCategory(cat.key)"
            :class="[
              'relative pl-3 py-1 font-semibold text-sm whitespace-nowrap transition-all duration-200',
              state.selectedCategory === cat.key
                ? 'text-stone-900 before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-[3px] before:h-[70%] before:bg-red-500 before:rounded-full'
                : 'text-stone-300 hover:text-stone-600',
            ]"
          >
            {{ cat.label }}
            <span
              :class="
                state.selectedCategory === cat.key
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

.no-zoom-touch,
button {
  touch-action: manipulation;
}
</style>