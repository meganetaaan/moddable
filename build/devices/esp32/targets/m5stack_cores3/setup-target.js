/*
 * Copyright (c) 2023 Shinya Ishikawa
 *
 *   This file is part of the Moddable SDK Runtime.
 *
 *   The Moddable SDK Runtime is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU Lesser General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   The Moddable SDK Runtime is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU Lesser General Public License for more details.
 *
 *   You should have received a copy of the GNU Lesser General Public License
 *   along with the Moddable SDK Runtime.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

import AXP2101 from "axp2101";
import SMBus from "pins/smbus";
import AudioOut from "pins/audioout";
import Resource from "Resource";
import config from "mc/config";
import Timer from "timer";

const INTERNAL_I2C = Object.freeze({
  sda: 12,
  scl: 11,
  hz: 400_000,
});

const state = {
  handleRotation: nop,
};

globalThis.Host = {
  Backlight: class {
    constructor(brightness = 100) {
      this.write(brightness);
    }
    write(value) {
      if (undefined !== globalThis.power) globalThis.power.brightness = value;
    }
    close() {}
  },
};

class M5CoreS3Button {
  // M5StackCoreTouch calls write when button changes
  #value = 0;
  read() {
    return this.#value;
  }
  write(value) {
    if (this.#value === value) return;
    this.#value = value;
    this.onChanged?.();
  }
}

export default function (done) {
  // buttons
  if (config.virtualButton) {
    globalThis.button = {
      a: new M5CoreS3Button(),
      b: new M5CoreS3Button(),
      c: new M5CoreS3Button(),
    };
  }

  // power
  globalThis.power = new Power();
  globalThis.amp = new AW88298();
  globalThis.mic = new ES7210();

  // start-up sound
  if (config.startupSound) {
    const speaker = new AudioOut({ streams: 1 });
    speaker.callback = function () {
      this.stop();
      this.close();
      Timer.set(this.done);
    };
    speaker.done = done;
    done = undefined;

    speaker.enqueue(0, AudioOut.Samples, new Resource(config.startupSound));
    speaker.enqueue(0, AudioOut.Callback, 0);
    speaker.start();
  }

  done?.();
}

class ES7210 extends SMBus {
  constructor() {
    super({ address: 0x40, ...INTERNAL_I2C });
    this.initialize();
  }

  initialize() {
    trace('ES7210#initialize\n')
    this.writeRegister(0x00, 0xFF); // RESET_CTL

    const initSequence = [
      [0x00, 0x41], // RESET_CTL
      [0x01, 0x1F], // CLK_ON_OFF
      [0x06, 0x00], // DIGITAL_PDN
      [0x07, 0x20], // ADC_OSR
      [0x08, 0x10], // MODE_CFG
      [0x09, 0x30], // TCT0_CHPINI
      [0x0A, 0x30], // TCT1_CHPINI
      [0x20, 0x0A], // ADC34_HPF2
      [0x21, 0x2A], // ADC34_HPF1
      [0x22, 0x0A], // ADC12_HPF2
      [0x23, 0x2A], // ADC12_HPF1
      [0x02, 0xC1],
      [0x04, 0x01],
      [0x05, 0x00],
      [0x11, 0x60],
      [0x40, 0x42], // ANALOG_SYS
      [0x41, 0x70], // MICBIAS12
      [0x42, 0x70], // MICBIAS34
      [0x43, 0x1B], // MIC1_GAIN
      [0x44, 0x1B], // MIC2_GAIN
      [0x45, 0x00], // MIC3_GAIN
      [0x46, 0x00], // MIC4_GAIN
      [0x47, 0x00], // MIC1_LP
      [0x48, 0x00], // MIC2_LP
      [0x49, 0x00], // MIC3_LP
      [0x4A, 0x00], // MIC4_LP
      [0x4B, 0x00], // MIC12_PDN
      [0x4C, 0xFF], // MIC34_PDN
      [0x01, 0x14], // CLK_ON_OFF
    ];

    for (const [reg, value] of initSequence) {
      this.writeRegister(reg, value);
    }
  }

  writeRegister(register, value) {
    this.writeByte(register, value);
  }
}

/**
 * AW88298 amplifier IC
 */
class AW88298 extends SMBus {
  #rateTable;
  #sampleRate;
  constructor() {
    super({ address: 0x36, ...INTERNAL_I2C });
    this.#rateTable = [4, 5, 6, 8, 10, 11, 15, 20, 22, 44];
    this.writeWord(0x05, 0x0008, true); // RMSE=0 HAGCE=0 HDCCE=0 HMUTE=0
    this.writeWord(0x61, 0x0673, true); // boost mode disabled
    this.writeWord(0x04, 0x4040, true); // I2SEN=1 AMPPD=0 PWDN=0
    this.volume = 250;
    this.sampleRate = 24000;
  }

  /**
   * @note with ESP-IDF, 11025Hz and its multiples are not available for the slight gap between the clock of ESP32S3 and AW88298 PLL
   * @fixme should reset sampleRate if the different value specified in AudioOut#constructor
   */
  set sampleRate(sampleRate) {
    if (this.#sampleRate === sampleRate) {
      return;
    }
    this.#sampleRate = sampleRate;
    let rateData = 0;
    let rate = Math.round((sampleRate + 1102) / 2205);
    while (
      rate > this.#rateTable[rateData] &&
      ++rateData < this.#rateTable.length
    );
    rateData |= 0x14c0; // I2SRXEN=1 CHSEL=01(left) I2SFS=11(32bits)
    this.writeWord(0x06, rateData, true);
  }

  set volume(volume) {
    const vdata = Math.round(Math.min(256, Math.max(0, volume)));
    this.writeWord(0x0c, ((256 - vdata) << 8) | 0x64, true);
  }

  get volume() {
    const vdata = this.readByte(0x0c);
    return 256 - vdata;
  }
}

class Power extends AXP2101 {
  constructor() {
    super(INTERNAL_I2C);
    this.writeByte(0x90, 0xbf);
    this.writeByte(0x92, 13);
    this.writeByte(0x93, 28);
    this.writeByte(0x94, 28);
    this.writeByte(0x95, 28);
    this.writeByte(0x27, 0);
    this.writeByte(0x69, 0x11);
    this.writeByte(0x10, 0x30);

    this.expander = new AW9523(INTERNAL_I2C);
    this.expander.writeByte(0x02, 0b00000111);
    this.expander.writeByte(0x03, 0b10000011);
    this.expander.writeByte(0x04, 0b00011000);
    this.expander.writeByte(0x05, 0b00001100);
    this.expander.writeByte(0x11, 0b00010000);
    this.expander.writeByte(0x12, 0b11111111);
    this.expander.writeByte(0x13, 0b11111111);

    this.resetLcd();
  }

  resetLcd() {
    this.expander.writeByteMask(0x03, 0, 0b11011111);
    Timer.delay(20);
    this.expander.writeByteMask(0x03, 0b00100000, 0xff);
  }
}

/**
 * AW9523 Expander IC
 */
class AW9523 extends SMBus {
  constructor(it) {
    super({ address: 0x58, ...it });
  }

  writeByteMask(address, data, mask) {
    const tmp = this.readByte(address);
    const newData = (tmp & mask) | data;
    this.writeByte(address, newData);
  }
}

function nop() {}
