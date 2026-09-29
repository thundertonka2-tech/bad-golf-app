# Bad Golf AR measure — keep the plugin + its reflective activity callback, and ARCore's
# JNI-facing classes, under the release build's R8 minify.
-keep class com.simplisticfishing.badgolf.measure.** { *; }
-keep class com.google.ar.core.** { *; }
-dontwarn com.google.ar.core.**
