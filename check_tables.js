const url = "https://jxyobyinvflojrhrdcrf.supabase.co/rest/v1/users?select=*";
const key = "sb_publishable_cZCSK2WrC9Y-8nC9vwJzLw_o8LRjIlY";

fetch(url, {
    headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
    }
}).then(r => r.json().then(data => ({status: r.status, data})))
.then(console.log);
