plugins {
  alias(libs.plugins.android.application)
}

android {
  namespace = "dev.langle.probe.gecko"
  compileSdk = 37
  defaultConfig {
    applicationId = "dev.langle.probe.gecko"
    minSdk = 29
    targetSdk = 37
    versionCode = 1
    versionName = "0.2"
    ndk { abiFilters += "arm64-v8a" }
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
  implementation(libs.geckoview)
}
