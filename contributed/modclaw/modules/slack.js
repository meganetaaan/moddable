import {
	parseSlackUserIds,
	slackUserIdsContain,
} from "../core/slack/userIds.js";

export function parseUserIds(input, maxIds) {
	return parseSlackUserIds(input, maxIds);
}

export function containsUserId(ids, userId) {
	return slackUserIdsContain(ids, userId);
}
