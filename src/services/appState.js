import { computed, reactive } from "vue";
import { menuItemsSeed, ordersSeed, usersSeed } from "../data/mockData";

const serviceFee = 30;
const menuStorageKey = "zank-menu-items";
const cartStorageKey = "zank-cart-items";
const orderStorageKey = "zank-orders";
const lastOrderStorageKey = "zank-last-order-number";

function normalizeMenuItem(item) {
  const seedItem = menuItemsSeed.find((entry) => entry.id === item.id) || {};
  return {
    ...seedItem,
    ...item,
    nameTh: item.nameTh ?? seedItem.nameTh ?? "",
    descriptionTh: item.descriptionTh ?? seedItem.descriptionTh ?? "",
    ingredientsTh: item.ingredientsTh ?? seedItem.ingredientsTh ?? [],
    allergensTh: item.allergensTh ?? seedItem.allergensTh ?? [],
    dietaryTagsTh: item.dietaryTagsTh ?? seedItem.dietaryTagsTh ?? [],
    tasteProfilesTh: item.tasteProfilesTh ?? seedItem.tasteProfilesTh ?? [],
  };
}

function readStoredMenuItems() {
  try {
    const storedItems = JSON.parse(localStorage.getItem(menuStorageKey));
    return (storedItems || structuredClone(menuItemsSeed)).map(
      normalizeMenuItem,
    );
  } catch {
    return structuredClone(menuItemsSeed);
  }
}

function persistMenuItems() {
  localStorage.setItem(menuStorageKey, JSON.stringify(state.menuItems));
}

function readStoredCartItems() {
  try {
    return JSON.parse(localStorage.getItem(cartStorageKey)) || [];
  } catch {
    return [];
  }
}

function persistCartItems() {
  localStorage.setItem(cartStorageKey, JSON.stringify(state.cart));
}

function readStoredOrders() {
  try {
    return (
      JSON.parse(localStorage.getItem(orderStorageKey)) ||
      structuredClone(ordersSeed)
    );
  } catch {
    return structuredClone(ordersSeed);
  }
}

function persistOrders() {
  localStorage.setItem(orderStorageKey, JSON.stringify(state.orders));
}

const state = reactive({
  activeUser: JSON.parse(localStorage.getItem("zank-active-user") || "null"),
  language: localStorage.getItem("zank-language") || "en",
  menuItems: readStoredMenuItems(),
  orders: readStoredOrders(),
  users: structuredClone(usersSeed),
  cart: readStoredCartItems(),
  customerPreferences: ["Gluten allergy", "Vegetarian"],
  selectedCategory: "Starters",
  lastOrderNumber: localStorage.getItem(lastOrderStorageKey) || "A102",
});

console.log("LOCAL STORAGE USER:", localStorage.getItem("zank-active-user"));

window.addEventListener("storage", (event) => {
  if (event.key === orderStorageKey && event.newValue) {
    try {
      state.orders = JSON.parse(event.newValue);
    } catch {
      // Keep the current in-memory orders if another tab writes invalid data.
    }
  }
  if (event.key === menuStorageKey && event.newValue) {
    try {
      state.menuItems = JSON.parse(event.newValue).map(normalizeMenuItem);
    } catch {
      // Keep the current menu if another tab writes invalid data.
    }
  }
  if (event.key === cartStorageKey && event.newValue) {
    try {
      state.cart = JSON.parse(event.newValue);
    } catch {
      // Keep the current cart if another tab writes invalid data.
    }
  }
  if (event.key === lastOrderStorageKey && event.newValue)
    state.lastOrderNumber = event.newValue;
});

const translations = {
  th: {
    "Search dishes, ingredients, or taste": "ค้นหาเมนู วัตถุดิบ หรือรสชาติ",
    "Logged out successfully. Choose an interface to continue.":
      "ออกจากระบบเรียบร้อยแล้ว กรุณาเลือกหน้าที่ต้องการใช้งาน",
    "Choose Your Interface": "เลือกหน้าการใช้งาน",
    "Select how you want to use the restaurant system.":
      "เลือกวิธีที่คุณต้องการใช้งานระบบร้านอาหาร",
    Customer: "ลูกค้า",
    "Browse the menu, ask Chef AI, and place orders.":
      "ดูเมนู ถาม Chef AI และสั่งอาหาร",
    "Open Menu": "เปิดเมนู",
    "No login required": "ไม่ต้องเข้าสู่ระบบ",
    Staff: "พนักงาน",
    "View live orders and update order status.":
      "ดูออเดอร์แบบสดและอัปเดตสถานะออเดอร์",
    "Staff Login": "เข้าสู่ระบบพนักงาน",
    "Owner / Admin": "เจ้าของร้าน / แอดมิน",
    "Manage menu items and monitor restaurant orders.":
      "จัดการเมนูและติดตามออเดอร์ของร้าน",
    "Admin Login": "เข้าสู่ระบบแอดมิน",
    "Login required": "ต้องเข้าสู่ระบบ",
    "Staff and owner access is restricted to authorized users.":
      "เฉพาะพนักงานและเจ้าของร้านที่ได้รับอนุญาตเท่านั้น",
    "Today’s": "เมนู",
    Signature: "แนะนำ",
    Curations: "วันนี้",
    "Browse dishes or ask Chef AI for recommendations based on taste, ingredients, allergies, or dietary preferences.":
      "เลือกดูเมนูหรือถาม Chef AI เพื่อแนะนำอาหารตามรสชาติ วัตถุดิบ อาการแพ้ หรือความต้องการด้านอาหาร",
    Checkout: "ตะกร้า",
    Starters: "อาหารเรียกน้ำย่อย",
    "Main Courses": "อาหารจานหลัก",
    Mains: "จานหลัก",
    Drinks: "เครื่องดื่ม",
    "Check Order Status": "ตรวจสอบสถานะ",
    Status: "สถานะ",
    Menu: "เมนู",
    "Add to Cart": "เพิ่มลงตะกร้า",
    Details: "รายละเอียด",
    "Sold out": "หมด",
    Ingredients: "วัตถุดิบ",
    "Taste profile": "รสชาติ",
    "Spice level": "ระดับความเผ็ด",
    Allergens: "สารก่อภูมิแพ้",
    Availability: "สถานะเมนู",
    None: "ไม่มี",
    "Ask Chef AI about this dish": "ถาม Chef AI เกี่ยวกับเมนูนี้",
    "e.g., less spicy, no garlic": "เช่น เผ็ดน้อย ไม่ใส่กระเทียม",
    "Chef AI": "Chef AI",
    "Hello! I'm Chef AI. I can help you find dishes by taste, ingredients, or dietary preference.":
      "สวัสดี! ฉันคือ Chef AI ช่วยค้นหาเมนูตามรสชาติ วัตถุดิบ หรือความต้องการด้านอาหารได้",
    "Recommend a dish": "แนะนำเมนู",
    "Check ingredients": "ดูวัตถุดิบ",
    "Vegetarian options": "เมนูมังสวิรัติ",
    "Check order status": "ตรวจสอบสถานะออเดอร์",
    "Ask Chef AI...": "ถาม Chef AI...",
    Add: "เพิ่ม",
    "Review Your Order": "ตรวจสอบรายการสั่งซื้อ",
    "Check your basket before submitting.": "ตรวจสอบตะกร้าก่อนส่งออเดอร์",
    "Preferences:": "ความต้องการ:",
    Edit: "แก้ไข",
    "Warning: This item contains": "คำเตือน: เมนูนี้มี",
    Remove: "ลบ",
    Replace: "เปลี่ยน",
    "Add note": "เพิ่มหมายเหตุ",
    "Dining Information": "ข้อมูลการรับประทาน",
    "Table number": "หมายเลขโต๊ะ",
    "Kitchen note": "หมายเหตุถึงครัว",
    "Order Summary": "สรุปคำสั่งซื้อ",
    Subtotal: "ยอดรวม",
    "Service Fee": "ค่าบริการ",
    Total: "รวมทั้งหมด",
    "Submit Order": "ส่งออเดอร์",
    "Order number will be created after submitting.":
      "ระบบจะสร้างเลขออเดอร์หลังจากส่งคำสั่งซื้อ",
    "Back to Menu": "กลับไปเมนู",
    "Order Submitted": "ส่งออเดอร์แล้ว",
    "Your order has been sent to the kitchen.":
      "ออเดอร์ของคุณถูกส่งไปยังครัวแล้ว",
    "Order No.": "เลขออเดอร์",
    "Use your order number to check status later.":
      "ใช้เลขออเดอร์เพื่อตรวจสอบสถานะภายหลัง",
    "Check Order Status": "ตรวจสอบสถานะออเดอร์",
    "Enter your order number or view your active order.":
      "กรอกเลขออเดอร์หรือดูออเดอร์ล่าสุดของคุณ",
    "Find Order": "ค้นหาออเดอร์",
    "No order found for this order number.": "ไม่พบออเดอร์หมายเลขนี้",
    "Status updates when staff update the order.":
      "สถานะจะอัปเดตเมื่อพนักงานเปลี่ยนสถานะออเดอร์",
    Available: "พร้อมขาย",
    available: "พร้อมขาย",
    sold_out: "หมด",
    new: "ใหม่",
    preparing: "กำลังทำ",
    ready: "พร้อมเสิร์ฟ",
    completed: "เสร็จสิ้น",
    cancelled: "ยกเลิก",
    Baht: "บาท",
    Contains: "มี",
    Vegetarian: "มังสวิรัติ",
    Vegan: "วีแกน",
    Savory: "กลมกล่อม",
    Mild: "อ่อน",
    Light: "เบา",
    Spicy: "เผ็ด",
    Sour: "เปรี้ยว",
    Refreshing: "สดชื่น",
    Sweet: "หวาน",
    Creamy: "ครีมมี่",
    Gluten: "กลูเตน",
    Dairy: "นม",
    Nuts: "ถั่ว",
    Fish: "ปลา",
  },
};

export function useAppState() {
  const availableMenuItems = computed(() =>
    state.menuItems.filter((item) => item.availability === "available"),
  );

  const cartItems = computed(() =>
    state.cart
      .map((cartItem) => {
        const item = state.menuItems.find(
          (entry) => entry.id === cartItem.menuItemId,
        );
        return item
          ? { ...item, quantity: cartItem.quantity, note: cartItem.note }
          : null;
      })
      .filter(Boolean),
  );

  const subtotal = computed(() =>
    cartItems.value.reduce((sum, item) => sum + item.price * item.quantity, 0),
  );
  const total = computed(() =>
    subtotal.value ? subtotal.value + serviceFee : 0,
  );

  const conflictItems = computed(() => {
    const allergies = state.customerPreferences
      .filter((pref) => pref.toLowerCase().includes("allergy"))
      .map((pref) => pref.toLowerCase().replace(" allergy", ""));

    return cartItems.value.filter((item) =>
      item.allergens.some((allergen) =>
        allergies.includes(allergen.toLowerCase()),
      ),
    );
  });

  function addToCart(menuItemId, quantity = 1, note = "") {
    const menuItem = state.menuItems.find((item) => item.id === menuItemId);
    if (!menuItem || menuItem.availability === "sold_out") return false;

    const existingIndex = state.cart.findIndex(
      (item) => item.menuItemId === menuItemId,
    );

    if (existingIndex > -1) {
      state.cart[existingIndex].quantity += quantity;

      if (state.cart[existingIndex].quantity <= 0) {
        state.cart.splice(existingIndex, 1);
      }
    } else if (quantity > 0) {
      state.cart.push({ menuItemId, quantity, note });
    }

    persistCartItems();
    return true;
  }

  function updateCartItem(menuItemId, patch) {
    const existing = state.cart.find((item) => item.menuItemId === menuItemId);
    if (!existing) return;
    Object.assign(existing, patch);
    if (existing.quantity <= 0) removeFromCart(menuItemId);
    else persistCartItems();
  }

  function removeFromCart(menuItemId) {
    state.cart = state.cart.filter((item) => item.menuItemId !== menuItemId);
    persistCartItems();
  }

  function createOrder({ tableNumber, customerNote }) {
    const nextNumber = `A${Math.floor(100 + Math.random() * 900)}`;
    const order = {
      id: `order-${Date.now()}`,
      orderNumber: nextNumber,
      tableNumber: tableNumber || "T-24",
      status: "new",
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      customerNote: customerNote || "",
      allergies: state.customerPreferences
        .filter((pref) => pref.toLowerCase().includes("allergy"))
        .map((pref) => pref.replace(" allergy", "")),
      preferences: state.customerPreferences.filter(
        (pref) => !pref.toLowerCase().includes("allergy"),
      ),
      items: cartItems.value.map((item) => ({
        menuItemId: item.id,
        name: item.name,
        nameTh: item.nameTh,
        quantity: item.quantity,
        price: item.price,
        note: item.note,
        allergens: item.allergens,
      })),
    };
    state.orders.unshift(order);
    state.lastOrderNumber = nextNumber;
    localStorage.setItem(lastOrderStorageKey, nextNumber);
    persistOrders();
    state.cart = [];
    persistCartItems();
    return order;
  }

  function updateOrderStatus(orderNumber, status) {
    const order = state.orders.find(
      (entry) => entry.orderNumber === orderNumber,
    );
    if (order) order.status = status;
    persistOrders();
  }

  function cancelOrder(orderNumber) {
    const order = state.orders.find(
      (entry) => entry.orderNumber === orderNumber,
    );
    if (order && !["completed", "cancelled"].includes(order.status))
      order.status = "cancelled";
    persistOrders();
  }

  function saveMenuItem(item) {
    const existingIndex = state.menuItems.findIndex(
      (entry) => entry.id === item.id,
    );
    const normalized = normalizeMenuItem({
      ...item,
      id:
        item.id ||
        item.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, ""),
      price: Number(item.price || 0),
    });
    if (existingIndex >= 0) state.menuItems[existingIndex] = normalized;
    else state.menuItems.unshift(normalized);
    persistMenuItems();
    return normalized;
  }

  function deleteMenuItem(id) {
    state.menuItems = state.menuItems.filter((item) => item.id !== id);
    persistMenuItems();
  }

  function toggleAvailability(id) {
    const item = state.menuItems.find((entry) => entry.id === id);
    if (item)
      item.availability =
        item.availability === "available" ? "sold_out" : "available";
    persistMenuItems();
  }

  function addStaffAccount(staff) {
    state.users.unshift({
      id: `staff-${Date.now()}`,
      fullName: staff.fullName,
      email: staff.email,
      password: staff.password,
      role: staff.role,
      status: "active",
      lastLogin: "Never",
    });
  }

  function toggleStaffStatus(id) {
    const user = state.users.find((entry) => entry.id === id);
    if (user && user.role !== "owner")
      user.status = user.status === "active" ? "inactive" : "active";
  }

  function signIn(role, email, password) {
    const allowedRoles =
      role === "owner" ? ["owner"] : ["kitchen_staff", "reception_staff"];
    const user = state.users.find(
      (entry) =>
        entry.email.toLowerCase() === email.toLowerCase() &&
        entry.password === password &&
        entry.status === "active" &&
        allowedRoles.includes(entry.role),
    );
    if (!user) return false;
    state.activeUser = user;
    localStorage.setItem("zank-active-user", JSON.stringify(state.activeUser));
    return true;
  }

  function signOut() {
    state.activeUser = null;
    localStorage.removeItem("zank-active-user");
  }

  function toggleLanguage() {
    state.language = state.language === "en" ? "th" : "en";
    localStorage.setItem("zank-language", state.language);
  }

  function t(value) {
    if (!value) return value;
    return translations[state.language]?.[value] || value;
  }

  function localizeMenuItem(item) {
    if (!item) return item;
    const useThai = state.language === "th";
    return {
      ...item,
      displayName: useThai && item.nameTh ? item.nameTh : item.name,
      displayDescription:
        useThai && item.descriptionTh ? item.descriptionTh : item.description,
      displayIngredients:
        useThai && item.ingredientsTh?.length
          ? item.ingredientsTh
          : item.ingredients,
      displayAllergens:
        useThai && item.allergensTh?.length ? item.allergensTh : item.allergens,
      displayDietaryTags:
        useThai && item.dietaryTagsTh?.length
          ? item.dietaryTagsTh
          : item.dietaryTags,
      displayTasteProfiles:
        useThai && item.tasteProfilesTh?.length
          ? item.tasteProfilesTh
          : item.tasteProfiles,
    };
  }

  function recommend(query) {
    const lower = query.toLowerCase();
    const matches = availableMenuItems.value.filter((item) => {
      const searchable = [
        item.name,
        item.category,
        item.description,
        ...item.ingredients,
        ...item.allergens,
        ...item.dietaryTags,
        ...item.tasteProfiles,
      ]
        .join(" ")
        .toLowerCase();
      return lower
        .split(/\s+/)
        .some((word) => word.length > 2 && searchable.includes(word));
    });
    return matches.slice(0, 2);
  }

  return {
    state,
    serviceFee,
    availableMenuItems,
    cartItems,
    subtotal,
    total,
    conflictItems,
    addToCart,
    updateCartItem,
    removeFromCart,
    createOrder,
    updateOrderStatus,
    cancelOrder,
    saveMenuItem,
    deleteMenuItem,
    toggleAvailability,
    addStaffAccount,
    toggleStaffStatus,
    signIn,
    signOut,
    toggleLanguage,
    t,
    localizeMenuItem,
    recommend,
  };
}

async function createOrder(orderData) {
  try {
    const response = await fetch("http://localhost:3000/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tableNumber: orderData.tableNumber,
        customerNote: orderData.customerNote,
        items: orderData.items,
      }),
    });

    if (!response.ok) {
      throw new Error("เซิร์ฟเวอร์ตอบกลับด้วยข้อผิดพลาด");
    }

    const result = await response.json();

    if (result.success) {
      cartItems.value = [];
      return result;
    }
  } catch (error) {
    console.error("ไม่สามารถเชื่อมต่อเพื่อบันทึกข้อมูลได้:", error);
    throw error;
  }
}
