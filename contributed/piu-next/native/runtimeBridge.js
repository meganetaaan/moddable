class NativeRuntimeBridgeSession extends Native("xs_piu_next_runtime_bridge_session_destructor") {
	constructor(root, context) {
		super();
		const props = (root && typeof root === "object" && root.props && (typeof root.props === "object"))
			? root.props
			: {};
		const application = context?.application ?? new Application(null, props);
		this._application = application;
		native("xs_piu_next_runtime_bridge_session").call(this, application, root);
	}

	get application() {
		return this._application;
	}

	update(root) {
		native("xs_piu_next_runtime_bridge_session_update").call(this, root);
	}

	dispose() {
		native("xs_piu_next_runtime_bridge_session_dispose").call(this);
	}
}

class NativeRuntimeBridge extends Native("xs_piu_next_runtime_bridge_destructor") {
	constructor() {
		super();
		native("xs_piu_next_runtime_bridge").call(this);
	}

	mount(root, context) {
		if (globalThis.__piuNextEnableNativeRuntimeBridge !== true)
			return null;
		return new NativeRuntimeBridgeSession(root, context);
	}
}

export function createNativeRuntimeBridge() {
	return new NativeRuntimeBridge();
}

export function installNativeRuntimeBridge(scope = globalThis) {
	const bridge = createNativeRuntimeBridge();
	scope.__piuNextRuntimeBridge = bridge;
	return bridge;
}

export const nativeRuntimeBridge = installNativeRuntimeBridge();
