-keepattributes *Annotation*

# Room crea la base interna de WorkManager por reflexion durante AndroidX
# Startup. R8 puede conservar la clase y eliminar su constructor sin argumentos,
# lo que hace que la aplicacion release se cierre antes de abrir MainActivity.
-keep class androidx.work.impl.WorkDatabase_Impl {
    public <init>();
}

-keepclassmembers class com.tusenda84.admin.AdminUpdateBridge {
    @android.webkit.JavascriptInterface <methods>;
}
