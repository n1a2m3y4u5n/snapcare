plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

/**
 * The graph the app ships is not checked in here — it is copied at build time
 * from `nutrition_manager/web/model/`, which is what `promote.py --install`
 * writes.
 *
 * That indirection is the whole point. "Ship the best model" has to survive
 * someone training a better one: if the .onnx were vendored into this module,
 * promoting a new winner would silently leave the phone on the old graph, and
 * nothing about the APK would say so. Copying from the promoted location means
 * a rebuild is the only step, and a missing file fails the build loudly rather
 * than at the moment a user photographs their dinner.
 */
val modelDir = rootProject.layout.projectDirectory.dir("../web/model")
val stagedModel = layout.buildDirectory.dir("generated/modelAssets")

val stageModel by tasks.registering(Copy::class) {
    description = "Copy the promoted nutrition model into the APK's assets."
    from(modelDir) {
        include("web.onnx", "web.json")
    }
    into(stagedModel)
    doFirst {
        val onnx = modelDir.file("web.onnx").asFile
        val manifest = modelDir.file("web.json").asFile
        val missing = listOf(onnx, manifest).filterNot { it.isFile }
        if (missing.isNotEmpty()) {
            throw GradleException(
                "no model to ship: ${missing.joinToString { it.path }}\n" +
                    "run `python promote.py --install` in nutrition_manager/ first.",
            )
        }
    }
}

android {
    namespace = "app.snapcare.mealcam"
    compileSdk = 34

    defaultConfig {
        applicationId = "app.snapcare.mealcam"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "0.1"
    }

    sourceSets {
        getByName("main") {
            assets.srcDir(stagedModel)
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    // A 16 MB float32 graph gains nothing from deflate and costs a decompression
    // pass on every cold start. Leaving it stored lets the runtime read it
    // straight out of the APK.
    androidResources {
        noCompress.add("onnx")
    }

    buildFeatures {
        viewBinding = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

// Matched by task type rather than by name: the assets-merge task is called
// different things across AGP versions, and a name that stops matching would
// silently ship an APK with no model in it rather than failing the build.
tasks.withType<com.android.build.gradle.tasks.MergeSourceSetFolders>().configureEach {
    dependsOn(stageModel)
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    val cameraX = "1.3.4"
    implementation("androidx.camera:camera-core:$cameraX")
    implementation("androidx.camera:camera-camera2:$cameraX")
    implementation("androidx.camera:camera-lifecycle:$cameraX")
    implementation("androidx.camera:camera-view:$cameraX")

    implementation("com.microsoft.onnxruntime:onnxruntime-android:1.19.2")
}
