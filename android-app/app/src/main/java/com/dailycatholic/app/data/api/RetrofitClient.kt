package com.dailycatholic.app.data.api

import com.dailycatholic.app.BuildConfig
import com.dailycatholic.app.data.AuthTokenHolder
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

object RetrofitClient {

    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BASIC
    }

    private val okHttpClient = OkHttpClient.Builder()
        .addInterceptor { chain ->
            val req = chain.request()
            val path = req.url.encodedPath
            val isPasswordGrant = path.contains("auth/v1/token") && req.method == "POST"
            val b = req.newBuilder()
                .addHeader("apikey", BuildConfig.SUPABASE_ANON_KEY)
            if (!isPasswordGrant) {
                AuthTokenHolder.accessToken?.let { token ->
                    b.addHeader("Authorization", "Bearer $token")
                }
            }
            chain.proceed(b.build())
        }
        .addInterceptor(loggingInterceptor)
        .build()

    val apiService: SupabaseApiService by lazy {
        Retrofit.Builder()
            .baseUrl(BuildConfig.SUPABASE_URL.trimEnd('/') + "/")
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(SupabaseApiService::class.java)
    }
}
