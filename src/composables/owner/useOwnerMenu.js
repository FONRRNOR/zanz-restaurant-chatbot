import { ref, reactive, computed } from "vue";
import { supabase } from "../../supabaseClient";

export function useOwnerMenu(state) {
  // ==========================================
  // 1. State Declarations
  // ==========================================
  const menuItems = ref([]);
  const selected = ref(null);
  const isLoading = ref(false);

  const isModalOpen = ref(false);
  const isEditModalOpen = ref(false);
  const isRecommendModalOpen = ref(false);

  const contentLanguage = ref("en");
  const viewMode = ref("list");
  const filterMode = ref("all");

  const alertInfo = ref({
    show: false,
    message: "",
    type: "success",
  });

  const showDeleteModal = ref(false);
  const itemToDelete = ref(null);
  const isDeleting = ref(false);

  const form = reactive({});
  const addForm = reactive({});

  // ==========================================
  // 2. Computed Properties
  // ==========================================
  const recommendedItems = computed(() => {
    return menuItems.value.filter((item) => item.isRecommended);
  });

  const displayMenuItems = computed(() => {
    let list = [...menuItems.value];
    if (filterMode.value === "recommended") {
      list = list.filter((item) => item.isRecommended);
    }
    return list.sort((a, b) => {
      if (a.isRecommended === b.isRecommended) return 0;
      return a.isRecommended ? -1 : 1;
    });
  });

  const complete = computed(
    () => form.name && form.category && form.price && form.availability
  );

  const addComplete = computed(
    () => addForm.name && addForm.category && addForm.price && addForm.availability
  );

  // ==========================================
  // 3. Methods & Actions
  // ==========================================
  function triggerAlert(message, type = "success") {
    alertInfo.value = { show: true, message, type };
    setTimeout(() => {
      alertInfo.value.show = false;
    }, 3000);
  }

  async function fetchMenuItems() {
    isLoading.value = true;
    try {
      const savedUserJson = sessionStorage.getItem("zank-active-user");
      if (!savedUserJson) throw new Error("No active session found.");
      const localUser = JSON.parse(savedUserJson);

      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .is("is_deleted", false)
        .eq("restaurant_id", localUser.restaurant_id)
        .order("id", { ascending: true });

      if (error) throw error;

      menuItems.value = data.map((item) => ({
        id: item.id,
        name: item.name,
        nameTh: item.name_th,
        category: item.category,
        price: item.price,
        image: item.image,
        description: item.description,
        descriptionTh: item.description_th,
        ingredients: item.ingredients || [],
        ingredientsTh: item.ingredients_th || [],
        allergens: item.allergens || [],
        allergensTh: item.allergens_th || [],
        dietaryTags: item.dietary_tags || [],
        dietaryTagsTh: item.dietary_tags_th || [],
        tasteProfiles: item.taste_profiles || [],
        tasteProfilesTh: item.taste_profiles_th || [],
        spiceLevel: item.spice_level,
        availability: item.availability,
        isRecommended: item.is_recommended || false,
      }));

      if (menuItems.value.length > 0 && !selected.value) {
        load(menuItems.value[0], false);
      }
    } catch (error) {
      triggerAlert(
        state.language === "en"
          ? "Error fetching data: " + error.message
          : "เกิดข้อผิดพลาดในการดึงข้อมูล",
        "error"
      );
    } finally {
      isLoading.value = false;
    }
  }

  function load(item, triggerModal = true) {
    selected.value = item;
    Object.assign(form, {
      ...item,
      ingredientsText: (item.ingredients || []).join(", "),
      allergensText: (item.allergens || []).join(", "),
      dietaryText: (item.dietaryTags || []).join(", "),
      tasteText: (item.tasteProfiles || []).join(", "),
      ingredientsThText: (item.ingredientsTh || []).join(", "),
      allergensThText: (item.allergensTh || []).join(", "),
      dietaryThText: (item.dietaryTagsTh || []).join(", "),
      tasteThText: (item.tasteProfilesTh || []).join(", "),
    });

    if (triggerModal && window.innerWidth < 1280) {
      isEditModalOpen.value = true;
    }
  }

  function promptDelete(item) {
    itemToDelete.value = item;
    showDeleteModal.value = true;
  }

  async function confirmDelete() {
    if (!itemToDelete.value) return;
    isDeleting.value = true;

    try {
      const { error } = await supabase
        .from("menu_items")
        .update({ is_deleted: true })
        .eq("id", itemToDelete.value.id);

      if (error) throw error;

      menuItems.value = menuItems.value.filter(
        (i) => i.id !== itemToDelete.value.id
      );

      if (menuItems.value.length > 0) {
        if (selected.value?.id === itemToDelete.value.id) {
          load(menuItems.value[0]);
        }
      } else {
        selected.value = null;
      }

      showDeleteModal.value = false;
      const deletedName =
        state.language === "en"
          ? itemToDelete.value.name
          : itemToDelete.value.nameTh || itemToDelete.value.name;
      triggerAlert(
        state.language === "en"
          ? `Deleted "${deletedName}" successfully.`
          : `ลบเมนู "${deletedName}" สำเร็จแล้ว`,
        "success"
      );
    } catch (error) {
      triggerAlert(
        state.language === "en"
          ? "Error deleting item: " + error.message
          : "เกิดข้อผิดพลาดในการลบรายการ",
        "error"
      );
    } finally {
      isDeleting.value = false;
      setTimeout(() => {
        itemToDelete.value = null;
      }, 300);
    }
  }

  async function submitEdit() {
    const payload = {
      name: form.name,
      category: form.category,
      price: Number(form.price),
      description: form.description,
      image: form.image,
      ingredients: form.ingredientsText ? form.ingredientsText.split(",").map((x) => x.trim()).filter(Boolean) : [],
      allergens: form.allergensText ? form.allergensText.split(",").map((x) => x.trim()).filter(Boolean) : [],
      dietary_tags: form.dietaryText ? form.dietaryText.split(",").map((x) => x.trim()).filter(Boolean) : [],
      taste_profiles: form.tasteText ? form.tasteText.split(",").map((x) => x.trim()).filter(Boolean) : [],
      name_th: form.nameTh,
      description_th: form.descriptionTh,
      ingredients_th: form.ingredientsThText ? form.ingredientsThText.split(",").map((x) => x.trim()).filter(Boolean) : [],
      allergens_th: form.allergensThText ? form.allergensThText.split(",").map((x) => x.trim()).filter(Boolean) : [],
      dietary_tags_th: form.dietaryThText ? form.dietaryThText.split(",").map((x) => x.trim()).filter(Boolean) : [],
      taste_profiles_th: form.tasteThText ? form.tasteThText.split(",").map((x) => x.trim()).filter(Boolean) : [],
      spice_level: form.spiceLevel,
      availability: form.availability,
    };

    try {
      const { error } = await supabase.from("menu_items").update(payload).eq("id", form.id);
      if (error) throw error;

      const index = menuItems.value.findIndex((item) => item.id === form.id);
      if (index !== -1) {
        const updatedItem = {
          ...menuItems.value[index],
          name: payload.name,
          nameTh: payload.name_th,
          category: payload.category,
          price: payload.price,
          image: payload.image,
          description: payload.description,
          descriptionTh: payload.description_th,
          ingredients: payload.ingredients,
          ingredientsTh: payload.ingredients_th,
          allergens: payload.allergens,
          allergensTh: payload.allergens_th,
          dietaryTags: payload.dietary_tags,
          dietaryTagsTh: payload.dietary_tags_th,
          tasteProfiles: payload.taste_profiles,
          tasteProfilesTh: payload.taste_profiles_th,
          spiceLevel: payload.spice_level,
          availability: payload.availability,
        };

        menuItems.value[index] = updatedItem;
        if (selected.value?.id === form.id) {
          selected.value = updatedItem;
        }
      }

      isEditModalOpen.value = false;
      triggerAlert(
        state.language === "en" ? "Item updated successfully!" : "อัปเดตเมนูสำเร็จแล้ว",
        "success"
      );
    } catch (error) {
      triggerAlert(
        state.language === "en" ? "Error updating data: " + error.message : "เกิดข้อผิดพลาดในการอัปเดตข้อมูล",
        "error"
      );
    }
  }

  function addNew() {
    Object.assign(addForm, {
      name: "",
      nameTh: "",
      category: "Main Courses",
      price: 0,
      image: "",
      description: "",
      descriptionTh: "",
      ingredientsText: "",
      ingredientsThText: "",
      allergensText: "",
      allergensThText: "",
      dietaryText: "",
      dietaryThText: "",
      tasteText: "",
      tasteThText: "",
      spiceLevel: "None",
      availability: "available",
    });
    isModalOpen.value = true;
  }

  async function submitAdd() {
    try {
      const savedUserJson = sessionStorage.getItem("zank-active-user");
      if (!savedUserJson) throw new Error("No active session found.");
      const localUser = JSON.parse(savedUserJson);

      const payload = {
        restaurant_id: localUser.restaurant_id,
        name: addForm.name,
        category: addForm.category,
        price: Number(addForm.price),
        description: addForm.description,
        image: addForm.image,
        ingredients: addForm.ingredientsText ? addForm.ingredientsText.split(",").map((x) => x.trim()).filter(Boolean) : [],
        allergens: addForm.allergensText ? addForm.allergensText.split(",").map((x) => x.trim()).filter(Boolean) : [],
        dietary_tags: addForm.dietaryText ? addForm.dietaryText.split(",").map((x) => x.trim()).filter(Boolean) : [],
        taste_profiles: addForm.tasteText ? addForm.tasteText.split(",").map((x) => x.trim()).filter(Boolean) : [],
        name_th: addForm.nameTh,
        description_th: addForm.descriptionTh,
        ingredients_th: addForm.ingredientsThText ? addForm.ingredientsThText.split(",").map((x) => x.trim()).filter(Boolean) : [],
        allergens_th: addForm.allergensThText ? addForm.allergensThText.split(",").map((x) => x.trim()).filter(Boolean) : [],
        dietary_tags_th: addForm.dietaryThText ? addForm.dietaryThText.split(",").map((x) => x.trim()).filter(Boolean) : [],
        taste_profiles_th: addForm.tasteThText ? addForm.tasteThText.split(",").map((x) => x.trim()).filter(Boolean) : [],
        spice_level: addForm.spiceLevel,
        availability: addForm.availability,
      };

      const { error } = await supabase.from("menu_items").insert([payload]);
      if (error) throw error;

      isModalOpen.value = false;
      await fetchMenuItems();
      triggerAlert(
        state.language === "en" ? "New item added successfully!" : "เพิ่มรายการเมนูใหม่สำเร็จแล้ว!",
        "success"
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      triggerAlert(
        state.language === "en" ? "Error creating item: " + error.message : "เกิดข้อผิดพลาดในการสร้างรายการใหม่",
        "error"
      );
    }
  }

  return {
    menuItems,
    selected,
    isLoading,
    isModalOpen,
    isEditModalOpen,
    isRecommendModalOpen,
    contentLanguage,
    viewMode,
    filterMode,
    alertInfo,
    showDeleteModal,
    itemToDelete,
    isDeleting,
    form,
    addForm,
    recommendedItems,
    displayMenuItems,
    complete,
    addComplete,
    triggerAlert,
    fetchMenuItems,
    load,
    promptDelete,
    confirmDelete,
    submitEdit,
    addNew,
    submitAdd,
  };
}