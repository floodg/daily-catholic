# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in the SDK's default proguard-android-optimize.txt.

# Keep Retrofit interfaces
-keepattributes Signature, InnerClasses, EnclosingMethod
-keepattributes RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations
-keepclassmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}

# Keep Gson model classes
-keep class com.joesketo.app.data.models.** { *; }

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**
