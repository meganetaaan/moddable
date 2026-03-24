export function textBufferAppend(text, data, maxLength) {
	const buffer = String(text ?? "");
	const chunk = String(data ?? "");

	if (maxLength <= 0)
		return {ok: false, text: ""};
	if (buffer.length >= maxLength)
		return {ok: false, text: buffer.slice(0, maxLength - 1)};

	const available = (maxLength - 1) - buffer.length;
	const appended = chunk.slice(0, available);
	return {
		ok: appended.length === chunk.length,
		text: buffer + appended,
	};
}

export class TextBuffer {
	constructor(maxLength, text = "") {
		this.maxLength = maxLength;
		this.text = String(text ?? "");
		if (this.text.length >= maxLength)
			this.text = this.text.slice(0, maxLength - 1);
	}

	append(data) {
		const result = textBufferAppend(this.text, data, this.maxLength);
		this.text = result.text;
		return result.ok;
	}

	get length() {
		return this.text.length;
	}

	toString() {
		return this.text;
	}
}
