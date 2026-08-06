<script setup>
import { computed, ref, onMounted } from "vue";
import { Globe2, UserCircle, Store } from "@lucide/vue"; // Add Store icon
import AppLogo from "./AppLogo.vue";
import { useAppState } from "../services/appState";
import { supabase } from "../supabaseClient";
import { useRouter } from "vue-router";

defineProps({
  cartCount: { type: Number, default: 0 },
  modelValue: { type: String, default: "" },
  searchPlaceholder: {
    type: String,
    default: "Search dishes, ingredients, or taste",
  },
  owner: { type: Boolean, default: false },
});

defineEmits(["update:modelValue"]);

const router = useRouter();
const { state, toggleLanguage: baseToggleLanguage } = useAppState();

const userEmail = ref("");
const dbRole = ref("");
const restaurantName = ref(""); // Add restaurant name variable

function handleToggleLanguage() {
  baseToggleLanguage();
  localStorage.setItem("zank-language", state.language);
}

const accountLabel = computed(() => {
  const role = dbRole.value?.toLowerCase();
  if (role === "admin" || role === "owner") {
    return state.language === "en" ? "Owner / Admin" : "เจ้าของร้าน / แอดมิน";
  }
  if (role === "kitchen_staff" || role === "reception_staff") {
    return state.language === "en" ? "Staff" : "พนักงาน";
  }
  return state.language === "en" ? "Customer" : "ลูกค้าทั่วไป";
});

async function fetchUserData() {
  try {
    const savedLanguage = localStorage.getItem("zank-language");
    if (savedLanguage && state.language !== savedLanguage) {
      state.language = savedLanguage;
    }

    const savedUserJson = sessionStorage.getItem("zank-active-user");

    if (savedUserJson) {
      const localUser = JSON.parse(savedUserJson);
      userEmail.value = localUser.email;
      dbRole.value = localUser.role || "customer";
      restaurantName.value = localUser.restaurant_name || "ZANK Restaurant"; // Get restaurant name
      state.activeUser = localUser;
    } else {
      userEmail.value = state.language === "en" ? "Guest" : "ลูกค้าทั่วไป";
      dbRole.value = "customer";
      restaurantName.value = "ZANK Restaurant";
    }
  } catch (error) {
    console.error("Error fetching user data:", error);
    userEmail.value = state.language === "en" ? "Guest" : "ลูกค้าทั่วไป";
    dbRole.value = "customer";
    restaurantName.value = "ZANK Restaurant";
  }
}

async function handleLogout() {
  sessionStorage.removeItem("zank-active-user");
  state.activeUser = null;
  await supabase.auth.signOut();
  router.push("/");
}

onMounted(() => {
  fetchUserData();
});
</script>

<template>
  <header
    class="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-stone-200 bg-white/90 px-6 backdrop-blur-md shadow-sm"
  >
    <!-- Left Section: Logo (Moved restaurant name out) -->
    <div class="flex items-center gap-5">
      <AppLogo
        :to="
          dbRole?.toLowerCase() === 'admin' || dbRole?.toLowerCase() === 'owner'
            ? '/owner/dashboard'
            : '/'
        "
      />
    </div>

    <!-- Right Section: Controls & User -->
    <div class="flex items-center gap-4">
      <!-- Language toggle button -->
      <button
        class="hidden items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700 shadow-sm transition hover:bg-stone-50 sm:flex"
        @click="handleToggleLanguage"
      >
        <Globe2 :size="16" class="text-stone-400" />
        <span class="flex gap-1 font-bold text-[13px]">
          <span
            :class="
              state.language === 'en' ? 'text-stone-900' : 'text-stone-400'
            "
            >EN</span
          >
          <span class="text-stone-300">/</span>
          <span
            :class="
              state.language === 'th' ? 'text-stone-900' : 'text-stone-400'
            "
            >TH</span
          >
        </span>
      </button>

      <!-- User Profile & Restaurant Badge -->
      <div
        class="relative flex items-center gap-3 rounded-full border border-stone-200 p-2 pr-5 bg-white shadow-sm transition hover:shadow-md cursor-pointer"
      >
        <!-- User icon -->
        <div
          class="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-stone-500"
        >
          <UserCircle :size="24" stroke-width="1.5" />
        </div>

        <!-- Email & Role info -->
        <div class="hidden flex-col text-left leading-tight md:flex">
          <span
            class="text-sm font-black text-stone-800 max-w-[140px] truncate"
            >{{ userEmail }}</span
          >
          <span class="text-[11px] font-bold text-stone-500">{{
            accountLabel
          }}</span>
        </div>

        <!-- Divider between Email and Restaurant name (Displays only on medium screens and up) -->
        <div class="hidden md:block h-7 w-px bg-stone-200 mx-1"></div>

        <!-- Restaurant name info (Displays after Email) -->
        <div class="hidden flex-col text-left leading-tight md:flex">
          <span
            class="text-sm font-black text-stone-800 max-w-[140px] truncate"
            >{{ restaurantName }}</span
          >
        </div>
      </div>
    </div>
  </header>
</template>
