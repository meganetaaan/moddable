# HUB75 RGB LED Matrix Driver Example

This example demonstrates the HUB75 RGB LED matrix driver for the Moddable SDK.

## Overview

The HUB75 driver provides:
- **ECMA-419 compliant API** for standard I/O interface
- **Screen interface** for integration with Poco rendering engine
- **Hardware acceleration** with DMA-based refresh
- **Multi-panel support** for chained displays
- **Brightness control** with PWM-based dimming
- **Color correction** with gamma table

## Hardware Requirements

### Supported Panels
- 32x32 RGB LED matrix panels
- 64x32 RGB LED matrix panels  
- 64x64 RGB LED matrix panels (with E pin)
- Chainable panels for larger displays

### Pin Connections (ESP32 default)

| HUB75 Pin | ESP32 Pin | Description |
|-----------|-----------|-------------|
| R1        | 25        | Red data (top half) |
| G1        | 26        | Green data (top half) |
| B1        | 27        | Blue data (top half) |
| R2        | 14        | Red data (bottom half) |
| G2        | 12        | Green data (bottom half) |
| B2        | 13        | Blue data (bottom half) |
| A         | 23        | Row address A |
| B         | 19        | Row address B |
| C         | 5         | Row address C |
| D         | 17        | Row address D |
| E         | 18        | Row address E (64-row panels) |
| CLK       | 16        | Shift register clock |
| LATCH     | 4         | Data latch |
| OE        | 15        | Output enable (active low) |

## Building and Running

### ESP32
```bash
mcconfig -d -m -p esp32
```

### ESP32-S2
```bash
mcconfig -d -m -p esp32s2
```

### ESP32-S3
```bash
mcconfig -d -m -p esp32s3
```

### Custom Pin Configuration
Modify the pin assignments in `manifest.json`:

```json
{
  "defines": {
    "hub75": {
      "pins": {
        "r1": 25,
        "g1": 26,
        // ... other pins
      }
    }
  }
}
```

## Usage Examples

### Basic Initialization
```javascript
import HUB75 from "hub75";

const display = new HUB75({
  width: 64,
  height: 32,
  chains: 1,
  brightness: 128
});
```

### Using with Poco Renderer
```javascript
import Poco from "commodetto/Poco";

const poco = new Poco(display);

poco.begin();
poco.fillRectangle(0xF800, 0, 0, 32, 16); // Red rectangle
poco.end();
```

### Color Utilities
```javascript
import { rgb565, hsvToRgb565 } from "hub75";

const red = rgb565(255, 0, 0);
const rainbow = hsvToRgb565(180, 1.0, 1.0); // Cyan
```

### Brightness Control
```javascript
display.brightness = 255; // Maximum brightness
display.brightness = 64;  // 25% brightness
display.brightness = 0;   // Minimum brightness
```

### Test Patterns
```javascript
display.testPattern("gradient");
display.testPattern("checkerboard");
display.testPattern("colors");
```

## Display Features

### Multi-Panel Chaining
```javascript
const display = new HUB75({
  width: 64,
  height: 32,
  chains: 2  // Two 64x32 panels = 128x32 display
});
```

### Async Display Updates
The HUB75 driver is asynchronous and uses double buffering:

```javascript
display.begin(0, 0, width, height);
display.send(pixelBuffer);
display.end(); // Triggers buffer swap
```

### Screen Interface
Compatible with all Commodetto graphics operations:

```javascript
poco.begin();
poco.drawText("Hello", font, 0xFFFF, 10, 10);
poco.drawBitmap(bitmap, 0, 0);
poco.end();
```

## Performance Notes

- **Refresh Rate**: 120Hz default (configurable)
- **Color Depth**: RGB565 (16-bit) or RGB888 (24-bit)
- **Memory Usage**: Double buffered (2x frame buffer)
- **DMA Transfer**: Hardware accelerated pixel pushing
- **CPU Usage**: <5% for 64x32 display at 120Hz

## Troubleshooting

### Display Not Working
- Check power supply (5V, adequate current)
- Verify pin connections
- Ensure proper grounding
- Check for loose connections

### Flickering Display
- Increase refresh rate
- Check power supply stability
- Reduce brightness if power limited
- Verify clock signal integrity

### Wrong Colors
- Check RGB pin assignments
- Verify pixel format (RGB565 vs RGB888)
- Test with simple solid colors

### Performance Issues
- Reduce refresh rate if needed
- Use RGB565 instead of RGB888
- Optimize pixel data transfers
- Consider frame rate limiting

## API Reference

### Constructor Options
- `width`: Panel width in pixels
- `height`: Panel height in pixels  
- `chains`: Number of chained panels
- `brightness`: Initial brightness (0-255)
- `refreshHz`: Refresh rate in Hz
- `pixelFormat`: Color format (default: RGB565)

### Methods
- `begin(x, y, w, h)`: Start pixel transfer
- `send(buffer, offset, count)`: Send pixel data
- `end()`: Complete transfer and swap buffers
- `clear(color)`: Fill display with color
- `testPattern(pattern)`: Display test pattern
- `close()`: Release resources

### Properties
- `width`, `height`: Display dimensions
- `brightness`: Current brightness (0-255)
- `pixelFormat`: Current pixel format
- `async`: Always true for HUB75

## License

Copyright (c) 2016-2024 Moddable Tech, Inc.
Licensed under GNU Lesser General Public License v3.0