<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from "vue";
import { useAppState } from "../../services/appState";
import { useCustomerMenu } from "../../composables/customer/useCustomerMenu";

import TopBarCustomer from "../../components/common/TopBarCustomer.vue";
import { Plus, Minus, Bot } from "lucide-vue-next";
import AiChatModal from "../../components/chat/AiChatModal.vue";
import RecommendationModal from "../../components/menu/RecommendationModal.vue";
import OrderUpdateModal from "../../components/order/OrderUpdateModal.vue";

const { state } = useAppState();

const menuContainerRef = ref(null);
const isScrolling = ref(false);
let scrollTimeout = null;
let observer = null;

const setupIntersectionObserver = () => {
  if (observer) observer.disconnect();
  if (!menuContainerRef.value) return;

  const options = {
    root: menuContainerRef.value,
    rootMargin: "-10px 0px -70% 0px",
    threshold: 0,
  };

  observer = new IntersectionObserver((entries) => {
    if (state.isManualScrolling) return;
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const catKey = entry.target.getAttribute("data-category-key");
        if (catKey) state.selectedCategory = catKey;
      }
    });
  }, options);

  const sections = menuContainerRef.value.querySelectorAll(
    ".category-menu-section",
  );
  sections.forEach((sec) => observer.observe(sec));
};

const handleOpenChatbotFromModal = () => {
  showRecommendationModal.value = false;
  isAiChatOpen.value = true;
};

const {
  loading,
  isSessionExpired,
  showModal,
  selectedItem,
  isAiChatOpen,
  showRecommendationModal,
  isOrderModalOpen,
  latestOrderUpdate,
  restaurantId,
  tableId,
  language,
  cart,
  cartCount,
  cartTotal,
  groupedMenu,
  openModal,
  closeModal,
  userPreferences,
  handlePreferencesSaved,
  handlePreferencesReset,
  getMenuName,
  getMenuDescription,
  getMenuAllergens,
  formatAllergens,
  formatIngredients,
  getItemQuantity,
  goToOrder,
  addToCart,
  removeFromCart,
  handleUpdateCartNote,
  handleVisibilityChange,
} = useCustomerMenu(state, setupIntersectionObserver);

const handleScroll = () => {
  isScrolling.value = true;
  if (scrollTimeout) clearTimeout(scrollTimeout);
  scrollTimeout = setTimeout(() => {
    isScrolling.value = false;
  }, 300);
};

watch(
  () => [groupedMenu.value, state.language],
  async () => {
    await nextTick();
    setupIntersectionObserver();
  },
);

onMounted(() => {
  document.addEventListener("visibilitychange", handleVisibilityChange);

  const savedPrefs = sessionStorage.getItem("customer_preferences");
  if (savedPrefs) {
    try {
      const parsedPrefs = JSON.parse(savedPrefs);
      handlePreferencesSaved(parsedPrefs);
    } catch (e) {
      console.error("Invalid preferences format in storage");
    }
  }

  const hasSeenModal = sessionStorage.getItem("has_seen_recommendation");
  if (!hasSeenModal) {
    showRecommendationModal.value = true;
    sessionStorage.setItem("has_seen_recommendation", "true");
  } else {
    showRecommendationModal.value = false;
  }
});

onUnmounted(() => {
  if (scrollTimeout) clearTimeout(scrollTimeout);
  if (observer) observer.disconnect();
});
</script>

<template>
  <div
    class="mobile-shell flex flex-col h-[100dvh] bg-white overflow-hidden relative"
  >
    <RecommendationModal
      :is-open="showRecommendationModal"
      :language="state.language"
      @save="handlePreferencesSaved"
      @skip="showRecommendationModal = false"
      @reset="handlePreferencesReset"
      @open-chatbot="handleOpenChatbotFromModal"
    />
    <OrderUpdateModal
      :is-open="isOrderModalOpen"
      :order-data="latestOrderUpdate"
      :duration="10"
      @close="isOrderModalOpen = false"
    />

    <div
      v-if="isSessionExpired"
      class="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-stone-100/90 backdrop-blur-md"
    >
      <div
        class="w-full max-w-sm bg-white rounded-3xl p-8 text-center shadow-xl border border-stone-200/80 flex flex-col items-center animate-in zoom-in-95 duration-200"
      >
        <div
          class="w-20 h-20 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mb-6 shadow-xs ring-8 ring-emerald-50/80"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-10 w-10 text-emerald-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <h1 class="text-2xl font-black text-stone-900 mb-2">
          {{
            state.language === "th"
              ? "ขอบคุณที่ใช้บริการครับ"
              : "Thank you for dining with us"
          }}
        </h1>

        <p class="text-stone-600 text-sm mb-6 leading-relaxed">
          {{
            state.language === "th"
              ? "บิลนี้ถูกชำระเงินและโต๊ะถูกเคลียร์เรียบร้อยแล้ว หวังว่าจะได้ให้บริการท่านอีกครั้ง"
              : "This bill has been paid and the table has been cleared. We hope to see you again soon."
          }}
        </p>

        <div
          class="w-full bg-red-50 p-4 rounded-2xl border border-red-200/80 flex items-start gap-3 text-left shadow-2xs"
        >
          <div class="p-1 bg-red-100 rounded-full text-red-600 shrink-0 mt-0.5">
            <svg
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              stroke-width="2.5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <p class="text-xs text-red-700 font-bold leading-relaxed">
            {{
              state.language === "th"
                ? "หากต้องการสั่งอาหารเพิ่ม กรุณาสแกน QR Code ที่โต๊ะของคุณใหม่อีกครั้งครับ"
                : "If you would like to order more, please scan the QR code at your table again."
            }}
          </p>
        </div>
      </div>
    </div>

    <div
      v-else-if="loading"
      class="flex-1 flex items-center justify-center text-stone-400 font-bold"
    >
      {{ state.language === "th" ? "กำลังโหลดเมนู..." : "Loading menu..." }}
    </div>

    <template v-else>
      <TopBarCustomer class="flex-shrink-0" />
      <main
        id="main-menu-scroll-container"
        ref="menuContainerRef"
        class="flex-1 min-h-0 overflow-y-auto px-4 pb-36 pt-2 scroll-smooth"
        @scroll="handleScroll"
      >
        <div
          v-if="
            groupedMenu.length === 0 ||
            (groupedMenu[0]?.key === 'Search' &&
              groupedMenu[0].items.length === 0)
          "
          class="text-center py-16 text-stone-400"
        >
          <p class="text-sm font-medium">
            {{
              state.language === "th" ? "ไม่พบเมนูที่ค้นหา" : "No menus found"
            }}
          </p>
        </div>

        <div v-else class="flex flex-col">
          <section
            v-for="(group, index) in groupedMenu"
            :key="group.key"
            :id="`category-section-${group.key}`"
            :data-category-key="group.key"
            class="category-menu-section scroll-mt-2"
          >
            <div
              v-if="index > 0"
              class="border-b border-dashed border-stone-400 mt-2 mb-4"
            ></div>
            <h2
              v-if="group.key === 'Recommended'"
              class="font-black text-xl mb-2 flex items-center gap-2 text-emerald-800"
            >
              {{ group.label }}
            </h2>
            <h2
              v-else-if="group.key !== 'Search'"
              class="font-black text-lg mb-2 text-stone-900"
            >
              {{ group.label }}
            </h2>

            <div class="flex flex-col">
              <div
                v-for="item in group.items"
                :key="group.key + '-' + item.id"
                @click="openModal(item)"
                class="flex gap-4 items-start py-5 border-b border-dashed border-stone-200 last:border-none cursor-pointer hover:bg-stone-50 transition-opacity rounded-xl px-2 -mx-2 relative"
                :class="{
                  'opacity-40':
                    item._status?.isAllergic || item._status?.isDietConflict,
                }"
              >
                <div
                  class="w-24 h-24 rounded-2xl bg-stone-100 flex-shrink-0 overflow-hidden shadow-sm relative"
                >
                  <img
                    v-if="item.image"
                    :src="item.image"
                    loading="lazy"
                    class="w-full h-full object-cover"
                  />
                  <div
                    v-else
                    class="w-full h-full flex items-center justify-center text-stone-300 text-xs text-center p-2"
                  >
                    {{ state.language === "th" ? "ไม่มีรูปภาพ" : "No Image" }}
                  </div>
                </div>

                <div
                  class="flex-1 min-h-[6rem] flex flex-col justify-between min-w-0 py-1"
                >
                  <div>
                    <h3
                      class="font-bold text-stone-900 text-base leading-snug line-clamp-2 break-words whitespace-normal"
                    >
                      {{ getMenuName(item) }}
                    </h3>
                    <p
                      v-if="item.allergens || item.allergens_th"
                      class="text-xs text-stone-500 mt-1 line-clamp-1 break-words whitespace-normal"
                    >
                      <span class="font-medium">{{
                        state.language === "th"
                          ? "สารก่อภูมิแพ้:"
                          : "Allergens:"
                      }}</span>
                      {{ formatAllergens(getMenuAllergens(item)) }}
                    </p>
                    <div
                      v-if="item._status?.isAllergic"
                      class="text-[11px] text-red-600 font-bold mt-1.5 bg-red-50 px-2 py-0.5 rounded w-fit flex items-center gap-1 border border-red-200"
                    >
                      {{
                        state.language === "th"
                          ? "มีส่วนผสมที่คุณแพ้"
                          : "Contains your allergens"
                      }}
                    </div>
                    <div
                      v-else-if="item._status?.isDietConflict"
                      class="text-[11px] text-amber-700 font-bold mt-1.5 bg-amber-50 px-2 py-0.5 rounded w-fit flex items-center gap-1 border border-amber-200"
                    >
                      {{
                        state.language === "th"
                          ? "ไม่ตรงกับรูปแบบอาหารที่คุณทาน"
                          : "Not matching your diet"
                      }}
                    </div>
                    <div
                      v-else-if="item._status?.isTooSpicy"
                      class="text-[10px] text-orange-600 font-bold mt-1.5 bg-orange-50 px-2 py-0.5 rounded w-fit flex items-center gap-1 border border-orange-100"
                    >
                      {{
                        state.language === "th"
                          ? "เผ็ดกว่าที่คุณเลือก"
                          : "Spicier than preferred"
                      }}
                    </div>
                  </div>

                  <div
                    class="flex justify-between items-center mt-3 relative z-20"
                  >
                    <p class="font-bold text-stone-900 text-lg">
                      {{ item.priceNum ? item.priceNum.toLocaleString() : 0 }}
                      {{ state.language === "th" ? "บาท" : "Baht" }}
                    </p>
                    <div class="h-9 flex justify-end items-center">
                      <button
                        v-if="getItemQuantity(item.id) === 0"
                        @click.stop="
                          item._status?.isAllergic ||
                          item._status?.isDietConflict
                            ? null
                            : addToCart(item)
                        "
                        :disabled="
                          item._status?.isAllergic ||
                          item._status?.isDietConflict
                        "
                        :class="[
                          'touch-manipulation w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-transform shadow-xs border',
                          item._status?.isAllergic ||
                          item._status?.isDietConflict
                            ? 'bg-stone-100 border-stone-200 text-stone-300 cursor-not-allowed'
                            : 'bg-white border-stone-300 text-stone-800 hover:bg-stone-100 active:scale-95',
                        ]"
                      >
                        <Plus
                          :size="16"
                          stroke-width="2.5"
                          :class="
                            item._status?.isAllergic ||
                            item._status?.isDietConflict
                              ? 'text-stone-300'
                              : 'text-stone-700'
                          "
                        />
                      </button>

                      <div
                        v-else
                        class="flex items-center gap-1.5 bg-stone-50 border border-stone-200 rounded-full p-1 shadow-2xs"
                        @click.stop
                      >
                        <button
                          @click.stop="removeFromCart(item.id)"
                          class="touch-manipulation w-7 h-7 rounded-full flex items-center justify-center bg-white text-stone-600 hover:bg-stone-200 active:scale-95 shadow-2xs"
                        >
                          <Minus :size="13" stroke-width="2.5" />
                        </button>
                        <span
                          class="w-6 text-center text-sm font-bold text-stone-900 select-none"
                          >{{ getItemQuantity(item.id) }}</span
                        >
                        <button
                          @click.stop="addToCart(item)"
                          class="touch-manipulation w-7 h-7 rounded-full flex items-center justify-center bg-stone-900 text-white hover:bg-stone-800 active:scale-95 shadow-2xs"
                        >
                          <Plus
                            :size="13"
                            stroke-width="2.5"
                            class="text-white"
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>

      <button
        @click="isAiChatOpen = true"
        class="fixed right-5 bottom-24 z-40 w-14 h-14 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-full shadow-xl flex items-center justify-center transition-all duration-300 group"
        aria-label="Chat with AI"
      >
        <Bot :size="24" class="group-hover:scale-110 transition-transform" />
        <span
          class="absolute top-0 right-0 w-3.5 h-3.5 bg-amber-400 border-2 border-white rounded-full"
        ></span>
      </button>

      <div
        :class="[
          'fixed bottom-0 left-0 right-0 p-4 z-30 transition-all duration-700 ease-out',
          cartCount > 0 && !isScrolling
            ? 'translate-y-0 opacity-100'
            : 'translate-y-full opacity-0 pointer-events-none',
        ]"
      >
        <button
          @click="goToOrder"
          class="touch-manipulation w-full bg-stone-900 text-white py-4 rounded-2xl font-black flex justify-between items-center px-6 active:scale-[0.99] transition-transform shadow-lg"
        >
          <span>
            {{ state.language === "th" ? "ดูตะกร้า" : "View Cart" }}
            <span class="mx-1.5 opacity-60">•</span> {{ cartCount }}
            {{
              state.language === "th"
                ? "รายการ"
                : cartCount === 1
                  ? "item"
                  : "items"
            }}
          </span>
          <span>
            {{ cartTotal.toLocaleString() }}
            {{ language === "th" ? "บาท." : "Baht." }}
          </span>
        </button>
      </div>

      <AiChatModal
        :is-open="isAiChatOpen"
        :restaurant-id="restaurantId"
        :language="language"
        :cart="cart"
        @close="isAiChatOpen = false"
        @add-to-cart="addToCart"
        @remove-from-cart="removeFromCart"
        @update-cart-note="handleUpdateCartNote"
      />

      <Transition name="fade">
        <div
          v-if="showModal"
          class="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/60 backdrop-blur-sm"
          @click="closeModal"
        >
          <Transition name="zoom">
            <div
              v-if="showModal && selectedItem"
              @click.stop
              class="bg-white w-full max-w-[340px] max-h-[85vh] rounded-3xl overflow-y-auto flex flex-col shadow-2xl relative"
            >
              <div class="relative h-60 w-full bg-stone-100 flex-shrink-0">
                <img
                  v-if="selectedItem.image"
                  :src="selectedItem.image"
                  class="w-full h-full object-cover"
                />
                <div
                  v-else
                  class="w-full h-full flex items-center justify-center text-stone-400"
                >
                  {{
                    state.language === "th"
                      ? "ไม่มีรูปภาพ"
                      : "No Image Available"
                  }}
                </div>
                <button
                  @click="closeModal"
                  class="absolute top-4 right-4 w-7 h-7 bg-black/40 hover:bg-black/50 rounded-full flex items-center justify-center text-white cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div class="p-5 pb-8 text-left space-y-4">
                <div class="flex justify-between items-start">
                  <h2 class="text-xl font-bold text-stone-900 leading-snug">
                    {{ getMenuName(selectedItem) }}
                  </h2>
                  <span
                    class="text-lg font-bold text-emerald-700 whitespace-nowrap ml-2"
                  >
                    {{
                      selectedItem.priceNum
                        ? selectedItem.priceNum.toLocaleString()
                        : 0
                    }}
                    {{ state.language === "th" ? "บาท" : "Baht" }}
                  </span>
                </div>

                <div
                  v-if="selectedItem._status?.isAllergic"
                  class="text-xs text-red-600 font-bold bg-red-50 px-3 py-2 rounded-xl flex items-start gap-2 border border-red-100"
                >
                  <span>{{
                    state.language === "th"
                      ? "คำเตือน: เมนูนี้มีส่วนผสมที่คุณแพ้ กรุณาหลีกเลี่ยง"
                      : "Warning: This dish contains allergens you specified. Please avoid."
                  }}</span>
                </div>
                <div
                  v-else-if="selectedItem._status?.isDietConflict"
                  class="text-xs text-amber-700 font-bold bg-amber-50 px-3 py-2 rounded-xl flex items-start gap-2 border border-amber-100"
                >
                  <span>{{
                    state.language === "th"
                      ? "คำเตือน: เมนูนี้ไม่ตรงกับประเภทอาหารที่คุณเลือกไว้"
                      : "Warning: This dish does not match your selected dietary preferences."
                  }}</span>
                </div>

                <div v-if="getMenuDescription(selectedItem)">
                  <p class="text-sm text-stone-600 leading-relaxed">
                    {{ getMenuDescription(selectedItem) }}
                  </p>
                </div>

                <div
                  v-if="selectedItem.ingredients || selectedItem.ingredients_th"
                  class="border-t border-stone-100 pt-3"
                >
                  <p class="text-[13px] text-stone-400 font-medium mb-1">
                    {{
                      state.language === "th"
                        ? "ส่วนผสมและองค์ประกอบ"
                        : "Ingredients & Components"
                    }}
                  </p>
                  <p class="text-[14px] text-stone-900 leading-relaxed">
                    {{
                      formatIngredients(
                        state.language === "th" && selectedItem.ingredients_th
                          ? selectedItem.ingredients_th
                          : selectedItem.ingredients,
                      )
                    }}
                  </p>
                </div>

                <div class="border-t border-stone-100 pt-3">
                  <div class="text-xs flex items-baseline gap-1.5 flex-wrap">
                    <span class="font-medium text-red-500">
                      {{
                        state.language === "th"
                          ? "สารก่อภูมิแพ้:"
                          : "Allergens:"
                      }}
                    </span>
                    <span class="font-bold text-red-800">
                      {{
                        formatAllergens(getMenuAllergens(selectedItem)) ||
                        (state.language === "th"
                          ? "ไม่มีข้อมูลสารก่อภูมิแพ้"
                          : "None")
                      }}
                    </span>
                  </div>
                </div>

                <div
                  class="flex gap-4 border-t border-stone-100 pt-3 text-xs text-stone-700"
                >
                  <div v-if="selectedItem.category">
                    <span class="font-medium text-stone-500">
                      {{
                        state.language === "th" ? "หมวดหมู่: " : "Category: "
                      }}
                    </span>
                    <span class="font-bold text-stone-800">{{
                      selectedItem.category
                    }}</span>
                  </div>
                  <div v-if="selectedItem.calories">
                    <span class="font-medium text-stone-500">Calories: </span>
                    <span class="font-bold text-stone-800"
                      >{{ selectedItem.calories }} kcal</span
                    >
                  </div>
                </div>

                <div
                  v-if="
                    selectedItem.spice_level !== undefined &&
                    selectedItem.spice_level !== null
                  "
                  class="border-t border-stone-100 pt-3 text-xs flex items-center justify-between gap-2 overflow-visible"
                >
                  <div
                    class="flex items-center gap-1.5 whitespace-nowrap min-w-0"
                  >
                    <span class="font-medium text-stone-500 shrink-0">
                      {{
                        state.language === "th"
                          ? "ระดับความเผ็ด:"
                          : "Spiciness:"
                      }}
                    </span>
                    <span class="font-bold text-stone-800 whitespace-nowrap">
                      {{
                        Number(selectedItem.spice_level) === 0
                          ? state.language === "th"
                            ? "ไม่เผ็ด (Level 0)"
                            : "Non-spicy (Level 0)"
                          : Number(selectedItem.spice_level) === 1
                            ? state.language === "th"
                              ? "เผ็ดน้อย (Level 1)"
                              : "Mild (Level 1)"
                            : Number(selectedItem.spice_level) === 2
                              ? state.language === "th"
                                ? "เผ็ดปานกลาง (Level 2)"
                                : "Medium (Level 2)"
                              : Number(selectedItem.spice_level) === 3
                                ? state.language === "th"
                                  ? "เผ็ดมาก (Level 3)"
                                  : "Hot (Level 3)"
                                : Number(selectedItem.spice_level) === 4
                                  ? state.language === "th"
                                    ? "เผ็ดจัด (Level 4)"
                                    : "Extra Hot (Level 4)"
                                  : state.language === "th"
                                    ? "เผ็ดสุดขีด (Level 5)"
                                    : "Extreme (Level 5)"
                      }}
                    </span>
                  </div>

                  <div
                    class="relative w-32 h-6 flex items-center justify-end shrink-0"
                  >
                    <img
                      :src="`/spice-levels/level-${Number(selectedItem.spice_level) || 0}.png`"
                      :alt="`Spice level ${selectedItem.spice_level}`"
                      class="h-5 w-auto object-contain transform scale-[2.8] origin-right pointer-events-none drop-shadow-xs"
                    />
                  </div>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </Transition>
    </template>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.zoom-enter-active,
.zoom-leave-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.zoom-enter-from,
.zoom-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
