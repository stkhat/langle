plugins {
  alias(libs.plugins.android.application) apply false
  // GeckoView depends on kotlin-stdlib 2.4; this puts a matching Kotlin on AGP's built-in Kotlin path.
  alias(libs.plugins.kotlin.android) apply false
}
