<script setup>
import { reactive, ref, onMounted } from "vue";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";

import MobileNav from "../../components/common/MobileNav.vue";
import SideNav from "../../components/common/SideNav.vue";
import TopBar from "../../components/common/TopBar.vue";

import { useAppState } from "../../services/appState";
import { supabase } from "../../supabaseClient";

const { state } = useAppState();

const ownerNav = [
  { label: "Dashboard", to: "/owner/dashboard", short: "Home" },
  { label: "Menu Management", to: "/owner/menu-management", short: "Menu" },
  { label: "Orders", to: "/owner/orders" },
  { label: "Staff Accounts", to: "/owner/staff-accounts", short: "Staff" },
  { label: "Logout", to: "/logout", short: "Logout" },
];

// --- Reactive State Setup ---
const staffItems = ref([]);
const currentOwnerId = ref(null);
const restaurantId = ref("");
const restaurantName = ref("");
const isLoading = ref(false);

const form = reactive({
  fullName: "",
  email: "",
  role: "kitchen_staff",
  password: "",
  confirmPassword: "",
});

// --- Edit Modal State ---
const isEditModalOpen = ref(false);
const isEditingSubmit = ref(false);
const editingStaff = reactive({
  id: "",
  fullName: "",
  email: "",
  newPassword: "",
});

/**
 * Fetches all necessary staff data based on the currently logged-in user from localStorage
 */
async function fetchStaffData() {
  isLoading.value = true;
  try {
    const savedLanguage = localStorage.getItem("zank-language");
    if (savedLanguage) {
      state.language = savedLanguage;
    }

    const savedUserJson = sessionStorage.getItem("zank-active-user");

    if (!savedUserJson)
      throw new Error(
        state.language === "en"
          ? "Please log in again."
          : "กรุณาเข้าสู่ระบบใหม่อีกครั้ง",
      );

    const activeUser = JSON.parse(savedUserJson);

    currentOwnerId.value = activeUser.id;
    restaurantId.value = activeUser.restaurant_id || "";
    restaurantName.value = activeUser.restaurant_name || "Zank Restaurant";

    if (restaurantId.value) {
      const { data: staffData, error: staffError } = await supabase
        .from("profiles")
        .select("*")
        .eq("restaurant_id", restaurantId.value)
        .neq("role", "admin");

      if (staffError) throw staffError;

      staffItems.value = staffData.map((item) => ({
        id: item.id,
        fullName: item.name || "-",
        email: item.email,
        role: item.role,
        status: item.status || "active",
        lastLogin: item.last_login || item.lastLogin || "-",
      }));
    }
  } catch (error) {
    console.error("Error loading staff data:", error.message);
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  fetchStaffData();
});

function handleEditStaff(user) {
  Object.assign(editingStaff, {
    id: user.id,
    fullName: user.fullName === "-" ? "" : user.fullName,
    email: user.email,
    newPassword: "",
  });
  isEditModalOpen.value = true;
}

function closeEditModal() {
  isEditModalOpen.value = false;
}

async function submitEdit() {
  if (!editingStaff.fullName || !editingStaff.email) {
    alert(
      state.language === "en"
        ? "Name and email fields cannot be empty."
        : "กรุณากรอกชื่อและอีเมล",
    );
    return;
  }

  try {
    isEditingSubmit.value = true;

    const updatePayload = {
      name: editingStaff.fullName,
      email: editingStaff.email.trim(),
    };

    if (editingStaff.newPassword) {
      if (editingStaff.newPassword.length < 6) {
        alert(
          state.language === "en"
            ? "Password must be at least 6 characters long."
            : "รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร",
        );
        return;
      }
      const salt = bcrypt.genSaltSync(10);
      updatePayload.password_hash = bcrypt.hashSync(
        editingStaff.newPassword,
        salt,
      );
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update(updatePayload)
      .eq("id", editingStaff.id);

    if (profileError) throw profileError;

    alert(
      state.language === "en"
        ? "Staff account details updated successfully!"
        : "อัปเดตข้อมูลพนักงานเรียบร้อยแล้ว!",
    );
    isEditModalOpen.value = false;
    await fetchStaffData();
  } catch (error) {
    alert(
      (state.language === "en"
        ? "Failed to update staff: "
        : "เกิดข้อผิดพลาดในการอัปเดต: ") + error.message,
    );
  } finally {
    isEditingSubmit.value = false;
  }
}

async function submit() {
  if (
    !form.fullName ||
    !form.email ||
    !form.password ||
    form.password !== form.confirmPassword
  ) {
    alert(
      state.language === "en"
        ? "Please fill out all required fields and ensure passwords match."
        : "กรุณากรอกข้อมูลให้ครบถ้วนและตรวจสอบรหัสผ่านให้ตรงกัน",
    );
    return;
  }

  if (form.password.length < 6) {
    alert(
      state.language === "en"
        ? "Password must be at least 6 characters long."
        : "รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร",
    );
    return;
  }

  if (!restaurantId.value) {
    alert(
      state.language === "en"
        ? "Restaurant ID not found."
        : "ไม่พบรหัสร้านอาหาร",
    );
    return;
  }

  try {
    isLoading.value = true;
    const cleanEmail = form.email.trim();

    const salt = bcrypt.genSaltSync(10);
    const securePasswordHash = bcrypt.hashSync(form.password, salt);

    const tempSupabase = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: signUpData, error: signUpError } =
      await tempSupabase.auth.signUp({
        email: cleanEmail,
        password: form.password,
        options: {
          data: {
            name: form.fullName,
            role: form.role,
            restaurant_id: restaurantId.value,
            restaurant_name: restaurantName.value,
            created_by: currentOwnerId.value,
          },
        },
      });

    if (signUpError) throw signUpError;

    if (signUpData?.user) {
      await new Promise((resolve) => setTimeout(resolve, 400));

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          name: form.fullName,
          role: form.role,
          restaurant_id: restaurantId.value,
          restaurant_name: restaurantName.value,
          created_by: currentOwnerId.value,
          password_hash: securePasswordHash,
        })
        .eq("id", signUpData.user.id);

      if (profileError) {
        if (
          profileError.message.includes("0 rows") ||
          profileError.details?.includes("0 rows")
        ) {
          const { error: insertError } = await supabase
            .from("profiles")
            .insert([
              {
                id: signUpData.user.id,
                email: cleanEmail,
                name: form.fullName,
                role: form.role,
                restaurant_id: restaurantId.value,
                restaurant_name: restaurantName.value,
                created_by: currentOwnerId.value,
                password_hash: securePasswordHash,
              },
            ]);
          if (insertError) throw insertError;
        } else {
          throw profileError;
        }
      }
    }

    await fetchStaffData();

    Object.assign(form, {
      fullName: "",
      email: "",
      role: "kitchen_staff",
      password: "",
      confirmPassword: "",
    });
    alert(
      state.language === "en"
        ? "Staff account created successfully!"
        : "สร้างบัญชีพนักงานเรียบร้อยแล้ว!",
    );
  } catch (error) {
    alert(
      (state.language === "en"
        ? "Failed to create account: "
        : "ไม่สามารถสร้างบัญชีได้: ") + error.message,
    );
  } finally {
    isLoading.value = false;
  }
}

async function handleRemoveStaff(userId) {
  if (
    !confirm(
      state.language === "en"
        ? "Are you sure you want to permanently delete this staff account?"
        : "คุณแน่ใจหรือไม่ที่จะลบบัญชีพนักงานนี้อย่างถาวร?",
    )
  )
    return;

  try {
    isLoading.value = true;
    const { error } = await supabase.from("profiles").delete().eq("id", userId);
    if (error) throw error;

    await fetchStaffData();
    alert(
      state.language === "en"
        ? "Staff profile deleted permanently."
        : "ลบบัญชีพนักงานเรียบร้อยแล้ว",
    );
  } catch (error) {
    alert(
      (state.language === "en"
        ? "Failed to delete staff: "
        : "ลบพนักงานไม่สำเร็จ: ") + error.message,
    );
  } finally {
    isLoading.value = false;
  }
}

function formatRole(role) {
  if (role === "kitchen_staff")
    return state.language === "en" ? "Kitchen Staff" : "พนักงานครัว";
  if (role === "reception_staff")
    return state.language === "en" ? "Reception Staff" : "พนักงานต้อนรับ";
  return role;
}
</script>

<template>
  <div class="page-shell">
    <TopBar owner search-placeholder="Search staff name or email" />
    <div class="content-shell">
      <SideNav :items="ownerNav" />
      <main class="main-panel">
        <h1 class="text-4xl font-black">
          {{ state.language === "en" ? "Staff Accounts" : "บัญชีพนักงาน" }}
        </h1>
        <p class="mt-2 text-muted">
          {{
            state.language === "en"
              ? "Create staff logins and manage access to live orders."
              : "สร้างบัญชีเข้าใช้งานสำหรับพนักงาน และจัดการสิทธิ์การเข้าถึงออเดอร์สด"
          }}
        </p>

        <section class="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
          <article class="section-card overflow-hidden">
            <div
              class="hidden bg-pale px-5 py-4 text-sm font-black text-brand lg:grid lg:grid-cols-[1fr_1.2fr_1fr_.8fr_1fr_1.2fr]"
            >
              <span>{{ state.language === "en" ? "Name" : "ชื่อ" }}</span>
              <span>{{ state.language === "en" ? "Email" : "อีเมล" }}</span>
              <span>{{ state.language === "en" ? "Role" : "ตำแหน่ง" }}</span>
              <span>{{ state.language === "en" ? "Status" : "สถานะ" }}</span>
              <span>{{
                state.language === "en" ? "Last Login" : "เข้าสู่ระบบล่าสุด"
              }}</span>
              <span>{{ state.language === "en" ? "Actions" : "จัดการ" }}</span>
            </div>

            <div v-if="isLoading" class="p-5 text-center text-muted">
              {{
                state.language === "en"
                  ? "Loading staff accounts..."
                  : "กำลังโหลดข้อมูลพนักงาน..."
              }}
            </div>

            <div
              v-else-if="staffItems.length === 0"
              class="p-5 text-center text-muted"
            >
              {{
                state.language === "en"
                  ? "No staff accounts found for your restaurant."
                  : "ไม่พบบัญชีพนักงานในร้านของคุณ"
              }}
            </div>

            <div
              v-else
              v-for="user in staffItems"
              :key="user.id"
              class="grid gap-3 border-t border-stone-100 p-5 lg:grid-cols-[1fr_1.2fr_1fr_.8fr_1fr_1.2fr] lg:items-center"
            >
              <strong>{{ user.fullName }}</strong>
              <span class="text-sm text-muted">{{ user.email }}</span>
              <span class="capitalize">{{ formatRole(user.role) }}</span>
              <span
                class="rounded-full px-3 py-1 text-xs font-bold w-fit"
                :class="
                  user.status === 'active'
                    ? 'bg-pale text-brand'
                    : 'bg-stone-100 text-muted'
                "
                >{{ user.status }}</span
              >
              <span class="text-sm text-muted">{{ user.lastLogin }}</span>

              <div class="flex items-center gap-2">
                <button
                  class="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand/20 cursor-pointer"
                  @click="handleEditStaff(user)"
                >
                  {{ state.language === "en" ? "Edit" : "แก้ไข" }}
                </button>
                <button
                  class="flex items-center gap-1.5 rounded-lg bg-transparent px-3 py-1.5 text-xs font-semibold text-stone-400 transition hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-200 cursor-pointer"
                  @click="handleRemoveStaff(user.id)"
                >
                  {{ state.language === "en" ? "Remove" : "ลบ" }}
                </button>
              </div>
            </div>
          </article>

          <form class="section-card p-5 h-fit" @submit.prevent="submit">
            <h2 class="text-xl font-black">
              {{
                state.language === "en"
                  ? "Add Staff Account"
                  : "เพิ่มบัญชีพนักงาน"
              }}
            </h2>
            <p class="mt-2 text-sm text-muted">
              {{
                state.language === "en"
                  ? "Staff can access Live Orders and Menu Items only. Owner pages remain restricted."
                  : "พนักงานสามารถเข้าถึงได้เฉพาะออเดอร์สดและรายการเมนู หน้าของผู้จัดการจะถูกจำกัดสิทธิ์"
              }}
            </p>
            <div class="mt-5 grid gap-3">
              <input
                v-model="form.fullName"
                class="field"
                :placeholder="
                  state.language === 'en' ? 'Full Name' : 'ชื่อ-นามสกุล'
                "
                required
              />
              <input
                v-model="form.email"
                class="field"
                :placeholder="
                  state.language === 'en' ? 'Email Address' : 'อีเมล'
                "
                type="email"
                required
              />
              <select v-model="form.role" class="field">
                <option value="kitchen_staff">
                  {{
                    state.language === "en" ? "Kitchen Staff" : "พนักงานครัว"
                  }}
                </option>
                <option value="reception_staff">
                  {{
                    state.language === "en"
                      ? "Reception Staff"
                      : "พนักงานต้อนรับ"
                  }}
                </option>
              </select>
              <input
                v-model="form.password"
                class="field"
                :placeholder="
                  state.language === 'en'
                    ? 'Temporary Password'
                    : 'รหัสผ่านชั่วคราว'
                "
                type="password"
                required
              />
              <input
                v-model="form.confirmPassword"
                class="field"
                :placeholder="
                  state.language === 'en'
                    ? 'Confirm Password'
                    : 'ยืนยันรหัสผ่าน'
                "
                type="password"
                required
              />
              <button class="primary-btn cursor-pointer" :disabled="isLoading">
                {{ state.language === "en" ? "Create Account" : "สร้างบัญชี" }}
              </button>
            </div>
          </form>
        </section>
      </main>
    </div>
    <MobileNav :items="ownerNav" />

    <div
      v-if="isEditModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm transition-opacity"
    >
      <div
        class="w-full max-w-md overflow-hidden rounded-2xl bg-white p-6 shadow-2xl border border-stone-100"
      >
        <div
          class="flex items-center justify-between border-b border-stone-100 pb-4"
        >
          <h3 class="text-lg font-black text-stone-900">
            {{
              state.language === "en"
                ? "Edit Staff Profile"
                : "แก้ไขข้อมูลพนักงาน"
            }}
          </h3>
          <button
            @click="closeEditModal"
            class="rounded-lg p-1 text-stone-400 hover:bg-stone-100 cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form @submit.prevent="submitEdit" class="mt-4 grid gap-4">
          <div>
            <label
              class="block text-xs font-bold text-stone-500 uppercase mb-1"
            >
              {{ state.language === "en" ? "Full Name" : "ชื่อ-นามสกุล" }}
            </label>
            <input
              v-model="editingStaff.fullName"
              class="field"
              :placeholder="
                state.language === 'en' ? 'Staff Member Name' : 'ชื่อพนักงาน'
              "
              required
            />
          </div>
          <div>
            <label
              class="block text-xs font-bold text-stone-500 uppercase mb-1"
            >
              {{ state.language === "en" ? "Email Address" : "อีเมล" }}
            </label>
            <input
              v-model="editingStaff.email"
              class="field"
              placeholder="email@zank.com"
              type="email"
              required
            />
          </div>
          <div class="border-t border-stone-100 pt-3">
            <label
              class="block text-xs font-bold text-stone-500 uppercase mb-1"
            >
              {{
                state.language === "en"
                  ? "Override Password (Optional)"
                  : "เปลี่ยนรหัสผ่านใหม่ (ถ้าต้องการ)"
              }}
            </label>
            <input
              v-model="editingStaff.newPassword"
              class="field"
              :placeholder="
                state.language === 'en'
                  ? 'Leave blank to keep current'
                  : 'เว้นว่างไว้หากไม่ต้องการเปลี่ยน'
              "
              type="password"
            />
          </div>

          <div
            class="mt-4 flex justify-end gap-2 border-t border-stone-100 pt-4"
          >
            <button
              type="button"
              @click="closeEditModal"
              class="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-semibold cursor-pointer"
            >
              {{ state.language === "en" ? "Cancel" : "ยกเลิก" }}
            </button>
            <button
              type="submit"
              :disabled="isEditingSubmit"
              class="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-md cursor-pointer"
            >
              {{
                isEditingSubmit
                  ? state.language === "en"
                    ? "Saving..."
                    : "กำลังบันทึก..."
                  : state.language === "en"
                    ? "Save Changes"
                    : "บันทึกการเปลี่ยนแปลง"
              }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
