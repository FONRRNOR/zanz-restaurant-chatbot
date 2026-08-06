<script setup>
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import MobileNav from "../../components/MobileNav.vue";
import SideNav from "../../components/SideNav.vue";
import StatusPill from "../../components/StatusPill.vue";
import TagList from "../../components/TagList.vue";
import TopBar from "../../components/TopBar.vue";
import { useAppState } from "../../services/appState";
import { supabase } from "../../supabaseClient";

const router = useRouter();
const { state, signOut } = useAppState();

const menuItems = ref([]);
const sortBy = ref("category");
const sortOrder = ref("asc");

// State to store the selected menu item data when clicked for details
const selectedItem = ref(null);

// State for toast notifications
const alert = ref({
  show: false,
  message: "",
  type: "success", // 'success' | 'error'
});

const navItems = computed(() => [
  {
    label: state.language === "en" ? "Live Orders" : "ออเดอร์สด",
    to: "/staff/live-orders",
    short: "Orders",
  },
  {
    label: state.language === "en" ? "Menu Items" : "รายการเมนู",
    to: "/staff/menu-items",
    short: "Menu",
  },
  {
    label: state.language === "en" ? "Logout" : "ออกจากระบบ",
    to: "/logout",
    short: "Logout",
  },
]);

async function fetchMenuItems() {
  try {
    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .is("is_deleted", false)
      .order("id", { ascending: true });

    if (error) throw error;
    menuItems.value = data || [];
  } catch (error) {
    console.error("Error fetching menu items:", error.message);
  }
}

const sortedMenuItems = computed(() => {
  return [...menuItems.value].sort((a, b) => {
    let modifier = sortOrder.value === "asc" ? 1 : -1;

    if (sortBy.value === "category") {
      const orderConfig = {
        Starters: 1,
        "Main Courses": 2,
        Drink: 3,
      };

      let weightA = orderConfig[a.category] || 99;
      let weightB = orderConfig[b.category] || 99;

      // If in the same category and sharing the same weight, sort by ID instead of name
      if (weightA === weightB) {
        return (Number(a.id) - Number(b.id)) * modifier;
      }

      return (weightA - weightB) * modifier;
    }

    let fieldA = a[sortBy.value];
    let fieldB = b[sortBy.value];

    if (sortBy.value === "price") {
      return (Number(fieldA) - Number(fieldB)) * modifier;
    }

    fieldA = (fieldA || "").toString().toLowerCase();
    fieldB = (fieldB || "").toString().toLowerCase();

    if (fieldA < fieldB) return -1 * modifier;
    if (fieldA > fieldB) return 1 * modifier;
    return 0;
  });
});

function handleSort(field) {
  if (sortBy.value === field) {
    sortOrder.value = sortOrder.value === "asc" ? "desc" : "asc";
  } else {
    sortBy.value = field;
    sortOrder.value = "asc";
  }
}

// Trigger custom notification toast
function triggerAlert(message, type = "success") {
  alert.value = { show: true, message, type };
  setTimeout(() => {
    alert.value.show = false;
  }, 3000);
}

async function toggleAvailability(itemId, currentStatus) {
  const nextStatus = currentStatus === "available" ? "sold_out" : "available";

  // Find item and keep backup in case of network failure
  const itemIndex = menuItems.value.findIndex((x) => x.id === itemId);
  if (itemIndex === -1) return;
  const originalStatus = menuItems.value[itemIndex].availability;

  try {
    // 1. Reactive Update: Update local state immediately for a snappy UI experience
    menuItems.value[itemIndex].availability = nextStatus;

    // 2. Database Update: Send changes to Supabase
    const { error } = await supabase
      .from("menu_items")
      .update({ availability: nextStatus })
      .eq("id", itemId);

    if (error) throw error;

    // 3. Status Notification: Trigger success toast
    const itemName =
      state.language === "en"
        ? menuItems.value[itemIndex].name
        : menuItems.value[itemIndex].name_th || menuItems.value[itemIndex].name;

    const successMsg =
      state.language === "en"
        ? `Updated "${itemName}" status successfully.`
        : `อัปเดตสถานะเมนู "${itemName}" สำเร็จแล้ว`;

    triggerAlert(successMsg, "success");
  } catch (error) {
    // Rollback local state if database communication fails
    if (menuItems.value[itemIndex]) {
      menuItems.value[itemIndex].availability = originalStatus;
    }
    console.error("Error updating availability:", error.message);

    const errorMsg =
      state.language === "en"
        ? "Failed to update status. Please try again."
        : "เกิดข้อผิดพลาด ไม่สามารถเปลี่ยนสถานะได้ กรุณาลองใหม่";

    triggerAlert(errorMsg, "error");
  }
}

function logout() {
  signOut();
  router.push("/");
}

onMounted(() => {
  fetchMenuItems();
});
</script>

<template>
  <div class="page-shell relative">
    <div
      v-if="selectedItem"
      class="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
      @click.self="selectedItem = null"
    >
      <section
        class="grid max-h-[92vh] w-full max-w-4xl overflow-auto rounded-[2rem] bg-white shadow-strong md:grid-cols-[360px_1fr]"
      >
        <div class="relative h-64 sm:h-72 md:h-full md:min-h-[450px]">
          <img
            :src="selectedItem.image"
            :alt="selectedItem.name"
            class="absolute inset-0 h-full w-full object-cover"
          />
        </div>

        <div class="p-6 md:p-8">
          <button
            class="float-right text-4xl font-black text-stone-400 transition-transform hover:scale-110 hover:text-black"
            @click="selectedItem = null"
            title="Close"
          >
            ×
          </button>

          <h2 class="text-3xl font-black pr-8">
            {{
              state.language === "en"
                ? selectedItem.name
                : selectedItem.name_th || selectedItem.name
            }}
          </h2>

          <div class="mt-3 flex flex-wrap items-center gap-5">
            <p class="text-xl font-black text-brand">
              {{ selectedItem.price }}
              {{ state.language === "en" ? "Baht" : "บาท" }}
            </p>
            <div class="transform scale-125 origin-left drop-shadow-md">
              <StatusPill :status="selectedItem.availability" />
            </div>
          </div>

          <p class="mt-4 leading-relaxed text-stone-500">
            {{
              state.language === "en"
                ? selectedItem.description
                : selectedItem.description_th || selectedItem.description || "-"
            }}
          </p>

          <TagList
            class="mt-4"
            :tags="[
              ...(selectedItem.taste_profiles || []),
              ...(selectedItem.dietary_tags || []),
              ...(selectedItem.allergens || []).map((a) =>
                state.language === 'en' ? `Contains ${a}` : `มี ${a}`,
              ),
            ]"
          />

          <div class="mt-6 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <strong>{{
                state.language === "en" ? "Ingredients" : "วัตถุดิบ"
              }}</strong>
              <p class="text-stone-500">
                {{
                  state.language === "en"
                    ? (selectedItem.ingredients || []).join(", ")
                    : (
                        selectedItem.ingredients_th ||
                        selectedItem.ingredients ||
                        []
                      ).join(", ")
                }}
              </p>
            </div>
            <div>
              <strong>{{
                state.language === "en" ? "Taste profile" : "รสชาติ"
              }}</strong>
              <p class="text-stone-500">
                {{ (selectedItem.taste_profiles || []).join(", ") }}
              </p>
            </div>
            <div>
              <strong>{{
                state.language === "en" ? "Spice level" : "ระดับความเผ็ด"
              }}</strong>
              <p class="text-stone-500">
                {{ selectedItem.spice_level || "-" }}
              </p>
            </div>
            <div>
              <strong>{{
                state.language === "en" ? "Allergens" : "สารก่อภูมิแพ้"
              }}</strong>
              <p class="text-stone-500">
                {{
                  (selectedItem.allergens || []).length
                    ? state.language === "en"
                      ? selectedItem.allergens.join(", ")
                      : (
                          selectedItem.allergens_th || selectedItem.allergens
                        ).join(", ")
                    : state.language === "en"
                      ? "None"
                      : "ไม่มี"
                }}
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
    <Transition
      enter-active-class="transform ease-out duration-300 transition"
      enter-from-class="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2"
      enter-to-class="translate-y-0 opacity-100 sm:translate-x-0"
      leave-active-class="transition ease-in duration-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="alert.show"
        class="fixed top-5 right-5 z-50 flex items-center w-full max-w-xs p-4 rounded-xl shadow-lg border text-sm font-bold tracking-tight"
        :class="
          alert.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-red-50 border-red-200 text-red-800'
        "
      >
        <div class="mr-3 flex-shrink-0">
          <span v-if="alert.type === 'success'"></span>
          <span v-else></span>
        </div>
        <div>{{ alert.message }}</div>
      </div>
    </Transition>

    <TopBar
      :search-placeholder="
        state.language === 'en'
          ? 'Search menu items or ingredients'
          : 'ค้นหาเมนู หรือวัตถุดิบอาหาร'
      "
    />
    <div class="content-shell">
      <SideNav :items="navItems" />
      <main class="main-panel">
        <header
          class="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div>
            <h1 class="text-4xl font-black tracking-tight text-stone-950">
              {{ state.language === "en" ? "Menu Items" : "รายการเมนูอาหาร" }}
            </h1>
            <p class="mt-2 text-sm text-stone-500 font-medium">
              {{
                state.language === "en"
                  ? "Check availability, ingredients, allergens, and item details."
                  : "ตรวจสอบสถานะอาหารพร้อมเสิร์ฟ วัตถุดิบ สารก่อภูมิแพ้ และรายละเอียดอื่น ๆ"
              }}
            </p>
          </div>
        </header>

        <section
          class="section-card overflow-hidden border border-stone-200/80 shadow-soft"
        >
          <div
            class="hidden bg-stone-50 border-b border-stone-200/60 px-6 py-4 text-xs font-black uppercase tracking-wider text-stone-500 lg:grid lg:grid-cols-[80px_1.4fr_.8fr_.8fr_1fr_.7fr_.9fr] lg:gap-4 items-center select-none"
          >
            <span class="text-center">{{
              state.language === "en" ? "Image" : "รูปอาหาร"
            }}</span>

            <span class="text-left">{{
              state.language === "en" ? "Item" : "เมนู"
            }}</span>

            <div
              @click="handleSort('category')"
              class="cursor-pointer flex items-center justify-center gap-1 py-1 h-7 transition"
              :class="
                sortBy === 'category'
                  ? 'text-brand border-b-2 border-brand font-black'
                  : 'hover:text-stone-800'
              "
            >
              {{ state.language === "en" ? "Category" : "หมวดหมู่" }}
            </div>

            <div
              @click="handleSort('price')"
              class="cursor-pointer flex items-center justify-center gap-1 py-1 h-7 transition"
              :class="
                sortBy === 'price'
                  ? 'text-brand border-b-2 border-brand font-black'
                  : 'hover:text-stone-800'
              "
            >
              {{ state.language === "en" ? "Price" : "ราคา" }}
            </div>

            <span class="text-center">{{
              state.language === "en" ? "Tags" : "แท็ก"
            }}</span>

            <div
              @click="handleSort('availability')"
              class="cursor-pointer flex items-center justify-center gap-1 py-1 h-7 transition"
              :class="
                sortBy === 'availability'
                  ? 'text-brand border-b-2 border-brand font-black'
                  : 'hover:text-stone-800'
              "
            >
              {{ state.language === "en" ? "Status" : "สถานะ" }}
            </div>

            <span class="text-center">{{
              state.language === "en" ? "Action" : "จัดการสถานะ"
            }}</span>
          </div>

          <div class="divide-y divide-stone-100">
            <article
              v-for="item in sortedMenuItems"
              :key="item.id"
              @click="selectedItem = item"
              class="cursor-pointer grid gap-4 p-6 grid-cols-1 lg:grid-cols-[80px_1.4fr_.8fr_.8fr_1fr_.7fr_.9fr] lg:gap-4 lg:items-center text-center lg:text-left transition-all duration-150"
              :class="
                item.availability === 'sold_out'
                  ? 'bg-stone-50/50 opacity-70 grayscale-[15%]'
                  : 'hover:bg-pale/20 hover:shadow-sm'
              "
            >
              <div class="flex justify-center">
                <img
                  :src="item.image"
                  :alt="item.name"
                  class="h-20 w-20 rounded-2xl object-cover shadow-sm border border-stone-100"
                />
              </div>

              <div class="space-y-1 text-center lg:text-left">
                <h2 class="font-black text-stone-900 text-base tracking-tight">
                  {{
                    state.language === "en"
                      ? item.name
                      : item.name_th || item.name
                  }}
                </h2>
                <p class="text-xs text-stone-500 leading-relaxed">
                  <span
                    class="font-bold uppercase tracking-wider text-[10px] text-stone-400 mr-1"
                  >
                    {{ state.language === "en" ? "Ingredients" : "วัตถุดิบ" }}:
                  </span>
                  {{
                    state.language === "en"
                      ? (item.ingredients || []).join(", ")
                      : (item.ingredients_th || item.ingredients || []).join(
                          ", ",
                        )
                  }}
                </p>
                <p class="text-xs text-stone-500 leading-relaxed">
                  <span
                    class="font-bold uppercase tracking-wider text-[10px] text-stone-400 mr-1"
                  >
                    {{
                      state.language === "en" ? "Allergens" : "สารก่อภูมิแพ้"
                    }}:
                  </span>
                  <span
                    :class="
                      (item.allergens || []).length
                        ? 'text-red-600 font-bold bg-red-50 px-1.5 py-0.5 rounded'
                        : ''
                    "
                  >
                    {{
                      (item.allergens || []).length
                        ? state.language === "en"
                          ? item.allergens.join(", ")
                          : (item.allergens_th || item.allergens).join(", ")
                        : state.language === "en"
                          ? "None"
                          : "ไม่มี"
                    }}
                  </span>
                </p>
              </div>

              <div
                class="flex justify-center text-center font-bold text-stone-700 text-sm"
              >
                {{ item.category }}
              </div>

              <div
                class="flex justify-center text-center font-extrabold text-brand text-base"
              >
                {{ item.price }} {{ state.language === "en" ? "Baht" : "บาท" }}
              </div>

              <div class="flex justify-center">
                <TagList
                  :tags="[
                    ...(item.taste_profiles || []).slice(0, 1),
                    ...(item.dietary_tags || []).slice(0, 1),
                  ]"
                />
              </div>

              <div class="flex justify-center">
                <StatusPill :status="item.availability" />
              </div>

              <div class="flex justify-center w-full">
                <button
                  class="w-full lg:w-auto rounded-md py-1 px-2.5 text-[10px] font-bold uppercase border transition-all active:scale-95 whitespace-nowrap"
                  :class="
                    item.availability === 'available'
                      ? 'bg-white border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300'
                      : 'bg-brand border-transparent text-white hover:bg-brandDark'
                  "
                  @click.stop="toggleAvailability(item.id, item.availability)"
                >
                  {{
                    item.availability === "available"
                      ? state.language === "en"
                        ? "Sold Out"
                        : "หมด"
                      : state.language === "en"
                        ? "Available"
                        : "พร้อมขาย"
                  }}
                </button>
              </div>
            </article>
          </div>
        </section>
      </main>
    </div>
    <MobileNav :items="navItems" />
  </div>
</template>
