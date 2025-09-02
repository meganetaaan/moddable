import { Outline } from "commodetto/outline";

const multiShape = {
    __proto__: Content.prototype,
    _create($, it) @ "PiuMultiShape_create",
    
    get items() @ "PiuMultiShape_get_items",
    set items(it) @ "PiuMultiShape_set_items",
    
    get fillOutline() @ "PiuMultiShape_get_fillOutline",
    get strokeOutline() @ "PiuMultiShape_get_strokeOutline",
    
    set fillOutline(it) @ "PiuMultiShape_set_fillOutline",
    set strokeOutline(it) @ "PiuMultiShape_set_strokeOutline",
};
export const MultiShape = Template(multiShape);
MultiShape.Outline = Outline;
Object.freeze(multiShape);
globalThis.MultiShape = MultiShape;
