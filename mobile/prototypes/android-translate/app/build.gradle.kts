plugins {
  alias(libs.plugins.android.application)
}

// Throwaway comparison of on-device translators (docs/notes/mobile.md). Each flavor is its own
// app, so size and memory are measured apart. Mozilla's engine files are not in the repository:
//   ./gradlew assembleDebug -PengineAssets=<folder with bergamot-translator.js and .wasm>
android {
  namespace = "dev.langle.probe.translate"
  compileSdk = 37
  defaultConfig {
    applicationId = "dev.langle.probe.translate"
    minSdk = 29
    targetSdk = 37
    versionCode = 1
    versionName = "0.1"
    ndk { abiFilters += "arm64-v8a" }
  }
  flavorDimensions += "engine"
  productFlavors {
    for (engine in listOf("none", "mlkit", "bergamot")) {
      create(engine) {
        dimension = "engine"
        applicationIdSuffix = ".$engine"
      }
    }
  }
  providers.gradleProperty("engineAssets").orNull?.let {
    sourceSets.getByName("bergamot").assets.directories += it
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
  "mlkitImplementation"(libs.mlkit.translate)
}
