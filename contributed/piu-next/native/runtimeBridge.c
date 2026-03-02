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

static void piuNextEnsureIDs(xsMachine *the)
{
	if (gIDs.initialized)
		return;

	gIDs.id_application = xsID("_application");
	gIDs.id_type = xsID("type");
	gIDs.id_props = xsID("props");
	gIDs.id_children = xsID("children");
	gIDs.id_kind = xsID("kind");
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
	if (xsmcTypeOf(slot) != xsStringType)
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

static xsIdentifier piuNextCtorIDForType(xsMachine *the, xsSlot typeSlot)
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
	xsUnknownError("Unsupported node type");
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
	return (keyType == xsStringType) || (keyType == xsIntegerType) || (keyType == xsNumberType);
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
	if (xsmcTypeOf(key) == xsUndefinedType)
		return xsUndefined;
	xsmcSetString(keyString, xsmcToString(key));
	return keyString;
}

static xsSlot piuNextExtractElementChildren(xsMachine *the, xsSlot node)
{
	xsIntegerValue base = xsmcVars(1);
	xsSlot children;
	xsSlot at;
	xsSlot child;
	xsSlot kind;
	xsIntegerValue i;
	xsIntegerValue length;
	xsIntegerValue out = 0;

	xsVar(base) = xsmcNewArray(0);
	if (!xsmcHas(node, gIDs.id_children))
		return xsVar(base);

	xsmcGet(children, node, gIDs.id_children);
	if (xsmcTypeOf(children) != xsReferenceType)
		return xsVar(base);

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
		xsmcSetAt(xsVar(base), at, child);
		out += 1;
	}

	return xsVar(base);
}

static xsSlot piuNextBuildNodeProps(xsMachine *the, xsSlot node)
{
	xsSlot sourceProps = piuNextGetNodeProps(the, node);
	xsSlot keys = piuNextObjectKeys(the, sourceProps);
	xsSlot at;
	xsSlot key;
	xsSlot value;
	xsSlot typeSlot;
	xsIntegerValue i;
	xsIntegerValue length = piuNextArrayLength(the, keys);
	xsIntegerValue base = xsmcVars(1);

	xsVar(base) = xsmcNewObject();
	for (i = 0; i < length; i++) {
		const char *name;
		xsmcSetInteger(at, i);
		xsmcGetAt(key, keys, at);
		if (xsmcTypeOf(key) != xsStringType)
			continue;
		name = xsmcToString(key);
		if (piuNextIsReservedKey(name))
			continue;
		xsmcGetAt(value, sourceProps, key);
		xsmcSetAt(xsVar(base), key, value);
	}

	if (!xsmcHas(node, gIDs.id_type))
		return xsVar(base);
	xsmcGet(typeSlot, node, gIDs.id_type);
	if (!piuNextStringEquals(the, typeSlot, "label"))
		return xsVar(base);

	if (xsmcHas(sourceProps, gIDs.id_string)) {
		xsmcGet(value, sourceProps, gIDs.id_string);
		if (xsmcTypeOf(value) == xsStringType)
			xsmcSet(xsVar(base), gIDs.id_string, value);
	}
	else if (xsmcHas(sourceProps, gIDs.id_text)) {
		xsmcGet(value, sourceProps, gIDs.id_text);
		if (xsmcTypeOf(value) == xsStringType)
			xsmcSet(xsVar(base), gIDs.id_string, value);
	}

	return xsVar(base);
}

static xsSlot piuNextCreateContent(xsMachine *the, xsSlot node)
{
	xsSlot typeSlot;
	xsSlot props;
	xsIdentifier ctorID;
	xsIntegerValue base = xsmcVars(1);

	xsVar(base) = node;
	if (!xsmcHas(xsVar(base), gIDs.id_type))
		return xsUndefined;
	xsmcGet(typeSlot, xsVar(base), gIDs.id_type);
	if (xsmcTypeOf(typeSlot) != xsStringType)
		return xsUndefined;

	props = piuNextBuildNodeProps(the, xsVar(base));
	ctorID = piuNextCtorIDForType(the, typeSlot);

	if (piuNextIsContainerType(the, typeSlot)) {
		xsSlot elementChildren = piuNextExtractElementChildren(the, xsVar(base));
		xsSlot contents = xsmcNewArray(0);
		xsSlot at;
		xsSlot childNode;
		xsSlot childContent;
		xsIntegerValue i;
		xsIntegerValue out = 0;
		xsIntegerValue length = piuNextArrayLength(the, elementChildren);

		for (i = 0; i < length; i++) {
			xsmcSetInteger(at, i);
			xsmcGetAt(childNode, elementChildren, at);
			childContent = piuNextCreateContent(the, childNode);
			if ((xsmcTypeOf(childContent) == xsUndefinedType) || (xsmcTypeOf(childContent) == xsNullType))
				continue;
			xsmcSetInteger(at, out);
			xsmcSetAt(contents, at, childContent);
			out += 1;
		}

		xsmcSet(props, gIDs.id_contents, contents);
	}

	return xsNew2(xsGlobal, ctorID, xsNull, props);
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
		if (!piuNextStringEquals(the, previousType, xsmcToString(nextType)))
			return 0;
		if (piuNextIsContainerType(the, nextType))
			return 0;
	}

	return 1;
}

static uint8_t piuNextTryInPlaceUpdate(xsMachine *the, xsSlot session, xsSlot application, xsSlot nextElements)
{
	xsSlot previousElements;
	xsSlot child;
	xsSlot at;
	xsSlot nextElement;
	xsSlot props;
	xsIntegerValue i;
	xsIntegerValue length;

	if (!xsmcHas(session, gIDs.id_prevElements))
		return 0;
	xsmcGet(previousElements, session, gIDs.id_prevElements);
	if (xsmcTypeOf(previousElements) != xsReferenceType)
		return 0;
	if (!piuNextCanInPlaceUpdate(the, previousElements, nextElements))
		return 0;

	xsmcGet(child, application, gIDs.id_first);
	length = piuNextArrayLength(the, nextElements);
	for (i = 0; i < length; i++) {
		if (piuNextIsNullish(the, child))
			return 0;
		xsmcSetInteger(at, i);
		xsmcGetAt(nextElement, nextElements, at);
		props = piuNextBuildNodeProps(the, nextElement);
		piuNextApplyRootProps(the, child, props);
		xsmcGet(child, child, gIDs.id_next);
	}

	if (!piuNextIsNullish(the, child))
		return 0;
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
		return 0;
	if (!xsmcHas(application, gIDs.id_content) || !xsmcHas(application, gIDs.id_insert) || !xsmcHas(application, gIDs.id_remove))
		return 0;
	if (!xsmcHas(session, gIDs.id_keyToContent) || !xsmcHas(session, gIDs.id_keyToType))
		return 0;

	xsmcGet(previousElements, session, gIDs.id_prevElements);
	xsmcGet(keyToContent, session, gIDs.id_keyToContent);
	xsmcGet(keyToType, session, gIDs.id_keyToType);
	if (xsmcTypeOf(previousElements) != xsReferenceType)
		return 0;
	if (xsmcTypeOf(keyToContent) != xsReferenceType)
		return 0;
	if (xsmcTypeOf(keyToType) != xsReferenceType)
		return 0;

	previousLength = piuNextArrayLength(the, previousElements);
	nextLength = piuNextArrayLength(the, nextElements);
	for (i = 0; i < previousLength; i++) {
		xsmcSetInteger(at, i);
		xsmcGetAt(previousElement, previousElements, at);
		if (!piuNextNodeHasKey(the, previousElement))
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
		if (!piuNextNodeHasKey(the, nextElement))
			return 0;
		if (!xsmcHas(nextElement, gIDs.id_type))
			return 0;
		xsmcGet(nextType, nextElement, gIDs.id_type);
		if (piuNextIsContainerType(the, nextType))
			return 0;
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
		xsSlot props;
		xsSlot previousKeyType;

		xsmcSetInteger(at, i);
		xsmcGetAt(nextElement, nextElements, at);
		nextKey = piuNextNodeKey(the, nextElement);
		nextKeyString = piuNextNodeKeyString(the, nextElement);
		xsmcGet(nextType, nextElement, gIDs.id_type);

		xsmcGetAt(keyedIndex, keyToContent, nextKeyString);
		xsmcGetAt(previousKeyType, keyToType, nextKeyString);
		if ((xsmcTypeOf(keyedIndex) == xsIntegerType)
			&& (xsmcTypeOf(previousKeyType) == xsStringType)
			&& piuNextStringEquals(the, previousKeyType, xsmcToString(nextType))) {
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
				if (!piuNextStringEquals(the, previousType, xsmcToString(nextType)))
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
			props = piuNextBuildNodeProps(the, nextElement);
			piuNextApplyRootProps(the, reusableChild, props);
			xsmcSetInteger(at, desiredCount);
			xsmcSetAt(xsVar(0), at, reusableChild);
			desiredReused[desiredCount] = 1;
			desiredCount += 1;
			continue;
		}

		reusableChild = piuNextCreateContent(the, nextElement);
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
		xsCall1(application, gIDs.id_remove, desired);
	}

	for (i = 0; i < desiredCount; i++) {
		xsmcSetInteger(at, i);
		xsmcGetAt(desired, xsVar(0), at);
		current = xsCall1(application, gIDs.id_content, xsInteger(i));
		if (piuNextSameValue(the, current, desired))
			continue;
		if (desiredReused[i])
			xsCall1(application, gIDs.id_remove, desired);
		if (piuNextIsNullish(the, current))
			xsCall1(application, gIDs.id_add, desired);
		else
			xsCall2(application, gIDs.id_insert, desired, current);
	}

	c_free(used);
	c_free(desiredReused);
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
		if (xsmcTypeOf(keyString) != xsStringType)
			continue;
		xsmcGet(typeSlot, element, gIDs.id_type);
		xsmcSetInteger(at, i);
		xsmcSetAt(xsVar(0), keyString, at);
		xsmcSetAt(xsVar(1), keyString, typeSlot);
	}

	xsmcSet(session, gIDs.id_keyToContent, xsVar(0));
	xsmcSet(session, gIDs.id_keyToType, xsVar(1));
}

static void piuNextRender(xsMachine *the, xsSlot session, xsSlot application, xsSlot root)
{
	xsSlot rootType;
	xsSlot rootProps;
	xsSlot elementChildren;
	xsSlot at;
	xsSlot childNode;
	xsSlot childContent;
	xsIntegerValue i;
	xsIntegerValue length;

	if (!xsmcHas(root, gIDs.id_type))
		xsUnknownError("Root node must be <application>.");
	xsmcGet(rootType, root, gIDs.id_type);
	if (!piuNextStringEquals(the, rootType, "application"))
		xsUnknownError("Root node must be <application>.");

	rootProps = piuNextBuildNodeProps(the, root);
	piuNextApplyRootProps(the, application, rootProps);

	elementChildren = piuNextExtractElementChildren(the, root);
	if (piuNextTryInPlaceUpdate(the, session, application, elementChildren)) {
		xsmcSet(session, gIDs.id_prevElements, elementChildren);
		piuNextRefreshKeyTables(the, session, application, elementChildren);
		return;
	}
	if (piuNextTryKeyedReconcile(the, session, application, elementChildren)) {
		xsmcSet(session, gIDs.id_prevElements, elementChildren);
		piuNextRefreshKeyTables(the, session, application, elementChildren);
		return;
	}

	xsCall0(application, gIDs.id_empty);
	length = piuNextArrayLength(the, elementChildren);
	for (i = 0; i < length; i++) {
		xsmcSetInteger(at, i);
		xsmcGetAt(childNode, elementChildren, at);
		childContent = piuNextCreateContent(the, childNode);
		if ((xsmcTypeOf(childContent) == xsUndefinedType) || (xsmcTypeOf(childContent) == xsNullType))
			continue;
		xsCall1(application, gIDs.id_add, childContent);
	}

	xsmcSet(session, gIDs.id_prevElements, elementChildren);
	piuNextRefreshKeyTables(the, session, application, elementChildren);
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
}

void xs_piu_next_runtime_bridge_session_destructor(void *data)
{
}

void xs_piu_next_runtime_bridge_session_update(xsMachine *the)
{
	PiuNextRuntimeBridgeSessionRecord *session = xsmcGetHostChunk(xsThis);
	xsmcVars(2);

	if (!session || session->disposed)
		return;
	if (xsmcArgc < 1)
		return;

	piuNextEnsureIDs(the);
	xsmcGet(xsVar(0), xsThis, gIDs.id_application);
	xsVar(1) = xsArg(0);
	piuNextRender(the, xsThis, xsVar(0), xsVar(1));
}

void xs_piu_next_runtime_bridge_session_dispose(xsMachine *the)
{
	PiuNextRuntimeBridgeSessionRecord *session = xsmcGetHostChunk(xsThis);
	xsmcVars(1);
	xsSlot previousElements;
	xsSlot keyToContent;
	xsSlot keyToType;

	if (!session || session->disposed)
		return;

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
}
