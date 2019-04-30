import NeoPixel from "neopixel";

import Digital from "pins/digital";
import Monitor from "monitor";

import AudioOut from "pins/i2s";
import Resource from "Resource";

import Timer from "timer";
import MPU9250 from "mpu9250";

import config from "mc/config";

const state = {
	handleRotation: nop
};


export default function (done) {
	global.lights = new NeoPixel({});

	global.button = {
		a: new Monitor({pin: 39, mode: Digital.InputPullUp, edge: Monitor.RisingEdge | Monitor.FallingEdge}),
		b: new Monitor({pin: 38, mode: Digital.InputPullUp, edge: Monitor.RisingEdge | Monitor.FallingEdge}),
		c: new Monitor({pin: 37, mode: Digital.InputPullUp, edge: Monitor.RisingEdge | Monitor.FallingEdge}),
	};
	button.a.onChanged = button.b.onChanged = button.c.onChanged = nop;

	global.speaker = new AudioOut({streams: 4});
	/*
	speaker.callback = function() {this.stop()};
	speaker.enqueue(0, AudioOut.Samples, new Resource("bflatmajor.maud"));
	speaker.enqueue(0, AudioOut.Callback, 0);
	speaker.start();
	*/

	//@@ microphone

	state.accelerometerGyro = new MPU9250;

	global.accelerometer = {
		onreading: nop
	}

	global.gyro = {
		onreading: nop
	}

	accelerometer.start = function(frequency){
		accelerometer.stop();
		state.accelerometerTimerID = Timer.repeat(id => {
			state.accelerometerGyro.configure({ operation: "accelerometer" });
			const sample = state.accelerometerGyro.sample();
			if (sample) {
				sample.y *= -1;
				sample.z *= -1;
				state.handleRotation(sample);
				accelerometer.onreading(sample);
			}
		}, frequency);
	}

	gyro.start = function(frequency){
		gyro.stop();
		state.gyroTimerID = Timer.repeat(id => {
			state.accelerometerGyro.configure({ operation: "gyroscope" });
			const sample = state.accelerometerGyro.sample();
			if (sample) {
				let {x, y, z} = sample;
				const temp = x;
				x = y * -1;
				y = temp * -1;
				z *= -1;
				gyro.onreading({ x, y, z });
			}
		}, frequency);
	}

	accelerometer.stop = function(){
		if (undefined !== state.accelerometerTimerID)
			Timer.clear(state.accelerometerTimerID);
		delete state.accelerometerTimerID;
	}

	gyro.stop = function () {
		if (undefined !== state.gyroTimerID)
			Timer.clear(state.gyroTimerID);
		delete state.gyroTimerID;
	}

	if (config.autorotate && global.Application){
		state.handleRotation = function (reading) {
			if (Math.abs(reading.y) > Math.abs(reading.x)) {
				if (reading.y < -0.7 && application.rotation != 90) {
					application.rotation = 90;
				} else if (reading.y > 0.7 && application.rotation != 270) {
					application.rotation = 270;
				}
			} else {
				if (reading.x < -0.7 && application.rotation != 180) {
					application.rotation = 180;
				} else if (reading.x > 0.7 && application.rotation != 0) {
					application.rotation = 0;
				}
			}
		}
		accelerometer.start(300);
	}

	done();
}

function nop() {
}

