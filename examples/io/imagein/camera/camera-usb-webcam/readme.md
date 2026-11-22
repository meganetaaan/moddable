# CoreS3 USB webcam

This Moddable example streams the M5Stack CoreS3's GC0308 camera over USB Video Class (UVC). It advertises MJPEG at 320 × 240 with a default frame rate of 10 fps. The actual frame rate depends on capture, encoding, and transfer time.

## Build and flash

Set up the [Moddable ESP32 toolchain](../../../../../documentation/devices/esp32.md) and source the ESP-IDF export script. Run this command from the example directory.

```sh
mcconfig -m -p esp32/m5stack_cores3 -t build
```

Use a release build. The UVC component owns the USB port, which is also used by the SDK debugger in a debug build.

Connect the CoreS3 with a USB data cable. Hold the bottom reset button until the green LED lights up, then release it to enter download mode. To write the example to the device, run the following command with the download port reported by your operating system.

```sh
UPLOAD_PORT=/dev/ttyACM0 mcconfig -m -p esp32/m5stack_cores3 -t deploy
```

Press reset briefly if the device remains in download mode after flashing. Open the Windows Camera app and select **M5Stack CoreS3 Webcam**. Move an object in front of the sensor to verify the live feed. Close and reopen the app, then unplug and reconnect USB to check that the feed resumes. To flash again, re-enter download mode.

The example initializes the board through the stock Moddable CoreS3 setup. The native webcam module borrows that I²C bus, captures RGB565 frames, and converts them to JPEG on a FreeRTOS task. TinyUSB handles USB negotiation and transport through Espressif's UVC component. The UVC interface carries video.
