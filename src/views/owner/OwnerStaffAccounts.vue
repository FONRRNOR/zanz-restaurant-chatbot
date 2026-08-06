<script setup>
import { reactive, ref, onMounted } from "vue";
import { createClient } from "@supabase/supabase-js";
import MobileNav from "../../components/MobileNav.vue";
import SideNav from "../../components/SideNav.vue";
import TopBar from "../../components/TopBar.vue";
import { useAppState } from "../../services/appState";
import { supabase } from "../../supabaseClient";
import bcrypt from "bcryptjs";

const { state } = useAppState();

const ownerNav = [
  { label: 'Dashboard', to: '/owner/dashboard', short: 'Home' },
  { label: 'Menu Management', to: '/owner/menu-management', short: 'Menu' },
  { label: 'Orders', to: '/owner/orders' },
  { label: 'Staff Accounts', to: '/owner/staff-accounts', short: 'Staff' },
  { label: 'Logout', to: '/logout', short: 'Logout' },
];

// --- Reactive State Setup ---
const staffItems = ref([]);
const currentOwnerId = ref(null);
const restaurantId = ref(""); 
const restaurantName = ref(""); 
const isLoading = ref(false);

const form = reactive({
  fullName: '',
  email: '',
  role: 'kitchen_staff',
  password: '',
  confirmPassword: '',
});

// --- Edit Modal State ---
const isEditModalOpen = ref(false);
const isEditingSubmit = ref(false);
const editingStaff = reactive({
  id: "",
  fullName: "",
  email: "",
  newPassword: ""
});

/**
 * Fetches all necessary staff data based on the currently logged-in user from localStorage
 */
async function fetchStaffData() {
  isLoading.value = true;
  try {
    // 1. Retrieve the active user session data from localStorage saved during login
    const savedUserJson = sessionStorage.getItem("zank-active-user");
    
    if (!savedUserJson) throw new Error("Please log in again.");
    
    const activeUser = JSON.parse(savedUserJson);

    // 2. Map session payload directly to reactive parameters without relying on old Supabase Auth state
    currentOwnerId.value = activeUser.id;
    restaurantId.value = activeUser.restaurant_id || "";
    restaurantName.value = activeUser.restaurant_name || "Zank Restaurant";

    // 3. Query all staff members associated with the current restaurant_id
    if (restaurantId.value) {
      const { data: staffData, error: staffError } = await supabase
        .from("profiles")
        .select("*")
        .eq("restaurant_id", restaurantId.value)
        .neq("role", "admin"); // Exclude admin/owner accounts from the staff list

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
    alert("Error loading staff data: " + error.message);
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  fetchStaffData();
});

/**
 * Opens the Edit Modal and maps selected staff data into reactive fields
 */
function handleEditStaff(user) {
  Object.assign(editingStaff, {
    id: user.id,
    fullName: user.fullName === "-" ? "" : user.fullName,
    email: user.email,
    newPassword: "" 
  });
  isEditModalOpen.value = true;
}

/**
 * Closes the Edit Modal safely
 */
function closeEditModal() {
  isEditModalOpen.value = false;
}

/**
 * Submits the edited staff details to profiles and updates encryption parameters
 */
async function submitEdit() {
  if (!editingStaff.fullName || !editingStaff.email) {
    alert("Name and email fields cannot be empty.");
    return;
  }

  try {
    isEditingSubmit.value = true;

    const updatePayload = {
      name: editingStaff.fullName,
      email: editingStaff.email.trim()
    };

    if (editingStaff.newPassword) {
      if (editingStaff.newPassword.length < 6) {
        alert("Password must be at least 6 characters long.");
        return;
      }
      const salt = bcrypt.genSaltSync(10);
      updatePayload.password_hash = bcrypt.hashSync(editingStaff.newPassword, salt);
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update(updatePayload)
      .eq("id", editingStaff.id);

    if (profileError) throw profileError;

    alert("Staff account details updated successfully!");
    isEditModalOpen.value = false;
    await fetchStaffData();
  } catch (error) {
    alert("Failed to update staff: " + error.message);
  } finally {
    isEditingSubmit.value = false;
  }
}

/**
 * Handles submission for creating a brand-new staff account with bcrypt encryption
 */
async function submit() {
  if (!form.fullName || !form.email || !form.password || form.password !== form.confirmPassword) {
    alert("Please fill out all required fields and ensure passwords match.");
    return;
  }

  if (form.password.length < 6) {
    alert("Password must be at least 6 characters long.");
    return;
  }

  if (!restaurantId.value) {
    alert("Restaurant ID not found. Unable to create staff account.");
    return;
  }

  try {
    isLoading.value = true;
    const cleanEmail = form.email.trim();

    // 🌟 Encrypt the form password using Bcrypt
    const salt = bcrypt.genSaltSync(10);
    const securePasswordHash = bcrypt.hashSync(form.password, salt);

    const tempSupabase = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: signUpData, error: signUpError } = await tempSupabase.auth.signUp({
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
        if (profileError.message.includes("0 rows") || profileError.details?.includes("0 rows")) {
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
    alert("Staff account created and registered securely!");
  } catch (error) {
    alert("Failed to create account: " + error.message);
  } finally {
    isLoading.value = false;
  }
}

/**
 * Completely removes the staff profile from the database table
 */
async function handleRemoveStaff(userId) {
  if (!confirm("Are you sure you want to permanently delete this staff account?")) return;
    
  try {
    isLoading.value = true;
    const { error } = await supabase.from("profiles").delete().eq("id", userId);
    if (error) throw error;
    
    await fetchStaffData();
    alert("Staff profile deleted permanently.");
  } catch (error) {
    alert("Failed to delete staff: " + error.message);
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="page-shell">
    <TopBar owner search-placeholder="Search staff name or email" />
    <div class="content-shell">
      <SideNav :items="ownerNav" />
      <main class="main-panel">
        <h1 class="text-4xl font-black">Staff Accounts</h1>
        <p class="mt-2 text-muted">Create staff logins and manage access to live orders.</p>

        <section class="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
          <article class="section-card overflow-hidden">
            <div class="hidden bg-pale px-5 py-4 text-sm font-black text-brand lg:grid lg:grid-cols-[1fr_1.2fr_1fr_.8fr_1fr_1.2fr]">
              <span>Name</span><span>Email</span><span>Role</span><span>Status</span><span>Last Login</span><span>Actions</span>
            </div>

            <div v-if="isLoading" class="p-5 text-center text-muted">
              Loading staff accounts...
            </div>

            <div v-else-if="staffItems.length === 0" class="p-5 text-center text-muted">
              No staff accounts found for your restaurant.
            </div>

            <div v-else v-for="user in staffItems" :key="user.id" class="grid gap-3 border-t border-stone-100 p-5 lg:grid-cols-[1fr_1.2fr_1fr_.8fr_1fr_1.2fr] lg:items-center">
              <strong>{{ user.fullName }}</strong>
              <span class="text-sm text-muted">{{ user.email }}</span>
              <span class="capitalize">{{ user.role.replace('_', ' ') }}</span>
              <span class="rounded-full px-3 py-1 text-xs font-bold w-fit" :class="user.status === 'active' ? 'bg-pale text-brand' : 'bg-stone-100 text-muted'">{{ user.status }}</span>
              <span class="text-sm text-muted">{{ user.lastLogin }}</span>
              
              <div class="flex items-center gap-2">
                <button
                  class="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 hover:text-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                  @click="handleEditStaff(user)"
                >
                  Edit
                </button>
                <button
                  class="flex items-center gap-1.5 rounded-lg bg-transparent px-3 py-1.5 text-xs font-semibold text-stone-400 transition hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-200"
                  @click="handleRemoveStaff(user.id)"
                >
                  Remove
                </button>
              </div>
            </div>
          </article>

          <form class="section-card p-5 h-fit" @submit.prevent="submit">
            <h2 class="text-xl font-black">Add Staff Account</h2>
            <p class="mt-2 text-sm text-muted">Staff can access Live Orders and Menu Items only. Owner pages remain restricted.</p>
            <div class="mt-5 grid gap-3">
              <input v-model="form.fullName" class="field" placeholder="Full Name" required />
              <input v-model="form.email" class="field" placeholder="Email Address" type="email" required />
              <select v-model="form.role" class="field">
                <option value="kitchen_staff">Kitchen Staff</option>
                <option value="reception_staff">Reception Staff</option>
              </select>
              <input v-model="form.password" class="field" placeholder="Temporary Password" type="password" required />
              <input v-model="form.confirmPassword" class="field" placeholder="Confirm Password" type="password" required />
              <button class="primary-btn" :disabled="isLoading">Create Account</button>
            </div>
          </form>
        </section>
      </main>
    </div>
    <MobileNav :items="ownerNav" />

    <div v-if="isEditModalOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm transition-opacity">
      <div class="w-full max-w-md overflow-hidden rounded-2xl bg-white p-6 shadow-2xl border border-stone-100">
        <div class="flex items-center justify-between border-b border-stone-100 pb-4">
          <h3 class="text-lg font-black text-stone-900">Edit Staff Profile</h3>
          <button @click="closeEditModal" class="rounded-lg p-1 text-stone-400 hover:bg-stone-100">✕</button>
        </div>

        <form @submit.prevent="submitEdit" class="mt-4 grid gap-4">
          <div>
            <label class="block text-xs font-bold text-stone-500 uppercase mb-1">Full Name</label>
            <input v-model="editingStaff.fullName" class="field" placeholder="Staff Member Name" required />
          </div>
          <div>
            <label class="block text-xs font-bold text-stone-500 uppercase mb-1">Email Address</label>
            <input v-model="editingStaff.email" class="field" placeholder="email@zank.com" type="email" required />
          </div>
          <div class="border-t border-stone-100 pt-3">
            <label class="block text-xs font-bold text-stone-500 uppercase mb-1">Override Password (Optional)</label>
            <input v-model="editingStaff.newPassword" class="field" placeholder="Leave blank to keep current" type="password" />
          </div>

          <div class="mt-4 flex justify-end gap-2 border-t border-stone-100 pt-4">
            <button type="button" @click="closeEditModal" class="rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-semibold">Cancel</button>
            <button type="submit" :disabled="isEditingSubmit" class="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-md">
              {{ isEditingSubmit ? 'Saving...' : 'Save Changes' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>