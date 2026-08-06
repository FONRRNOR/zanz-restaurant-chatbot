<script setup>
import { computed, ref, watch, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAppState } from "../../services/appState";
import {
  ArrowLeft,
  Utensils,
  Plus,
  Minus,
  Trash2,
  CheckCircle,
  Pencil,
} from "lucide-vue-next";

import { supabase } from "../../supabaseClient";

const { state } = useAppState();

const router = useRouter();
const route = useRoute();
const isSubmitting = ref(false);

const showDeleteModal = ref(false);
const itemToDelete = ref(null);

// State สำหรับเก็บโน้ตของแต่ละเมนู
const itemNotes = ref({});

// State สำหรับเปิด/ปิดช่องกรอกโน้ต (key เป็น item.id)
const showNoteInput = ref({});

const showSuccessModal = ref(false);
const successOrderCode = ref("");

const groupedCartItems = computed(() => {
  if (!state.cart) return [];
  const groups = {};

  state.cart.forEach((item) => {
    if (!groups[item.id]) {
      groups[item.id] = { ...item, quantity: 0 };
    }
    groups[item.id].quantity++;
  });

  return Object.values(groups);
});

const subtotal = computed(() => {
  if (!state.cart) return 0;
  return state.cart.reduce(
    (sum, item) => sum + (item.priceNum || parseFloat(item.price) || 0),
    0,
  );
});
const serviceFee = computed(() => 0);
const total = computed(() => subtotal.value + serviceFee.value);

// ดึงข้อมูล Cart และ Note จาก sessionStorage ตอนเปิดหน้านี้ขึ้นมา
onMounted(() => {
  const resId = route.query.restaurantId;
  const tabId = route.query.tableId;

  if (resId && tabId) {
    // 💡 1. เพิ่มการดึง Cart กลับมา ป้องกันตะกร้าหายตอนรีเฟรชเว็บ
    const savedCart = sessionStorage.getItem(`cart_${resId}_${tabId}`);
    if (savedCart) {
      try {
        state.cart = JSON.parse(savedCart);
      } catch (e) {
        state.cart = [];
      }
    }

    // 2. ดึงข้อมูล Note ตามเดิม
    const savedNotes = sessionStorage.getItem(`notes_${resId}_${tabId}`);
    if (savedNotes) {
      try {
        const parsedNotes = JSON.parse(savedNotes);
        itemNotes.value = parsedNotes;

        Object.keys(parsedNotes).forEach((id) => {
          if (parsedNotes[id] && parsedNotes[id].trim() !== "") {
            showNoteInput.value[id] = true;
          }
        });
      } catch (e) {
        console.error("Error parsing notes:", e);
      }
    }
  }
});

// Watch ตะกร้าสินค้า
watch(
  () => state.cart,
  (newCart) => {
    const resId = route.query.restaurantId;
    const tabId = route.query.tableId;
    if (resId && tabId && newCart) {
      sessionStorage.setItem(`cart_${resId}_${tabId}`, JSON.stringify(newCart));
    }
  },
  { deep: true },
);

// Watch ข้อมูล Note ถ้ามีการพิมพ์เปลี่ยนให้เซฟลง sessionStorage อัตโนมัติ
watch(
  itemNotes,
  (newNotes) => {
    const resId = route.query.restaurantId;
    const tabId = route.query.tableId;
    if (resId && tabId) {
      sessionStorage.setItem(
        `notes_${resId}_${tabId}`,
        JSON.stringify(newNotes),
      );
    }
  },
  { deep: true },
);

const toggleNoteInput = (id) => {
  showNoteInput.value[id] = !showNoteInput.value[id];
};

const goBackToMenu = () => {
  router.push({
    path: "/customer/menu/mobile",
    query: {
      restaurantId: route.query.restaurantId,
      tableId: route.query.tableId,
    },
  });
};

const adjustQuantity = (item, amount) => {
  if (!state.cart) state.cart = [];

  if (amount > 0) {
    state.cart.push(item);
  } else {
    const currentQuantity = state.cart.filter((c) => c.id === item.id).length;

    if (currentQuantity === 1) {
      itemToDelete.value = item;
      showDeleteModal.value = true;
    } else {
      const index = state.cart.findIndex((c) => c.id === item.id);
      if (index !== -1) state.cart.splice(index, 1);
    }
  }
};

const promptRemoveItem = (item) => {
  itemToDelete.value = item;
  showDeleteModal.value = true;
};

const confirmDelete = () => {
  if (itemToDelete.value && state.cart) {
    state.cart = state.cart.filter((c) => c.id !== itemToDelete.value.id);
    delete itemNotes.value[itemToDelete.value.id];
    delete showNoteInput.value[itemToDelete.value.id];
  }
  showDeleteModal.value = false;
  setTimeout(() => {
    itemToDelete.value = null;
  }, 300);
};

const cancelDelete = () => {
  showDeleteModal.value = false;
  setTimeout(() => {
    itemToDelete.value = null;
  }, 300);
};

const submitOrder = async () => {
  if (!state.cart || state.cart.length === 0) return;

  isSubmitting.value = true;

  try {
    const restaurantId = route.query.restaurantId;
    const tableId = route.query.tableId;

    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .insert({
        table_number: tableId,
        total_price: total.value,
        restaurant_id: restaurantId,
        status: "pending",
      })
      .select("id, order_code")
      .single();

    if (orderError) throw orderError;

    const orderItems = groupedCartItems.value.map((item) => ({
      order_id: orderData.id,
      menu_id: item.id,
      menu_name: item.name,
      quantity: item.quantity,
      price_at_order: item.priceNum || parseFloat(item.price),
      note:
        itemNotes.value[item.id] && itemNotes.value[item.id].trim() !== ""
          ? itemNotes.value[item.id]
          : null,
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItems);

    if (itemsError) throw itemsError;

    // เก็บ Order Code ไว้แสดง
    successOrderCode.value = orderData.order_code;

    // เคลียร์ข้อมูลทั้งหมดเมื่อสั่งสำเร็จ
    state.cart = [];
    itemNotes.value = {};
    showNoteInput.value = {};
    sessionStorage.removeItem(`cart_${restaurantId}_${tableId}`);
    sessionStorage.removeItem(`notes_${restaurantId}_${tableId}`);

    // เปิด Modal สำเร็จ
    showSuccessModal.value = true;
  } catch (error) {
    console.error("Error submitting order:", error);
    alert("เกิดข้อผิดพลาดในการสั่งอาหาร กรุณาลองใหม่อีกครั้ง");
  } finally {
    isSubmitting.value = false;
  }
};

const closeSuccessModal = () => {
  showSuccessModal.value = false;
  goBackToMenu();
};
</script>

<template>
  <div
    class="mobile-shell flex flex-col h-screen bg-stone-50 overflow-hidden relative"
  >
    <!-- Top Bar -->
    <header
      class="bg-white px-4 pt-4 pb-3 flex items-center justify-center relative shadow-sm z-10"
    >
      <button
        @click="goBackToMenu"
        class="touch-manipulation absolute left-4 w-10 h-10 flex items-center justify-center rounded-full bg-stone-100 text-stone-600 hover:bg-stone-200 active:scale-95 transition-colors"
      >
        <ArrowLeft :size="20" />
      </button>
      <h1 class="font-extrabold text-stone-900 text-lg">
        {{ state.language === "th" ? "ตะกร้าสินค้า" : "Your Cart" }}
      </h1>
    </header>

    <!-- ถ้าไม่มีของในตะกร้า -->
    <div
      v-if="!state.cart || state.cart.length === 0"
      class="flex-1 flex flex-col items-center justify-center p-6 text-center"
    >
      <Utensils :size="48" class="text-stone-300 mb-4" />
      <h2 class="text-xl font-bold text-stone-800 mb-2">
        {{ state.language === "th" ? "ตะกร้าว่างเปล่า" : "Your cart is empty" }}
      </h2>
      <p class="text-stone-500 text-sm mb-8">
        {{
          state.language === "th"
            ? "คุณยังไม่ได้เลือกเมนูอาหารเลย"
            : "Add some delicious items to your cart."
        }}
      </p>
      <button
        @click="goBackToMenu"
        class="touch-manipulation bg-stone-900 text-white font-bold py-3 px-8 rounded-full active:scale-95 transition-transform"
      >
        {{ state.language === "th" ? "เลือกเมนูอาหาร" : "Browse Menu" }}
      </button>
    </div>

    <!-- ถ้ามีของในตะกร้า -->
    <template v-else>
      <main class="flex-1 overflow-y-auto px-4 py-6 pb-32">
        <!-- Table Info -->
        <div
          class="bg-white rounded-2xl p-4 mb-4 shadow-sm flex items-center justify-between border border-stone-100"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center text-stone-500"
            >
              <Utensils :size="18" />
            </div>
            <div>
              <p
                class="text-xs font-bold text-stone-400 uppercase tracking-wider"
              >
                {{ state.language === "th" ? "รับประทานที่ร้าน" : "Dine-in" }}
              </p>
              <p class="font-black text-stone-900">
                {{ state.language === "th" ? "โต๊ะ" : "Table" }}
                {{ route.query.tableId || state.tableNumber || "-" }}
              </p>
            </div>
          </div>
        </div>

        <!-- Order Items List -->
        <div
          class="bg-white rounded-2xl p-5 mb-6 shadow-sm border border-stone-100"
        >
          <h3
            class="font-black text-stone-900 mb-4 border-b border-stone-100 pb-3"
          >
            {{ state.language === "th" ? "รายการอาหารของคุณ" : "Your Items" }}
          </h3>

          <div class="space-y-6">
            <div
              v-for="item in groupedCartItems"
              :key="item.id"
              class="flex gap-4 items-start flex-col border-b border-dashed border-stone-200 pb-6 last:border-b-0 last:pb-0"
            >
              <!-- แถวบน: รูป รายละเอียด และปุ่มต่างๆ -->
              <div class="flex gap-4 items-start w-full">
                <!-- รูปภาพ -->
                <div
                  class="w-20 h-20 rounded-xl bg-stone-100 flex-shrink-0 overflow-hidden"
                >
                  <img
                    v-if="item.image"
                    :src="item.image"
                    class="w-full h-full object-cover"
                  />
                  <div
                    v-else
                    class="w-full h-full flex items-center justify-center text-stone-300 text-[10px]"
                  >
                    No Image
                  </div>
                </div>

                <!-- รายละเอียด และ กลุ่มปุ่มจัดการ -->
                <div
                  class="flex-1 flex flex-col min-w-0 h-full justify-between"
                >
                  <div>
                    <h4
                      class="font-bold text-stone-900 text-sm leading-snug line-clamp-2"
                    >
                      {{
                        state.language === "th" && item.name_th
                          ? item.name_th
                          : item.name
                      }}
                    </h4>
                    <p class="font-bold text-stone-500 text-sm mt-1">
                      {{
                        (
                          item.priceNum || parseFloat(item.price)
                        ).toLocaleString()
                      }}
                      B.
                    </p>
                  </div>

                  <div class="flex items-center justify-between mt-3">
                    <!-- ปุ่ม - จำนวน + -->
                    <div
                      class="flex items-center gap-3 bg-stone-50 border border-stone-200 rounded-full px-1 py-1"
                    >
                      <button
                        @click="adjustQuantity(item, -1)"
                        class="touch-manipulation w-7 h-7 rounded-full bg-white shadow-sm flex items-center justify-center text-stone-600 hover:text-stone-900"
                      >
                        <Minus :size="14" stroke-width="3" />
                      </button>
                      <span
                        class="w-4 text-center text-sm font-bold text-stone-900"
                        >{{ item.quantity }}</span
                      >
                      <button
                        @click="adjustQuantity(item, 1)"
                        class="touch-manipulation w-7 h-7 rounded-full flex items-center justify-center bg-stone-900 text-white hover:bg-stone-800 active:scale-95 transition-transform flex-shrink-0"
                      >
                        <Plus :size="14" stroke-width="3" />
                      </button>
                    </div>

                    <!-- กลุ่มปุ่มด้านขวา: โน้ต + ถังขยะ -->
                    <div class="flex items-center gap-2">
                      <button
                        @click="toggleNoteInput(item.id)"
                        class="touch-manipulation p-2 rounded-full transition-colors"
                        :class="
                          itemNotes[item.id]
                            ? 'bg-amber-100 text-amber-600 hover:bg-amber-200'
                            : 'bg-stone-50 text-stone-400 hover:text-stone-600 hover:bg-stone-100'
                        "
                      >
                        <Pencil :size="16" />
                      </button>
                      <button
                        @click="promptRemoveItem(item)"
                        class="touch-manipulation p-2 text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 transition-colors rounded-full"
                      >
                        <Trash2 :size="16" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- แถวล่าง: ช่องสำหรับกรอก Note -->
              <div
                v-if="showNoteInput[item.id]"
                class="w-full pl-[0px] mt-2 origin-top transition-all"
              >
                <input
                  type="text"
                  v-model="itemNotes[item.id]"
                  @keyup.enter="toggleNoteInput(item.id)"
                  :placeholder="
                    state.language === 'th'
                      ? 'คำขอเพิ่มเติม (ถ้ามี)'
                      : 'Special instructions (optional)'
                  "
                  class="w-full bg-stone-50 border border-stone-200 rounded-md px-3 py-1.5 text-xs text-stone-700 placeholder-stone-400 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Summary & Total -->
        <div class="bg-white rounded-2xl p-5 shadow-sm border border-stone-100">
          <div class="space-y-3 mb-4 border-b border-stone-100 pb-4">
            <div
              class="flex justify-between text-sm text-stone-500 font-medium"
            >
              <span>{{ state.language === "th" ? "ยอดรวม" : "Subtotal" }}</span>
              <span>{{ subtotal.toLocaleString() }} B.</span>
            </div>
            <div
              class="flex justify-between text-sm text-stone-500 font-medium"
            >
              <span>{{
                state.language === "th" ? "ค่าบริการ" : "Service Fee"
              }}</span>
              <span>{{ serviceFee.toLocaleString() }} B.</span>
            </div>
          </div>
          <div class="flex justify-between items-center">
            <span class="font-black text-stone-900 text-lg">{{
              state.language === "th" ? "รวมทั้งสิ้น" : "Total"
            }}</span>
            <span class="font-black text-2xl text-stone-900"
              >{{ total.toLocaleString() }} B.</span
            >
          </div>
        </div>
      </main>

      <!-- Bottom Sticky Action -->
      <div
        class="fixed bottom-0 left-0 right-0 p-4 z-20 bg-gradient-to-t from-stone-50 via-stone-50 to-transparent pt-8"
      >
        <button
          @click="submitOrder"
          :disabled="isSubmitting"
          class="touch-manipulation w-full bg-stone-900 text-white py-4 rounded-2xl font-black text-center active:scale-[0.99] transition-all shadow-lg flex justify-between items-center px-6 disabled:opacity-70"
        >
          <span>{{
            isSubmitting
              ? state.language === "th"
                ? "กำลังส่ง..."
                : "Submitting..."
              : state.language === "th"
                ? "ยืนยันสั่งอาหาร"
                : "Place Order"
          }}</span>
          <span v-if="!isSubmitting">{{ total.toLocaleString() }} B.</span>
        </button>
      </div>
    </template>
    <!-- จบ tag ของตะกร้าที่มีสินค้า -->

    <!-- 💡 ย้าย Modals ลงมาตรงนี้ ให้ทำงานแยกเป็นอิสระจากตะกร้าสินค้า 💡 -->

    <!-- Delete Confirmation Modal -->
    <Transition name="fade">
      <div
        v-if="showDeleteModal"
        class="fixed inset-0 z-[60] flex items-center justify-center p-5 bg-black/60 backdrop-blur-sm"
        @click="cancelDelete"
      >
        <Transition name="zoom">
          <div
            v-if="showDeleteModal"
            @click.stop
            class="bg-white w-full max-w-[320px] rounded-3xl p-6 text-center shadow-2xl"
          >
            <div
              class="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4"
            >
              <Trash2 size="28" stroke-width="2.5" />
            </div>
            <h3 class="text-lg font-bold text-stone-900 mb-2">
              {{ state.language === "th" ? "ลบเมนูนี้?" : "Remove Item?" }}
            </h3>
            <p class="text-sm text-stone-500 mb-6 leading-relaxed">
              {{
                state.language === "th"
                  ? "คุณต้องการลบรายการนี้ออกจากตะกร้าใช่หรือไม่"
                  : "Are you sure you want to remove this item from your cart?"
              }}
            </p>
            <div class="flex gap-3">
              <button
                @click="cancelDelete"
                class="flex-1 py-3 rounded-xl font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 active:scale-95 transition-transform"
              >
                {{ state.language === "th" ? "ยกเลิก" : "Cancel" }}
              </button>
              <button
                @click="confirmDelete"
                class="flex-1 py-3 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 active:scale-95 transition-transform"
              >
                {{ state.language === "th" ? "ลบรายการ" : "Remove" }}
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>

    <!-- Success Modal -->
    <Transition name="fade">
      <div
        v-if="showSuccessModal"
        class="fixed inset-0 z-[60] flex items-center justify-center p-5 bg-black/60 backdrop-blur-sm"
      >
        <Transition name="zoom">
          <div
            v-if="showSuccessModal"
            class="bg-white w-full max-w-[320px] rounded-3xl p-6 text-center shadow-2xl"
          >
            <div
              class="w-16 h-16 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4"
            >
              <CheckCircle size="28" stroke-width="2.5" />
            </div>
            <h3 class="text-lg font-bold text-stone-900 mb-2">
              {{
                state.language === "th" ? "สั่งอาหารสำเร็จ!" : "Order Placed!"
              }}
            </h3>
            <p class="text-sm text-stone-500 mb-2 leading-relaxed">
              {{
                state.language === "th"
                  ? "ร้านอาหารได้รับออเดอร์ของคุณแล้ว"
                  : "The restaurant has received your order."
              }}
            </p>
            <!-- แสดงรหัส Order -->
            <div
              class="bg-stone-50 rounded-lg py-3 px-4 mb-6 border border-stone-100"
            >
              <span
                class="text-xs text-stone-400 block mb-1 uppercase font-bold"
                >{{
                  state.language === "th" ? "รหัสออเดอร์" : "Order Code"
                }}</span
              >
              <span class="text-lg font-black text-stone-800">{{
                successOrderCode
              }}</span>
            </div>
            <button
              @click="closeSuccessModal"
              class="w-full py-3 rounded-xl font-bold text-white bg-stone-900 hover:bg-stone-800 active:scale-95 transition-transform"
            >
              {{ state.language === "th" ? "กลับไปหน้าเมนู" : "Back to Menu" }}
            </button>
          </div>
        </Transition>
      </div>
    </Transition>
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
