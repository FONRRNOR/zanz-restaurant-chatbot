<script setup>
import { computed, reactive, ref, watch, onMounted } from "vue";
import { Pencil, Plus, Trash2, X, LayoutList, TableProperties } from "@lucide/vue";
import MobileNav from "../../components/MobileNav.vue";
import SideNav from "../../components/SideNav.vue";
import StatusPill from "../../components/StatusPill.vue";
import TagList from "../../components/TagList.vue";
import TopBar from "../../components/TopBar.vue";

// Import Supabase client database connection
import { supabase } from "../../supabaseClient";
import { useAppState } from "../../services/appState"; // Sync language variables

const { state } = useAppState();

const ownerNav = [
  { label: "Dashboard", to: "/owner/dashboard", short: "Home" },
  { label: "Menu Management", to: "/owner/menu-management", short: "Menu" },
  { label: "Orders", to: "/owner/orders" },
  { label: "Staff Accounts", to: "/owner/staff-accounts", short: "Staff" },
  { label: "Logout", to: "/logout", short: "Logout" },
];

const menuItems = ref([]);
const selected = ref(null);
const isLoading = ref(false);
const isModalOpen = ref(false); // Controls visibility for the "Add New" Modal Popup
const contentLanguage = ref("en"); // Used only for the traditional Edit form side-tab
const viewMode = ref("list"); // Controls view switching between 'list' and 'table'

// State for toast notifications
const alertInfo = ref({
  show: false,
  message: "",
  type: "success", // 'success' | 'error'
});

// Trigger custom notification toast
function triggerAlert(message, type = "success") {
  alertInfo.value = { show: true, message, type };
  setTimeout(() => {
    alertInfo.value.show = false;
  }, 3000);
}

// Form reactive states (Separated to prevent data collision)
const form = reactive({}); // For Side-by-Side traditional Edit Item
const addForm = reactive({}); // For Center-PopUp Add New Item

// 1. Fetch menu data from Supabase
async function fetchMenuItems() {
  isLoading.value = true;
  try {
    // Check global authentication fallback credentials
    const savedUserJson = sessionStorage.getItem("zank-active-user");
    if (!savedUserJson) throw new Error("No active session found.");
    const localUser = JSON.parse(savedUserJson);

    const { data, error } = await supabase
      .from("menu_items")
      .select("*")
      .is("is_deleted", false)
      .eq("restaurant_id", localUser.restaurant_id) // Query items paired with the correct store
      .order("id", { ascending: true });

    if (error) throw error;

    menuItems.value = data.map((item) => ({
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

    // Auto-select first item on load if available
    if (menuItems.value.length > 0 && !selected.value) {
      load(menuItems.value[0]);
    }
  } catch (error) {
    triggerAlert(state.language === 'en' ? "Error fetching data: " + error.message : "เกิดข้อผิดพลาดในการดึงข้อมูล", "error");
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  fetchMenuItems();
});

// 2. Load item data into the Edit Form
function load(item) {
  selected.value = item;
  Object.assign(form, {
    ...item,
    ingredientsText: (item.ingredients || []).join(", "),
    allergensText: (item.allergens || []).join(", "),
    dietaryText: (item.dietaryTags || []).join(", "),
    tasteText: (item.tasteProfiles || []).join(", "),
    ingredientsThText: (item.ingredientsTh || []).join(", "),
    allergensThText: (item.allergensTh || []).join(", "),
    dietaryThText: (item.dietaryTagsTh || []).join(", "),
    tasteThText: (item.tasteProfilesTh || []).join(", "),
  });
}

// Watch selected item to dynamically sync the edit form side-panel
watch(selected, (item) => item && load(item), { immediate: true });

// Check validation status for both forms
const complete = computed(
  () =>
    form.name &&
    form.nameTh &&
    form.category &&
    form.price &&
    form.description &&
    form.descriptionTh &&
    form.ingredientsText &&
    form.ingredientsThText &&
    form.tasteText &&
    form.tasteThText &&
    form.availability,
);

const addComplete = computed(
  () =>
    addForm.name &&
    addForm.nameTh &&
    addForm.category &&
    addForm.price &&
    addForm.description &&
    addForm.descriptionTh &&
    addForm.ingredientsText &&
    addForm.ingredientsThText &&
    addForm.tasteText &&
    addForm.tasteThText &&
    addForm.availability,
);

// 3. Submit Update for existing item (Side panel)
async function submitEdit() {
  const payload = {
    name: form.name,
    category: form.category,
    price: Number(form.price),
    description: form.description,
    image: form.image,
    ingredients: form.ingredientsText
      ? form.ingredientsText
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      : [],
    allergens: form.allergensText
      ? form.allergensText
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      : [],
    dietary_tags: form.dietaryText
      ? form.dietaryText
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      : [],
    taste_profiles: form.tasteText
      ? form.tasteText
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      : [],
    name_th: form.nameTh,
    description_th: form.descriptionTh,
    ingredients_th: form.ingredientsThText
      ? form.ingredientsThText
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      : [],
    allergens_th: form.allergensThText
      ? form.allergensThText
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      : [],
    dietary_tags_th: form.dietaryThText
      ? form.dietaryThText
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      : [],
    taste_profiles_th: form.tasteThText
      ? form.tasteThText
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      : [],
    spice_level: form.spiceLevel,
    availability: form.availability,
  };

  try {
    const { error } = await supabase
      .from("menu_items")
      .update(payload)
      .eq("id", form.id);
    if (error) throw error;

    await fetchMenuItems();
    triggerAlert(state.language === 'en' ? "Item updated successfully!" : "อัปเดตเมนูสำเร็จแล้ว", "success");

    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    triggerAlert(state.language === 'en' ? "Error updating data: " + error.message : "เกิดข้อผิดพลาดในการอัปเดตข้อมูล", "error");
  }
}

// 4. Initialize empty form states and Open the Modal for Adding New Item
function addNew() {
  Object.assign(addForm, {
    name: "",
    nameTh: "",
    category: "Main Courses",
    price: 0,
    image: "",
    description: "",
    descriptionTh: "",
    ingredientsText: "",
    ingredientsThText: "",
    allergensText: "",
    allergensThText: "",
    dietaryText: "",
    dietaryThText: "",
    tasteText: "",
    tasteThText: "",
    spiceLevel: "None",
    availability: "available",
  });
  isModalOpen.value = true;
}

// 5. Submit Insertion for new item (Modal)
async function submitAdd() {
  try {
    const savedUserJson = localStorage.getItem("zank-active-user");
    if (!savedUserJson) throw new Error("No active session found.");
    const localUser = JSON.parse(savedUserJson);

    const payload = {
      restaurant_id: localUser.restaurant_id, 
      name: addForm.name,
      category: addForm.category,
      price: Number(addForm.price),
      description: addForm.description,
      image: addForm.image,
      ingredients: addForm.ingredientsText
        ? addForm.ingredientsText
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)
        : [],
      allergens: addForm.allergensText
        ? addForm.allergensText
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)
        : [],
      dietary_tags: addForm.dietaryText
        ? addForm.dietaryText
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)
        : [],
      taste_profiles: addForm.tasteText
        ? addForm.tasteText
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)
        : [],
      name_th: addForm.nameTh,
      description_th: addForm.descriptionTh,
      ingredients_th: addForm.ingredientsThText
        ? addForm.ingredientsThText
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)
        : [],
      allergens_th: addForm.allergensThText
        ? addForm.allergensThText
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)
        : [],
      dietary_tags_th: addForm.dietaryThText
        ? addForm.dietaryThText
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)
        : [],
      taste_profiles_th: addForm.tasteThText
        ? addForm.tasteThText
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean)
        : [],
      spice_level: addForm.spiceLevel,
      availability: addForm.availability,
    };

    const { error } = await supabase.from("menu_items").insert([payload]);
    if (error) throw error;

    isModalOpen.value = false;
    await fetchMenuItems();
    triggerAlert(state.language === 'en' ? "New item added successfully!" : "เพิ่มรายการเมนูใหม่สำเร็จแล้ว!", "success");

    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    triggerAlert(state.language === 'en' ? "Error creating item: " + error.message : "เกิดข้อผิดพลาดในการสร้างรายการใหม่", "error");
  }
}

// 6. Soft Delete item from Supabase
async function removeItem(item) {
  const confirmMsg = state.language === 'en' 
    ? `Are you sure you want to delete ${item.name}?` 
    : `คุณแน่ใจหรือไม่ว่าต้องการลบ ${item.nameTh || item.name}?`;
    
  if (!confirm(confirmMsg)) return;

  try {
    // Switch from using .delete() to updating the is_deleted flag to true
    const { error } = await supabase
      .from("menu_items")
      .update({ is_deleted: true })
      .eq("id", item.id);
      
    if (error) throw error;

    // Update the UI by removing the item from the array
    menuItems.value = menuItems.value.filter((i) => i.id !== item.id);
    if (menuItems.value.length > 0) {
      load(menuItems.value[0]);
    } else {
      selected.value = null;
    }
    
    triggerAlert(state.language === 'en' ? "Item deleted successfully." : "ลบรายการเมนูสำเร็จแล้ว", "success");
  } catch (error) {
    triggerAlert(state.language === 'en' ? "Error deleting item: " + error.message : "เกิดข้อผิดพลาดในการลบรายการ", "error");
  }
}
</script>

<template>
  <div class="page-shell relative">
    
    <!-- แจ้งเตือน Toast Notification -->
    <Transition
      enter-active-class="transform ease-out duration-300 transition"
      enter-from-class="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2"
      enter-to-class="translate-y-0 opacity-100 sm:translate-x-0"
      leave-active-class="transition ease-in duration-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="alertInfo.show"
        class="fixed top-5 right-5 z-[999] flex items-center w-full max-w-xs p-4 rounded-xl shadow-lg border text-sm font-bold tracking-tight"
        :class="
          alertInfo.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-red-50 border-red-200 text-red-800'
        "
      >
        <div class="mr-3 flex-shrink-0">
          <span v-if="alertInfo.type === 'success'"></span>
          <span v-else></span>
        </div>
        <div>{{ alertInfo.message }}</div>
      </div>
    </Transition>

    <TopBar owner search-placeholder="Search menu items or ingredients" />
    <div class="content-shell">
      <SideNav :items="ownerNav" />
      <main class="main-panel">
        <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 class="text-4xl font-black">
              {{ state.language === 'en' ? 'Menu Management' : 'การจัดการรายการเมนู' }}
            </h1>
            <p class="mt-2 text-muted">
              {{ state.language === 'en' ? 'Manage dishes, ingredients, allergens, taste profiles, and availability.' : 'จัดการรายละเอียดอาหาร, ส่วนผสม, สารก่อภูมิแพ้, รสชาติ และสถานะการขาย' }}
            </p>
          </div>
          
          <div class="flex items-center gap-3">
            <button
              class="primary-btn inline-flex items-center gap-2"
              @click="addNew"
            >
              <Plus :size="18" /> {{ state.language === 'en' ? 'Add Menu Item' : 'เพิ่มรายการเมนูใหม่' }}
            </button>
          </div>
        </div>

        <section class="grid gap-6 xl:grid-cols-[1fr_420px] items-start">
          
          <article class="section-card overflow-hidden">
            <div v-if="isLoading" class="p-5 text-center text-muted">
              Loading menu items...
            </div>
            <div v-else>
              <div v-if="viewMode === 'list'" class="divide-y divide-stone-100">
                <article
                  v-for="item in menuItems"
                  :key="item.id"
                  class="grid cursor-pointer gap-4 p-5 transition hover:bg-pale lg:grid-cols-[80px_1.2fr_.7fr_.7fr_1fr_auto] lg:items-center"
                  :class="selected?.id === item.id ? 'bg-pale ring-2 ring-brand/20' : ''"
                  @click="load(item)"
                >
                  <img
                    :src="item.image"
                    :alt="item.name"
                    class="h-20 w-20 rounded-2xl object-cover"
                  />
                  <div>
                    <strong>{{ state.language === 'th' ? (item.nameTh || item.name) : item.name }}</strong>
                    <p v-if="item.nameTh && state.language === 'en'" class="text-sm font-semibold text-brand">
                      {{ item.nameTh }}
                    </p>
                    <p class="text-sm text-muted">{{ item.category }}</p>
                  </div>
                  <span class="font-bold text-brand">{{ item.price }} Baht</span>
                  <StatusPill :status="item.availability" />
                  <TagList
                    :tags="[
                      ...item.tasteProfiles.slice(0, 1),
                      ...item.allergens.slice(0, 1).map((a) => `Contains ${a}`),
                    ]"
                  />
                  <div class="flex flex-wrap gap-2">
                    <button
                      class="rounded-full border border-red-100 px-4 py-2 text-sm font-bold text-red-600 transition hover:bg-red-50 bg-white"
                      @click.stop="removeItem(item)"
                    >
                      <Trash2 :size="16" class="inline" /> {{ state.language === 'en' ? 'Delete' : 'ลบออก' }}
                    </button>
                  </div>
                </article>
              </div>

              <div v-else class="overflow-x-auto custom-scrollbar">
                <table class="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr class="bg-stone-50 border-b border-stone-100 text-stone-600 text-sm font-bold">
                      <th class="p-4 w-24">{{ state.language === 'en' ? 'Image' : 'รูปภาพ' }}</th>
                      <th class="p-4">{{ state.language === 'en' ? 'Name' : 'ชื่อเมนู' }}</th>
                      <th class="p-4">{{ state.language === 'en' ? 'Category' : 'หมวดหมู่' }}</th>
                      <th class="p-4">{{ state.language === 'en' ? 'Price' : 'ราคา' }}</th>
                      <th class="p-4">{{ state.language === 'en' ? 'Status' : 'สถานะ' }}</th>
                      <th class="p-4 text-center">{{ state.language === 'en' ? 'Actions' : 'จัดการ' }}</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-stone-100 text-sm">
                    <tr 
                      v-for="item in menuItems" 
                      :key="item.id"
                      class="hover:bg-pale cursor-pointer transition"
                      :class="selected?.id === item.id ? 'bg-pale font-medium ring-1 ring-brand/10' : ''"
                      @click="load(item)"
                    >
                      <td class="p-4">
                        <img :src="item.image" :alt="item.name" class="h-12 w-12 rounded-xl object-cover" />
                      </td>
                      <td class="p-4">
                        <div class="font-bold text-stone-800">
                          {{ state.language === 'th' ? (item.nameTh || item.name) : item.name }}
                        </div>
                        <div v-if="state.language === 'en' && item.nameTh" class="text-xs text-brand font-medium">
                          {{ item.nameTh }}
                        </div>
                      </td>
                      <td class="p-4 text-stone-500">{{ item.category }}</td>
                      <td class="p-4 font-bold text-brand">{{ item.price }} ฿</td>
                      <td class="p-4">
                        <StatusPill :status="item.availability" />
                      </td>
                      <td class="p-4 text-center" @click.stop>
                        <button 
                          class="p-2 text-red-600 hover:bg-red-50 rounded-xl transition"
                          @click="removeItem(item)"
                        >
                          <Trash2 :size="18" />
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </article>

          <form
            class="section-card p-5 sticky top-24 shadow-strong z-10 flex flex-col h-[calc(100vh-130px)] bg-white overflow-hidden"
            @submit.prevent="submitEdit"
          >
            <div class="flex-none border-b border-stone-100 pb-3">
              <div class="flex items-center justify-between mb-3">
                <h2 class="text-xl font-black">
                  {{ state.language === 'en' ? 'Edit Item' : 'แก้ไขข้อมูลเมนู' }}
                </h2>
                <span
                  class="rounded-full px-3 py-1 text-xs font-bold"
                  :class="complete ? 'bg-pale text-brand' : 'bg-orange-50 text-orange-700'"
                >
                  {{ complete ? (state.language === 'en' ? "Complete" : "ข้อมูลครบถ้วน") : (state.language === 'en' ? "Missing data" : "ข้อมูลไม่ครบ") }}
                </span>
              </div>
              <div class="grid grid-cols-2 rounded-2xl bg-pale p-1">
                <button
                  type="button"
                  class="rounded-xl px-4 py-2 text-sm font-black transition"
                  :class="contentLanguage === 'en' ? 'bg-white text-brand shadow-sm' : 'text-muted'"
                  @click="contentLanguage = 'en'"
                >
                  English
                </button>
                <button
                  type="button"
                  class="rounded-xl px-4 py-2 text-sm font-black transition"
                  :class="contentLanguage === 'th' ? 'bg-white text-brand shadow-sm' : 'text-muted'"
                  @click="contentLanguage = 'th'"
                >
                  ภาษาไทย
                </button>
              </div>
            </div>

            <div class="flex-1 overflow-y-auto py-4 pr-1 grid gap-4 content-start custom-scrollbar">
              
              <div v-if="contentLanguage === 'en'" class="grid gap-3">
                <input v-model="form.name" class="field" placeholder="English name" />
                <textarea v-model="form.description" class="field h-28" placeholder="English description"></textarea>
                <textarea v-model="form.ingredientsText" class="field h-24" placeholder="English ingredients, comma separated"></textarea>
                <input v-model="form.allergensText" class="field" placeholder="English allergens, comma separated" />
                <input v-model="form.dietaryText" class="field" placeholder="English dietary tags" />
                <input v-model="form.tasteText" class="field" placeholder="English taste profile" />
              </div>

              <div v-else class="grid gap-3">
                <input v-model="form.nameTh" class="field" placeholder="ชื่อเมนูภาษาไทย" />
                <textarea v-model="form.descriptionTh" class="field h-28" placeholder="คำอธิบายภาษาไทย"></textarea>
                <textarea v-model="form.ingredientsThText" class="field h-24" placeholder="วัตถุดิบภาษาไทย คั่นด้วยเครื่องหมายจุลภาค"></textarea>
                <input v-model="form.allergensThText" class="field" placeholder="สารก่อภูมิแพ้ภาษาไทย" />
                <input v-model="form.dietaryThText" class="field" placeholder="แท็กประเภทอาหารภาษาไทย" />
                <input v-model="form.tasteThText" class="field" placeholder="รสชาติภาษาไทย" />
              </div>

              <div class="grid gap-3 sm:grid-cols-2">
                <select v-model="form.category" class="field">
                  <option>Starters</option>
                  <option>Main Courses</option>
                  <option>Drinks</option>
                </select>
                <input v-model="form.price" class="field" type="number" placeholder="Price" />
              </div>
              
              <input v-model="form.image" class="field" placeholder="Image URL" />
              
              <div class="grid gap-3 sm:grid-cols-2">
                <select v-model="form.spiceLevel" class="field">
                  <option>None</option>
                  <option>Mild</option>
                  <option>Medium</option>
                  <option>Hot</option>
                </select>
                <select v-model="form.availability" class="field">
                  <option value="available">Available</option>
                  <option value="sold_out">Sold out</option>
                </select>
              </div>
            </div>

            <div class="flex-none border-t border-stone-100 pt-3 bg-white">
              <button class="primary-btn w-full bg-brand text-white py-3 font-bold rounded-2xl shadow-md transition hover:opacity-90">
                {{ state.language === 'en' ? 'Update Item Changes' : 'บันทึกการแก้ไขเมนู' }}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
    <MobileNav :items="ownerNav" />

    <div
      v-if="isModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <form
        class="bg-white rounded-3xl shadow-2xl w-full max-w-7xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        @submit.prevent="submitAdd"
      >
        <div class="border-b border-stone-100 p-5 flex items-center justify-between bg-stone-50">
          <div>
            <h2 class="text-2xl font-black text-stone-800">Add New Menu Item</h2>
            <p class="text-sm text-stone-500">Fill out English content, Thai translations, and system configuration.</p>
          </div>
          <div class="flex items-center gap-3">
            <span class="rounded-full px-3 py-1 text-xs font-bold" :class="addComplete ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'">
              {{ addComplete ? "Data Ready" : "Incomplete" }}
            </span>
            <button type="button" class="text-stone-400 hover:text-stone-600 p-1" @click="isModalOpen = false">
              <X :size="20" />
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 overflow-y-auto bg-white divide-y lg:divide-y-0 lg:divide-x divide-stone-100">
          <div class="grid gap-4 content-start lg:pr-2">
            <h3 class="text-sm font-bold text-brand uppercase tracking-wider">English Details</h3>
            <div class="grid gap-2 border border-stone-100 p-4 rounded-2xl bg-stone-50/50 content-start">
              <span class="text-xs font-bold text-stone-400 mb-1 block">ENGLISH</span>
              <input v-model="addForm.name" class="field" placeholder="English name" required />
              <textarea v-model="addForm.description" class="field h-20" placeholder="English description"></textarea>
              <textarea v-model="addForm.ingredientsText" class="field h-16" placeholder="Ingredients (comma separated)"></textarea>
              <input v-model="addForm.allergensText" class="field" placeholder="Allergens (comma separated)" />
              <input v-model="addForm.dietaryText" class="field" placeholder="Dietary tags" />
              <input v-model="addForm.tasteText" class="field" placeholder="Taste profile" />
            </div>
          </div>

          <div class="grid gap-4 pt-6 lg:pt-0 lg:px-4 content-start">
            <h3 class="text-sm font-bold text-brand uppercase tracking-wider">Thai Translations</h3>
            <div class="grid gap-2 border border-stone-100 p-4 rounded-2xl bg-stone-50/50 content-start">
              <span class="text-xs font-bold text-stone-400 mb-1 block">THAI LANGUAGE</span>
              <input v-model="addForm.nameTh" class="field" placeholder="ชื่อเมนูภาษาไทย" required />
              <textarea v-model="addForm.descriptionTh" class="field h-20" placeholder="คำอธิบายภาษาไทย"></textarea>
              <textarea v-model="addForm.ingredientsThText" class="field h-16" placeholder="วัตถุดิบภาษาไทย (คั่นด้วยเครื่องหมายจุลภาค)"></textarea>
              <input v-model="addForm.allergensThText" class="field" placeholder="สารก่อภูมิแพ้ภาษาไทย" />
              <input v-model="addForm.dietaryThText" class="field" placeholder="แท็กประเภทอาหารภาษาไทย" />
              <input v-model="addForm.tasteThText" class="field" placeholder="รสชาติภาษาไทย" />
            </div>
          </div>

          <div class="grid gap-4 pt-6 lg:pt-0 lg:pl-6 content-start">
            <h3 class="text-sm font-bold text-stone-500 uppercase tracking-wider">System Configuration</h3>
            <div class="grid gap-4 border border-stone-100 p-4 rounded-2xl bg-stone-50/50 content-start">
              <div>
                <label class="text-xs font-bold text-stone-400 mb-1 block">Category</label>
                <select v-model="addForm.category" class="field">
                  <option>Starters</option>
                  <option>Main Courses</option>
                  <option>Drinks</option>
                </select>
              </div>

              <div>
                <label class="text-xs font-bold text-stone-400 mb-1 block">Price (Baht)</label>
                <input v-model="addForm.price" class="field" type="number" placeholder="Price" required />
              </div>

              <div>
                <label class="text-xs font-bold text-stone-400 mb-1 block">Image URL</label>
                <input v-model="addForm.image" class="field" placeholder="https://images.unsplash.com/..." />
                <div v-if="addForm.image" class="mt-2 h-28 w-full rounded-xl overflow-hidden border border-stone-200">
                  <img :src="addForm.image" class="h-full w-full object-cover" alt="Preview" />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3 mt-1">
                <div>
                  <label class="text-xs font-bold text-stone-400 mb-1 block">Spice Level</label>
                  <select v-model="addForm.spiceLevel" class="field">
                    <option>None</option>
                    <option>Mild</option>
                    <option>Medium</option>
                    <option>Hot</option>
                  </select>
                </div>
                <div>
                  <label class="text-xs font-bold text-stone-400 mb-1 block">Availability</label>
                  <select v-model="addForm.availability" class="field">
                    <option value="available">Available</option>
                    <option value="sold_out">Sold out</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="border-t border-stone-100 p-4 bg-stone-50 flex items-center justify-end gap-3">
          <button type="button" class="secondary-btn px-5 py-2.5" @click="isModalOpen = false">Cancel</button>
          <button type="submit" class="primary-btn px-6 py-2.5">Create New Item</button>
        </div>
      </form>
    </div>
  </div>
</template>