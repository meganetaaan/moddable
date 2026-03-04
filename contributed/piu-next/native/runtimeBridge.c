#include "xsmc.h"
#include "mc.xs.h"

#include <stdint.h>
#include <string.h>

typedef struct {
	uint8_t disposed;
} PiuNextRuntimeBridgeSessionRecord;

typedef struct {
	uint8_t initialized;
	xsIdentifier id_application;
	xsIdentifier id_type;
	xsIdentifier id_props;
	xsIdentifier id_children;
	xsIdentifier id_kind;
	xsIdentifier id_value;
	xsIdentifier id_string;
	xsIdentifier id_text;
	xsIdentifier id_contents;
	xsIdentifier id_add;
	xsIdentifier id_insert;
	xsIdentifier id_remove;
	xsIdentifier id_content;
	xsIdentifier id_empty;
	xsIdentifier id_first;
	xsIdentifier id_next;
	xsIdentifier id_key;
	xsIdentifier id_container;
	xsIdentifier id_Object;
	xsIdentifier id_keys;
	xsIdentifier id_is;
	xsIdentifier id_length;
	xsIdentifier id_prevElements;
	xsIdentifier id_keyToContent;
	xsIdentifier id_keyToType;
	xsIdentifier id_Application;
	xsIdentifier id_Container;
	xsIdentifier id_Column;
	xsIdentifier id_Row;
	xsIdentifier id_Content;
	xsIdentifier id_Label;
} PiuNextRuntimeIDs;

static PiuNextRuntimeIDs gIDs;

static uint8_t piuNextIsStringSlot(xsMachine *the, xsSlot slot)
{
	xsType type = xsmcTypeOf(slot);
	return (type == xsStringType) || (type == xsStringXType);
}

static void piuNextEnsureIDs(xsMachine *the)
{
	if (gIDs.initialized)
		return;

	gIDs.id_application = xsID("_application");
	gIDs.id_type = xsID("type");
	gIDs.id_props = xsID("props");
	gIDs.id_children = xsID("children");
	gIDs.id_kind = xsID("kind");
	gIDs.id_value = xsID("value");
	gIDs.id_string = xsID("string");
	gIDs.id_text = xsID("text");
	gIDs.id_contents = xsID("contents");
	gIDs.id_add = xsID("add");
	gIDs.id_insert = xsID("insert");
	gIDs.id_remove = xsID("remove");
	gIDs.id_content = xsID("content");
	gIDs.id_empty = xsID("empty");
	gIDs.id_first = xsID("first");
	gIDs.id_next = xsID("next");
	gIDs.id_key = xsID("key");
	gIDs.id_container = xsID("container");
	gIDs.id_Object = xsID("Object");
	gIDs.id_keys = xsID("keys");
	gIDs.id_is = xsID("is");
	gIDs.id_length = xsID("length");
	gIDs.id_prevElements = xsID("_prevElements");
	gIDs.id_keyToContent = xsID("_keyToContent");
	gIDs.id_keyToType = xsID("_keyToType");
	gIDs.id_Application = xsID("Application");
	gIDs.id_Container = xsID("Container");
	gIDs.id_Column = xsID("Column");
	gIDs.id_Row = xsID("Row");
	gIDs.id_Content = xsID("Content");
	gIDs.id_Label = xsID("Label");

	gIDs.initialized = 1;
}

static uint8_t piuNextStringEquals(xsMachine *the, xsSlot slot, const char *value)
{
	if (!piuNextIsStringSlot(the, slot))
		return 0;
	return (0 == c_strcmp(xsmcToString(slot), value));
}

static uint8_t piuNextIsReservedKey(const char *key)
{
	return (0 == c_strcmp(key, "onTap"))
		|| (0 == c_strcmp(key, "onTouchBegan"))
		|| (0 == c_strcmp(key, "onTouchMoved"))
		|| (0 == c_strcmp(key, "onTouchEnded"))
		|| (0 == c_strcmp(key, "ref"))
		|| (0 == c_strcmp(key, "key"))
		|| (0 == c_strcmp(key, "text"));
}

static xsSlot piuNextObjectKeys(xsMachine *the, xsSlot object)
{
	xsSlot objectCtor;
	xsmcGet(objectCtor, xsGlobal, gIDs.id_Object);
	return xsCall1(objectCtor, gIDs.id_keys, object);
}

static xsIntegerValue piuNextArrayLength(xsMachine *the, xsSlot array)
{
	xsSlot length;
	xsmcGet(length, array, gIDs.id_length);
	return xsmcToInteger(length);
}

static uint8_t piuNextIsContainerType(xsMachine *the, xsSlot typeSlot)
{
	return piuNextStringEquals(the, typeSlot, "container")
		|| piuNextStringEquals(the, typeSlot, "column")
		|| piuNextStringEquals(the, typeSlot, "row");
}

static uint8_t piuNextIsNullish(xsMachine *the, xsSlot slot)
{
	xsType type = xsmcTypeOf(slot);
	return (type == xsUndefinedType) || (type == xsNullType);
}

static uint8_t piuNextSameValue(xsMachine *the, xsSlot left, xsSlot right)
{
	xsSlot objectCtor;
	xsSlot result;
	xsmcGet(objectCtor, xsGlobal, gIDs.id_Object);
	result = xsCall2(objectCtor, gIDs.id_is, left, right);
	return xsmcToBoolean(result);
}

static uint8_t piuNextStringSlotEquals(xsMachine *the, xsSlot left, xsSlot right)
{
	if (!piuNextIsStringSlot(the, left) || !piuNextIsStringSlot(the, right))
		return 0;
	return piuNextSameValue(the, left, right);
}

static xsIdentifier piuNextCtorIDForType(xsMachine *the, xsSlot node, xsSlot typeSlot)
{
	if (piuNextStringEquals(the, typeSlot, "container"))
		return gIDs.id_Container;
	if (piuNextStringEquals(the, typeSlot, "column"))
		return gIDs.id_Column;
	if (piuNextStringEquals(the, typeSlot, "row"))
		return gIDs.id_Row;
	if (piuNextStringEquals(the, typeSlot, "content"))
		return gIDs.id_Content;
	if (piuNextStringEquals(the, typeSlot, "label"))
		return gIDs.id_Label;
	if (piuNextStringEquals(the, typeSlot, ""))
		xsUnknownError("Unsupported node type: <empty>");
	if (piuNextStringEquals(the, typeSlot, "text"))
		xsUnknownError("Unsupported node type: text");
	if (piuNextStringEquals(the, typeSlot, "application"))
		xsUnknownError("Unsupported node type: application");
	if (xsmcHas(node, gIDs.id_kind)) {
		xsSlot kind;
		xsmcGet(kind, node, gIDs.id_kind);
		if (piuNextStringEquals(the, kind, "text"))
			xsUnknownError("Unsupported node type: from text node");
		if (piuNextStringEquals(the, kind, "element"))
			xsUnknownError("Unsupported node type: unknown element");
	}
	if ((xsmcTypeOf(typeSlot) == xsStringType) || (xsmcTypeOf(typeSlot) == xsStringXType))
		xsUnknownError("Unsupported node type: <string>");
	xsUnknownError("Unsupported node type: <non-string>");
	return gIDs.id_Content;
}

static xsSlot piuNextGetNodeProps(xsMachine *the, xsSlot node)
{
	xsSlot props;
	if (!xsmcHas(node, gIDs.id_props))
		return xsmcNewObject();
	xsmcGet(props, node, gIDs.id_props);
	if (xsmcTypeOf(props) != xsReferenceType)
		return xsmcNewObject();
	return props;
}

static uint8_t piuNextNodeHasKey(xsMachine *the, xsSlot node)
{
	xsSlot props = piuNextGetNodeProps(the, node);
	xsSlot key;
	xsType keyType;
	if (!xsmcHas(props, gIDs.id_key))
		return 0;
	xsmcGet(key, props, gIDs.id_key);
	keyType = xsmcTypeOf(key);
	return (keyType == xsStringType) || (keyType == xsStringXType) || (keyType == xsIntegerType) || (keyType == xsNumberType);
}

static xsSlot piuNextNodeKey(xsMachine *the, xsSlot node)
{
	xsSlot props = piuNextGetNodeProps(the, node);
	xsSlot key;
	if (!xsmcHas(props, gIDs.id_key))
		return xsUndefined;
	xsmcGet(key, props, gIDs.id_key);
	return key;
}

static xsSlot piuNextNodeKeyString(xsMachine *the, xsSlot node)
{
	xsSlot key = piuNextNodeKey(the, node);
	xsSlot keyString;
	const char *keyChars;
	if (xsmcTypeOf(key) == xsUndefinedType)
		return xsUndefined;
	keyChars = xsmcToString(key);
	xsmcSetString(keyString, keyChars);
	return keyString;
}

static xsSlot piuNextExtractElementChildren(xsMachine *the, xsSlot node)
{
	xsSlot result = xsmcNewArray(0);
	xsSlot children;
	xsSlot at;
	xsSlot child;
	xsSlot kind;
	xsIntegerValue i;
	xsIntegerValue length;
	xsIntegerValue out = 0;

	if (!xsmcHas(node, gIDs.id_children))
		return result;

	xsmcGet(children, node, gIDs.id_children);
	if (xsmcTypeOf(children) != xsReferenceType)
		return result;

	length = piuNextArrayLength(the, children);
	for (i = 0; i < length; i++) {
		xsmcSetInteger(at, i);
		xsmcGetAt(child, children, at);
		if (xsmcTypeOf(child) != xsReferenceType)
			continue;
		if (!xsmcHas(child, gIDs.id_kind))
			continue;
		xsmcGet(kind, child, gIDs.id_kind);
		if (!piuNextStringEquals(the, kind, "element"))
			continue;
		xsmcSetInteger(at, out);
		xsmcSetAt(result, at, child);
		out += 1;
	}

	return result;
}

static xsSlot piuNextBuildNodeProps(xsMachine *the, xsSlot node)
{
	xsSlot sourceProps = piuNextGetNodeProps(the, node);
	xsSlot keys = piuNextObjectKeys(the, sourceProps);
	xsSlot result = xsmcNewObject();
	xsSlot at;
	xsSlot key;
	xsSlot value;
	xsSlot typeSlot;
	xsIntegerValue i;
	xsIntegerValue length = piuNextArrayLength(the, keys);

	for (i = 0; i < length; i++) {
		const char *name;
		xsmcSetInteger(at, i);
		xsmcGetAt(key, keys, at);
		if (!piuNextIsStringSlot(the, key))
			continue;
		name = xsmcToString(key);
		if (piuNextIsReservedKey(name))
			continue;
		xsmcGetAt(value, sourceProps, key);
		xsmcSetAt(result, key, value);
	}

	if (!xsmcHas(node, gIDs.id_type))
		return result;
	xsmcGet(typeSlot, node, gIDs.id_type);
	if (!piuNextStringEquals(the, typeSlot, "label"))
		return result;

	if (xsmcHas(sourceProps, gIDs.id_string)) {
		xsmcGet(value, sourceProps, gIDs.id_string);
		if ((xsmcTypeOf(value) == xsStringType) || (xsmcTypeOf(value) == xsStringXType))
			xsmcSet(result, gIDs.id_string, value);
	}
	else if (xsmcHas(sourceProps, gIDs.id_text)) {
		xsmcGet(value, sourceProps, gIDs.id_text);
		if ((xsmcTypeOf(value) == xsStringType) || (xsmcTypeOf(value) == xsStringXType))
			xsmcSet(result, gIDs.id_string, value);
	}
	else if (xsmcHas(node, gIDs.id_children)) {
		xsSlot children;
		xsSlot child;
		xsSlot kind;
		xsSlot at;
		xsIntegerValue i;
		xsIntegerValue length;
		xsmcGet(children, node, gIDs.id_children);
		if (xsmcTypeOf(children) != xsReferenceType)
			return result;
		length = piuNextArrayLength(the, children);
		for (i = 0; i < length; i++) {
			xsmcSetInteger(at, i);
			xsmcGetAt(child, children, at);
			if (xsmcTypeOf(child) != xsReferenceType)
				continue;
			if (!xsmcHas(child, gIDs.id_kind))
				continue;
			xsmcGet(kind, child, gIDs.id_kind);
			if (!piuNextStringEquals(the, kind, "text"))
				continue;
			if (!xsmcHas(child, gIDs.id_value))
				continue;
			xsmcGet(value, child, gIDs.id_value);
			if (!piuNextIsStringSlot(the, value))
				continue;
			xsmcSet(result, gIDs.id_string, value);
			break;
		}
	}

	return result;
}

static uint8_t piuNextArrayHasSlot(xsMachine *the, xsSlot keys, xsSlot value)
{
	xsSlot at;
	xsSlot item;
	xsIntegerValue i;
	xsIntegerValue length = piuNextArrayLength(the, keys);
	for (i = 0; i < length; i++) {
		xsmcSetInteger(at, i);
		xsmcGetAt(item, keys, at);
		if (!piuNextSameValue(the, item, value))
			continue;
		return 1;
	}
	return 0;
}

static void piuNextOpSetProp(xsMachine *the, xsSlot target, xsSlot key, xsSlot value)
{
	xsmcSetAt(target, key, value);
}

static void piuNextOpClearProp(xsMachine *the, xsSlot target, xsSlot key)
{
	xsSlot empty;
	xsmcSetUndefined(empty);
	xsmcSetAt(target, key, empty);
}

static void piuNextPatchProps(xsMachine *the, xsSlot target, xsSlot previousProps, xsSlot nextProps)
{
	xsSlot previousKeys = piuNextObjectKeys(the, previousProps);
	xsSlot nextKeys = piuNextObjectKeys(the, nextProps);
	xsSlot at;
	xsSlot key;
	xsSlot previousValue;
	xsSlot nextValue;
	xsIntegerValue i;
	xsIntegerValue length;

	length = piuNextArrayLength(the, previousKeys);
	for (i = 0; i < length; i++) {
		xsmcSetInteger(at, i);
		xsmcGetAt(key, previousKeys, at);
		if (!piuNextIsStringSlot(the, key))
			continue;
		if (piuNextArrayHasSlot(the, nextKeys, key))
			continue;
		piuNextOpClearProp(the, target, key);
	}

	length = piuNextArrayLength(the, nextKeys);
	for (i = 0; i < length; i++) {
		uint8_t hadPrevious = 0;
		xsmcSetInteger(at, i);
		xsmcGetAt(key, nextKeys, at);
		if (!piuNextIsStringSlot(the, key))
			continue;
		if (piuNextArrayHasSlot(the, previousKeys, key)) {
			hadPrevious = 1;
			xsmcGetAt(previousValue, previousProps, key);
		}
		xsmcGetAt(nextValue, nextProps, key);
		if (hadPrevious && piuNextSameValue(the, previousValue, nextValue))
			continue;
		piuNextOpSetProp(the, target, key, nextValue);
	}
}

static uint8_t piuNextPatchNodeRecursive(xsMachine *the, xsSlot content, xsSlot previousElement, xsSlot nextElement)
{
	xsSlot previousType;
	xsSlot nextType;
	xsSlot previousProps;
	xsSlot nextProps;
	xsIntegerValue base = xsmcVars(4);

	xsVar(base) = previousElement;
	xsVar(base + 1) = nextElement;

	if (!xsmcHas(xsVar(base), gIDs.id_type) || !xsmcHas(xsVar(base + 1), gIDs.id_type)) {
		xsmcVars(-4);
		return 0;
	}
	xsmcGet(previousType, xsVar(base), gIDs.id_type);
	xsmcGet(nextType, xsVar(base + 1), gIDs.id_type);
	if (!piuNextStringSlotEquals(the, previousType, nextType)) {
		xsmcVars(-4);
		return 0;
	}

	previousProps = piuNextBuildNodeProps(the, xsVar(base));
	nextProps = piuNextBuildNodeProps(the, xsVar(base + 1));
	piuNextPatchProps(the, content, previousProps, nextProps);

	if (piuNextIsContainerType(the, nextType)) {
		xsSlot at;
		xsSlot previousChild;
		xsSlot nextChild;
		xsSlot childContent;
		xsIntegerValue i;
		xsIntegerValue length;

		xsVar(base + 2) = piuNextExtractElementChildren(the, xsVar(base));
		xsVar(base + 3) = piuNextExtractElementChildren(the, xsVar(base + 1));
		length = piuNextArrayLength(the, xsVar(base + 2));
		if (length != piuNextArrayLength(the, xsVar(base + 3))) {
			xsmcVars(-4);
			return 0;
		}
		if (!xsmcHas(content, gIDs.id_content)) {
			xsmcVars(-4);
			return 0;
		}
		for (i = 0; i < length; i++) {
			xsmcSetInteger(at, i);
			xsmcGetAt(previousChild, xsVar(base + 2), at);
			xsmcGetAt(nextChild, xsVar(base + 3), at);
			childContent = xsCall1(content, gIDs.id_content, xsInteger(i));
			if (piuNextIsNullish(the, childContent)) {
				xsmcVars(-4);
				return 0;
			}
			if (!piuNextPatchNodeRecursive(the, childContent, previousChild, nextChild)) {
				xsmcVars(-4);
				return 0;
			}
		}
	}

	xsmcVars(-4);
	return 1;
}

static xsSlot piuNextCreateContent(xsMachine *the, xsSlot node)
{
	xsSlot typeSlot;
	xsIdentifier ctorID;
	uint8_t isContainer;
	xsIntegerValue base = xsmcVars(4);
	const char *typeName;
	xsSlot result;

	xsVar(base) = node;
	if (!xsmcHas(xsVar(base), gIDs.id_type)) {
		xsmcVars(-4);
		return xsUndefined;
	}
	xsmcGet(typeSlot, xsVar(base), gIDs.id_type);
	if ((xsmcTypeOf(typeSlot) != xsStringType) && (xsmcTypeOf(typeSlot) != xsStringXType)) {
		xsmcVars(-4);
		return xsUndefined;
	}
	typeName = xsmcToString(typeSlot);
	if (!typeName || !typeName[0]) {
		xsSlot kind;
		if (xsmcHas(xsVar(base), gIDs.id_kind)) {
			xsmcGet(kind, xsVar(base), gIDs.id_kind);
			if ((xsmcTypeOf(kind) == xsStringType) || (xsmcTypeOf(kind) == xsStringXType))
				xsUnknownError("empty node type (kind=%s)", xsmcToString(kind));
		}
		xsUnknownError("empty node type");
	}

	ctorID = piuNextCtorIDForType(the, xsVar(base), typeSlot);
	isContainer = piuNextIsContainerType(the, typeSlot);
	xsVar(base + 1) = piuNextBuildNodeProps(the, xsVar(base));

	if (isContainer) {
		xsSlot children;
		xsSlot at;
		xsSlot childNode;
		xsSlot kind;
		xsSlot childContent;
		xsIntegerValue i;
		xsIntegerValue out = 0;
		xsIntegerValue length;

		xsVar(base + 3) = xsmcNewArray(0);
		if (!xsmcHas(xsVar(base), gIDs.id_children)) {
			xsmcSetUndefined(xsVar(base + 2));
			length = 0;
		}
		else {
			xsmcGet(children, xsVar(base), gIDs.id_children);
			if (xsmcTypeOf(children) != xsReferenceType) {
				xsmcSetUndefined(xsVar(base + 2));
				length = 0;
			}
			else {
				xsVar(base + 2) = children;
				length = piuNextArrayLength(the, xsVar(base + 2));
			}
		}

		for (i = 0; i < length; i++) {
			xsmcSetInteger(at, i);
			xsmcGetAt(childNode, xsVar(base + 2), at);
			if (xsmcTypeOf(childNode) != xsReferenceType)
				continue;
			if (!xsmcHas(childNode, gIDs.id_kind))
				continue;
			xsmcGet(kind, childNode, gIDs.id_kind);
			if (!piuNextStringEquals(the, kind, "element"))
				continue;
			childContent = piuNextCreateContent(the, childNode);
			if ((xsmcTypeOf(childContent) == xsUndefinedType) || (xsmcTypeOf(childContent) == xsNullType))
				continue;
			xsmcSetInteger(at, out);
			xsmcSetAt(xsVar(base + 3), at, childContent);
			out += 1;
		}

		xsmcSet(xsVar(base + 1), gIDs.id_contents, xsVar(base + 3));
	}

	result = xsNew2(xsGlobal, ctorID, xsNull, xsVar(base + 1));
	xsmcVars(-4);
	return result;
}

static xsSlot piuNextOpCreateNode(xsMachine *the, xsSlot node)
{
	return piuNextCreateContent(the, node);
}

static void piuNextOpInsertChild(xsMachine *the, xsSlot container, xsSlot child, xsSlot before)
{
	if (piuNextIsNullish(the, before))
		xsCall1(container, gIDs.id_add, child);
	else
		xsCall2(container, gIDs.id_insert, child, before);
}

static void piuNextOpRemoveNode(xsMachine *the, xsSlot container, xsSlot child)
{
	xsCall1(container, gIDs.id_remove, child);
}

static void piuNextApplyRootProps(xsMachine *the, xsSlot application, xsSlot rootProps)
{
	xsSlot keys = piuNextObjectKeys(the, rootProps);
	xsSlot at;
	xsSlot key;
	xsSlot value;
	xsIntegerValue i;
	xsIntegerValue length = piuNextArrayLength(the, keys);

	for (i = 0; i < length; i++) {
		xsmcSetInteger(at, i);
		xsmcGetAt(key, keys, at);
		xsmcGetAt(value, rootProps, key);
		xsmcSetAt(application, key, value);
	}
}

static uint8_t piuNextCanInPlaceUpdate(xsMachine *the, xsSlot previousElements, xsSlot nextElements)
{
	xsSlot at;
	xsSlot previousElement;
	xsSlot nextElement;
	xsSlot previousType;
	xsSlot nextType;
	xsIntegerValue i;
	xsIntegerValue previousLength = piuNextArrayLength(the, previousElements);
	xsIntegerValue nextLength = piuNextArrayLength(the, nextElements);

	if (previousLength != nextLength)
		return 0;

	for (i = 0; i < nextLength; i++) {
		xsmcSetInteger(at, i);
		xsmcGetAt(previousElement, previousElements, at);
		xsmcGetAt(nextElement, nextElements, at);

		if (piuNextNodeHasKey(the, previousElement) || piuNextNodeHasKey(the, nextElement))
			return 0;
		if (!xsmcHas(previousElement, gIDs.id_type) || !xsmcHas(nextElement, gIDs.id_type))
			return 0;

		xsmcGet(previousType, previousElement, gIDs.id_type);
		xsmcGet(nextType, nextElement, gIDs.id_type);
		if (!piuNextStringSlotEquals(the, previousType, nextType))
			return 0;
	}

	return 1;
}

static uint8_t piuNextTryInPlaceUpdate(xsMachine *the, xsSlot session, xsSlot application, xsSlot nextElements)
{
	xsIntegerValue base = xsmcVars(2);
	xsSlot at;
	xsSlot previousElement;
	xsSlot nextElement;
	xsIntegerValue i;
	xsIntegerValue length;

	if (!xsmcHas(session, gIDs.id_prevElements)) {
		xsmcVars(-2);
		return 0;
	}
	xsmcGet(xsVar(base), session, gIDs.id_prevElements);
	if (xsmcTypeOf(xsVar(base)) != xsReferenceType) {
		xsmcVars(-2);
		return 0;
	}
	if (!piuNextCanInPlaceUpdate(the, xsVar(base), nextElements)) {
		xsmcVars(-2);
		return 0;
	}

	xsmcGet(xsVar(base + 1), application, gIDs.id_first);
	length = piuNextArrayLength(the, nextElements);
	for (i = 0; i < length; i++) {
		if (piuNextIsNullish(the, xsVar(base + 1))) {
			xsmcVars(-2);
			return 0;
		}
		xsmcSetInteger(at, i);
		xsmcGetAt(previousElement, xsVar(base), at);
		xsmcGetAt(nextElement, nextElements, at);
		if (!piuNextPatchNodeRecursive(the, xsVar(base + 1), previousElement, nextElement)) {
			xsmcVars(-2);
			return 0;
		}
		xsmcGet(xsVar(base + 1), xsVar(base + 1), gIDs.id_next);
	}

	if (!piuNextIsNullish(the, xsVar(base + 1))) {
		xsmcVars(-2);
		return 0;
	}
	xsmcVars(-2);
	return 1;
}

static uint8_t piuNextTryKeyedReconcile(xsMachine *the, xsSlot session, xsSlot application, xsSlot nextElements)
{
	xsmcVars(2);
	xsSlot previousElements;
	xsSlot at;
	xsSlot previousElement;
	xsSlot nextElement;
	xsSlot previousType;
	xsSlot nextType;
	xsSlot desired;
	xsSlot current;
	xsSlot keyToContent;
	xsSlot keyToType;
	xsIntegerValue i;
	xsIntegerValue j;
	xsIntegerValue previousLength;
	xsIntegerValue nextLength;
	xsIntegerValue desiredCount = 0;
	xsIntegerValue removeCount = 0;
	uint8_t *used;
	uint8_t *desiredReused;

	if (!xsmcHas(session, gIDs.id_prevElements))
	{
		xsmcVars(-2);
		return 0;
	}
	if (!xsmcHas(application, gIDs.id_content) || !xsmcHas(application, gIDs.id_insert) || !xsmcHas(application, gIDs.id_remove))
	{
		xsmcVars(-2);
		return 0;
	}
	if (!xsmcHas(session, gIDs.id_keyToContent) || !xsmcHas(session, gIDs.id_keyToType))
	{
		xsmcVars(-2);
		return 0;
	}

	xsmcGet(previousElements, session, gIDs.id_prevElements);
	xsmcGet(keyToContent, session, gIDs.id_keyToContent);
	xsmcGet(keyToType, session, gIDs.id_keyToType);
	if (xsmcTypeOf(previousElements) != xsReferenceType)
	{
		xsmcVars(-2);
		return 0;
	}
	if (xsmcTypeOf(keyToContent) != xsReferenceType)
	{
		xsmcVars(-2);
		return 0;
	}
	if (xsmcTypeOf(keyToType) != xsReferenceType)
	{
		xsmcVars(-2);
		return 0;
	}

	previousLength = piuNextArrayLength(the, previousElements);
	nextLength = piuNextArrayLength(the, nextElements);
	for (i = 0; i < previousLength; i++) {
		xsmcSetInteger(at, i);
		xsmcGetAt(previousElement, previousElements, at);
		if (!piuNextNodeHasKey(the, previousElement))
		{
			xsmcVars(-2);
			return 0;
		}
		if (!xsmcHas(previousElement, gIDs.id_type))
		{
			xsmcVars(-2);
			return 0;
		}
		xsmcGet(previousType, previousElement, gIDs.id_type);
		if (piuNextIsContainerType(the, previousType))
		{
			xsmcVars(-2);
			return 0;
		}
	}
	for (i = 0; i < nextLength; i++) {
		xsmcSetInteger(at, i);
		xsmcGetAt(nextElement, nextElements, at);
		if (!piuNextNodeHasKey(the, nextElement))
		{
			xsmcVars(-2);
			return 0;
		}
		if (!xsmcHas(nextElement, gIDs.id_type))
		{
			xsmcVars(-2);
			return 0;
		}
		xsmcGet(nextType, nextElement, gIDs.id_type);
		if (piuNextIsContainerType(the, nextType))
		{
			xsmcVars(-2);
			return 0;
		}
	}

	used = c_calloc((size_t)previousLength, sizeof(uint8_t));
	if ((previousLength > 0) && !used)
		xsUnknownError("no memory");
	desiredReused = c_calloc((size_t)nextLength, sizeof(uint8_t));
	if ((nextLength > 0) && !desiredReused) {
		c_free(used);
		xsUnknownError("no memory");
	}

	xsVar(0) = xsmcNewArray(0);
	xsVar(1) = xsmcNewArray(0);

	for (i = 0; i < nextLength; i++) {
		int32_t reusableIndex = -1;
		uint8_t canReuse = 0;
		xsSlot nextKey;
		xsSlot nextKeyString;
		xsSlot reusableChild;
		xsSlot keyedIndex;
		xsSlot previousProps;
		xsSlot nextProps;
		xsSlot previousKeyType;

		xsmcSetInteger(at, i);
		xsmcGetAt(nextElement, nextElements, at);
		nextKey = piuNextNodeKey(the, nextElement);
		nextKeyString = piuNextNodeKeyString(the, nextElement);
		xsmcGet(nextType, nextElement, gIDs.id_type);

		xsmcGetAt(keyedIndex, keyToContent, nextKeyString);
		xsmcGetAt(previousKeyType, keyToType, nextKeyString);
		if ((xsmcTypeOf(keyedIndex) == xsIntegerType)
			&& ((xsmcTypeOf(previousKeyType) == xsStringType) || (xsmcTypeOf(previousKeyType) == xsStringXType))
			&& piuNextStringSlotEquals(the, previousKeyType, nextType)) {
			int32_t keyed = (int32_t)xsmcToInteger(keyedIndex);
			if ((keyed >= 0) && (keyed < previousLength) && !used[keyed]) {
				xsSlot previousKey;
				xsmcSetInteger(at, keyed);
				xsmcGetAt(previousElement, previousElements, at);
				previousKey = piuNextNodeKey(the, previousElement);
				if (piuNextSameValue(the, previousKey, nextKey)) {
					reusableIndex = keyed;
					used[reusableIndex] = 1;
					reusableChild = xsCall1(application, gIDs.id_content, xsInteger(reusableIndex));
					if (!piuNextIsNullish(the, reusableChild))
						canReuse = 1;
					else
						used[reusableIndex] = 0;
				}
			}
		}

		if (!canReuse) {
			for (j = 0; j < previousLength; j++) {
				xsSlot previousKey;
				if (used[j])
					continue;
				xsmcSetInteger(at, j);
				xsmcGetAt(previousElement, previousElements, at);
				xsmcGet(previousType, previousElement, gIDs.id_type);
				if (!piuNextStringSlotEquals(the, previousType, nextType))
					continue;
				previousKey = piuNextNodeKey(the, previousElement);
				if (!piuNextSameValue(the, previousKey, nextKey))
					continue;
				reusableChild = xsCall1(application, gIDs.id_content, xsInteger(j));
				if (piuNextIsNullish(the, reusableChild))
					continue;
				reusableIndex = (int32_t)j;
				used[reusableIndex] = 1;
				canReuse = 1;
				break;
			}
		}

		if (canReuse) {
			xsmcSetInteger(at, reusableIndex);
			xsmcGetAt(previousElement, previousElements, at);
			previousProps = piuNextBuildNodeProps(the, previousElement);
			nextProps = piuNextBuildNodeProps(the, nextElement);
			piuNextPatchProps(the, reusableChild, previousProps, nextProps);
			xsmcSetInteger(at, desiredCount);
			xsmcSetAt(xsVar(0), at, reusableChild);
			desiredReused[desiredCount] = 1;
			desiredCount += 1;
			continue;
		}

		reusableChild = piuNextOpCreateNode(the, nextElement);
		if (piuNextIsNullish(the, reusableChild))
			continue;
		xsmcSetInteger(at, desiredCount);
		xsmcSetAt(xsVar(0), at, reusableChild);
		desiredCount += 1;
	}

	for (i = 0; i < previousLength; i++) {
		xsSlot reusableChild;
		if (used[i])
			continue;
		reusableChild = xsCall1(application, gIDs.id_content, xsInteger(i));
		if (piuNextIsNullish(the, reusableChild))
			continue;
		xsmcSetInteger(at, removeCount);
		xsmcSetAt(xsVar(1), at, reusableChild);
		removeCount += 1;
	}

	for (i = 0; i < removeCount; i++) {
		xsmcSetInteger(at, i);
		xsmcGetAt(desired, xsVar(1), at);
		piuNextOpRemoveNode(the, application, desired);
	}

	for (i = 0; i < desiredCount; i++) {
		xsmcSetInteger(at, i);
		xsmcGetAt(desired, xsVar(0), at);
		current = xsCall1(application, gIDs.id_content, xsInteger(i));
		if (piuNextSameValue(the, current, desired))
			continue;
		if (desiredReused[i])
			piuNextOpRemoveNode(the, application, desired);
		piuNextOpInsertChild(the, application, desired, current);
	}

	c_free(used);
	c_free(desiredReused);
	xsmcVars(-2);
	return 1;
}

static uint8_t piuNextTryIndexReconcile(xsMachine *the, xsSlot session, xsSlot application, xsSlot nextElements)
{
	xsSlot previousElements;
	xsSlot at;
	xsSlot previousElement;
	xsSlot nextElement;
	xsSlot previousType;
	xsSlot nextType;
	xsSlot child;
	xsSlot previousProps;
	xsSlot nextProps;
	xsSlot none;
	xsIntegerValue i;
	xsIntegerValue minLength;
	xsIntegerValue previousLength;
	xsIntegerValue nextLength;

	if (!xsmcHas(session, gIDs.id_prevElements))
		return 0;
	if (!xsmcHas(application, gIDs.id_content) || !xsmcHas(application, gIDs.id_add) || !xsmcHas(application, gIDs.id_remove))
		return 0;

	xsmcGet(previousElements, session, gIDs.id_prevElements);
	if (xsmcTypeOf(previousElements) != xsReferenceType)
		return 0;

	previousLength = piuNextArrayLength(the, previousElements);
	nextLength = piuNextArrayLength(the, nextElements);
	for (i = 0; i < previousLength; i++) {
		xsmcSetInteger(at, i);
		xsmcGetAt(previousElement, previousElements, at);
		if (piuNextNodeHasKey(the, previousElement))
			return 0;
		if (!xsmcHas(previousElement, gIDs.id_type))
			return 0;
		xsmcGet(previousType, previousElement, gIDs.id_type);
		if (piuNextIsContainerType(the, previousType))
			return 0;
	}
	for (i = 0; i < nextLength; i++) {
		xsmcSetInteger(at, i);
		xsmcGetAt(nextElement, nextElements, at);
		if (piuNextNodeHasKey(the, nextElement))
			return 0;
		if (!xsmcHas(nextElement, gIDs.id_type))
			return 0;
		xsmcGet(nextType, nextElement, gIDs.id_type);
		if (piuNextIsContainerType(the, nextType))
			return 0;
	}

	minLength = (previousLength < nextLength) ? previousLength : nextLength;
	for (i = 0; i < minLength; i++) {
		xsmcSetInteger(at, i);
		xsmcGetAt(previousElement, previousElements, at);
		xsmcGetAt(nextElement, nextElements, at);
		xsmcGet(previousType, previousElement, gIDs.id_type);
		xsmcGet(nextType, nextElement, gIDs.id_type);
		if (!piuNextStringSlotEquals(the, previousType, nextType))
			return 0;

		child = xsCall1(application, gIDs.id_content, xsInteger(i));
		if (piuNextIsNullish(the, child))
			return 0;
		previousProps = piuNextBuildNodeProps(the, previousElement);
		nextProps = piuNextBuildNodeProps(the, nextElement);
		piuNextPatchProps(the, child, previousProps, nextProps);
	}

	for (i = previousLength; i > nextLength; i--) {
		xsIntegerValue removeIndex = i - 1;
		child = xsCall1(application, gIDs.id_content, xsInteger(removeIndex));
		if (piuNextIsNullish(the, child))
			continue;
		piuNextOpRemoveNode(the, application, child);
	}

	xsmcSetUndefined(none);
	for (i = minLength; i < nextLength; i++) {
		xsmcSetInteger(at, i);
		xsmcGetAt(nextElement, nextElements, at);
		child = piuNextOpCreateNode(the, nextElement);
		if (piuNextIsNullish(the, child))
			continue;
		piuNextOpInsertChild(the, application, child, none);
	}

	return 1;
}

static void piuNextRefreshKeyTables(xsMachine *the, xsSlot session, xsSlot application, xsSlot elements)
{
	xsmcVars(2);
	xsSlot at;
	xsSlot element;
	xsSlot keyString;
	xsSlot typeSlot;
	xsIntegerValue i;
	xsIntegerValue length = piuNextArrayLength(the, elements);

	xsVar(0) = xsmcNewObject();
	xsVar(1) = xsmcNewObject();

	for (i = 0; i < length; i++) {
		xsmcSetInteger(at, i);
		xsmcGetAt(element, elements, at);
		if (!piuNextNodeHasKey(the, element))
			continue;
		if (!xsmcHas(element, gIDs.id_type))
			continue;
		keyString = piuNextNodeKeyString(the, element);
		if ((xsmcTypeOf(keyString) != xsStringType) && (xsmcTypeOf(keyString) != xsStringXType))
			continue;
		xsmcGet(typeSlot, element, gIDs.id_type);
		xsmcSetInteger(at, i);
		xsmcSetAt(xsVar(0), keyString, at);
		xsmcSetAt(xsVar(1), keyString, typeSlot);
	}

	xsmcSet(session, gIDs.id_keyToContent, xsVar(0));
	xsmcSet(session, gIDs.id_keyToType, xsVar(1));
	xsmcVars(-2);
}

static void piuNextRender(xsMachine *the, xsSlot session, xsSlot application, xsSlot root)
{
	xsSlot rootType;
	xsSlot at;
	xsSlot childNode;
	xsSlot childContent;
	xsSlot previousElements;
	xsIntegerValue i;
	xsIntegerValue length;
	xsIntegerValue base = xsmcVars(5);

	xsVar(base) = session;
	xsVar(base + 1) = application;
	xsVar(base + 2) = root;

	if (!xsmcHas(xsVar(base + 2), gIDs.id_type))
		xsUnknownError("Root node must be <application>.");
	xsmcGet(rootType, xsVar(base + 2), gIDs.id_type);
	if (!piuNextStringEquals(the, rootType, "application"))
		xsUnknownError("Root node must be <application>.");

	xsVar(base + 3) = piuNextBuildNodeProps(the, xsVar(base + 2));
	piuNextApplyRootProps(the, xsVar(base + 1), xsVar(base + 3));

	xsVar(base + 4) = piuNextExtractElementChildren(the, xsVar(base + 2));
	if (xsmcHas(xsVar(base), gIDs.id_prevElements)) {
		xsmcGet(previousElements, xsVar(base), gIDs.id_prevElements);
		if ((xsmcTypeOf(previousElements) == xsReferenceType) && (piuNextArrayLength(the, previousElements) > 0)) {
			if (piuNextTryInPlaceUpdate(the, xsVar(base), xsVar(base + 1), xsVar(base + 4))) {
				xsmcSet(xsVar(base), gIDs.id_prevElements, xsVar(base + 4));
				piuNextRefreshKeyTables(the, xsVar(base), xsVar(base + 1), xsVar(base + 4));
				xsmcVars(-5);
				return;
			}
			if (piuNextTryKeyedReconcile(the, xsVar(base), xsVar(base + 1), xsVar(base + 4))) {
				xsmcSet(xsVar(base), gIDs.id_prevElements, xsVar(base + 4));
				piuNextRefreshKeyTables(the, xsVar(base), xsVar(base + 1), xsVar(base + 4));
				xsmcVars(-5);
				return;
			}
			if (piuNextTryIndexReconcile(the, xsVar(base), xsVar(base + 1), xsVar(base + 4))) {
				xsmcSet(xsVar(base), gIDs.id_prevElements, xsVar(base + 4));
				piuNextRefreshKeyTables(the, xsVar(base), xsVar(base + 1), xsVar(base + 4));
				xsmcVars(-5);
				return;
			}
		}
	}

	xsCall0(xsVar(base + 1), gIDs.id_empty);
	length = piuNextArrayLength(the, xsVar(base + 4));
	for (i = 0; i < length; i++) {
		xsmcSetInteger(at, i);
		xsmcGetAt(childNode, xsVar(base + 4), at);
		childContent = piuNextOpCreateNode(the, childNode);
		if ((xsmcTypeOf(childContent) == xsUndefinedType) || (xsmcTypeOf(childContent) == xsNullType))
			continue;
		xsCall1(xsVar(base + 1), gIDs.id_add, childContent);
	}

	xsmcSet(xsVar(base), gIDs.id_prevElements, xsVar(base + 4));
	piuNextRefreshKeyTables(the, xsVar(base), xsVar(base + 1), xsVar(base + 4));
	xsmcVars(-5);
}

void xs_piu_next_runtime_bridge(xsMachine *the)
{
	piuNextEnsureIDs(the);
}

void xs_piu_next_runtime_bridge_destructor(void *data)
{
}

void xs_piu_next_runtime_bridge_session(xsMachine *the)
{
	PiuNextRuntimeBridgeSessionRecord session;
	xsmcVars(2);
	xsSlot previousElements;
	xsSlot keyToContent;
	xsSlot keyToType;

	piuNextEnsureIDs(the);
	if (xsmcArgc < 2)
		xsUnknownError("runtime bridge session requires application and root");

	xsVar(0) = xsArg(0);
	xsVar(1) = xsArg(1);
	session.disposed = 0;
	xsmcSetHostChunk(xsThis, &session, sizeof(session));
	previousElements = xsmcNewArray(0);
	keyToContent = xsmcNewObject();
	keyToType = xsmcNewObject();
	xsmcSet(xsThis, gIDs.id_prevElements, previousElements);
	xsmcSet(xsThis, gIDs.id_keyToContent, keyToContent);
	xsmcSet(xsThis, gIDs.id_keyToType, keyToType);
	piuNextRender(the, xsThis, xsVar(0), xsVar(1));
	xsmcVars(-2);
}

void xs_piu_next_runtime_bridge_session_destructor(void *data)
{
}

void xs_piu_next_runtime_bridge_session_update(xsMachine *the)
{
	PiuNextRuntimeBridgeSessionRecord *session = xsmcGetHostChunk(xsThis);
	xsmcVars(2);

	if (!session || session->disposed) {
		xsmcVars(-2);
		return;
	}
	if (xsmcArgc < 1) {
		xsmcVars(-2);
		return;
	}

	piuNextEnsureIDs(the);
	xsmcGet(xsVar(0), xsThis, gIDs.id_application);
	xsVar(1) = xsArg(0);
	piuNextRender(the, xsThis, xsVar(0), xsVar(1));
	xsmcVars(-2);
}

void xs_piu_next_runtime_bridge_session_dispose(xsMachine *the)
{
	PiuNextRuntimeBridgeSessionRecord *session = xsmcGetHostChunk(xsThis);
	xsmcVars(1);
	xsSlot previousElements;
	xsSlot keyToContent;
	xsSlot keyToType;

	if (!session || session->disposed) {
		xsmcVars(-1);
		return;
	}

	piuNextEnsureIDs(the);
	xsmcGet(xsVar(0), xsThis, gIDs.id_application);
	xsCall0(xsVar(0), gIDs.id_empty);
	previousElements = xsmcNewArray(0);
	keyToContent = xsmcNewObject();
	keyToType = xsmcNewObject();
	xsmcSet(xsThis, gIDs.id_prevElements, previousElements);
	xsmcSet(xsThis, gIDs.id_keyToContent, keyToContent);
	xsmcSet(xsThis, gIDs.id_keyToType, keyToType);
	session->disposed = 1;
	xsmcVars(-1);
}
