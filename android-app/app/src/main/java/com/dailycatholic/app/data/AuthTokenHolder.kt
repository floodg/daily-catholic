package com.dailycatholic.app.data

/** In-memory bearer token for authenticated Supabase REST calls (set on login / session restore). */
object AuthTokenHolder {
    @Volatile
    var accessToken: String? = null
}
