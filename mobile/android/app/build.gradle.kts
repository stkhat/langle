// The Android app (docs/plans/mobile-app.md "M1: Android shell"): the engine over System WebView,
// the extension host, the app origin and the minimal screen. The core (router, store …) is :core.
plugins {
  alias(libs.plugins.android.application)
}

android {
  namespace = "dev.langle.app"
  compileSdk = 37
  defaultConfig {
    applicationId = "dev.langle.app"
    minSdk = 29
    targetSdk = 37
    versionCode = 1
    versionName = "0.1"
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  buildFeatures {
    aidl = false
    buildConfig = true
    shaders = false
  }
  testOptions {
    // android.util.Log in unit tests.
    unitTests.isReturnDefaultValues = true
  }
  androidResources {
    // aapt's default also leaves out folders starting with "_"; the bundled build keeps them all.
    ignoreAssetsPattern = "!.svn:!.git:!.ds_store:!*.scc:.*:!CVS:!thumbs.db:!picasa.ini:!*~"
  }
}

dependencies {
  implementation(project(":core"))
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.webkit)
  testImplementation(platform(libs.junit.bom))
  testImplementation(libs.junit.jupiter)
  testRuntimeOnly(libs.junit.platform.launcher)
}

tasks.withType<Test>().configureEach {
  useJUnitPlatform()
  testLogging {
    events("failed")
    exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
  }
}
