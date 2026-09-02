# PZ-APP-C06 no publica release. Se preservan las clases que Android/Firebase
# construyen desde el manifiesto cuando C12 habilite una variante de producción.
-keep public class com.tusenda84.storefront.StorefrontApplication { public <init>(); }
-keep public class com.tusenda84.storefront.StorefrontActivity { public <init>(); }
-keep public class com.tusenda84.storefront.StorefrontMessagingService { public <init>(); }
-keepattributes *Annotation*

# Room 2.6 conserva el nombre de las bases generadas, pero R8 puede eliminar el
# constructor sin argumentos que Room usa por reflexion. WorkManager crea esta
# base durante AndroidX Startup, antes incluso de iniciar StorefrontApplication.
-keep class androidx.work.impl.WorkDatabase_Impl {
    public <init>();
}
