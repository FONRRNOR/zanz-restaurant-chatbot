<script setup>
import { ref, onMounted, computed } from "vue";
import QrcodeVue from "qrcode.vue";
import TopBar from "../../components/TopBar.vue";
import SideNav from "../../components/SideNav.vue";
import { useAppState } from "../../services/appState";
import { supabase } from "../../supabaseClient";

const { state } = useAppState();

const restaurantId = ref("");
const restaurantName = ref("");
const tables = ref([]);
const showModal = ref(false);
const form = ref({
  tableCount: 1,
  seatsPerTable: 4,
});

// --- New QR Print System (Let the browser handle the layout automatically) ---
const showPrintModal = ref(false);
const printForm = ref({
  startTable: "",
  endTable: "",
  qrSizeCm: 8, // Default size 8 cm.
});

// Filter tables based on the selected range for printing
const tablesToPrint = computed(() => {
  if (!printForm.value.startTable || !printForm.value.endTable) return [];
  const startIdx = tables.value.findIndex(
    (t) => t.number === printForm.value.startTable,
  );
  const endIdx = tables.value.findIndex(
    (t) => t.number === printForm.value.endTable,
  );

  if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) return [];
  return tables.value.slice(startIdx, endIdx + 1);
});

function openPrintModal() {
  if (tables.value.length > 0) {
    printForm.value.startTable = tables.value[0].number;
    printForm.value.endTable = tables.value[tables.value.length - 1].number;
  }
  showPrintModal.value = true;
}

function executePrint() {
  showPrintModal.value = false;
  setTimeout(() => {
    window.print();
  }, 300);
}
// ---------------------------------------------------

const ownerNav = [
  { label: "Dashboard", to: "/owner/dashboard", short: "Home" },
  { label: "Menu Management", to: "/owner/menu-management", short: "Menu" },
  { label: "Orders", to: "/owner/orders" },
  { label: "Staff Accounts", to: "/owner/staff-accounts", short: "Staff" },
  { label: "Logout", to: "/logout", short: "Logout" },
];

onMounted(async () => {
  const savedUserJson = sessionStorage.getItem("zank-active-user");
  if (savedUserJson) {
    const localUser = JSON.parse(savedUserJson);
    restaurantId.value = localUser.restaurant_id;
    restaurantName.value = localUser.restaurant_name || "ZANK Restaurant";
    await fetchTables();
  }
});

async function fetchTables() {
  if (!restaurantId.value) return;
  try {
    const { data, error } = await supabase
      .from("tables")
      .select("*")
      .eq("restaurant_id", restaurantId.value)
      .order("table_number", { ascending: true });

    if (error) throw error;
    if (data) {
      tables.value = data.map((t) => ({
        id: t.id,
        number: t.table_number,
        seats: t.seats,
      }));
    }
  } catch (error) {
    console.error("Error fetching tables:", error.message);
  }
}

function generateTableUrl(tableNumber) {
  const baseUrl = window.location.origin;
  if (!restaurantId.value) return "";
  // เติม /mobile เข้าไป เพื่อให้ลูกค้าสแกนแล้วไปหน้า Mobile Menu
  return `${baseUrl}/customer/menu/mobile?restaurantId=${restaurantId.value}&tableId=${tableNumber}`;
}

async function generateTables() {
  if (form.value.tableCount < 1 || form.value.seatsPerTable < 1) return;
  if (!restaurantId.value) {
    alert("Error: No active restaurant ID found.");
    return;
  }

  try {
    let startNumber = 1;
    if (tables.value.length > 0) {
      const maxNum = Math.max(
        ...tables.value.map((t) => parseInt(t.number) || 0),
      );
      startNumber = maxNum + 1;
    }

    const newTablesPayload = [];
    for (let i = 0; i < form.value.tableCount; i++) {
      const tableNum = String(startNumber + i).padStart(2, "0");
      newTablesPayload.push({
        restaurant_id: restaurantId.value,
        table_number: tableNum,
        seats: form.value.seatsPerTable,
      });
    }

    const { error } = await supabase.from("tables").insert(newTablesPayload);
    if (error) throw error;

    showModal.value = false;
    form.value.tableCount = 1;
    await fetchTables();
  } catch (error) {
    alert("Error generating tables: " + error.message);
  }
}

async function deleteTable(tableId, tableNumber) {
  if (!confirm(`Are you sure you want to delete Table ${tableNumber}?`)) return;
  try {
    const { error } = await supabase.from("tables").delete().eq("id", tableId);
    if (error) throw error;
    tables.value = tables.value.filter((t) => t.id !== tableId);
  } catch (error) {
    alert("Error deleting table: " + error.message);
  }
}

function getSeatColorClass(seats) {
  const s = parseInt(seats) || 0;
  if (s <= 2) return "bg-red-100 text-red-600";
  if (s <= 4) return "bg-orange-100 text-orange-600";
  if (s <= 8) return "bg-yellow-100 text-yellow-700"; // Use yellow-700 for better readability
  return "bg-stone-100 text-stone-600"; // More than 8 or others are gray
}
</script>

<template>
  <div class="page-shell">
    <TopBar owner />

    <div class="content-shell">
      <SideNav :items="ownerNav" />

      <main class="main-panel">
        <!-- Header -->
        <div
          class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8"
        >
          <div>
            <h1 class="text-4xl font-black text-stone-900">
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

          <!-- Buttons Group -->
          <div class="flex items-center gap-3" v-if="tables.length > 0">
            <!-- Print QR button -->
            <button
              @click="openPrintModal"
              class="bg-white border-2 border-stone-200 hover:border-stone-300 text-stone-700 font-bold px-5 py-2.5 rounded-2xl shadow-sm transition-all active:scale-95 text-sm flex items-center gap-2"
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

            <!-- Add Table -->
            <button
              @click="showModal = true"
              class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2.5 rounded-2xl shadow-md transition-all active:scale-95 text-sm flex items-center gap-2"
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
          class="flex flex-col items-center justify-center p-12 bg-white border-2 border-dashed border-stone-200 rounded-3xl mt-4 min-h-[400px]"
        >
          <div
            class="w-20 h-20 bg-stone-100 rounded-full flex items-center justify-center mb-6"
          >
            <svg
              class="w-10 h-10 text-stone-400"
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
          <h3 class="text-xl font-bold text-stone-800 mb-2">
            {{
              state.language === "en"
                ? "No tables created yet"
                : "ยังไม่มีข้อมูลโต๊ะอาหาร"
            }}
          </h3>
          <button
            @click="showModal = true"
            class="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-8 py-3.5 rounded-2xl shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
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
          class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5"
        >
          <div
            v-for="table in tables"
            :key="table.id"
            class="bg-white border border-stone-200 rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between group"
          >
            <div>
              <div class="flex items-center justify-between mb-4">
                <span
                  class="text-lg font-black text-stone-800 flex items-center gap-2"
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

              <!-- Display QR Code on the webpage -->
              <div
                class="bg-stone-50 border border-stone-200 aspect-square rounded-2xl flex flex-col items-center justify-center p-4 text-center group-hover:bg-stone-100 transition-colors"
              >
                <div
                  class="w-38 h-38 mx-auto bg-white border border-stone-200 rounded-2xl mb-4 flex items-center justify-center shadow-sm p-4 overflow-hidden"
                >
                  <qrcode-vue
                    :value="generateTableUrl(table.number)"
                    :size="120"
                    level="M"
                  />
                </div>
                <div
                  class="bg-white px-2 py-2 rounded-md border border-stone-200 w-full text-center flex flex-col gap-0.5"
                >
                  <span class="text-[11px] font-bold text-stone-700 truncate">{{
                    restaurantName
                  }}</span>
                  <span class="text-[12px] font-black text-emerald-600">
                    {{ state.language === "en" ? "Table" : "โต๊ะ" }}
                    {{ table.number }}
                  </span>
                </div>
              </div>
            </div>

            <div class="mt-5 pt-4 border-t border-stone-100 flex gap-2">
              <button
                @click="deleteTable(table.id, table.number)"
                class="w-full text-sm font-bold text-red-500 hover:bg-red-50 py-2.5 rounded-xl transition-all border border-transparent hover:border-red-100"
              >
                {{ state.language === "en" ? "Delete Table" : "ลบโต๊ะนี้" }}
              </button>
            </div>
          </div>
        </div>

        <!-- Modal for New Print Settings (Cleaner) -->
        <div
          v-if="showPrintModal"
          class="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4 transition-opacity"
        >
          <div
            class="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
          >
            <div class="flex items-center gap-4 mb-6">
              <div
                class="w-12 h-12 bg-stone-100 text-stone-700 rounded-2xl flex items-center justify-center"
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
              class="space-y-5 bg-stone-50 p-5 rounded-2xl border border-stone-100"
            >
              <!-- Select table range -->
              <div class="grid grid-cols-2 gap-4">
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

              <!-- QR Code Size -->
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
                  <!-- Use step="0.5" to allow decimals -->
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

              <!-- Warning message to use the browser's printing system instead -->
              <p class="text-[11px] text-stone-500 mt-2 leading-relaxed">
                *
                {{
                  state.language === "en"
                    ? "The layout will automatically wrap and adjust based on your A4 paper setting in the print dialog."
                    : "ระบบจะทำการเรียงจำนวนต่อหน้าให้คุ้มค่าที่สุดอัตโนมัติ ตามพื้นที่หน้ากระดาษ A4 ในระบบสั่งพิมพ์"
                }}
              </p>
            </div>

            <!-- Action Buttons -->
            <div class="mt-8 flex justify-end gap-3">
              <button
                @click="showPrintModal = false"
                class="rounded-xl border border-stone-200 px-5 py-3 text-sm font-bold text-stone-600 hover:bg-stone-50 transition-colors w-full md:w-auto"
              >
                {{ state.language === "en" ? "Cancel" : "ยกเลิก" }}
              </button>
              <button
                @click="executePrint"
                class="rounded-xl bg-stone-800 px-6 py-3 text-sm font-bold text-white shadow-lg hover:bg-black transition-all w-full md:w-auto flex justify-center items-center gap-2"
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
          <!-- (Structure remains exactly the same) -->
          <div
            class="w-full max-w-md rounded-[2rem] bg-white p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
          >
            <div class="flex items-center gap-4 mb-6">
              <div
                class="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center"
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
              class="space-y-6 bg-stone-50 p-5 rounded-2xl border border-stone-100"
            >
              <!-- Number of tables -->
              <div>
                <label
                  class="block text-sm font-bold text-stone-700 mb-3 text-center"
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
                    class="w-16 h-14 flex items-center justify-center bg-stone-50 hover:bg-stone-100 text-stone-600 cursor-pointer"
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
                        stroke-width="2.5"
                        d="M20 12H4"
                      />
                    </svg>
                  </button>
                  <div
                    class="flex-1 flex items-center justify-center border-x border-stone-200 bg-white h-14"
                  >
                    <input
                      v-model.number="form.tableCount"
                      type="number"
                      min="1"
                      class="w-16 text-center text-xl font-black text-stone-800 outline-none bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span class="text-stone-400 text-sm font-bold ml-1">{{
                      state.language === "en" ? "Tables" : "โต๊ะ"
                    }}</span>
                  </div>
                  <button
                    type="button"
                    @click="form.tableCount++"
                    class="w-16 h-14 flex items-center justify-center bg-stone-50 hover:bg-stone-100 text-emerald-600 cursor-pointer"
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
                  class="block text-sm font-bold text-stone-700 mb-3 text-center"
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
                    class="w-16 h-14 flex items-center justify-center bg-stone-50 hover:bg-stone-100 text-stone-600 cursor-pointer"
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
                        stroke-width="2.5"
                        d="M20 12H4"
                      />
                    </svg>
                  </button>
                  <div
                    class="flex-1 flex items-center justify-center border-x border-stone-200 bg-white h-14"
                  >
                    <input
                      v-model.number="form.seatsPerTable"
                      type="number"
                      min="1"
                      class="w-16 text-center text-xl font-black text-stone-800 outline-none bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span class="text-stone-400 text-sm font-bold ml-1">{{
                      state.language === "en" ? "Seats" : "ที่นั่ง"
                    }}</span>
                  </div>
                  <button
                    type="button"
                    @click="form.seatsPerTable++"
                    class="w-16 h-14 flex items-center justify-center bg-stone-50 hover:bg-stone-100 text-emerald-600 cursor-pointer"
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
              class="mt-4 flex items-start gap-2 text-blue-600 bg-blue-50 p-3 rounded-xl border border-blue-100 text-xs font-medium"
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
                ></path>
              </svg>
              {{
                state.language === "en"
                  ? "New tables will be added continuing from your existing table numbers."
                  : "โต๊ะใหม่จะถูกสร้างและรันหมายเลขต่อจากโต๊ะที่มีอยู่เดิม"
              }}
            </div>

            <div class="mt-8 flex justify-end gap-3">
              <button
                @click="showModal = false"
                class="rounded-xl border border-stone-200 px-5 py-3 text-sm font-bold text-stone-600 hover:bg-stone-50 transition-colors w-full md:w-auto"
              >
                {{ state.language === "en" ? "Cancel" : "ยกเลิก" }}
              </button>
              <button
                @click="generateTables"
                class="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all w-full md:w-auto"
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

  <!-- Print Display Zone (Removed fussy page breaks, let it flow naturally) -->
  <div class="print-only-layout">
    <!-- Throw everything into a single Container, no need to split into page-array anymore -->
    <div class="print-container">
      <div
        class="print-card"
        v-for="table in tablesToPrint"
        :key="table.id"
        :style="{ width: printForm.qrSizeCm + 'cm' }"
      >
        <div class="qr-wrapper">
          <!-- Convert cm to pixels for qrcode-vue -->
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
/* Hide Print Layout when on normal webpage */
.print-only-layout {
  display: none;
}

/* CSS for Print Mode */
@media print {
  @page {
    size: A4 portrait;
    margin: 1cm; /* Actual paper margin */
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

  /* Arrange Grid to flow continuously (Flex Wrap) */
  .print-container {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    justify-content: flex-start;
    gap: 0.5cm; /* Gap distance */
  }

  .print-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: 1px dashed #ccc;
    padding: 0.4cm;
    box-sizing: content-box;
    /* The magic is here: Prevent any QR from being cut in half at the end of the page */
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
