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
  sourceSets {
    // The Bergamot translator's engine files (npm run mobile:bergamot; git-ignored), served
    // to the translator's page as assets bergamot/….
    getByName("main").assets.directories += "engine"
    // The ad-blocking crate's library (npm run mobile:adblock -- android; git-ignored).
    getByName("main").jniLibs.directories += "../../adblock/build/android/jniLibs"
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
  // Google sign-in for Drive sync: AuthorizationClient (docs/notes/mobile.md "Drive sign-in (M7a)").
  implementation(libs.play.services.auth)
  testImplementation(platform(libs.junit.bom))
  testImplementation(libs.junit.jupiter)
  testRuntimeOnly(libs.junit.platform.launcher)
}

// The engine files are code pinned by SHA-256 and never committed (scripts/mobile/bergamot.ts
// checks them): an APK without them would have no on-device translator, so packaging the
// assets fails without them. Unit tests do not need them.
val checkEngineFiles by tasks.registering {
  val dir = layout.projectDirectory.dir("engine/bergamot")
  val names = listOf("bergamot-translator.wasm", "bergamot-translator.js", "LICENSE")
  doLast {
    val missing = names.filterNot { dir.file(it).asFile.isFile }
    if (missing.isNotEmpty())
      throw GradleException(
        "The Bergamot engine files are missing from mobile/android/app/engine/bergamot/ " +
          "(${missing.joinToString()}). Run `npm run mobile:bergamot` at the repository root.",
      )
  }
}
tasks.matching { it.name.startsWith("merge") && it.name.endsWith("Assets") }.configureEach {
  dependsOn(checkEngineFiles)
}

// The ad-blocking library is built from mobile/adblock/ and never committed: an APK without it
// would block nothing, so packaging the native libraries fails without it. The ABIs are those
// scripts/mobile/adblock.ts builds (its `ANDROID`): an ABI left out here would not install on
// devices of only that ABI, or would run there without blocking.
val checkAdblockLibrary by tasks.registering {
  val dir = layout.projectDirectory.dir("../../adblock/build/android/jniLibs")
  val abis = listOf("arm64-v8a", "armeabi-v7a", "x86_64")
  doLast {
    val missing = abis.filterNot { dir.file("$it/liblangle_adblock.so").asFile.isFile }
    if (missing.isNotEmpty())
      throw GradleException(
        "The ad-blocking library is missing from mobile/adblock/build/android/jniLibs/ " +
          "(${missing.joinToString()}). Run `npm run mobile:adblock -- android` at the repository root.",
      )
  }
}
tasks.matching { it.name.startsWith("merge") && it.name.endsWith("JniLibFolders") }.configureEach {
  dependsOn(checkAdblockLibrary)
}

tasks.withType<Test>().configureEach {
  useJUnitPlatform()
  testLogging {
    events("failed")
    exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
  }
}
