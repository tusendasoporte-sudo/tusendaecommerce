# PZ-APP-C06 no publica release. Se preservan las clases que Android/Firebase
# construyen desde el manifiesto cuando C12 habilite una variante de producción.
-keep public class com.tusenda84.storefront.StorefrontApplication { public <init>(); }
-keep public class com.tusenda84.storefront.StorefrontActivity { public <init>(); }
-keep public class com.tusenda84.storefront.StorefrontMessagingService { public <init>(); }
-keepattributes *Annotation*
