export function startHelpText() {
	return (
		"zclaw online.\n\n" +
		"Talk to me in normal language. You do not need command syntax.\n\n" +
		"Examples:\n" +
		"- what are all GPIO states\n" +
		"- turn GPIO 5 on\n" +
		"- remind me daily at 8:15 to water plants\n" +
		"- remember that GPIO 4 controls the arcade machine\n" +
		"- create a tool called arcade_on that turns GPIO 4 on\n" +
		"- turn the arcade on in 10 minutes\n" +
		"- switch to witty persona\n" +
		"\n" +
		"Chat commands:\n" +
		"- /help (show this message)\n" +
		"- /settings (show status)\n" +
		"- /stop (pause intake)\n" +
		"- /resume (resume)\n" +
		"\n" +
		"USB local admin commands:\n" +
		"- /gpio [all|pin|pin high|pin low]\n" +
		"- /diag [scope] [verbose]\n" +
		"- /reboot\n" +
		"- /wifi [status|scan]\n" +
		"- /bootcount\n" +
		"- /factory-reset confirm"
	);
}

export function settingsText({paused = false, persona = "neutral"} = {}) {
	return (
		"zclaw settings:\n" +
		`- Message intake: ${paused ? "paused" : "active"}\n` +
		`- Persona: ${persona}\n` +
		"- Chat commands: /start, /help, /settings, /stop, /resume\n" +
		"- USB local admin: /gpio, /diag, /reboot, /wifi, /bootcount, /factory-reset\n" +
		"- /gpio supports reads and writes (e.g. /gpio 9 low)\n" +
		"- Persona changes: ask in normal chat (handled via tool calls)\n" +
		"- Device settings are global (e.g., timezone <name>)"
	);
}
