class Hub75Controller @"xs_hub75_destructor_" {
	constructor(options) @"xs_hub75_constructor_"
	close() @"xs_hub75_close_"
	configure(options) @"xs_hub75_configure_"
	start(buffer) @"xs_hub75_start_"
	stop() @"xs_hub75_stop_"
	swapBuffers(buffer) @"xs_hub75_swap_"
	setPlaneDurations(durations) @"xs_hub75_setPlaneDurations_"
}

export default Hub75Controller;
