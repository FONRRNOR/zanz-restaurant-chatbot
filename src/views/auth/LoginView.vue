<script setup>
import { Eye, EyeOff, Lock, Mail, ShieldCheck, Globe2 } from "@lucide/vue";
import { computed, ref, watch, onMounted } from "vue";
import { useRouter } from "vue-router";
import AppLogo from "../../components/AppLogo.vue";
import { supabase } from "../../supabaseClient";
import { useAppState } from "../../services/appState";
import bcrypt from "bcryptjs";

const props = defineProps({
  type: { type: String, required: true },
});

const router = useRouter();
const { state, toggleLanguage: baseToggleLanguage } = useAppState();

const email = ref("");
const password = ref("");
const showPassword = ref(false);
const showError = ref(false);
const errorMessage = ref("");

// --- Dynamic Text Translations ---

const title = computed(() => {
  if (props.type === "owner") {
    return state.language === "en" ? "Admin Login" : "เข้าสู่ระบบแอดมิน";
  }
  return state.language === "en" ? "Staff Login" : "เข้าสู่ระบบพนักงาน";
});

const subtitle = computed(() => {
  if (props.type === "owner") {
    return state.language === "en"
      ? "Manage menus, ingredients, allergens, and customer orders."
      : "จัดการเมนูอาหาร วัตถุดิบ สารก่อภูมิแพ้ และรายการคำสั่งซื้อของลูกค้า";
  }
  return state.language === "en"
    ? "Access live orders and update order status."
    : "เข้าถึงรายการคำสั่งซื้อสดและอัปเดตสถานะออเดอร์";
});

const target = computed(() =>
  props.type === "owner" ? "/owner/dashboard" : "/staff/live-orders",
);

const emailPlaceholder = computed(() => {
  if (props.type === "owner") {
    return state.language === "en"
      ? "e.g., admin@zank.com"
      : "เช่น admin@zank.com";
  }
  return state.language === "en"
    ? "e.g., staff@zank.com"
    : "เช่น staff@zank.com";
});

const passwordPlaceholder = computed(() => {
  return state.language === "en" ? "Enter your password" : "กรอกรหัสผ่านของคุณ";
});

// --- Validation and Error Messages Translations ---

const defaultInvalidMessage = computed(() => {
  return state.language === "en"
    ? "Invalid email or password."
    : "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
});

const emailFormatMessage = computed(() => {
  return state.language === "en"
    ? "Please enter a valid email address format (e.g., user@example.com)."
    : "กรุณากรอกรูปแบบอีเมลที่ถูกต้อง (เช่น user@example.com)";
});

const emptyPasswordMessage = computed(() => {
  return state.language === "en"
    ? "Password field cannot be empty."
    : "กรุณากรอกรหัสผ่าน";
});

const noPermissionMessage = computed(() => {
  return state.language === "en"
    ? `This account does not have permission to access the ${title.value}.`
    : `บัญชีนี้ไม่มีสิทธิ์การเข้าใช้งานในส่วนของ ${title.value}`;
});

const dbErrorMessage = computed(() => {
  return state.language === "en"
    ? "An error occurred while accessing the database."
    : "เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล";
});

// ---------------------------------

watch(email, (newValue) => {
  email.value = newValue.replace(/[^a-zA-Z0-9@._+-]/g, "");
});

watch(password, (newValue) => {
  password.value = newValue.replace(
    /[^a-zA-Z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/g,
    "",
  );
});

function handleToggleLanguage() {
  baseToggleLanguage();
  localStorage.setItem("zank-language", state.language);
}

async function submit() {
  try {
    showError.value = false;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.value)) {
      errorMessage.value = emailFormatMessage.value;
      showError.value = true;
      return;
    }

    if (!password.value) {
      errorMessage.value = emptyPasswordMessage.value;
      showError.value = true;
      return;
    }

    console.log("Checking credentials for:", email.value);

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("email", email.value)
      .single();

    if (profileError || !profileData) {
      if (profileError && profileError.code !== "PGRST116") {
        console.error("Supabase Error:", profileError);
        errorMessage.value = dbErrorMessage.value;
      } else {
        errorMessage.value = defaultInvalidMessage.value;
      }
      showError.value = true;
      return;
    }

    const isValidPassword = bcrypt.compareSync(
      password.value,
      profileData.password_hash,
    );

    if (!isValidPassword) {
      errorMessage.value = defaultInvalidMessage.value;
      showError.value = true;
      return;
    }

    const currentRole = profileData.role;
    let isRoleValid = false;

    if (props.type === "owner") {
      isRoleValid = currentRole === "admin";
    } else if (props.type === "staff") {
      isRoleValid = ["kitchen_staff", "reception_staff"].includes(currentRole);
    }

    if (!isRoleValid) {
      errorMessage.value = noPermissionMessage.value;
      showError.value = true;
      return;
    }

    const userData = {
      id: profileData.id,
      email: profileData.email,
      role: currentRole,
      restaurant_id: profileData.restaurant_id,
      restaurant_name: profileData.restaurant_name,
    };

    state.activeUser = userData;
    // Store user data in sessionStorage instead of localStorage to isolate sessions per tab
    sessionStorage.setItem("zank-active-user", JSON.stringify(userData));
    router.push(target.value);
  } catch (error) {
    console.error("Login verification exception error:", error);
    showError.value = true;
  }
}

onMounted(() => {
  const savedLanguage = localStorage.getItem("zank-language");
  if (savedLanguage && state.language !== savedLanguage) {
    state.language = savedLanguage;
  }

  if (state.activeUser) {
    state.activeUser = null;
    // Clear the session state from sessionStorage as well when unmounting or returning to this view
    sessionStorage.removeItem("zank-active-user");
  }
});
</script>

<template>
  <main class="page-shell min-h-screen px-5 py-8">
    <header class="mx-auto flex max-w-6xl items-center justify-between">
      <AppLogo />

      <button
        class="flex items-center gap-2 rounded-full px-3 py-2 text-sm text-stone-700 transition hover:bg-stone-100"
        type="button"
        @click="handleToggleLanguage"
      >
        <Globe2 :size="18" class="text-stone-500" />
        <span class="flex gap-1 font-bold">
          <span
            :class="
              state.language === 'en'
                ? 'font-black text-stone-900'
                : 'font-normal text-stone-400'
            "
            >EN</span
          >
          <span class="text-stone-300">/</span>
          <span
            :class="
              state.language === 'th'
                ? 'font-black text-stone-900'
                : 'font-normal text-stone-400'
            "
            >TH</span
          >
        </span>
      </button>
    </header>

    <section
      class="mx-auto mt-12 max-w-md rounded-[2rem] bg-white p-8 shadow-strong"
    >
      <div class="text-center">
        <div
          class="mx-auto mt-6 grid h-12 w-12 place-items-center rounded-full bg-pale text-brand"
        >
          <ShieldCheck :size="26" />
        </div>
        <h1 class="mt-5 text-3xl font-black">{{ title }}</h1>
        <p class="mt-2 text-sm leading-relaxed text-muted">{{ subtitle }}</p>
        <p class="mt-4 text-sm font-semibold text-brand">
          {{
            state.language === "en"
              ? "For authorized users only."
              : "สำหรับผู้ที่ได้รับอนุญาตเท่านั้น"
          }}
        </p>
      </div>

      <form class="mt-7 space-y-4" @submit.prevent="submit">
        <label class="block text-sm font-bold">
          {{ state.language === "en" ? "Email address" : "ที่อยู่อีเมล" }}
          <span
            class="mt-2 flex items-center gap-2 rounded-2xl border border-stone-200 px-4 py-3"
          >
            <Mail :size="18" class="text-muted" />
            <input
              v-model="email"
              class="w-full outline-none"
              type="email"
              :placeholder="emailPlaceholder"
            />
          </span>
        </label>
        <label class="block text-sm font-bold">
          <span class="flex justify-between">
            {{ state.language === "en" ? "Password" : "รหัสผ่าน" }}
            <RouterLink to="/forgot-password" class="text-xs text-brand">{{
              state.language === "en" ? "Forgot password?" : "ลืมรหัสผ่าน?"
            }}</RouterLink>
          </span>
          <span
            class="mt-2 flex items-center gap-2 rounded-2xl border border-stone-200 px-4 py-3"
          >
            <Lock :size="18" class="text-muted" />
            <input
              v-model="password"
              class="w-full outline-none"
              :type="showPassword ? 'text' : 'password'"
              :placeholder="passwordPlaceholder"
            />
            <button
              type="button"
              class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition hover:bg-pale hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
              @click="showPassword = !showPassword"
            >
              <EyeOff v-if="showPassword" :size="18" />
              <Eye v-else :size="18" />
            </button>
          </span>
        </label>

        <p v-if="showError" class="text-sm font-semibold text-red-600">
          {{ errorMessage }}
        </p>

        <label class="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" />
          {{ state.language === "en" ? "Remember me" : "จดจำฉันไว้" }}
        </label>
        <button class="primary-btn w-full">
          {{ state.language === "en" ? "Sign In" : "เข้าสู่ระบบ" }}
        </button>
      </form>

      <RouterLink
        to="/"
        class="mt-6 block text-center text-sm font-bold text-brand"
        >{{
          state.language === "en"
            ? "← Back to interface selection"
            : "← กลับไปหน้าเลือกอินเตอร์เฟส"
        }}</RouterLink
      >
      <p
        class="mt-6 border-t border-stone-100 pt-5 text-center text-xs text-muted"
      >
        {{
          state.language === "en"
            ? "Only authorized accounts can access this dashboard."
            : "เฉพาะบัญชีที่ได้รับอนุญาตเท่านั้นที่สามารถเข้าถึงแดชบอร์ดนี้ได้"
        }}
      </p>
    </section>
  </main>
</template>
