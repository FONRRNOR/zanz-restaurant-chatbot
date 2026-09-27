import { createRouter, createWebHistory } from "vue-router";
import RoleSelection from "../views/shared/RoleSelection.vue";
import LogoutView from "../views/shared/LogoutView.vue";
import LoginView from "../views/auth/LoginView.vue";
import ForgotPassword from "../views/auth/ForgotPassword.vue";
import CustomerMenuViewMobile from "../views/customer/CustomerMenuViewMobile.vue";
import StaffLiveOrders from "../views/staff/StaffLiveOrders.vue";
import StaffMenuItems from "../views/staff/StaffMenuItems.vue";
import OwnerDashboard from "../views/owner/OwnerDashboard.vue";
import OwnerMenuManagement from "../views/owner/OwnerMenuManagement.vue";
import OwnerOrders from "../views/owner/OwnerOrders.vue";
import OwnerStaffAccounts from "../views/owner/OwnerStaffAccounts.vue";
import { useAppState } from "../services/appState";
import OrderConfirmMobile from "../views/customer/OrderConfirmMobile.vue";
import OrderStatusMobile from "../views/customer/OrderStatusMobile.vue";
import OwnerTableManagement from "../views/owner/OwnerTableManagement.vue";

const routes = [
  { path: "/", component: RoleSelection },
  { path: "/logout", component: LogoutView },
  { path: "/forgot-password", component: ForgotPassword },
  { path: "/staff/login", component: LoginView, props: { type: "staff" } },
  { path: "/owner/login", component: LoginView, props: { type: "owner" } },
  { path: "/customer/menu/mobile", component: CustomerMenuViewMobile },
  {
    path: "/customer/order-status/mobile/:orderId",
    component: OrderStatusMobile,
  },
  {
    path: "/staff/live-orders",
    component: StaffLiveOrders,
    meta: { requiresStaff: true },
  },
  {
    path: "/staff/menu-items",
    component: StaffMenuItems,
    meta: { requiresStaff: true },
  },
  {
    path: "/owner/dashboard",
    component: OwnerDashboard,
    meta: { requiresOwner: true },
  },
  {
    path: "/owner/menu-management",
    component: OwnerMenuManagement,
    meta: { requiresOwner: true },
  },
  {
    path: "/owner/orders",
    component: OwnerOrders,
    meta: { requiresOwner: true },
  },
  {
    path: "/owner/staff-accounts",
    component: OwnerStaffAccounts,
    meta: { requiresOwner: true },
  },
  {
    path: "/owner/tables",
    component: OwnerTableManagement,
    meta: { requiresOwner: true },
  },
  {
    path: "/order",
    name: "OrderConfirm",
    component: OrderConfirmMobile,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach((to) => {
  const { state } = useAppState();

  const publicPages = [
    "/",
    "/owner/login",
    "/staff/login",
    "/forgot-password",
    "/customer/menu/mobile",
    "/order",
  ];

  const isPublicDynamicPage =
    to.path.startsWith("/customer/order-status/mobile/");

  // 1. ดึงข้อมูลจาก sessionStorage
  const savedUserString = sessionStorage.getItem("zank-active-user");
  if (!state.activeUser && savedUserString) {
    try {
      state.activeUser = JSON.parse(savedUserString);
    } catch (error) {
      console.error("Error parsing user from sessionStorage:", error);
    }
  }

  // 2. เช็คการเข้าถึงหน้า Owner/Staff
  if (
    !publicPages.includes(to.path) &&
    !isPublicDynamicPage &&
    !state.activeUser
  ) {
    return "/"; 
  }

  // 3. ถ้าเข้าหน้าแรกแต่มี Session ค้างอยู่ ให้ปัดไปหน้า Dashboard
  if (to.path === "/" && state.activeUser) {
    if (state.activeUser.role === "owner") {
      return "/owner/dashboard";
    }
    if (state.activeUser.role === "staff") {
      return "/staff/live-orders";
    }
  }
});

export default router;