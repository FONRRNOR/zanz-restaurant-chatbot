<script setup>
import { computed, ref, watch, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Info, ShoppingCart } from "@lucide/vue";
import ChatPanel from "../../components/ChatPanel.vue";
import MobileNav from "../../components/MobileNav.vue";
import QuantityControl from "../../components/QuantityControl.vue";
import SideNav from "../../components/SideNav.vue";
import TagList from "../../components/TagList.vue";
import TopBar from "../../components/TopBarCustomer.vue";
import { useAppState } from "../../services/appState";
import { supabase } from "../../supabaseClient";

const { state, addToCart, localizeMenuItem, t } = useAppState();
const route = useRoute();
const router = useRouter();

const selectedItem = ref(null);
const search = ref("");
const detailQty = ref(1);
const detailNote = ref("");
const isLoading = ref(false);

const currentRestaurantId = computed(
  () => route.query.restaurantId || state.restaurantId,
);
const currentTableId = computed(() => route.query.tableId || state.tableId);

// 🔥 1. สร้าง Mapping เพื่อยุบรวมหมวดหมู่ย่อย ให้เป็นหมวดหมู่ใหญ่ (แสดงผลบน UI)
const categoryMapping = {
  Cakes: "Desserts",
  Pastries: "Desserts",
  Tarts: "Desserts",
  Bakery: "Desserts",
  Desserts: "Desserts",
  Coffee: "Drinks",
  Tea: "Drinks",
  "Non-Coffee": "Drinks",
  Drink: "Drinks",
  Drinks: "Drinks",
  // สามารถเพิ่มการยุบรวมของร้านอื่นๆ ได้ที่นี่ เช่น "Noodles": "Main Courses"
};

// ฟังก์ชันช่วยแปลงชื่อหมวดหมู่จาก DB เป็นชื่อกลุ่ม (ถ้าไม่มีใน Mapping ให้ใช้ชื่อเดิม)
const getUIGroupName = (dbCategory) =>
  categoryMapping[dbCategory] || dbCategory;

// 🔥 2. สร้างเมนูตามกลุ่มใหญ่
const navItems = computed(() => {
  const baseParams = `restaurantId=${currentRestaurantId.value}${currentTableId.value ? `&tableId=${currentTableId.value}` : ""}`;

  // แปลงหมวดหมู่ทุกอันของร้านให้เป็นชื่อกลุ่มใหญ่
  const allGroups = (state.menuItems || []).map((item) =>
    getUIGroupName(item.category),
  );

  // กรองชื่อกลุ่มที่ไม่ซ้ำกัน
  const uniqueGroups = [...new Set(allGroups)].filter(Boolean);

  const dynamicLinks = uniqueGroups.map((group) => ({
    label: group,
    to: `/customer/menu?${baseParams}&category=${encodeURIComponent(group)}`,
    short: group,
  }));

  return [
    ...dynamicLinks,
    {
      label: "Check Order Status",
      to: `/customer/order-status?${baseParams}`,
      short: "Status",
    },
  ];
});

async function fetchDatabaseMenuItems(restaurantId) {
  isLoading.value = true;
  try {
    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .is("is_deleted", false)
      .eq("restaurant_id", restaurantId)
      .order("id", { ascending: true });

    if (error) throw error;

    state.menuItems = (data || []).map((item) => ({
      id: item.id,
      name: item.name,
      nameTh: item.name_th,
      category: item.category,
      price: item.price,
      image: item.image,
      description: item.description,
      descriptionTh: item.description_th,
      ingredients: item.ingredients || [],
      ingredientsTh: item.ingredients_th || [],
      allergens: item.allergens || [],
      allergensTh: item.allergens_th || [],
      dietaryTags: item.dietary_tags || [],
      dietaryTagsTh: item.dietary_tags_th || [],
      tasteProfiles: item.taste_profiles || [],
      tasteProfilesTh: item.taste_profiles_th || [],
      spiceLevel: item.spice_level,
      availability: item.availability,
    }));
  } catch (error) {
    console.error("เกิดข้อผิดพลาด:", error.message);
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  const restaurantId = route.query.restaurantId;
  const tableId = route.query.tableId;

  if (restaurantId) {
    state.restaurantId = restaurantId;
    if (tableId) state.tableId = tableId;
    fetchDatabaseMenuItems(restaurantId);
  } else if (state.restaurantId) {
    fetchDatabaseMenuItems(state.restaurantId);
  } else {
    alert("Store information not found. Please scan the QR code on your table again.");
    router.push("/");
  }
});

// 🔥 3. ตอนกรองเมนูให้เช็กจากกลุ่มใหญ่แทนหมวดหมู่ย่อย
const filteredItems = computed(() =>
  (state.menuItems || []).map(localizeMenuItem).filter((item) => {
    if (item.availability === "sold_out") return false;

    const isAllMenuMode =
      !route.query.category ||
      state.selectedCategory === "All" ||
      search.value.trim() !== "";

    // หาชื่อกลุ่มของไอเท็มชิ้นนี้ แล้วเทียบกับกลุ่มที่ผู้ใช้เลือก
    const itemGroup = getUIGroupName(item.category);
    const isDirectMatch = itemGroup === state.selectedCategory;

    const categoryMatch = isAllMenuMode || isDirectMatch;

    const text = [
      item.name,
      item.nameTh,
      item.description,
      item.descriptionTh,
      ...item.ingredients,
      ...(item.ingredientsTh || []),
      ...item.dietaryTags,
      ...(item.dietaryTagsTh || []),
      ...item.tasteProfiles,
      ...(item.tasteProfilesTh || []),
    ]
      .join(" ")
      .toLowerCase();

    return categoryMatch && text.includes(search.value.toLowerCase());
  }),
);

watch(
  () => route.query.category,
  (category) => {
    if (!category) {
      state.selectedCategory = "All";
    } else {
      state.selectedCategory = category;
    }
  },
  { immediate: true },
);

watch(search, (newSearch) => {
  if (newSearch.trim() !== "") state.selectedCategory = "All";
});

function openDetail(item) {
  selectedItem.value = item;
  detailQty.value = 1;
  detailNote.value = "";
}

function addSelected() {
  addToCart(selectedItem.value.id, detailQty.value, detailNote.value);
  selectedItem.value = null;
}

const getCartItemQuantity = computed(() => {
  return (itemId) => {
    const item = cartItems.value.find((c) => c.menuItemId === itemId);
    return item ? item.quantity : 0;
  };
});

const totalCartQuantity = computed(() => {
  return cartItems.value.reduce((total, item) => total + item.quantity, 0);
});

const cartItems = computed(() => state.cart);
</script>

<template>
  <div class="page-shell">
    <TopBar v-model="search" :cart-count="totalCartQuantity" />
    <div class="content-shell">
      <SideNav :items="navItems" bottom-label="Checkout" />
      <main class="main-panel">
        <div
          class="grid gap-6 xl:grid-cols-[1fr_380px] 2xl:grid-cols-[1fr_420px]"
        >
          <section>
            <div
              v-if="state.selectedCategory === 'All' && search.trim() === ''"
              class="mb-7 flex flex-wrap items-end justify-between gap-4 animation-fade-in"
            >
              <div>
                <h1 class="text-4xl font-black">
                  {{ t("Today’s") }}
                  <span class="italic text-brand">{{ t("Signature") }}</span>
                  {{ t("Curations") }}
                </h1>
                <p class="mt-2 max-w-2xl text-muted">
                  {{
                    t(
                      "Browse dishes or ask Chef AI for recommendations based on taste, ingredients, allergies, or dietary preferences.",
                    )
                  }}
                </p>
              </div>
            </div>

            <input
              v-model="search"
              class="field mb-6 max-w-xl h-12 px-4"
              :placeholder="t('Search dishes, ingredients, or taste')"
            />

            <div
              v-if="isLoading"
              class="p-10 text-center text-stone-400 font-bold"
            >
              {{ t("Loading menu items...") }}
            </div>

            <section v-else class="grid items-stretch gap-6 sm:grid-cols-2">
              <article
                v-for="item in filteredItems"
                :key="item.id"
                class="section-card flex h-full flex-col overflow-hidden transition hover:-translate-y-1 hover:shadow-strong"
              >
                <button
                  class="flex flex-1 flex-col text-left"
                  @click="openDetail(item)"
                >
                  <img
                    :src="item.image"
                    :alt="item.displayName"
                    class="h-48 w-full object-cover"
                  />
                  <div class="flex flex-1 flex-col p-5">
                    <div class="flex items-start justify-between gap-3">
                      <h2 class="min-h-12 font-black leading-snug">
                        {{ item.displayName }}
                      </h2>
                      <strong class="whitespace-nowrap text-brand"
                        >{{ item.price }} {{ t("Baht") }}</strong
                      >
                    </div>
                    <p class="mt-3 text-sm leading-relaxed text-muted">
                      {{ item.displayDescription }}
                    </p>
                    <TagList
                      class="mt-4"
                      :tags="[
                        ...item.displayTasteProfiles.slice(0, 1),
                        ...item.displayDietaryTags.slice(0, 1),
                        ...item.displayAllergens
                          .slice(0, 1)
                          .map((a) => `Contains ${a}`),
                      ]"
                    />
                  </div>
                </button>
                <div
                  class="mt-auto flex items-center justify-between gap-3 px-5 pb-5"
                >
                  <span
                    v-if="item.availability === 'sold_out'"
                    class="rounded-full bg-red-50 px-3 py-2 text-sm font-bold text-red-700"
                    >{{ t("Sold out") }}</span
                  >

                  <button
                    v-if="getCartItemQuantity(item.id) === 0"
                    class="primary-btn"
                    style="
                      padding: 6px 16px !important;
                      font-size: 15px !important;
                    "
                    @click="addToCart(item.id)"
                  >
                    {{ t("Add to Cart") }}
                  </button>

                  <div v-else class="flex items-center gap-2">
                    <button
                      class="secondary-btn w-7 h-7 flex items-center justify-center rounded-full"
                      @click="addToCart(item.id, -1)"
                    >
                      -
                    </button>
                    <span
                      class="font-black w-8 text-center text-lg text-gray-800"
                      >{{ getCartItemQuantity(item.id) }}</span
                    >
                    <button
                      class="primary-btn w-7 h-7 flex items-center justify-center rounded-full"
                      @click="addToCart(item.id, 1)"
                    >
                      +
                    </button>
                  </div>

                  <button
                    class="secondary-btn"
                    style="
                      padding: 6px 16px !important;
                      font-size: 15px !important;
                      height: auto !important;
                    "
                    @click="openDetail(item)"
                  >
                    <Info :size="14" class="inline" /> {{ t("Details") }}
                  </button>
                </div>
              </article>
            </section>
          </section>

          <div class="hidden xl:block">
            <ChatPanel
              class="sticky top-24 h-[calc(100vh-7rem)] min-h-[720px]"
            />
          </div>
        </div>
      </main>
    </div>
    <MobileNav :items="navItems" />

    <div
      v-if="selectedItem"
      class="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
      @click.self="selectedItem = null"
    >
      <section
        class="grid max-h-[92vh] w-full max-w-4xl overflow-auto rounded-[2rem] bg-white shadow-strong md:grid-cols-[360px_1fr]"
      >
        <img
          :src="selectedItem.image"
          :alt="selectedItem.displayName"
          class="h-72 w-full object-cover md:h-full"
        />
        <div class="p-6 md:p-8">
          <button
            class="float-right text-4xl font-black text-muted transition-transform hover:scale-110 hover:text-black"
            @click="selectedItem = null"
            title="Close"
          >
            ×
          </button>
          <h2 class="text-3xl font-black">{{ selectedItem.displayName }}</h2>
          <p class="mt-1 text-xl font-black text-brand">
            {{ selectedItem.price }} {{ t("Baht") }}
          </p>
          <p class="mt-4 leading-relaxed text-muted">
            {{ selectedItem.displayDescription }}
          </p>
          <TagList
            class="mt-4"
            :tags="[
              ...selectedItem.displayTasteProfiles,
              ...selectedItem.displayDietaryTags,
              ...selectedItem.displayAllergens.map((a) => `Contains ${a}`),
            ]"
          />
          <div class="mt-6 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <strong>{{ t("Ingredients") }}</strong>
              <p class="text-muted">
                {{ selectedItem.displayIngredients.join(", ") }}
              </p>
            </div>
            <div>
              <strong>{{ t("Taste profile") }}</strong>
              <p class="text-muted">
                {{ selectedItem.displayTasteProfiles.map(t).join(", ") }}
              </p>
            </div>
            <div>
              <strong>{{ t("Spice level") }}</strong>
              <p class="text-muted">{{ t(selectedItem.spiceLevel) }}</p>
            </div>
            <div>
              <strong>{{ t("Allergens") }}</strong>
              <p class="text-muted">
                {{
                  selectedItem.displayAllergens.length
                    ? selectedItem.displayAllergens.map(t).join(", ")
                    : t("None")
                }}
              </p>
            </div>
          </div>
          <div class="mt-6 flex flex-wrap items-center gap-4">
            <QuantityControl v-model="detailQty" />
            <input
              v-model="detailNote"
              class="field flex-1"
              :placeholder="t('e.g., less spicy, no garlic')"
            />
          </div>
          <div class="mt-6 flex flex-wrap gap-3">
            <button
              class="primary-btn"
              style="padding: 6px 16px !important; font-size: 15px !important"
              :disabled="selectedItem.availability === 'sold_out'"
              @click="addSelected"
            >
              {{ t("Add to Cart") }}
            </button>
            <button
              class="secondary-btn"
              style="padding: 6px 16px !important; font-size: 15px !important"
            >
              {{ t("Ask Chef AI about this dish") }}
            </button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>