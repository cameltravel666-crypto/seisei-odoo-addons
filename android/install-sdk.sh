#!/bin/bash
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$PATH"
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export ANDROID_SDK_ROOT=/opt/homebrew/share/android-commandlinetools

# Accept licenses
yes | $ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager --licenses

# Install required packages
$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager "platforms;android-34" "build-tools;34.0.0" "platform-tools"

echo "SDK installation complete!"
