/*
 * Copyright (c) 2016-2017  Moddable Tech, Inc.
 *
 *   This file is part of the Moddable SDK Runtime.
 * 
 *   The Moddable SDK Runtime is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU Lesser General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 * 
 *   The Moddable SDK Runtime is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU Lesser General Public License for more details.
 * 
 *   You should have received a copy of the GNU Lesser General Public License
 *   along with the Moddable SDK Runtime.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

#include "piuMC.h"
#include "freetype.h"
#include "ftobjs.h"
#include "ftstroke.h"
#include "commodettoPocoOutline.h"

typedef struct PiuMultiShapeStruct PiuMultiShapeRecord, *PiuMultiShape;
struct PiuMultiShapeStruct {
	PiuHandlePart;
	PiuIdlePart;
	PiuBehaviorPart;
	PiuContentPart;
	
	// Backward compatible single-outline storage (used if items is not set)
	uint8_t fillBlend;
	PocoColor fillColor;
	xsSlot* fillOutline;

	uint8_t strokeBlend;
	PocoColor strokeColor;
	xsSlot* strokeOutline;

	// New: items array reference (Array of { fill?, stroke?, skin? })
	xsSlot* items;
};

static void PiuMultiShapeBind(void* it, PiuApplication* application, PiuView* view);
static void PiuMultiShapeDictionary(xsMachine* the, void* it);
static void PiuMultiShapeDraw(void* it, PiuView* view, PiuRectangle area);
static void PiuMultiShapeDrawAux(void* it, PiuView* view, PiuCoordinate x, PiuCoordinate y, PiuDimension sw, PiuDimension sh);
static void PiuMultiShapeMark(xsMachine* the, void* it, xsMarkRoot markRoot);
static void PiuMultiShapeMeasureHorizontally(void* it);
static void PiuMultiShapeMeasureVertically(void* it);
static void PiuMultiShapeUnbind(void* it, PiuApplication* application, PiuView* view);

const PiuDispatchRecord ICACHE_FLASH_ATTR PiuMultiShapeDispatchRecord = {
	"MultiShape",
	PiuMultiShapeBind,
	PiuContentCascade,
	PiuMultiShapeDraw,
	PiuContentFitHorizontally,
	PiuContentFitVertically,
	PiuContentHit,
	PiuContentIdle,
	PiuContentInvalidate,
	PiuMultiShapeMeasureHorizontally,
	PiuMultiShapeMeasureVertically,
	PiuContentPlace,
	NULL,
	NULL,
	PiuContentReflow,
	PiuContentShowing,
	PiuContentShown,
	PiuContentSync,
	PiuMultiShapeUnbind,
	PiuContentUpdate
};

const xsHostHooks ICACHE_FLASH_ATTR PiuMultiShapeHooks = {
	PiuContentDelete,
	PiuMultiShapeMark,
	NULL
};

void PiuMultiShapeBind(void* it, PiuApplication* application, PiuView* view)
{
	PiuContentBind(it, application, view);
}

void PiuMultiShapeDictionary(xsMachine* the, void* it) 
{
	PiuContainer* self = it;
	xsBooleanValue boolean;
	if (xsFindBoolean(xsArg(1), xsID_clip, &boolean)) {
		if (boolean)
			(*self)->flags |= piuClip;
		else
			(*self)->flags &= ~piuClip;
	}
}

static void PiuMultiShapeDrawItems(PiuMultiShape* self, PiuView* view, PiuCoordinate x, PiuCoordinate y);

void PiuMultiShapeDraw(void* it, PiuView* view, PiuRectangle area) 
{
	PiuMultiShape* self = it;
	PiuSkin* skin = (*self)->skin;
	if (skin) {
		PiuColorRecord color;
		PiuState state = (*self)->state;
		if (state < 0) state = 0;
		else if (3 < state) state = 3;
		if ((*self)->fillOutline) {
			PiuColorsBlend((*skin)->data.color.fill, state, &color);
			(*self)->fillColor = PocoMakeColor((*view)->poco, color.r, color.g, color.b);
			(*self)->fillBlend = color.a;
		}
		if ((*self)->strokeOutline) {
			PiuColorsBlend((*skin)->data.color.stroke, state, &color);
			(*self)->strokeColor = PocoMakeColor((*view)->poco, color.r, color.g, color.b);
			(*self)->strokeBlend = color.a;
		}
		if ((*self)->items || (*self)->fillOutline || (*self)->strokeOutline) {
			if ((*self)->flags & piuClip) {
				PiuRectangleRecord bounds;
				PiuRectangleSet(&bounds, 0, 0, (*self)->bounds.width, (*self)->bounds.height);
				PiuViewPushClip(view, 0, 0, bounds.width, bounds.height);
				PiuViewDrawContent(view, PiuMultiShapeDrawAux, it, 0, 0, bounds.width, bounds.height);
				PiuViewPopClip(view);
			}
			else 
				PiuViewDrawContent(view, PiuMultiShapeDrawAux, it, 0, 0, (*self)->bounds.width, (*self)->bounds.height);
		}
	}
}

void PiuMultiShapeDrawAux(void* it, PiuView* view, PiuCoordinate x, PiuCoordinate y, PiuDimension sw, PiuDimension sh)
{
	PiuMultiShape* self = it;
	if ((*self)->items) {
		PiuMultiShapeDrawItems(self, view, x, y);
		return;
	}
	// Fallback: single outlines
	{
		PocoOutline outline;
		xsBeginHost((*self)->the);
		if ((*self)->fillOutline) {
			xsResult = xsReference((*self)->fillOutline);
			outline = xsGetHostData(xsResult);
			PocoOutlineFill((*view)->poco, (*self)->fillColor, (*self)->fillBlend, outline, x, y);
		}
		if ((*self)->strokeOutline) {
			xsResult = xsReference((*self)->strokeOutline);
			outline = xsGetHostData(xsResult);
			PocoOutlineFill((*view)->poco, (*self)->strokeColor, (*self)->strokeBlend, outline, x, y);
		}
		xsEndHost((*self)->the);
	}
}

static void PiuMultiShapeDrawItems(PiuMultiShape* self, PiuView* view, PiuCoordinate x, PiuCoordinate y)
{
	Poco poco = (*view)->poco;
	PiuColorRecord color;
	PiuState state = (*self)->state;
	if (state < 0) state = 0; else if (3 < state) state = 3;

	xsBeginHost((*self)->the);
	{
		xsIntegerValue length = 0;
		xsSlot items = xsReference((*self)->items);
		if (xsTypeOf(items) == xsReferenceType) {
			length = xsToInteger(xsGet(items, xsID_length));
			for (xsIntegerValue i = 0; i < length; i++) {
				xsSlot item = xsGetAt(items, xsInteger(i));
				if (xsTypeOf(item) != xsReferenceType)
					continue;
				// Resolve skin for this item
				PiuSkin* skin = (*self)->skin;
				if (xsHas(item, xsID_skin)) {
					xsSlot itemSkin = xsGet(item, xsID_skin);
					if (xsTypeOf(itemSkin) == xsReferenceType)
						skin = PIU(Skin, itemSkin);
				}
				// Fill
				if (xsHas(item, xsID_fill)) {
					xsSlot fill = xsGet(item, xsID_fill);
					if (xsTypeOf(fill) == xsReferenceType) {
						PocoOutline outline = xsGetHostData(fill);
						PiuColorsBlend((*skin)->data.color.fill, state, &color);
						PocoColor fillColor = PocoMakeColor(poco, color.r, color.g, color.b);
						PocoOutlineFill(poco, fillColor, color.a, outline, x, y);
					}
				}
				// Stroke
				if (xsHas(item, xsID_stroke)) {
					xsSlot stroke = xsGet(item, xsID_stroke);
					if (xsTypeOf(stroke) == xsReferenceType) {
						PocoOutline outline = xsGetHostData(stroke);
						PiuColorsBlend((*skin)->data.color.stroke, state, &color);
						PocoColor strokeColor = PocoMakeColor(poco, color.r, color.g, color.b);
						PocoOutlineFill(poco, strokeColor, color.a, outline, x, y);
					}
				}
			}
		}
	}
	xsEndHost((*self)->the);
}

void PiuMultiShapeMark(xsMachine* the, void* it, xsMarkRoot markRoot)
{
	PiuMultiShape self = it;
	PiuContentMark(the, it, markRoot);
	PiuMarkReference(the, self->fillOutline);
	PiuMarkReference(the, self->strokeOutline);
	PiuMarkReference(the, self->items);
}

void PiuMultiShapeMeasureHorizontally(void* it) 
{
	PiuMultiShape* self = it;
	if (((*self)->coordinates.horizontal & piuLeftRightWidth) < piuLeftRight) {
		PiuDimension maxWidth = 0;
		PocoOutline outline;
		xsBeginHost((*self)->the);
		if ((*self)->items) {
			xsSlot items = xsReference((*self)->items);
			xsIntegerValue length = xsToInteger(xsGet(items, xsID_length));
			for (xsIntegerValue i = 0; i < length; i++) {
				xsSlot item = xsGetAt(items, xsInteger(i));
				if (xsTypeOf(item) != xsReferenceType) continue;
				if (xsHas(item, xsID_fill)) {
					xsSlot fill = xsGet(item, xsID_fill);
					if (xsTypeOf(fill) == xsReferenceType) {
						outline = xsGetHostData(fill);
						#if (90 == kPocoRotation) || (180 == kPocoRotation) || (270 == kPocoRotation)
						PocoOutlineUnrotate(outline);
						#endif
						PocoOutlineCalculateCBox(outline);
						if (outline->w > maxWidth) maxWidth = outline->w;
					}
				}
				if (xsHas(item, xsID_stroke)) {
					xsSlot stroke = xsGet(item, xsID_stroke);
					if (xsTypeOf(stroke) == xsReferenceType) {
						outline = xsGetHostData(stroke);
						#if (90 == kPocoRotation) || (180 == kPocoRotation) || (270 == kPocoRotation)
						PocoOutlineUnrotate(outline);
						#endif
						PocoOutlineCalculateCBox(outline);
						if (outline->w > maxWidth) maxWidth = outline->w;
					}
				}
			}
		}
		else {
			if ((*self)->fillOutline) {
				xsResult = xsReference((*self)->fillOutline);
				outline = xsGetHostData(xsResult);
				#if (90 == kPocoRotation) || (180 == kPocoRotation) || (270 == kPocoRotation)
				PocoOutlineUnrotate(outline);
				#endif
				PocoOutlineCalculateCBox(outline);
				if (outline->w > maxWidth) maxWidth = outline->w;
			}
			if ((*self)->strokeOutline) {
				xsResult = xsReference((*self)->strokeOutline);
				outline = xsGetHostData(xsResult);
				#if (90 == kPocoRotation) || (180 == kPocoRotation) || (270 == kPocoRotation)
				PocoOutlineUnrotate(outline);
				#endif
				PocoOutlineCalculateCBox(outline);
				if (outline->w > maxWidth) maxWidth = outline->w;
			}
		}
		xsEndHost((*self)->the);
		(*self)->coordinates.width = maxWidth;
	}
}

void PiuMultiShapeMeasureVertically(void* it) 
{
	PiuMultiShape* self = it;
	if (((*self)->coordinates.vertical & piuTopBottomHeight) < piuTopBottom) {
		PiuDimension maxHeight = 0;
		PocoOutline outline;
		xsBeginHost((*self)->the);
		if ((*self)->items) {
			xsSlot items = xsReference((*self)->items);
			xsIntegerValue length = xsToInteger(xsGet(items, xsID_length));
			for (xsIntegerValue i = 0; i < length; i++) {
				xsSlot item = xsGetAt(items, xsInteger(i));
				if (xsTypeOf(item) != xsReferenceType) continue;
				if (xsHas(item, xsID_fill)) {
					xsSlot fill = xsGet(item, xsID_fill);
					if (xsTypeOf(fill) == xsReferenceType) {
						outline = xsGetHostData(fill);
						#if (90 == kPocoRotation) || (180 == kPocoRotation) || (270 == kPocoRotation)
						PocoOutlineUnrotate(outline);
						#endif
						PocoOutlineCalculateCBox(outline);
						if (outline->h > maxHeight) maxHeight = outline->h;
					}
				}
				if (xsHas(item, xsID_stroke)) {
					xsSlot stroke = xsGet(item, xsID_stroke);
					if (xsTypeOf(stroke) == xsReferenceType) {
						outline = xsGetHostData(stroke);
						#if (90 == kPocoRotation) || (180 == kPocoRotation) || (270 == kPocoRotation)
						PocoOutlineUnrotate(outline);
						#endif
						PocoOutlineCalculateCBox(outline);
						if (outline->h > maxHeight) maxHeight = outline->h;
					}
				}
			}
		}
		else {
			if ((*self)->fillOutline) {
				xsResult = xsReference((*self)->fillOutline);
				outline = xsGetHostData(xsResult);
				#if (90 == kPocoRotation) || (180 == kPocoRotation) || (270 == kPocoRotation)
				PocoOutlineUnrotate(outline);
				#endif
				PocoOutlineCalculateCBox(outline);
				if (outline->h > maxHeight) maxHeight = outline->h;
			}
			if ((*self)->strokeOutline) {
				xsResult = xsReference((*self)->strokeOutline);
				outline = xsGetHostData(xsResult);
				#if (90 == kPocoRotation) || (180 == kPocoRotation) || (270 == kPocoRotation)
				PocoOutlineUnrotate(outline);
				#endif
				PocoOutlineCalculateCBox(outline);
				if (outline->h > maxHeight) maxHeight = outline->h;
			}
		}
		xsEndHost((*self)->the);
		(*self)->coordinates.height = maxHeight;
	}
}

void PiuMultiShapeUnbind(void* it, PiuApplication* application, PiuView* view)
{
	PiuContentUnbind(it, application, view);
}

void PiuMultiShape_create(xsMachine* the)
{
	PiuMultiShape* self;
	xsVars(4);
	xsSetHostChunk(xsThis, NULL, sizeof(PiuMultiShapeRecord));
	self = PIU(MultiShape, xsThis);
	(*self)->the = the;
	(*self)->reference = xsToReference(xsThis);
	xsSetHostHooks(xsThis, (xsHostHooks*)&PiuMultiShapeHooks);
	(*self)->dispatch = (PiuDispatch)&PiuMultiShapeDispatchRecord;
	(*self)->flags = piuVisible | piuClip;
	(*self)->items = NULL;
	PiuContentDictionary(the, self);
	PiuMultiShapeDictionary(the, self);
	PiuBehaviorOnCreate(self);
}

void PiuMultiShape_get_fillOutline(xsMachine* the)
{
	PiuMultiShape* self = PIU(MultiShape, xsThis);
	xsSlot* fillOutline = (*self)->fillOutline;
	if (fillOutline)
		xsResult = xsReference(fillOutline);
}

void PiuMultiShape_get_strokeOutline(xsMachine* the)
{
	PiuMultiShape* self = PIU(MultiShape, xsThis);
	xsSlot* strokeOutline = (*self)->strokeOutline;
	if (strokeOutline)
		xsResult = xsReference(strokeOutline);
}

void PiuMultiShape_set_fillOutline(xsMachine *the)
{
	PiuMultiShape* self = PIU(MultiShape, xsThis);
	(*self)->fillOutline = xsToReference(xsArg(0));
	if ((((*self)->coordinates.horizontal & piuLeftRightWidth) < piuLeftRight) || (((*self)->coordinates.vertical & piuTopBottomHeight) < piuTopBottom))
		PiuContentReflow(self, piuSizeChanged);
	else
		PiuContentInvalidate(self, NULL);
}

void PiuMultiShape_set_strokeOutline(xsMachine *the)
{
	PiuMultiShape* self = PIU(MultiShape, xsThis);
	(*self)->strokeOutline = xsToReference(xsArg(0));
	if ((((*self)->coordinates.horizontal & piuLeftRightWidth) < piuLeftRight) || (((*self)->coordinates.vertical & piuTopBottomHeight) < piuTopBottom))
		PiuContentReflow(self, piuSizeChanged);
	else
		PiuContentInvalidate(self, NULL);
}

void PiuMultiShape_get_items(xsMachine* the)
{
	PiuMultiShape* self = PIU(MultiShape, xsThis);
	xsSlot* items = (*self)->items;
	if (items)
		xsResult = xsReference(items);
}

void PiuMultiShape_set_items(xsMachine* the)
{
	PiuMultiShape* self = PIU(MultiShape, xsThis);
	(*self)->items = xsToReference(xsArg(0));
	if ((((*self)->coordinates.horizontal & piuLeftRightWidth) < piuLeftRight) || (((*self)->coordinates.vertical & piuTopBottomHeight) < piuTopBottom))
		PiuContentReflow(self, piuSizeChanged);
	else
		PiuContentInvalidate(self, NULL);
}

