#include "xsmc.h"
#include "xsHost.h"
#include "mc.xs.h"			// for xsID_ values
#include "aquestalk.h"

#define LEN_FRAME 256
uint32_t *workbuf = 0;

typedef struct {
	uint32_t *workbuf;
} TtsRecord, *TTS;

void xs_tts(xsMachine *the)
{
	TTS tts;
	workbuf = (uint32_t *)malloc(AQ_SIZE_WORKBUF * sizeof(uint32_t));
	if (workbuf == 0) {
		xsUnknownError("No heap memory");
	}
	tts->workbuf = workbuf;
	int iret = CAqTkPicoF_Init(tts->workbuf, LEN_FRAME, "XXX-XXX-XXX");
	if(iret){
		xsUnknownError("AquesTalk init error");
	}
  return;
}

void xs_tts_destructor(void *data)
{
	if (data){
		TTS tts = (TTS) data;
		free(tts->workbuf);
	}
}

void xs_tts_set_speech(xsMachine *the)
{
	uint8_t *str = (xsmcArgc > 0 && xsmcTest(xsArg(0))) ? (uint8_t *)xsmcToString(xsArg(0)) : (uint8_t *)"hoge";
	int speed = (xsmcArgc > 1 && xsmcTest(xsArg(1))) ? xsmcToInteger(xsArg(1)) : 80;
	int iret = CAqTkPicoF_SetKoe(str, speed, 128);
	if (iret) {
		xsUnknownError("fail to set speech");
	}
  return;
}

void xs_tts_synthe_frame(xsMachine *the) 
{
	uint16_t *data = (uint16_t *)xsmcGetHostData(xsArg(0));
	uint16_t offset = xsmcArgc > 1 ? xsmcToInteger(xsArg(1)) : 0;
	data += offset;

	int16_t len;
	// for(;;) {
	int iret;
	iret = CAqTkPicoF_SyntheFrame(data, &len);
	if (iret) {
		xsmcSetInteger(xsResult, -1);
	} else {
		xsmcSetInteger(xsResult, len);
	}
}
