// ============================================================
// LocApp config — fill in these values, save, that's it.
// ============================================================

window.CFG = {
  // Supabase project (same as CastApp)
  SUPABASE_URL:  "https://grsmscrbnzttgpzrqzxx.supabase.co",
  SUPABASE_ANON: "PASTE_ANON_KEY_HERE",  // Settings → API → anon public

  // Apps Script web app /exec URL (deploy from WebApp.gs)
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbx_YWsVpmdx9U73VBtrf_sJYZyehpRJoByR1YBgE2NfS_dx_tQw2OHpoFxep7geSF7L/exec",

  // Same shared secret as in WebApp.gs (SHARED_SECRET)
  SHARED_SECRET: "CHANGE_THIS_TO_A_RANDOM_STRING_32_CHARS",

  // Vilnius lat/lng for distance calculation (matches old logic)
  VILNIUS: { lat: 54.6872, lng: 25.2797 }
};
