<script setup>
import QrcodeVue from "qrcode.vue";
import TopBar from "../../components/common/TopBar.vue";
import SideNav from "../../components/common/SideNav.vue";

import { useAppState } from "../../services/appState";
import { useOwnerTables } from "../../composables/owner/useOwnerTables";

const { state } = useAppState();

const {
  restaurantName,
  tables,
  showModal,
  form,
  showPrintModal,
  printForm,
  showDeleteModal,
  tableToDeleteNumber,
  isDeleting,
  tablesToPrint,
  generateTables,
  promptDeleteTable,
  cancelDeleteTable,
  confirmDeleteTable,
  generateTableUrl,
  openPrintModal,
  executePrint,
  getSeatColorClass,
} = useOwnerTables(state);

const ownerNav = [
  { label: "Dashboard", to: "/owner/dashboard", short: "Home" },
  { label: "Menu Management", to: "/owner/menu-management", short: "Menu" },
  { label: "Orders", to: "/owner/orders" },
  { label: "Staff Accounts", to: "/owner/staff-accounts", short: "Staff" },
  { label: "Logout", to: "/logout", short: "Logout" },
];
</script>

<template>
  <div class="page-shell">
    <TopBar owner />

    <div class="content-shell">
      <SideNav :items="ownerNav" />

      <main class="main-panel p-4 md:p-6 lg:p-8">
        <!-- Header Section -->
        <div
          class="flex flex-col lg:flex-row lg:items-center justify-between gap-5 mb-6 md:mb-8"
        >
          <div>
            <h1 class="text-3xl md:text-4xl font-black text-stone-900">
              {{
                state.language === "en"
                  ? "Table Management"
                  : "จัดการโต๊ะและ QR Code"
              }}
            </h1>
            <p class="text-sm text-stone-500 mt-2 max-w-lg">
              {{
                state.language === "en"
                  ? "Set table capacity and generate QR codes for customers to scan and order."
                  : "กำหนดจำนวนที่นั่งของโต๊ะอาหาร และสร้าง QR Code สำหรับให้ลูกค้าสแกนสั่งอาหาร"
              }}
            </p>
          </div>

          <!-- Action buttons group -->
          <div
            class="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto"
            v-if="tables.length > 0"
          >
            <button
              @click="openPrintModal"
              class="w-full sm:w-auto bg-white border-2 border-stone-200 hover:border-stone-300 text-stone-700 font-bold px-5 py-3 sm:py-2.5 rounded-2xl shadow-sm transition-all active:scale-95 text-sm flex items-center justify-center gap-2"
            >
              <svg
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                />
              </svg>
              {{ state.language === "en" ? "Print QR" : "พิมพ์ QR Code" }}
            </button>

            <button
              @click="showModal = true"
              class="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-3 sm:py-2.5 rounded-2xl shadow-md transition-all active:scale-95 text-sm flex items-center justify-center gap-2"
            >
              <svg
                class="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 4v16m8-8H4"
                />
              </svg>
              {{ state.language === "en" ? "Add Table" : "เพิ่มโต๊ะ" }}
            </button>
          </div>
        </div>

        <!-- Empty State -->
        <div
          v-if="tables.length === 0"
          class="flex flex-col items-center justify-center p-8 md:p-12 bg-white border-2 border-dashed border-stone-200 rounded-3xl mt-4 min-h-[300px] md:min-h-[400px] text-center"
        >
          <div
            class="w-16 h-16 md:w-20 md:h-20 bg-stone-100 rounded-full flex items-center justify-center mb-6"
          >
            <svg
              class="w-8 h-8 md:w-10 md:h-10 text-stone-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
                d="M4 6h16M4 10h16M4 14h16M4 18h16"
              />
            </svg>
          </div>
          <h3 class="text-lg md:text-xl font-bold text-stone-800 mb-2">
            {{
              state.language === "en"
                ? "No tables created yet"
                : "ยังไม่มีข้อมูลโต๊ะอาหาร"
            }}
          </h3>
          <button
            @click="showModal = true"
            class="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3 md:px-8 md:py-3.5 rounded-2xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
          >
            {{
              state.language === "en"
                ? "Setup Your Tables"
                : "เริ่มตั้งค่าสร้างโต๊ะ"
            }}
          </button>
        </div>

        <!-- Table Grid -->
        <div
          v-else
          class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5"
        >
          <div
            v-for="table in tables"
            :key="table.id"
            class="bg-white border border-stone-200 rounded-3xl p-4 md:p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between group"
          >
            <div>
              <div class="flex items-center justify-between mb-4">
                <span
                  class="text-base md:text-lg font-black text-stone-800 flex items-center gap-2"
                >
                  <div class="w-2 h-2 rounded-full bg-emerald-500"></div>
                  {{ state.language === "en" ? "Table" : "โต๊ะ" }}
                  {{ table.number }}
                </span>
                <span
                  class="text-xs px-3 py-1 rounded-full font-bold transition-colors"
                  :class="getSeatColorClass(table.seats)"
                >
                  {{ table.seats }}
                  {{ state.language === "en" ? "Seats" : "ที่นั่ง" }}
                </span>
              </div>

              <!-- QR Code Card -->
              <div
                class="bg-stone-50 border border-stone-200 aspect-square rounded-2xl flex flex-col items-center justify-center p-3 md:p-4 text-center group-hover:bg-stone-100 transition-colors"
              >
                <div
                  class="w-full max-w-[140px] aspect-square mx-auto bg-white border border-stone-200 rounded-2xl mb-3 flex items-center justify-center shadow-sm p-3 overflow-hidden"
                >
                  <qrcode-vue
                    :value="generateTableUrl(table.number)"
                    :size="110"
                    level="M"
                    class="w-full h-full"
                  />
                </div>
                <div
                  class="bg-white px-2 py-2 rounded-md border border-stone-200 w-full text-center flex flex-col gap-0.5 shadow-sm"
                >
                  <span
                    class="text-[10px] md:text-[11px] font-bold text-stone-700 truncate"
                    >{{ restaurantName }}</span
                  >
                  <span
                    class="text-[11px] md:text-[12px] font-black text-emerald-600"
                  >
                    {{ state.language === "en" ? "Table" : "โต๊ะ" }}
                    {{ table.number }}
                  </span>
                </div>
              </div>
            </div>

            <div class="mt-4 md:mt-5 pt-4 border-t border-stone-100">
              <button
                @click="promptDeleteTable(table.id, table.number)"
                class="w-full text-sm font-bold text-red-500 hover:bg-red-50 py-2.5 rounded-xl transition-all border border-transparent hover:border-red-100"
              >
                {{ state.language === "en" ? "Delete Table" : "ลบโต๊ะนี้" }}
              </button>
            </div>
          </div>
        </div>

        <!-- ================= MODALS ================= -->

        <!-- Modal for Delete Confirmation -->
        <div
          v-if="showDeleteModal"
          class="fixed inset-0 z-[60] flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4 transition-opacity"
        >
          <div
            class="bg-white w-full max-w-[320px] rounded-3xl p-6 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-200"
          >
            <div
              class="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4"
            >
              <svg
                class="w-8 h-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2.5"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </div>
            <h3 class="text-xl font-bold text-stone-900 mb-2">
              {{
                state.language === "en" ? "Delete Table?" : "ยืนยันการลบโต๊ะ?"
              }}
            </h3>
            <p class="text-sm text-stone-500 mb-6 leading-relaxed">
              {{
                state.language === "en"
                  ? `Are you sure you want to delete Table ${tableToDeleteNumber}?`
                  : `คุณแน่ใจหรือไม่ว่าต้องการลบโต๊ะ ${tableToDeleteNumber}?`
              }}
            </p>
            <div class="flex gap-3">
              <button
                @click="cancelDeleteTable"
                class="flex-1 py-3 rounded-xl font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 active:scale-95 transition-transform"
              >
                {{ state.language === "en" ? "Cancel" : "ยกเลิก" }}
              </button>
              <button
                @click="confirmDeleteTable"
                :disabled="isDeleting"
                class="flex-1 py-3 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 active:scale-95 transition-transform disabled:opacity-70 disabled:active:scale-100"
              >
                {{
                  isDeleting
                    ? state.language === "en"
                      ? "Deleting..."
                      : "กำลังลบ..."
                    : state.language === "en"
                      ? "Delete"
                      : "ลบโต๊ะ"
                }}
              </button>
            </div>
          </div>
        </div>

        <!-- Modal for Print Settings -->
        <div
          v-if="showPrintModal"
          class="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4 transition-opacity"
        >
          <div
            class="w-full max-w-md rounded-[2rem] bg-white p-6 md:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
          >
            <div class="flex items-center gap-4 mb-6">
              <div
                class="w-12 h-12 bg-stone-100 text-stone-700 rounded-2xl flex items-center justify-center shrink-0"
              >
                <svg
                  class="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div>
                <h2 class="text-xl font-black text-stone-900">
                  {{
                    state.language === "en" ? "Print QR Codes" : "พิมพ์ QR Code"
                  }}
                </h2>
                <p class="text-xs text-stone-500 mt-1">
                  {{
                    state.language === "en"
                      ? "Configure QR size for printing"
                      : "ตั้งค่าขนาด QR Code สำหรับพิมพ์"
                  }}
                </p>
              </div>
            </div>

            <div
              class="space-y-4 md:space-y-5 bg-stone-50 p-4 md:p-5 rounded-2xl border border-stone-100"
            >
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-bold text-stone-600 mb-2">{{
                    state.language === "en" ? "From Table" : "เริ่มจากโต๊ะ"
                  }}</label>
                  <select
                    v-model="printForm.startTable"
                    class="w-full px-3 py-2.5 rounded-xl border border-stone-200 outline-none focus:border-stone-400 text-sm font-bold bg-white"
                  >
                    <option
                      v-for="t in tables"
                      :key="'start' + t.id"
                      :value="t.number"
                    >
                      {{ t.number }}
                    </option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-bold text-stone-600 mb-2">{{
                    state.language === "en" ? "To Table" : "ถึงโต๊ะ"
                  }}</label>
                  <select
                    v-model="printForm.endTable"
                    class="w-full px-3 py-2.5 rounded-xl border border-stone-200 outline-none focus:border-stone-400 text-sm font-bold bg-white"
                  >
                    <option
                      v-for="t in tables"
                      :key="'end' + t.id"
                      :value="t.number"
                    >
                      {{ t.number }}
                    </option>
                  </select>
                </div>
              </div>

              <div>
                <label
                  class="flex justify-between text-xs font-bold text-stone-600 mb-2"
                >
                  <span>{{
                    state.language === "en"
                      ? "QR Size (Width & Height)"
                      : "ขนาด QR Code (กว้าง x ยาว)"
                  }}</span>
                </label>
                <div
                  class="flex items-center w-full rounded-xl border border-stone-200 bg-white overflow-hidden shadow-sm"
                >
                  <input
                    v-model.number="printForm.qrSizeCm"
                    type="number"
                    step="0.5"
                    min="2"
                    class="flex-1 px-4 py-2.5 text-sm font-bold text-stone-800 outline-none"
                  />
                  <div
                    class="px-4 py-2.5 bg-stone-100 text-stone-500 text-xs font-bold border-l border-stone-200"
                  >
                    cm
                  </div>
                </div>
              </div>

              <p class="text-[11px] text-stone-500 mt-2 leading-relaxed">
                *
                {{
                  state.language === "en"
                    ? "The layout will automatically wrap and adjust based on your A4 paper setting in the print dialog."
                    : "ระบบจะทำการเรียงจำนวนต่อหน้าให้คุ้มค่าที่สุดอัตโนมัติ ตามพื้นที่หน้ากระดาษ A4 ในระบบสั่งพิมพ์"
                }}
              </p>
            </div>

            <div
              class="mt-6 md:mt-8 flex flex-col sm:flex-row justify-end gap-3"
            >
              <button
                @click="showPrintModal = false"
                class="rounded-xl border border-stone-200 px-5 py-3 text-sm font-bold text-stone-600 hover:bg-stone-50 transition-colors w-full sm:w-auto order-2 sm:order-1"
              >
                {{ state.language === "en" ? "Cancel" : "ยกเลิก" }}
              </button>
              <button
                @click="executePrint"
                class="rounded-xl bg-stone-800 px-6 py-3 text-sm font-bold text-white shadow-lg hover:bg-black transition-all w-full sm:w-auto flex justify-center items-center gap-2 order-1 sm:order-2"
              >
                <svg
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2z"
                  />
                </svg>
                {{
                  state.language === "en" ? "Start Printing" : "เปิดหน้าพิมพ์"
                }}
              </button>
            </div>
          </div>
        </div>

        <!-- Modal for Add Table -->
        <div
          v-if="showModal"
          class="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4 transition-opacity"
        >
          <div
            class="w-full max-w-md rounded-[2rem] bg-white p-6 md:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
          >
            <div class="flex items-center gap-4 mb-6">
              <div
                class="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0"
              >
                <svg
                  class="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              </div>
              <div>
                <h2 class="text-xl font-black text-stone-900">
                  {{
                    state.language === "en"
                      ? tables.length > 0
                        ? "Add Tables"
                        : "Setup Tables"
                      : tables.length > 0
                        ? "เพิ่มโต๊ะอาหาร"
                        : "ตั้งค่าสร้างโต๊ะ"
                  }}
                </h2>
                <p class="text-xs text-stone-500 mt-1">
                  {{
                    state.language === "en"
                      ? "Quickly generate your restaurant layout."
                      : "สร้างหรือเพิ่มรายการโต๊ะสำหรับร้านของคุณอย่างรวดเร็ว"
                  }}
                </p>
              </div>
            </div>

            <div
              class="space-y-5 md:space-y-6 bg-stone-50 p-4 md:p-5 rounded-2xl border border-stone-100"
            >
              <!-- Number of tables -->
              <div>
                <label
                  class="block text-sm font-bold text-stone-700 mb-2 md:mb-3 text-center"
                  >{{
                    state.language === "en"
                      ? "How many tables to add?"
                      : "ต้องการเพิ่มกี่โต๊ะ?"
                  }}</label
                >
                <div
                  class="flex items-center w-full rounded-2xl border border-stone-200 bg-white overflow-hidden focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all shadow-sm"
                >
                  <button
                    type="button"
                    @click="if (form.tableCount > 1) form.tableCount--;"
                    class="w-14 md:w-16 h-12 md:h-14 flex items-center justify-center bg-stone-50 hover:bg-stone-100 text-stone-600 cursor-pointer shrink-0"
                  >
                    <svg
                      class="w-5 h-5 md:w-6 md:h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2.5"
                        d="M20 12H4"
                      />
                    </svg>
                  </button>
                  <div
                    class="flex-1 flex items-center justify-center border-x border-stone-200 bg-white h-12 md:h-14"
                  >
                    <input
                      v-model.number="form.tableCount"
                      type="number"
                      min="1"
                      class="w-12 md:w-16 text-center text-lg md:text-xl font-black text-stone-800 outline-none bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span
                      class="text-stone-400 text-xs md:text-sm font-bold ml-1"
                      >{{ state.language === "en" ? "Tables" : "โต๊ะ" }}</span
                    >
                  </div>
                  <button
                    type="button"
                    @click="form.tableCount++"
                    class="w-14 md:w-16 h-12 md:h-14 flex items-center justify-center bg-stone-50 hover:bg-stone-100 text-emerald-600 cursor-pointer shrink-0"
                  >
                    <svg
                      class="w-5 h-5 md:w-6 md:h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2.5"
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              <!-- Number of seats per table -->
              <div>
                <label
                  class="block text-sm font-bold text-stone-700 mb-2 md:mb-3 text-center"
                  >{{
                    state.language === "en"
                      ? "Seats per table?"
                      : "จำนวนที่นั่งต่อโต๊ะ"
                  }}</label
                >
                <div
                  class="flex items-center w-full rounded-2xl border border-stone-200 bg-white overflow-hidden focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all shadow-sm"
                >
                  <button
                    type="button"
                    @click="if (form.seatsPerTable > 1) form.seatsPerTable--;"
                    class="w-14 md:w-16 h-12 md:h-14 flex items-center justify-center bg-stone-50 hover:bg-stone-100 text-stone-600 cursor-pointer shrink-0"
                  >
                    <svg
                      class="w-5 h-5 md:w-6 md:h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2.5"
                        d="M20 12H4"
                      />
                    </svg>
                  </button>
                  <div
                    class="flex-1 flex items-center justify-center border-x border-stone-200 bg-white h-12 md:h-14"
                  >
                    <input
                      v-model.number="form.seatsPerTable"
                      type="number"
                      min="1"
                      class="w-12 md:w-16 text-center text-lg md:text-xl font-black text-stone-800 outline-none bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span
                      class="text-stone-400 text-xs md:text-sm font-bold ml-1"
                      >{{ state.language === "en" ? "Seats" : "ที่นั่ง" }}</span
                    >
                  </div>
                  <button
                    type="button"
                    @click="form.seatsPerTable++"
                    class="w-14 md:w-16 h-12 md:h-14 flex items-center justify-center bg-stone-50 hover:bg-stone-100 text-emerald-600 cursor-pointer shrink-0"
                  >
                    <svg
                      class="w-5 h-5 md:w-6 md:h-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2.5"
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            <div
              v-if="tables.length > 0"
              class="mt-4 flex items-start gap-2 text-blue-600 bg-blue-50 p-3 rounded-xl border border-blue-100 text-xs font-medium leading-relaxed"
            >
              <svg
                class="w-4 h-4 shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>{{
                state.language === "en"
                  ? "New tables will be added continuing from your existing table numbers."
                  : "โต๊ะใหม่จะถูกสร้างและรันหมายเลขต่อจากโต๊ะที่มีอยู่เดิม"
              }}</span>
            </div>

            <div
              class="mt-6 md:mt-8 flex flex-col sm:flex-row justify-end gap-3"
            >
              <button
                @click="showModal = false"
                class="rounded-xl border border-stone-200 px-5 py-3 text-sm font-bold text-stone-600 hover:bg-stone-50 transition-colors w-full sm:w-auto order-2 sm:order-1"
              >
                {{ state.language === "en" ? "Cancel" : "ยกเลิก" }}
              </button>
              <button
                @click="generateTables"
                class="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all w-full sm:w-auto order-1 sm:order-2"
              >
                {{
                  state.language === "en"
                    ? tables.length > 0
                      ? "Add Tables"
                      : "Generate Tables"
                    : tables.length > 0
                      ? "ยืนยันการเพิ่มโต๊ะ"
                      : "สร้างโต๊ะทั้งหมด"
                }}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>

  <!-- Print Display Zone -->
  <div class="print-only-layout">
    <div class="print-container">
      <div
        class="print-card"
        v-for="table in tablesToPrint"
        :key="table.id"
        :style="{ width: printForm.qrSizeCm + 'cm' }"
      >
        <div class="qr-wrapper">
          <qrcode-vue
            :value="generateTableUrl(table.number)"
            :size="printForm.qrSizeCm * 37.8"
            level="M"
          />
        </div>
        <div class="print-card-text">
          <div class="print-shop-name">{{ restaurantName }}</div>
          <div class="print-table-num">
            {{ state.language === "en" ? "Table" : "โต๊ะ" }} {{ table.number }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.print-only-layout {
  display: none;
}
@media print {
  @page {
    size: A4 portrait;
    margin: 1cm;
  }
  body {
    background: white;
    margin: 0;
    padding: 0;
  }
  .page-shell,
  #app > div:not(.print-only-layout) {
    display: none !important;
  }
  .print-only-layout {
    display: block;
    width: 100%;
  }
  .print-container {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    justify-content: flex-start;
    gap: 0.5cm;
  }
  .print-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: 1px dashed #ccc;
    padding: 0.4cm;
    box-sizing: content-box;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .qr-wrapper {
    background: white;
    margin-bottom: 0.2cm;
  }
  .print-card-text {
    text-align: center;
    font-family: sans-serif;
    width: 100%;
  }
  .print-shop-name {
    font-size: 11px;
    font-weight: bold;
    color: #333;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .print-table-num {
    font-size: 16px;
    font-weight: 900;
    color: #000;
    margin-top: 0.1cm;
  }
}
</style>
