# ONNX Runtime reaches its native layer through JNI, so the classes that own
# native methods cannot be renamed or stripped by name-based analysis.
-keep class ai.onnxruntime.** { *; }
