<script setup>
import { watch, onMounted, onUnmounted } from "vue";
import { Plus, Trash2, X } from "@lucide/vue";

import MobileNav from "../../components/common/MobileNav.vue";
import SideNav from "../../components/common/SideNav.vue";
import StatusPill from "../../components/common/StatusPill.vue";
import TagList from "../../components/common/TagList.vue";
import TopBar from "../../components/common/TopBar.vue";
import RecommendMenuModal from "../../components/menu/RecommendMenuModal.vue";

import { useAppState } from "../../services/appState";
// เรียกใช้ Composable ใหม่ที่เพิ่งสร้าง
import { useOwnerMenu } from "../../composables/owner/useOwnerMenu"; 

const { state } = useAppState();

const ownerNav = [
  { label: "Dashboard", to: "/owner/dashboard", short: "Home" },
  { label: "Menu Management", to: "/owner/menu-management", short: "Menu" },
  { label: "Orders", to: "/owner/orders" },
  { label: "Staff Accounts", to: "/owner/staff-accounts", short: "Staff" },
  { label: "Logout", to: "/logout", short: "Logout" },
];

// Destructure ทุกอย่างที่ต้องใช้ใน UI ออกมาจาก Composable
const {
  menuItems, selected, isLoading,
  isModalOpen, isEditModalOpen, isRecommendModalOpen,
  contentLanguage, viewMode, filterMode,
  alertInfo, showDeleteModal, itemToDelete, isDeleting,
  form, addForm,
  recommendedItems, displayMenuItems, complete, addComplete,
  triggerAlert, fetchMenuItems, load, promptDelete, confirmDelete, submitEdit, addNew, submitAdd
} = useOwnerMenu(state);

const handleResize = () => {
  if (window.innerWidth >= 1280 && isEditModalOpen.value) {
    isEditModalOpen.value = false;
  }
};

onMounted(() => {
  fetchMenuItems();
  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
});

watch(selected, (item) => item && load(item, false), { immediate: true });
</script>

<template>
  <div class="page-shell relative">
    <!-- Toast Notification -->
    <Transition
      enter-active-class="transform ease-out duration-300 transition"
      enter-from-class="translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-10"
      enter-to-class="translate-y-0 opacity-100 sm:translate-x-0"
      leave-active-class="transition ease-in duration-200"
      leave-from-class="opacity-100 sm:translate-x-0"
      leave-to-class="opacity-0 sm:translate-x-10"
    >
      <div
        v-if="alertInfo.show"
        class="fixed top-24 right-5 sm:top-5 sm:right-5 z-[999] flex items-center w-full max-w-xs p-4 rounded-2xl shadow-xl shadow-stone-900/5 border text-sm font-bold tracking-tight"
        :class="
          alertInfo.type === 'success'
            ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
            : 'bg-red-50 border-red-100 text-red-800'
        "
      >
        <div class="mr-3 flex-shrink-0">
          <svg
            v-if="alertInfo.type === 'success'"
            class="w-6 h-6 text-emerald-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <svg
            v-else
            class="w-6 h-6 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div class="flex-1">{{ alertInfo.message }}</div>
        <button @click="alertInfo.show = false" class="ml-2 text-stone-400 hover:text-stone-600">
          <X size="16" />
        </button>
      </div>
    </Transition>

    <TopBar owner search-placeholder="Search menu items or ingredients" />
    <div class="content-shell">
      <SideNav :items="ownerNav" />
      <main class="main-panel">
        <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 class="text-4xl font-black">
              {{ state.language === "en" ? "Menu Management" : "การจัดการรายการเมนู" }}
            </h1>
            <p class="mt-2 text-muted">
              {{ state.language === "en" ? "Manage dishes, ingredients, allergens, taste profiles, and availability." : "จัดการรายละเอียดอาหาร, ส่วนผสม, สารก่อภูมิแพ้, รสชาติ และสถานะการขาย" }}
            </p>
          </div>

          <div class="flex items-center gap-3">
            <button
              type="button"
              class="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-sm hover:shadow transition-all active:scale-95"
              @click="isRecommendModalOpen = true"
            >
              <span>{{ state.language === "en" ? "Recommend Menus" : "จัดการเมนูแนะนำ" }}</span>
            </button>
            <button
              type="button"
              class="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold bg-brand hover:opacity-90 text-white shadow-sm hover:shadow transition-all active:scale-95"
              @click="addNew"
            >
              <Plus :size="18" />
              <span>{{ state.language === "en" ? "Add Menu Item" : "เพิ่มรายการเมนูใหม่" }}</span>
            </button>
          </div>
        </div>

        <section class="grid gap-6 xl:grid-cols-[1fr_420px] items-start">
          <article class="section-card overflow-hidden">
            <div v-if="isLoading" class="p-5 text-center text-muted">Loading menu items...</div>
            <div v-else>
              <!-- กล่องไฮไลท์เมนูแนะนำด้านบน -->
              <div v-if="recommendedItems.length > 0" class="p-5 bg-amber-50/50 border-b border-amber-100">
                <div class="flex items-center justify-between mb-3">
                  <div class="flex items-center gap-2">
                    <span class="p-1.5 bg-amber-500 text-white rounded-xl flex items-center justify-center"></span>
                    <h3 class="font-black text-stone-800 text-sm sm:text-base">
                      {{ state.language === "en" ? "Recommended Items" : "เมนูแนะนำประจำร้าน" }}
                    </h3>
                    <span class="text-xs font-bold text-amber-800 bg-amber-100/80 px-2.5 py-0.5 rounded-full border border-amber-200/60">
                      {{ recommendedItems.length }}
                    </span>
                  </div>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  <div
                    v-for="rec in recommendedItems"
                    :key="'rec-' + rec.id"
                    @click="load(rec, true)"
                    class="bg-white p-2.5 rounded-2xl border border-amber-200/70 shadow-sm hover:shadow transition cursor-pointer flex items-center gap-3 active:scale-98"
                    :class="selected?.id === rec.id ? 'ring-2 ring-amber-500 border-transparent' : ''"
                  >
                    <img :src="rec.image || 'https://via.placeholder.com/150'" class="w-11 h-11 rounded-xl object-cover bg-stone-100 shrink-0" :alt="rec.name" />
                    <div class="min-w-0 flex-1">
                      <p class="font-bold text-stone-800 text-xs sm:text-sm truncate">
                        {{ state.language === "th" ? rec.nameTh || rec.name : rec.name }}
                      </p>
                      <p class="text-xs font-black text-amber-600 mt-0.5">{{ rec.price }} ฿</p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- แถบเลือกสลับดู Filter -->
              <div class="px-5 py-3 border-b border-stone-100 bg-stone-50/70 flex items-center justify-between gap-3">
                <div class="flex gap-2">
                  <button
                    type="button"
                    @click="filterMode = 'all'"
                    class="px-3.5 py-1.5 rounded-xl text-xs font-bold transition"
                    :class="filterMode === 'all' ? 'bg-white shadow-sm text-stone-900 border border-stone-200' : 'text-stone-500 hover:text-stone-800'"
                  >
                    {{ state.language === "en" ? "All Menus" : "รายการทั้งหมด" }} ({{ menuItems.length }})
                  </button>
                  <button
                    type="button"
                    @click="filterMode = 'recommended'"
                    class="px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                    :class="filterMode === 'recommended' ? 'bg-amber-500 text-white shadow-sm' : 'text-stone-500 hover:text-stone-800'"
                  >
                    <span>{{ state.language === "en" ? "Recommended Only" : "เฉพาะเมนูแนะนำ" }}</span>
                    <span>({{ recommendedItems.length }})</span>
                  </button>
                </div>
                <span class="text-xs text-stone-400 font-medium">
                  {{ displayMenuItems.length }} {{ state.language === "en" ? "items" : "รายการ" }}
                </span>
              </div>

              <!-- List View -->
              <div v-if="viewMode === 'list'" class="divide-y divide-stone-100">
                <article
                  v-for="item in displayMenuItems"
                  :key="item.id"
                  class="grid cursor-pointer gap-4 p-5 transition hover:bg-pale lg:grid-cols-[80px_1.2fr_.7fr_.7fr_1fr_auto] lg:items-center"
                  :class="selected?.id === item.id ? 'bg-pale ring-2 ring-brand/20' : ''"
                  @click="load(item, true)"
                >
                  <div class="relative h-20 w-20 shrink-0">
                    <img :src="item.image || 'https://via.placeholder.com/150'" :alt="item.name" class="h-20 w-20 rounded-2xl object-cover bg-stone-100 shadow-sm" />
                    <span v-if="item.isRecommended" class="absolute -top-1.5 -right-1.5 p-1 bg-amber-500 text-white rounded-full shadow-sm"></span>
                  </div>
                  <div>
                    <div class="flex items-center gap-2 flex-wrap">
                      <strong>{{ state.language === "th" ? item.nameTh || item.name : item.name }}</strong>
                      <span v-if="item.isRecommended" class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-200/80 rounded-md">
                        {{ state.language === "en" ? "REC" : "แนะนำ" }}
                      </span>
                    </div>
                    <p v-if="item.nameTh && state.language === 'en'" class="text-sm font-semibold text-brand">{{ item.nameTh }}</p>
                    <p class="text-sm text-muted">{{ item.category }}</p>
                  </div>
                  <span class="font-bold text-brand">{{ item.price }} {{ state.language === "th" ? "บาท" : "Baht" }}</span>
                  <StatusPill :status="item.availability" />
                  <TagList :tags="[...item.tasteProfiles.slice(0, 1), ...item.allergens.slice(0, 1).map((a) => `Contains ${a}`)]" />
                  <div class="flex flex-wrap gap-2">
                    <button class="w-10 h-10 rounded-full border border-red-200 bg-white text-red-600 transition hover:bg-red-100 hover:border-red-300 flex items-center justify-center" @click.stop="promptDelete(item)">
                      <Trash2 :size="16" />
                    </button>
                  </div>
                </article>

                <div v-if="displayMenuItems.length === 0" class="p-10 text-center text-stone-400 text-sm">
                  {{ state.language === "en" ? "No items match your filter." : "ไม่พบรายการเมนูตามตัวกรองที่เลือก" }}
                </div>
              </div>
            </div>
          </article>

          <!-- Edit Form (Side Panel Only on Desktop xl screens >= 1280px) -->
          <form class="hidden xl:flex section-card p-5 sticky top-24 shadow-strong z-10 flex-col h-[calc(100vh-130px)] bg-white overflow-hidden" @submit.prevent="submitEdit">
            <div class="flex-none border-b border-stone-100 pb-3">
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <h2 class="text-xl font-black">{{ state.language === "en" ? "Edit Item" : "แก้ไขข้อมูลเมนู" }}</h2>
                  <span v-if="form.isRecommended" class="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-black bg-amber-100 text-amber-800 rounded-md border border-amber-200">
                    {{ state.language === "en" ? "Recommended" : "เมนูแนะนำ" }}
                  </span>
                </div>
                <span class="rounded-full px-3 py-1 text-xs font-bold" :class="complete ? 'bg-pale text-brand' : 'bg-orange-50 text-orange-700'">
                  {{ complete ? (state.language === "en" ? "Complete" : "ข้อมูลครบถ้วน") : (state.language === "en" ? "Missing data" : "ข้อมูลไม่ครบ") }}
                </span>
              </div>
              <div class="grid grid-cols-2 rounded-2xl bg-pale p-1">
                <button type="button" class="rounded-xl px-4 py-2 text-sm font-black transition" :class="contentLanguage === 'en' ? 'bg-white text-brand shadow-sm' : 'text-muted'" @click="contentLanguage = 'en'">English</button>
                <button type="button" class="rounded-xl px-4 py-2 text-sm font-black transition" :class="contentLanguage === 'th' ? 'bg-white text-brand shadow-sm' : 'text-muted'" @click="contentLanguage = 'th'">ภาษาไทย</button>
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
                {{ state.language === "en" ? "Update Item Changes" : "บันทึกการแก้ไขเมนู" }}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
    <MobileNav :items="ownerNav" />

    <!-- Edit Item Modal (For iPad & Mobile Screens) -->
    <div v-if="isEditModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm xl:hidden">
      <form class="bg-white rounded-3xl shadow-2xl w-full max-w-7xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200" @submit.prevent="submitEdit">
        <div class="border-b border-stone-100 p-4 md:p-5 flex items-center justify-between bg-stone-50 shrink-0">
          <div>
            <h2 class="text-xl md:text-2xl font-black text-stone-800">{{ state.language === "en" ? "Edit Menu Item" : "แก้ไขข้อมูลเมนู" }}</h2>
            <p class="text-xs md:text-sm text-stone-500">Update English content, Thai translations, and configuration.</p>
          </div>
          <div class="flex items-center gap-3">
            <span class="rounded-full px-3 py-1 text-[10px] md:text-xs font-bold whitespace-nowrap" :class="complete ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'">
              {{ complete ? "Data Ready" : "Incomplete" }}
            </span>
            <button type="button" class="text-stone-400 hover:text-stone-600 p-1 bg-white rounded-full shadow-sm" @click="isEditModalOpen = false">
              <X :size="20" />
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-4 md:p-6 overflow-y-auto bg-white divide-y md:divide-y-0 md:divide-x divide-stone-100">
          <div class="grid gap-4 content-start md:pr-4 lg:pr-2">
            <h3 class="text-sm font-bold text-brand uppercase tracking-wider">English Details</h3>
            <div class="grid gap-2 border border-stone-100 p-4 rounded-2xl bg-stone-50/50 content-start shadow-sm">
              <span class="text-[10px] font-bold text-stone-400 mb-1 block">ENGLISH</span>
              <input v-model="form.name" class="field" placeholder="English name" required />
              <textarea v-model="form.description" class="field h-20" placeholder="English description"></textarea>
              <textarea v-model="form.ingredientsText" class="field h-16" placeholder="Ingredients (comma separated)"></textarea>
              <input v-model="form.allergensText" class="field" placeholder="Allergens (comma separated)" />
              <input v-model="form.dietaryText" class="field" placeholder="Dietary tags" />
              <input v-model="form.tasteText" class="field" placeholder="Taste profile" />
            </div>
          </div>

          <div class="grid gap-4 pt-6 md:pt-0 md:pl-4 lg:px-4 content-start">
            <h3 class="text-sm font-bold text-brand uppercase tracking-wider">Thai Translations</h3>
            <div class="grid gap-2 border border-stone-100 p-4 rounded-2xl bg-stone-50/50 content-start shadow-sm">
              <span class="text-[10px] font-bold text-stone-400 mb-1 block">THAI LANGUAGE</span>
              <input v-model="form.nameTh" class="field" placeholder="ชื่อเมนูภาษาไทย" required />
              <textarea v-model="form.descriptionTh" class="field h-20" placeholder="คำอธิบายภาษาไทย"></textarea>
              <textarea v-model="form.ingredientsThText" class="field h-16" placeholder="วัตถุดิบภาษาไทย (คั่นด้วยเครื่องหมายจุลภาค)"></textarea>
              <input v-model="form.allergensThText" class="field" placeholder="สารก่อภูมิแพ้ภาษาไทย" />
              <input v-model="form.dietaryThText" class="field" placeholder="แท็กประเภทอาหารภาษาไทย" />
              <input v-model="form.tasteThText" class="field" placeholder="รสชาติภาษาไทย" />
            </div>
          </div>

          <div class="grid gap-4 pt-6 lg:pt-0 md:col-span-2 lg:col-span-1 lg:pl-6 content-start">
            <h3 class="text-sm font-bold text-stone-500 uppercase tracking-wider">System Configuration</h3>
            <div class="grid gap-4 border border-stone-100 p-4 rounded-2xl bg-stone-50/50 content-start shadow-sm">
              <div class="grid grid-cols-2 lg:grid-cols-1 gap-4">
                <div>
                  <label class="text-[10px] font-bold text-stone-400 mb-1 block uppercase">Category</label>
                  <select v-model="form.category" class="field">
                    <option>Starters</option>
                    <option>Main Courses</option>
                    <option>Drinks</option>
                  </select>
                </div>
                <div>
                  <label class="text-[10px] font-bold text-stone-400 mb-1 block uppercase">Price (Baht)</label>
                  <input v-model="form.price" class="field" type="number" placeholder="Price" required />
                </div>
              </div>
              <div>
                <label class="text-[10px] font-bold text-stone-400 mb-1 block uppercase">Image URL</label>
                <input v-model="form.image" class="field" placeholder="https://images.unsplash.com/..." />
                <div v-if="form.image" class="mt-2 h-24 w-full rounded-xl overflow-hidden border border-stone-200">
                  <img :src="form.image" class="h-full w-full object-cover" alt="Preview" />
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3 mt-1">
                <div>
                  <label class="text-[10px] font-bold text-stone-400 mb-1 block uppercase">Spice Level</label>
                  <select v-model="form.spiceLevel" class="field">
                    <option>None</option>
                    <option>Mild</option>
                    <option>Medium</option>
                    <option>Hot</option>
                  </select>
                </div>
                <div>
                  <label class="text-[10px] font-bold text-stone-400 mb-1 block uppercase">Availability</label>
                  <select v-model="form.availability" class="field">
                    <option value="available">Available</option>
                    <option value="sold_out">Sold out</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="border-t border-stone-100 p-4 bg-stone-50 flex items-center justify-end gap-3 shrink-0">
          <button type="button" class="secondary-btn px-5 py-2.5 font-bold" @click="isEditModalOpen = false">Cancel</button>
          <button type="submit" class="primary-btn px-6 py-2.5 shadow-md bg-brand text-white">Save Changes</button>
        </div>
      </form>
    </div>

    <!-- Add New Menu Item Modal -->
    <div v-if="isModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <form class="bg-white rounded-3xl shadow-2xl w-full max-w-7xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200" @submit.prevent="submitAdd">
        <div class="border-b border-stone-100 p-4 md:p-5 flex items-center justify-between bg-stone-50 shrink-0">
          <div>
            <h2 class="text-xl md:text-2xl font-black text-stone-800">Add New Menu Item</h2>
            <p class="text-xs md:text-sm text-stone-500">Fill out English content, Thai translations, and system configuration.</p>
          </div>
          <div class="flex items-center gap-3">
            <span class="rounded-full px-3 py-1 text-[10px] md:text-xs font-bold whitespace-nowrap" :class="addComplete ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'">
              {{ addComplete ? "Data Ready" : "Incomplete" }}
            </span>
            <button type="button" class="text-stone-400 hover:text-stone-600 p-1 bg-white rounded-full shadow-sm" @click="isModalOpen = false">
              <X :size="20" />
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-4 md:p-6 overflow-y-auto bg-white divide-y md:divide-y-0 md:divide-x divide-stone-100">
          <div class="grid gap-4 content-start md:pr-4 lg:pr-2">
            <h3 class="text-sm font-bold text-brand uppercase tracking-wider">English Details</h3>
            <div class="grid gap-2 border border-stone-100 p-4 rounded-2xl bg-stone-50/50 content-start shadow-sm">
              <span class="text-[10px] font-bold text-stone-400 mb-1 block">ENGLISH</span>
              <input v-model="addForm.name" class="field" placeholder="English name" required />
              <textarea v-model="addForm.description" class="field h-20" placeholder="English description"></textarea>
              <textarea v-model="addForm.ingredientsText" class="field h-16" placeholder="Ingredients (comma separated)"></textarea>
              <input v-model="addForm.allergensText" class="field" placeholder="Allergens (comma separated)" />
              <input v-model="addForm.dietaryText" class="field" placeholder="Dietary tags" />
              <input v-model="addForm.tasteText" class="field" placeholder="Taste profile" />
            </div>
          </div>

          <div class="grid gap-4 pt-6 md:pt-0 md:pl-4 lg:px-4 content-start">
            <h3 class="text-sm font-bold text-brand uppercase tracking-wider">Thai Translations</h3>
            <div class="grid gap-2 border border-stone-100 p-4 rounded-2xl bg-stone-50/50 content-start shadow-sm">
              <span class="text-[10px] font-bold text-stone-400 mb-1 block">THAI LANGUAGE</span>
              <input v-model="addForm.nameTh" class="field" placeholder="ชื่อเมนูภาษาไทย" required />
              <textarea v-model="addForm.descriptionTh" class="field h-20" placeholder="คำอธิบายภาษาไทย"></textarea>
              <textarea v-model="addForm.ingredientsThText" class="field h-16" placeholder="วัตถุดิบภาษาไทย (คั่นด้วยเครื่องหมายจุลภาค)"></textarea>
              <input v-model="addForm.allergensThText" class="field" placeholder="สารก่อภูมิแพ้ภาษาไทย" />
              <input v-model="addForm.dietaryThText" class="field" placeholder="แท็กประเภทอาหารภาษาไทย" />
              <input v-model="addForm.tasteThText" class="field" placeholder="รสชาติภาษาไทย" />
            </div>
          </div>

          <div class="grid gap-4 pt-6 lg:pt-0 md:col-span-2 lg:col-span-1 lg:pl-6 content-start">
            <h3 class="text-sm font-bold text-stone-500 uppercase tracking-wider">System Configuration</h3>
            <div class="grid gap-4 border border-stone-100 p-4 rounded-2xl bg-stone-50/50 content-start shadow-sm">
              <div class="grid grid-cols-2 lg:grid-cols-1 gap-4">
                <div>
                  <label class="text-[10px] font-bold text-stone-400 mb-1 block uppercase">Category</label>
                  <select v-model="addForm.category" class="field">
                    <option>Starters</option>
                    <option>Main Courses</option>
                    <option>Drinks</option>
                  </select>
                </div>
                <div>
                  <label class="text-[10px] font-bold text-stone-400 mb-1 block uppercase">Price (Baht)</label>
                  <input v-model="addForm.price" class="field" type="number" placeholder="Price" required />
                </div>
              </div>
              <div>
                <label class="text-[10px] font-bold text-stone-400 mb-1 block uppercase">Image URL</label>
                <input v-model="addForm.image" class="field" placeholder="https://images.unsplash.com/..." />
                <div v-if="addForm.image" class="mt-2 h-24 w-full rounded-xl overflow-hidden border border-stone-200">
                  <img :src="addForm.image" class="h-full w-full object-cover" alt="Preview" />
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3 mt-1">
                <div>
                  <label class="text-[10px] font-bold text-stone-400 mb-1 block uppercase">Spice Level</label>
                  <select v-model="addForm.spiceLevel" class="field">
                    <option>None</option>
                    <option>Mild</option>
                    <option>Medium</option>
                    <option>Hot</option>
                  </select>
                </div>
                <div>
                  <label class="text-[10px] font-bold text-stone-400 mb-1 block uppercase">Availability</label>
                  <select v-model="addForm.availability" class="field">
                    <option value="available">Available</option>
                    <option value="sold_out">Sold out</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="border-t border-stone-100 p-4 bg-stone-50 flex items-center justify-end gap-3 shrink-0">
          <button type="button" class="secondary-btn px-5 py-2.5 font-bold" @click="isModalOpen = false">Cancel</button>
          <button type="submit" class="primary-btn px-6 py-2.5 shadow-md">Create New Item</button>
        </div>
      </form>
    </div>

    <!-- Delete Confirmation Modal -->
    <div v-if="showDeleteModal" class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm transition-opacity">
      <div class="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
        <div class="flex items-center gap-4 mb-5">
          <div class="w-14 h-14 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center shrink-0">
            <Trash2 size="28" stroke-width="2.5" />
          </div>
          <div>
            <h3 class="text-xl font-black text-stone-900">{{ state.language === "en" ? "Delete Menu Item?" : "ยืนยันการลบเมนู?" }}</h3>
            <p class="text-sm text-stone-500 mt-1">{{ state.language === "en" ? "This action cannot be undone." : "ข้อมูลจะถูกลบและไม่สามารถกู้คืนได้" }}</p>
          </div>
        </div>
        <div class="bg-stone-50 rounded-2xl p-3 flex gap-4 items-center border border-stone-200 mb-6">
          <img :src="itemToDelete?.image || 'https://via.placeholder.com/150'" class="w-20 h-20 rounded-xl object-cover shadow-sm bg-white shrink-0" />
          <div class="flex-1 min-w-0">
            <h4 class="font-bold text-stone-800 text-base line-clamp-1">{{ state.language === "th" ? itemToDelete?.nameTh || itemToDelete?.name : itemToDelete?.name }}</h4>
            <p class="text-xs text-stone-400 mt-0.5 line-clamp-1">{{ state.language === "en" ? "Category:" : "หมวดหมู่:" }} {{ itemToDelete?.category }}</p>
            <p class="text-stone-900 font-black mt-2 text-lg">{{ itemToDelete?.price }} ฿</p>
          </div>
        </div>
        <div class="flex gap-3">
          <button @click="showDeleteModal = false" class="flex-1 py-3.5 rounded-xl font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 active:scale-95 transition-all">
            {{ state.language === "en" ? "Cancel" : "ยกเลิก" }}
          </button>
          <button @click="confirmDelete" :disabled="isDeleting" class="flex-1 py-3.5 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:active:scale-100">
            <span v-if="isDeleting">{{ state.language === "en" ? "Deleting..." : "กำลังลบ..." }}</span>
            <template v-else>
              <Trash2 size="18" />
              {{ state.language === "en" ? "Delete" : "ลบเมนู" }}
            </template>
          </button>
        </div>
      </div>
    </div>

    <!-- Recommend Menu Modal -->
    <RecommendMenuModal
      :is-open="isRecommendModalOpen"
      :items="menuItems"
      :language="state.language"
      @close="isRecommendModalOpen = false"
      @updated="fetchMenuItems"
      @alert="triggerAlert"
    />
  </div>
</template>