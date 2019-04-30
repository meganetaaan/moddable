/*
 * Copyright (c) 2019 Moddable Tech, Inc.
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
/*
	InvenSense MPU-9250 Accelerometer + Gyro + Magnetometer
            Datasheet: 			http://43zrtwysvxb2gf29r5o0athu.wpengine.netdna-cdn.com/wp-content/uploads/2015/02/MPU-6000-Datasheet1.pdf
            Register Map:       https://www.invensense.com/wp-content/uploads/2015/02/MPU-6000-Register-Map1.pdf
*/

import SMBus from "pins/smbus";
import Timer from "timer";

const REGISTERS = {
    INT_BYPASS: 0x37,
    ACCEL_XOUT: 0x3B, //big endian
    ACCEL_YOUT: 0x3D,
    ACCEL_ZOUT: 0x3F,
    TEMP_OUT: 0x41,
    GYRO_XOUT: 0x43,
    GYRO_YOUT: 0x45,
    GYRO_ZOUT: 0x47,
    PWR_MGMT_1: 0x6B,
    PWR_MGMT_2: 0x6C,
    WHO_AM_I: 0x75,
    USER_CTRL: 0x6A,
    I2C_MST_CTRL: 0x24,
    I2C_SLV0_ADDR: 0x25,
    I2C_SLV0_REG: 0x26,
    I2C_SLV0_CTRL: 0x27,
    I2C_SLV1_ADDR: 0x28,
    I2C_SLV1_REG: 0x29,
    I2C_SLV1_CTRL: 0x2A,
    I2C_SLV2_ADDR: 0x2B,
    I2C_SLV2_REG: 0x2C,
    I2C_SLV2_CTRL: 0x2D,
    I2C_SLV3_ADDR: 0x2E,
    I2C_SLV3_REG: 0x2F,
    I2C_SLV3_CTRL: 0x30,
    I2C_SLV4_ADDR: 0x31,
    I2C_SLV4_REG: 0x32,
    I2C_SLV4_DO: 0x33,
    I2C_SLV4_CTRL: 0x34,
    I2C_SLV4_DI: 0x35,
    I2C_MST_STATUS: 0x36,
    //Magnetometer Registers

    AK8963_I2C_ADDR: 0x0C,
    AK8963_WIA: 0x00, // should return 0x48
    INFO: 0x01,
    AK8963_ST1: 0x02,  // data ready status bit 0
    AK8963_XOUT_L: 0x03,  // data
    AK8963_XOUT_H: 0x04,
    AK8963_YOUT_L: 0x05,
    AK8963_YOUT_H: 0x06,
    AK8963_ZOUT_L: 0x07,
    AK8963_ZOUT_H: 0x08,
    AK8963_ST2: 0x09,  // Data overflow bit 3 and data read error status bit 2
    AK8963_CNTL: 0x0A,  // Power down (0000), single-measurement (0001), self-test (1000) and Fuse ROM (1111) modes on bits 3:0
    AK8963_ASTC: 0x0C,  // Self test control
    AK8963_I2CDIS: 0x0F,  // I2C disable
    AK8963_ASAX: 0x10,  // Fuse ROM x-axis sensitivity adjustment value
    AK8963_ASAY: 0x11,  // Fuse ROM y-axis sensitivity adjustment value
    AK8963_ASAZ: 0x12,  // Fuse ROM z-axis sensitivity adjustment value
};
Object.freeze(REGISTERS);

const EXPECTED_WHO_AM_I_MPU9250 = 0x71;
const EXPECTED_WHO_AM_I_AK9863 = 0x48;

const GYRO_SCALER = (1 / 131); //Datasheet Section 6.1
const ACCEL_SCALER = (1 / 16384); //Datasheet Section 6.2

class SMBHold extends SMBus { //SMBus implementation that holds the i2c bus between the i2c.read and i2c.write on read operations.
    constructor(dictionary) {
        super(dictionary);
    }
    readByte(register) {
        super.write(register, false);
        return super.read(1)[0];
    }
    readWord(register) {
        super.write(register, false);
        let value = super.read(2);
        return value[0] | (value[1] << 8);
    }
    readBlock(register, count, buffer) {
        super.write(register, false);
        return buffer ? super.read(count, buffer) : super.read(count);
    }
}

class Gyro_Accelerometer extends SMBHold {
    constructor(dictionary) {
        super(Object.assign({ address: 0x68 }, dictionary));
        this.xlRaw = new ArrayBuffer(6);
        this.xlView = new DataView(this.xlRaw);
        this.gyroRaw = new ArrayBuffer(6);
        this.gyroView = new DataView(this.gyroRaw);
        this.operation = "gyroscope";
        this.reboot();
        this.checkIdentification();
    }

    reboot() {
        this.writeByte(REGISTERS.PWR_MGMT_1, 0b10000000);
        Timer.delay(150);
        this.writeByte(REGISTERS.PWR_MGMT_1, 0b00000001);
        this.writeByte(REGISTERS.INT_BYPASS, 0b00000010);
        Timer.delay(150);
        
        /*
        this.writeByte(REGISTERS.USER_CTRL, 0x34); // Enable Master I2C, disable primary I2C I/F, and reset FIFO.
        this.writeByte(REGISTERS.SMPLRT_DIV, 9); // SMPLRT_DIV = 9, 100Hz sampling;
        this.writeByte(REGISTERS.CONFIG, (1 << 6) | (1 << 0)); // FIFO_mode = 1 (accept overflow), Use LPF, Bandwidth_gyro = 184 Hz, Bandwidth_temperature = 188 Hz,
        this.writeByte(REGISTERS.GYRO_CONFIG, (3 << 3)); // FS_SEL = 3 (2000dps)
        this.writeByte(REGISTERS.ACCEL_CONFIG, (2 << 3)); // AFS_SEL = 2 (8G)

        // this.writeByte(REGISTERS.I2C_MST_CTRL, (0xC8 | 13)); // Multi-master, Wait for external sensor, I2C stop then start cond., clk 400KHz
        */

        this.rebootMagnetometer();

        /*
        this.writeByte(REGISTERS.FIFO_EN, 0xF9); // FIFO enabled for temperature(2), gyro(2 * 3), accelerometer(2 * 3), slave 0(7, delayed sample). Total 21 bytes.
        this.writeByte(REGISTERS.USER_CTRL, 0x70); // Enable FIFO with Master I2C enabled, and primary I2C I/F disabled.

        */
        this.checkIdentification();
    }

    rebootMagnetometer() {
        this.checkIdentificationMagnetometer();

        this.writeByte(REGISTERS.I2C_SLV4_ADDR, REGISTERS.AK8963_I2C_ADDR); // Set the I2C slave 4 address of AK8963 and set for write.

        this.writeByte(REGISTERS.I2C_SLV4_REG, REGISTERS.AK8963_CNTL2); //I2C slave 4 register address from where to begin data transfer
        this.writeByte(REGISTERS.I2C_SLV4_DO, 0x01); // Reset AK8963
        this.writeByte(REGISTERS.I2C_SLV4_CTRL, 0x80); // Enable I2C slave 4
        Timer.delay(20);

        this.writeByte(REGISTERS.I2C_SLV4_REG, REGISTERS.AK8963_CNTL1); //I2C slave 0 register address from where to begin data transfer
        this.writeByte(REGISTERS.I2C_SLV4_DO, 0x12); // Register value to continuous measurement mode 1 (8Hz) in 16bit
        this.writeByte(REGISTERS.I2C_SLV4_CTRL, 0x80); // Enable I2C slave 4
        Timer.delay(20);

        //this.writeByte(REGISTERS.I2C_SLV4_CTRL, 0x0F); // sampling rate is 100 / (1 + 15) Hz

        this.writeByte(REGISTERS.I2C_SLV0_ADDR, REGISTERS.AK8963_I2C_ADDR | 0x80); // Set the I2C slave 0 address of AK8963 and set for read.

        this.writeByte(REGISTERS.I2C_SLV0_REG, REGISTERS.AK8963_HXL); //I2C slave 0 register address from where to begin data transfer
        this.writeByte(REGISTERS.I2C_SLV0_CTRL, 0x87); // Enable I2C and set 7 byte,
        // which makes the AK8963A unlatch the data registers for the next measurement by reading ST2 register (0x09).
        //this.writeByte(REGISTERS.I2C_MST_DELAY_CTRL, 0x81); // Delayed sampling is applied to Slave 0.
    }

    checkIdentificationMagnetometer() {
        this.writeByte(REGISTERS.I2C_SLV4_ADDR, REGISTERS.AK8963_I2C_ADDR | 0x80); // Set the I2C slave 4 address of AK8963 and set for read.

        this.writeByte(REGISTERS.I2C_SLV4_REG, REGISTERS.AK8963_WIA); //I2C slave 4 register address from where to begin data transfer
        this.writeByte(REGISTERS.I2C_SLV4_CTRL, 0x80); // Enable I2C slave 4
        Timer.delay(20);
        let gxlID = this.readByte(REGISTERS.I2C_SLV4_DI); // expecting 0x48
        trace(gxlID);
        // if (gxlID != EXPECTED_WHO_AM_I_AK9863) throw ("bad WHO_AM_I ID for AK-9863.");
    }

    checkIdentification() {
        let gxlID = this.readByte(REGISTERS.WHO_AM_I);
        if (gxlID != EXPECTED_WHO_AM_I_MPU9250) throw ("bad WHO_AM_I ID for MPU-9250.");
    }

    configure(dictionary) {
        for (let property in dictionary) {
            switch (property) {
                case "operation":
                    this.operation = dictionary.operation;
            }
        }
    }

    /*
    reboot() {
        this.writeByte(REGISTERS.PWR_MGMT_1, 0x80);
        Timer.delay(150);
        this.writeByte(REGISTERS.PWR_MGMT_1, 0x01);
        this.writeByte(USER_CTRL, 0x34);
        this.writeByte(REGISTERS.INT_BYPASS, 0x03);
        Timer.delay(150);
    }
    */

    sampleXL() {
        this.readBlock(REGISTERS.ACCEL_XOUT, 6, this.xlRaw);
        return {
            x: this.xlView.getInt16(0) * ACCEL_SCALER, 
            y: this.xlView.getInt16(2) * ACCEL_SCALER,
            z: this.xlView.getInt16(4) * ACCEL_SCALER
        }
    }

    sampleGyro() {
        this.readBlock(REGISTERS.GYRO_XOUT, 6, this.gyroRaw);
        return {
            x: this.gyroView.getInt16(0) * GYRO_SCALER, 
            y: this.gyroView.getInt16(2) * GYRO_SCALER,
            z: this.gyroView.getInt16(4) * GYRO_SCALER
        }
    }

    sampleMgn() {

    }

    sample() {
        switch (this.operation) {
            case "gyroscope":
                return this.sampleGyro();
            case "accelerometer":
                return this.sampleXL();
            case "magnetometer":
                return this.sampleMgn();
            default:
                trace("Invalid operation for MPU-9250.");
                throw ("Invalid operation for MPU-9250.");
        }
    }
}

Object.freeze(Gyro_Accelerometer.prototype);


/*
class Magnetometer extends SMBHoldBus {
    constructor(dictionary) {
        super(Object.assign({ address: 0x0E, throw: false}, dictionary));
        this.checkIdentification();
        this.calibration = { maxX: Number.NEGATIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY, maxZ: Number.NEGATIVE_INFINITY, minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, minZ: Number.POSITIVE_INFINITY };
        this.rawValues = new ArrayBuffer(6);
        this.view = new DataView(this.rawValues);
        this.enable();
    }

    checkIdentification() {
        let mID = this.readByte(REGISTERS.WHO_AM_I);
        if (mID != EXPECTED_WHO_AM_I) throw ("bad WHO_AM_I ID for MAG-3110");
    }

    configure(dictionary) {

    }

    calibrate(x, y, z){
        let cal = this.calibration;
        if (x < cal.minX) cal.minX = x;
        if (x > cal.maxX) cal.maxX = x;
        if (y < cal.minY) cal.minY = y;
        if (y > cal.maxY) cal.maxY = y;
        if (z > cal.maxZ) cal.maxZ = z;
        if (z < cal.minZ) cal.minZ = z;
        cal.xSpread = cal.maxX - cal.minX;
        cal.ySpread = cal.maxY - cal.minY;
        cal.zSpread = cal.maxZ - cal.minZ;
        cal.xMid = cal.minX + (cal.xSpread / 2);
        cal.yMid = cal.minY + (cal.ySpread / 2);
        cal.zMid = cal.minZ + (cal.zSpread / 2);
        if (cal.xSpread >= 20 && cal.ySpread >= 20 && cal.zSpread >= 20) return true;
        return false;
    }

    enable() {
        this.writeByte()
        this.writeByte(REGISTERS.CTRL_REG1, 0);
        this.writeByte(REGISTERS.CTRL_REG2, 0b10110000);
        Timer.delay(100);
        this.writeByte(REGISTERS.CTRL_REG1, 0b00000001);
    }

    disable() {
        this.writeByte(REGISTERS.CTRL_REG1, 0);
    }

    sample() {
        let test = this.readBlock(REGISTERS.OUT_X, 6, this.rawValues);
        if (test === undefined) return undefined;
        const x = this.view.getInt16(0);
        const y = this.view.getInt16(2);
        const z = this.view.getInt16(4);

        const calibrated = this.calibrate(x, y, z);

        if (!calibrated) return undefined;

        return {
            x: (x - this.calibration.xMid) * (2000 / this.calibration.xSpread),
            y: (y - this.calibration.yMid) * (2000 / this.calibration.ySpread),
            z: (z - this.calibration.zMid) * (2000 / this.calibration.zSpread)
        }
    }
}

Object.freeze(Magnetometer.prototype);
*/

export default Gyro_Accelerometer
