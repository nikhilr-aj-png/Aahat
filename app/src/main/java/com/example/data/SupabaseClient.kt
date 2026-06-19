package com.example.data

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime

object SupabaseModule {

    val client: SupabaseClient by lazy {
        val url = "https://jxyobyinvflojrhrdcrf.supabase.co"
        val key = "sb_publishable_cZCSK2WrC9Y-8nC9vwJzLw_o8LRjIlY"
        
        createSupabaseClient(
            supabaseUrl = url,
            supabaseKey = key
        ) {
            install(Auth)
            install(Postgrest)
            install(Realtime)
        }
    }
}
