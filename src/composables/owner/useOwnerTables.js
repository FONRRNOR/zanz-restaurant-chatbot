import { ref, computed, onMounted } from "vue";
import { supabase } from "../../supabaseClient";

export function useOwnerTables(state) {
  // State
  const restaurantId = ref("");
  const restaurantName = ref("");
  const tables = ref([]);
  
  const showModal = ref(false);
  const form = ref({
    tableCount: 1,
    seatsPerTable: 4,
  });

  // QR Print State
  const showPrintModal = ref(false);
  const printForm = ref({
    startTable: "",
    endTable: "",
    qrSizeCm: 8,
  });

  // Delete Table State
  const showDeleteModal = ref(false);
  const tableToDeleteId = ref(null);
  const tableToDeleteNumber = ref("");
  const isDeleting = ref(false);

  // Computed
  const tablesToPrint = computed(() => {
    if (!printForm.value.startTable || !printForm.value.endTable) return [];
    
    const startIdx = tables.value.findIndex(t => t.number === printForm.value.startTable);
    const endIdx = tables.value.findIndex(t => t.number === printForm.value.endTable);

    if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) return [];
    return tables.value.slice(startIdx, endIdx + 1);
  });

  // Actions: Initialization
  onMounted(async () => {
    const savedUserJson = sessionStorage.getItem("zank-active-user");
    if (savedUserJson) {
      const localUser = JSON.parse(savedUserJson);
      restaurantId.value = localUser.restaurant_id;
      restaurantName.value = localUser.restaurant_name || "ZANK Restaurant";
      await fetchTables();
    }
  });

  // Actions: Data Fetching
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

  // Actions: Table Generation
  async function generateTables() {
    if (form.value.tableCount < 1 || form.value.seatsPerTable < 1) return;
    if (!restaurantId.value) {
      alert("Error: No active restaurant ID found.");
      return;
    }

    try {
      let startNumber = 1;
      if (tables.value.length > 0) {
        const maxNum = Math.max(...tables.value.map(t => parseInt(t.number) || 0));
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

  // Actions: Delete Table
  function promptDeleteTable(id, number) {
    tableToDeleteId.value = id;
    tableToDeleteNumber.value = number;
    showDeleteModal.value = true;
  }

  function cancelDeleteTable() {
    showDeleteModal.value = false;
    setTimeout(() => {
      tableToDeleteId.value = null;
      tableToDeleteNumber.value = "";
    }, 200);
  }

  async function confirmDeleteTable() {
    if (!tableToDeleteId.value) return;
    isDeleting.value = true;

    try {
      const { error } = await supabase
        .from("tables")
        .delete()
        .eq("id", tableToDeleteId.value);
        
      if (error) throw error;
      
      tables.value = tables.value.filter(t => t.id !== tableToDeleteId.value);
      showDeleteModal.value = false;
    } catch (error) {
      alert("Error deleting table: " + error.message);
    } finally {
      isDeleting.value = false;
      tableToDeleteId.value = null;
      tableToDeleteNumber.value = "";
    }
  }

  // Actions: QR & Printing
  function generateTableUrl(tableNumber) {
    const baseUrl = import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin;
    if (!restaurantId.value) return "";
    return `${baseUrl}/customer/menu/mobile?restaurantId=${restaurantId.value}&tableId=${tableNumber}`;
  }

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

  // Utilities
  function getSeatColorClass(seats) {
    const s = parseInt(seats) || 0;
    if (s <= 2) return "bg-red-100 text-red-600";
    if (s <= 4) return "bg-orange-100 text-orange-600";
    if (s <= 8) return "bg-yellow-100 text-yellow-700";
    return "bg-stone-100 text-stone-600";
  }

  return {
    restaurantId,
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
    fetchTables,
    generateTables,
    promptDeleteTable,
    cancelDeleteTable,
    confirmDeleteTable,
    generateTableUrl,
    openPrintModal,
    executePrint,
    getSeatColorClass,
  };
}