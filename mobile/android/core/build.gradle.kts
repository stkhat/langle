// The app's core without the engine (docs/plans/mobile-app.md "M1 and M2"): envelopes, the
// router, the key-value store, the manifest reader, match patterns, alarms and tabs. Pure
// Kotlin/JVM, so `./gradlew :core:test` runs on the Mac without the emulator.
plugins {
  alias(libs.plugins.kotlin.jvm)
}

// Bytecode the app can use; built with whatever JDK runs Gradle (Android Studio's).
java {
  sourceCompatibility = JavaVersion.VERSION_17
  targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
  compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
}

// The shell's built-in English (docs/specs/mobile-app.md "Native strings follow the interface
// language"): en.json's `app.` keys, generated at build time as the resource
// native-strings-en.json (NativeStrings.ENGLISH), never copied by hand.
val generateNativeStrings by tasks.registering {
  // Locals only: the configuration cache keeps no script references for the action.
  val source = rootDir.resolve("../../src/i18n/locales/en.json")
  val outDir = layout.buildDirectory.dir("generated/native-strings")
  inputs.file(source)
  outputs.dir(outDir)
  doLast {
    @Suppress("UNCHECKED_CAST")
    val all = groovy.json.JsonSlurper().parse(source) as Map<String, Any?>
    val app = all.filterKeys { it.startsWith("app.") }.filterValues { it is String }
    val out = outDir.get().file("native-strings-en.json").asFile
    out.parentFile.mkdirs()
    out.writeText(groovy.json.JsonOutput.toJson(app))
  }
}
sourceSets.main { resources.srcDir(generateNativeStrings) }

dependencies {
  api(libs.kotlinx.serialization.json)
  testImplementation(platform(libs.junit.bom))
  testImplementation(libs.junit.jupiter)
  testRuntimeOnly(libs.junit.platform.launcher)
}

tasks.test {
  useJUnitPlatform()
  // The golden envelopes (mobile/protocol/) and protocol.ts, shared with the TS tests and XCTest.
  systemProperty("langle.repo", rootDir.parentFile.parentFile.absolutePath)
  testLogging {
    events("failed")
    exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
  }
}
