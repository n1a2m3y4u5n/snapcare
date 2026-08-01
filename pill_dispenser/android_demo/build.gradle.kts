// Pinned to what the installed SDK actually carries, and to the same versions
// as nutrition_manager/android — API 36 needs AGP 8.9+, and AGP 8.13 needs
// Gradle 8.13+. Bumping one of these three without the others is the usual way
// an Android build stops resolving.
plugins {
    id("com.android.application") version "8.13.2" apply false
    id("org.jetbrains.kotlin.android") version "2.1.21" apply false
}
