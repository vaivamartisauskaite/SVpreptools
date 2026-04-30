// ============================================================
// LocApp config — fill in these values, save, that's it.
// ============================================================

window.CFG = {
  // Supabase project (same as CastApp)
  SUPABASE_URL:  "https://grsmscrbnzttgpzrqzxx.supabase.co",
  SUPABASE_ANON: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyc21zY3Jibnp0dGdwenJxenh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NzMzNTIsImV4cCI6MjA5MzA0OTM1Mn0.C1Qm2GpxJdkXqiWqehB0INWC8j4jyPyRDiE7W5lkiuA",  // Settings → API → anon public

  // Apps Script web app /exec URL (deploy from WebApp.gs)
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbx_YWsVpmdx9U73VBtrf_sJYZyehpRJoByR1YBgE2NfS_dx_tQw2OHpoFxep7geSF7L/exec",

  // Same shared secret as in WebApp.gs (SHARED_SECRET)
  SHARED_SECRET: "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",

  // Vilnius lat/lng for distance calculation (matches old logic)
  VILNIUS: { lat: 54.6872, lng: 25.2797 }
};
