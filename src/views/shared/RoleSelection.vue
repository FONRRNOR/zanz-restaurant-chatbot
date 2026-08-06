<script setup>
import { ClipboardList, Lock, Monitor, Utensils } from "@lucide/vue";
import { RouterLink } from "vue-router";
import { computed, onMounted, onUnmounted } from "vue";
import AppLogo from "../../components/AppLogo.vue";
import { useAppState } from "../../services/appState";

const { state, toggleLanguage, t } = useAppState();

// --- 🌟 จุดที่เพิ่มเข้ามา: บล็อกการกดย้อนกลับเฉพาะหน้านี้ 🌟 ---
const preventNavigation = () => {
  window.history.pushState(window.history.state, "", window.location.href);
};

onMounted(() => {
  // สร้างประวัติทับไว้ 1 ชั้น และดักจับการกดปุ่ม Back/Forward ทันทีที่เปิดหน้านี้
  window.history.pushState(window.history.state, "", window.location.href);
  window.addEventListener("popstate", preventNavigation);
});

onUnmounted(() => {
  // ปลดล็อกเมื่อเปลี่ยนไปหน้าอื่น เพื่อให้หน้าอื่นๆ กดย้อนกลับได้ปกติ
  window.removeEventListener("popstate", preventNavigation);
});
// ----------------------------------------------------------------

/**
 * Wrap cards configuration in a computed property.
 * This guarantees all text re-evaluates through the t() translation method
 * immediately when the global state language changes.
 */
const cards = computed(() => [
  {
    title: t("Customer"),
    description: t("Browse the menu, ask Chef AI, and place orders."),
    note: t("No login required"),
    button: t("Open Menu"),
    to: "/customer/menu",
    icon: Utensils,
  },
  {
    title: t("Staff"),
    description: t("View live orders and update order status."),
    note: t("Login required"),
    button: t("Staff Login"),
    to: "/staff/login",
    icon: Monitor,
  },
  {
    title: t("Owner / Admin"),
    description: t("Manage menu items and monitor restaurant orders."),
    note: t("Login required"),
    button: t("Admin Login"),
    to: "/owner/login",
    icon: ClipboardList,
  },
]);

/**
 * Handles the language switcher switch action and persists the configuration
 * selection state inside localStorage to keep it synced across login/dashboard layouts.
 */
function handleToggleLanguage() {
  toggleLanguage();
  localStorage.setItem("zank-language", state.language);
}
</script>

<template>
  <main class="page-shell grid min-h-screen place-items-center px-5 py-10">
    <div class="w-full max-w-6xl">
      <header class="mb-10 flex items-center justify-between">
        <AppLogo />

        <!-- Accessible Interactive Language Toggle Action Button -->
        <button
          class="flex items-center gap-1 rounded-full px-4 py-2 text-sm font-bold text-stone-700 transition hover:bg-stone-100"
          type="button"
          @click="handleToggleLanguage"
        >
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
        </button>
      </header>

      <section class="section-card p-8 text-center md:p-12">
        <p
          class="mx-auto mb-4 w-fit rounded-full bg-pale px-4 py-2 text-sm font-bold text-brand"
        >
          {{ t("Logged out successfully. Choose an interface to continue.") }}
        </p>
        <h1 class="text-4xl font-black tracking-tight md:text-5xl">
          {{ t("Choose Your Interface") }}
        </h1>
        <p class="mt-3 text-muted">
          {{ t("Select how you want to use the restaurant system.") }}
        </p>

        <div class="mt-10 grid gap-5 md:grid-cols-3">
          <!-- Iterating computed cards with translation hooks already rendered in the script -->
          <article
            v-for="card in cards"
            :key="card.title"
            class="rounded-3xl border border-stone-100 bg-white p-6 text-left shadow-soft"
          >
            <div
              class="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-pale text-brand"
            >
              <component :is="card.icon" :size="28" />
            </div>
            <h2 class="text-xl font-black">{{ card.title }}</h2>
            <p class="mt-2 min-h-12 text-sm leading-relaxed text-muted">
              {{ card.description }}
            </p>
            <RouterLink
              :to="card.to"
              class="primary-btn mt-6 block text-center"
              >{{ card.button }}</RouterLink
            >
            <p
              class="mt-3 flex items-center gap-2 text-xs font-semibold text-muted"
            >
              <!-- Dynamically display lock icon based on translation localized string matching criteria -->
              <Lock
                v-if="
                  card.note.includes('Login') ||
                  card.note.includes('เข้าสู่ระบบ')
                "
                :size="14"
              />
              {{ card.note }}
            </p>
          </article>
        </div>

        <p class="mt-8 text-sm text-muted">
          {{ t("Staff and owner access is restricted to authorized users.") }}
        </p>
      </section>
    </div>
  </main>
</template>
