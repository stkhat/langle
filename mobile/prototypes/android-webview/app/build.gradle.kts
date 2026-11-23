plugins {
  alias(libs.plugins.android.application)
}

android {
  namespace = "dev.langle.probe.webview"
  compileSdk = 37
  defaultConfig {
    applicationId = "dev.langle.probe.webview"
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
}

dependencies {
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.webkit)
}
