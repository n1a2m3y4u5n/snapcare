plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

/**
 * The golden vectors are not checked in here — they are generated from the
 * firmware by `../webapp_kit/tools/make_vectors.py` and copied at build time
 * from the one place they live.
 *
 * That indirection is the point. This app is the fourth independent
 * implementation of the pairing crypto, and the only thing standing between
 * "four implementations" and "four subtly different implementations" is that
 * they all read the same file. Vendoring a copy here would let this one drift
 * and still pass its own tests.
 *
 * A missing file fails the build loudly rather than at the moment somebody
 * tries to pair with a real dispenser in front of an audience.
 */
val vectorsFile = rootProject.layout.projectDirectory.file("../webapp_kit/tests/vectors.json")
val stagedVectors = layout.buildDirectory.dir("generated/vectors")

val stageVectors by tasks.registering(Copy::class) {
    description = "Copy the firmware-generated crypto vectors in for the self-check."
    from(vectorsFile)
    into(stagedVectors)
    doFirst {
        if (!vectorsFile.asFile.isFile) {
            throw GradleException(
                "no vectors to check against: ${vectorsFile.asFile.path}\n" +
                    "run `make vectors` in pill_dispenser/webapp_kit/ first.",
            )
        }
    }
}

android {
    namespace = "app.snapcare.dispenserdemo"
    compileSdk = 36

    defaultConfig {
        applicationId = "app.snapcare.dispenserdemo"
        // Android 7. Nothing here needs anything newer, and the phones this is
        // most useful on are not the new ones.
        minSdk = 24
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"

        // The golden vectors, shipped as an asset and checked at launch. See
        // SelfCheck.kt: the app refuses to pair if its own crypto disagrees
        // with the Python that generated them, because the alternative is a
        // demo that silently sends schedules nothing can open.
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    // Wired to the task, not to the directory it writes: handing Gradle the
    // task provider is what makes it infer the dependency, so no consumer can
    // be added later that reads a stale or missing copy.
    sourceSets {
        getByName("main") { assets.srcDir(stageVectors) }
        getByName("test") { resources.srcDir(stageVectors) }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Signed with the debug key on purpose: this is a demo that has to
            // install by sideloading on whatever phone is at hand, and an
            // unsigned release APK will not install at all. It is not a
            // Play-Store artefact and does not pretend to be.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    buildFeatures {
        viewBinding = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

// Hung off `preBuild` rather than off each consumer.
//
// The staged file lives under `build/`, so *anything* that walks the build
// directory — the assets merge, the unit-test resources, the lint model — is a
// consumer, and Gradle fails the build for each one it finds undeclared. Naming
// them individually is a list that grows every time AGP adds a task. Making the
// copy part of the build's own prologue means there is no ordering left to get
// wrong.
tasks.named("preBuild") {
    dependsOn(stageVectors)
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
    implementation("androidx.recyclerview:recyclerview:1.3.2")
    implementation("com.google.android.material:material:1.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    // The pairing crypto is HMAC-SHA256 and AES-GCM, both of which are in the
    // JVM. Everything else here is HttpURLConnection and org.json. No client
    // library, deliberately: this file is also a reference for what the
    // protocol actually needs, and a dependency would hide that.
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.1")
    // A real org.json on the test classpath. Android's is a stub that throws
    // the moment it is touched in a JVM unit test, and the vector tests have to
    // run without a device — a crypto contract that can only be checked by
    // installing the app is one that gets checked during the demo.
    testImplementation("org.json:json:20240303")
}
