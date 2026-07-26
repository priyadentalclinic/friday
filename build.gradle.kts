// FRIDAY Mark VII - root build file
plugins {
    id("com.android.application") version "8.7.0" apply false
    id("org.jetbrains.kotlin.android") version "2.3.0" apply false
    id("com.google.devtools.ksp") version "2.3.4" apply false
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
