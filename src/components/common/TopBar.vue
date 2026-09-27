```vue
<script setup>
import { computed, ref, onMounted } from "vue";
import { Globe2, UserCircle, Store, Bell } from "@lucide/vue";
import AppLogo from "../common/AppLogo.vue";
import { useAppState } from "../../services/appState.js";
import { supabase } from "../../supabaseClient.js";
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
const restaurantName = ref("");
const notificationCount = ref(3);

/* --------------------------------
   Language
-------------------------------- */

function handleToggleLanguage() {
  baseToggleLanguage();
  localStorage.setItem("zank-language", state.language);
}

/* --------------------------------
   Account Label
-------------------------------- */

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

/* --------------------------------
   Restaurant Status
-------------------------------- */

const restaurantStatus = computed(() => {
  return state.language === "en" ? "Open" : "เปิดอยู่";
});

/* --------------------------------
   Fetch User Data
-------------------------------- */

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

      restaurantName.value = localUser.restaurant_name || "ZANK Restaurant";

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

/* --------------------------------
   Logout
-------------------------------- */

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
    class="sticky top-0 z-20 flex h-20 items-center justify-between border-b border-stone-200 bg-white/95 px-4 shadow-sm backdrop-blur-md sm:px-6"
  >
    <!-- =========================================
         LEFT SECTION
    ========================================== -->

    <div class="flex min-w-0 items-center gap-4">
      <!-- ZANK Logo -->

      <AppLogo
        :to="
          dbRole?.toLowerCase() === 'admin' || dbRole?.toLowerCase() === 'owner'
            ? '/owner/dashboard'
            : '/'
        "
      />

      <!-- Restaurant Identity -->

      <div
        class="hidden h-10 items-center gap-3 rounded-full border border-stone-200 bg-stone-50 px-3.5 sm:flex"
      >
        <!-- Restaurant Icon -->

        <div
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-stone-600 shadow-sm"
        >
          <Store :size="15" stroke-width="1.8" />
        </div>

        <!-- Restaurant Name -->

        <div class="flex min-w-0 items-center gap-2">
          <span
            class="max-w-[150px] truncate text-sm font-black tracking-tight text-stone-800 lg:max-w-[190px]"
          >
            {{ restaurantName }}
          </span>

          <!-- Divider -->

          <span class="h-4 w-px bg-stone-300"></span>

          <!-- Open Status -->

          <div class="flex shrink-0 items-center gap-1.5">
            <span class="relative flex h-2 w-2">
              <span
                class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60"
              ></span>

              <span
                class="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"
              ></span>
            </span>

            <span class="text-[11px] font-bold text-emerald-600">
              {{ restaurantStatus }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- =========================================
         RIGHT SECTION
    ========================================== -->

    <div class="flex items-center gap-2 sm:gap-3">
      <!-- Notification -->

      <!-- <button
        type="button"
        class="relative flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900"
        :aria-label="
          state.language === 'en'
            ? 'Notifications'
            : 'การแจ้งเตือน'
        "
      >
        <Bell :size="18" stroke-width="1.8" /> -->

      <!-- Notification Badge -->

      <!-- <span
          v-if="notificationCount > 0"
          class="absolute -right-0.5 -top-0.5 flex min-w-[17px] h-[17px] items-center justify-center rounded-full bg-stone-900 px-1 text-[9px] font-black leading-none text-white ring-2 ring-white"
        >
          {{
            notificationCount > 9
              ? "9+"
              : notificationCount
          }}
        </span>
      </button> -->

      <!-- Language Toggle -->
      <button
        type="button"
        class="hidden h-10 items-center gap-2 rounded-full border border-stone-200 bg-white px-3.5 text-sm text-stone-700 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 sm:flex"
        @click="handleToggleLanguage"
      >
        <Globe2 :size="16" class="text-stone-400 shrink-0" />

        <!-- เพิ่ม inline-flex และ items-center ตรงนี้เพื่อให้ EN / / / TH จัดกึ่งกลางแนวนอน-ตั้ง ร่วมกับไอคอนได้เป๊ะๆ -->
        <span
          class="inline-flex items-center gap-1 text-[12px] font-black leading-none"
        >
          <span
            :class="
              state.language === 'en' ? 'text-stone-900' : 'text-stone-400'
            "
          >
            EN
          </span>

          <span class="text-stone-300"> / </span>

          <span
            :class="
              state.language === 'th' ? 'text-stone-900' : 'text-stone-400'
            "
          >
            TH
          </span>
        </span>
      </button>

      <!-- User Profile -->

      <div
        class="flex items-center gap-2 rounded-full border border-stone-200 bg-white p-1.5 pr-3 shadow-sm transition hover:border-stone-300 hover:shadow-md sm:gap-3 sm:pr-4"
      >
        <!-- User Icon -->

        <div
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-500"
        >
          <UserCircle :size="23" stroke-width="1.5" />
        </div>

        <!-- User Information -->

        <div class="hidden min-w-0 flex-col text-left leading-tight md:flex">
          <span
            class="max-w-[130px] truncate text-[14px] font-black text-stone-800 lg:max-w-[160px]"
          >
            {{ userEmail }}
          </span>

          <span class="text-[12px] font-bold text-stone-500">
            {{ accountLabel }}
          </span>
        </div>

        <!-- Restaurant name on smaller desktop -->

        <div class="hidden h-7 w-px bg-stone-200 lg:block"></div>

        <div
          class="hidden max-w-[150px] truncate text-[13px] font-bold text-stone-600 lg:block"
        >
          {{ restaurantName }}
        </div>
      </div>
    </div>
  </header>
</template>
```
