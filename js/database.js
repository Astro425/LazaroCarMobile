const SUPABASE_URL = "https://hqlxrsvxosiykwomsvie.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_HDy6VaV9lngr56zPk_43UA_dpvEfqzL";

// Create the client
window.supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);


// Test connection
async function testConnection() {
    const { error } = await window.supabaseClient
        .from("cars")
        .select("*")
        .limit(1);

    if (error) {
        console.error("❌ Supabase connection failed:", error);
    } else {
        console.log("✅ Supabase connected successfully");
    }
}

testConnection();