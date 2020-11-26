export class TTS @ "xs_tts_destructor" {
	constructor(dictionary) @ "xs_tts";
  setSpeech(speech) @ "xs_tts_set_speech";
  syntheFrame() @"xs_tts_synthe_frame";
  static FRAME_LENGTH = 320 * 2;
}
Object.freeze(TTS.prototype);

export default TTS;
