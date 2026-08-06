<script setup>
import { MailCheck } from '@lucide/vue'
import { ref } from 'vue'
import AppLogo from '../../components/AppLogo.vue'

// Manage page steps (1 = Enter backup email, 2 = Enter OTP, 3 = Set new password with web email, 4 = Success)
const step = ref(1);

// Step 1 form data (Backup email for receiving OTP)
const backupEmail = ref("");
const expectedOTP = ref("");

// OTP 6-digit input management (Step 2)
const otpArray = ref(["", "", "", "", "", ""]);
const otpInputs = ref([]);

const handleOtpInput = (index, event) => {
  const val = event.target.value;
  if (val && index < 5) {
    otpInputs.value[index + 1].focus();
  }
};

const handleOtpKeydown = (index, event) => {
  if (event.key === "Backspace" && !otpArray.value[index] && index > 0) {
    otpInputs.value[index - 1].focus();
  }
};

// Step 3 form data (Web account email + new password)
const webEmailInput = ref(""); // Input for web account email to search in DB
const newPassword = ref("");
const confirmPassword = ref("");

const isLoading = ref(false);
const errorMessage = ref("");

// ----------------------------------------------------
// Step 1: Request OTP (Send to backup email)
// ----------------------------------------------------
const handleRequestOTP = async () => {
  errorMessage.value = "";
  if (!backupEmail.value)
    return (errorMessage.value = "Please send a backup email address to receive the OTP code.");

  isLoading.value = true;

  // Mock Email section for project testing in step 1
  const mockEmails = ["mock@zank.com", "test@zank.com"];
  if (mockEmails.includes(backupEmail.value)) {
    setTimeout(() => {
      expectedOTP.value = "123456";
      step.value = 2;
      isLoading.value = false;
    }, 1000);
    return;
  }

  try {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    expectedOTP.value = code;
    const expireTime = new Date(Date.now() + 15 * 60000).toLocaleTimeString(
      "th-TH",
      { hour: "2-digit", minute: "2-digit" },
    );

    // Send OTP to backupEmail (actual existing backup email)
    await emailjs.send(
      "service_tts6co9",
      "template_7106tym",
      {
        to_email: backupEmail.value,
        passcode: code,
        time: expireTime,
      },
      "fLzwQDL8L7UGsN9yw",
    );

    step.value = 2;
    await nextTick();
    if (otpInputs.value[0]) otpInputs.value[0].focus();
  } catch (error) {
    errorMessage.value = "ไม่สามารถส่งอีเมลได้";
  } finally {
    isLoading.value = false;
  }
};

// ----------------------------------------------------
// Step 2: Verify OTP
// ----------------------------------------------------
const handleVerifyOTP = async () => {
  errorMessage.value = "";
  const joinedOTP = otpArray.value.join("");

  if (joinedOTP.length !== 6)
    return (errorMessage.value = "Please enter the complete 6-digit code.");

  isLoading.value = true;
  try {
    await new Promise((resolve) => setTimeout(resolve, 800));

    if (joinedOTP !== expectedOTP.value) {
      throw new Error("Invalid OTP code");
    }

    step.value = 3; // Verification successful, proceed to set new password page
  } catch (error) {
    errorMessage.value = error.message || "Invalid OTP code";
  } finally {
    isLoading.value = false;
  }
};

// ----------------------------------------------------
// Step 3: Save new password by searching for web account email
// ----------------------------------------------------
const handleResetPassword = async () => {
  errorMessage.value = "";

  // 1. Check if both password fields match
  if (newPassword.value !== confirmPassword.value) {
    return (errorMessage.value = "The passwords in both fields do not match.");
  }
  if (newPassword.value.length < 6) {
    return (errorMessage.value = "The password must be at least 6 characters long.");
  }

  isLoading.value = true;
  try {
    // 2. Search for web account email in the profiles table of the Database
    const { data: userProfile, error: fetchError } = await supabase
      .from("profiles")
      .select("email")
      .eq("email", webEmailInput.value) // Search using the web account email entered on this page
      .single();

    // If email is not found in the system
    if (fetchError || !userProfile) {
      throw new Error("The email address you entered is not found in our system. Please check the email address and try again.");
    }

    // 3. Hash the new password using bcryptjs
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(newPassword.value, salt);

    // 4. Update the password_hash back to the profiles table based on the web email
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ password_hash: hashedPassword })
      .eq("email", webEmailInput.value);

    if (updateError) throw updateError;

    step.value = 4; // Success, proceed to completion page
  } catch (error) {
    errorMessage.value = error.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูล";
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <main class="page-shell min-h-screen px-5 py-8">
    <header class="mx-auto flex max-w-6xl items-center justify-between">
      <AppLogo />
      <span class="text-sm font-bold text-muted">EN / TH</span>
    </header>

    <section class="mx-auto mt-16 max-w-md rounded-[2rem] bg-white p-8 shadow-strong">
      <div class="text-center">
        <div class="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-pale text-brand">
          <MailCheck :size="30" />
        </div>
        <h1 class="mt-5 text-3xl font-black">Reset Password</h1>
        <p class="mt-2 text-sm leading-relaxed text-muted">Enter your registered email and we will send password reset instructions.</p>
      </div>

      <form class="mt-7 space-y-4" @submit.prevent="sent = true">
        <label class="block text-sm font-bold">
          Email address
          <input v-model="email" class="field mt-2" placeholder="name@zank.com" type="email" />
        </label>
        <button class="primary-btn w-full">Send Reset Link</button>
        <p v-if="sent" class="rounded-2xl bg-pale px-4 py-3 text-sm font-bold text-brand">If this email is registered, reset instructions will be sent.</p>
      </form>

      <div class="mt-6 flex justify-between text-sm font-bold text-brand">
        <RouterLink to="/owner/login">← Back to login</RouterLink>
        <RouterLink to="/">Interface selection</RouterLink>
      </div>
      <p class="mt-6 text-center text-xs text-muted">Only registered staff and owner accounts can reset passwords.</p>
    </section>
  </main>
</template>
