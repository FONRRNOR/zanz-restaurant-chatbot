<script setup>
import { onMounted } from 'vue'
import { useAppState } from '../../services/appState'

const { signOut } = useAppState()

onMounted(() => {
  // 1. เรียกใช้งานฟังก์ชันออกจากระบบเพื่อเคลียร์ State ใน Vue
  signOut()
  
  // 2. 🌟 บังคับลบข้อมูลใน sessionStorage ทิ้งทันที (สำคัญมาก) 🌟
  sessionStorage.removeItem('zank-active-user')
  
  // 3. ใช้ window.location.replace แทน router.replace
  // การทำแบบนี้คือการสั่งให้เบราว์เซอร์พาไปหน้าแรก พร้อมกับล้างหน่วยความจำของแอปพลิเคชันทิ้งทั้งหมด
  window.location.replace('/')
})
</script>

<template>
  <main class="page-shell grid min-h-screen place-items-center">
    <p class="rounded-3xl bg-white px-6 py-4 font-bold text-brand shadow-soft">Logging out...</p>
  </main>
</template>