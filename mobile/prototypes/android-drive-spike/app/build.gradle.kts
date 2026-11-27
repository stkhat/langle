plugins {
  alias(libs.plugins.android.application)
}

android {
  namespace = "dev.langle.spike.drive"
  compileSdk = 37
  defaultConfig {
    // The Android OAuth client is registered for this package and the debug keystore's SHA-1,
    // so the spike installs over the real app's package (its "langle" profile is left alone).
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
    buildConfig = false
    shaders = false
  }
  // drive.html and drive.js, shared with ios-drive-spike.
  sourceSets["main"].assets.directories.add("../../drive-spike-web")
}

dependencies {
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.webkit)
  implementation(libs.play.services.auth)
}
