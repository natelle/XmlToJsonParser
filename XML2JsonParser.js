//=============================================================================
// Copyright (c), 1999-2017, Bertin IT. - All Rights Reserved.
// This source code is the property of Bertin IT. Its content may not be
// disclosed to third parties, copied, used or duplicated in any form, in whole
// or in part, without the prior written consent of Bertin IT.
//=============================================================================
//
// metadata.js

load('inc/sources/object.js');
load('inc/sources/string.js');


function XML2JsonParser() {
}

/**
 * Executes a recursive parsing to create an array of objects from the xml and the descriptor
 *
 * @param {Object} descriptor : an object that describes the structure of the object according to the XML
 * @param {aXMLNode} xml : the XML object
 * @param {Boolean} [flatten=false] : use the flattening algorithm that recursively flatten the new object if true
 *
 * @return {Object} The object created from the parse
 */
XML2JsonParser.recursiveParse = function (descriptor, xml, strict, flatten, depth) {
    strict = (typeof strict !== 'undefined') ? strict : true;
    flatten = (typeof flatten !== 'undefined') ? flatten : false;
    depth = (typeof depth !== 'undefined') ? depth : 0;

    var isArray = ObjectUtil.isArray(descriptor);
    var array = isArray ? descriptor : [];
    var group = [];
    var object = {};
    var m = 0;
    if (isArray || descriptor.node === xml.name) {
        while (xml) {
            //print(StringUtil.repeat('-', 8*depth), 'processing', xml.name, descriptor.node);
            var push = !isArray;
            var insert = false;
            for (var i in array) {
                descriptor = array[i];
                if (descriptor.node === xml.name) {
                    insert = true;
                    //print(StringUtil.repeat('-', 8*depth+2), "#####" + xml.name, descriptor.node);
                    m++;
                    descriptor.found = true;
                    var value = null;

                    if (ObjectUtil.isset(descriptor.attribute)) {
                        value = xml.getAttribute(descriptor.attribute);
                    } else if (ObjectUtil.isset(descriptor.name)) {
                        value = xml.value;
                    } else {
                        push = true;
                    }

                    var allowed = true;
                    if (ObjectUtil.isFunction(descriptor.filter)) {
                        allowed = descriptor.filter.apply(this, [xml, object[descriptor.name], object]);
                    }

                    if (value !== null && allowed) {
                        if (value == false && ObjectUtil.isset(descriptor.children)) {
                            value = this.recursiveParse(descriptor.children, xml.get(), strict, flatten, depth + 1);
                        }

                        if (value && ObjectUtil.isFunction(descriptor.handler)) {
                            value = descriptor.handler.apply(this, [value, xml]);
                        }

                        if (ObjectUtil.isset(object[descriptor.name])) {
                            if (ObjectUtil.isArray(object[descriptor.name])) {
                                object[descriptor.name].push(value);
                            } else {
                                object[descriptor.name] = [object[descriptor.name], value];
                            }
                        } else {
                            object[descriptor.name] = value;
                        }

                    }

                    break;
                }
            }

            if ((!isArray || insert) && ObjectUtil.isset(descriptor.children) && push) {
                var result = this.recursiveParse(descriptor.children, xml.get(), strict, flatten, depth + 1);

                // Dynamic flattening of the objects
                if (flatten) {
                    result = XML2JsonParser.flatten(result);
                }

                if (ObjectUtil.size(result) > 0) {
                    group.push(result);
                }
            }

            xml = xml.next;
        }

        for (var i in array) {
            if ((!ObjectUtil.isset(array[i].name) || strict) && !ObjectUtil.isset(array[i].found)) {
                throw {message: "Error while parsing metadata : node '" + array[i].node + "' wasn't found in the XML.", errorCode: 2};
            }
        }

        if (group.length > 0) {
            if (group.length === 1 && ObjectUtil.isArray(group[0])) {
                group = group[0];
            }

            return group;
        }

        return object;
    } else {
        throw {message: "Error while parsing metadata : node '" + descriptor.node + "' wasn't found in the XML.", errorCode: 2};
    }
};

/**
 * Flattens a object made up subobjects i.e. move the D+1 keys and values to the depth D+0
 * { key_1: {key_2: 'A', key_3: 'B'}, key_4: { key_5: 'C' } } => { key_2: 'A', key_3: 'B', key_5: 'C' }
 *
 * @param {Mixed} object : the object/array to flatten
 *
 * @return {Object} The flattened object. If a key already exists in the current flattened object,
 * then, an array is created with flattened objects to avoid duplication and overwriting
 */
XML2JsonParser.flatten = function (object) {
    var flattened = {};

    for (var j in object) {
        if (ObjectUtil.isObject(object[j])) {
            for (var i in object[j]) {
                if (!ObjectUtil.isArray(flattened) && !ObjectUtil.isset(flattened[i])) {
                    flattened[i] = object[j][i];
                } else {
                    if (!ObjectUtil.isArray(flattened)) {
                        flattened = [flattened];

                        var o = {};
                        o[i] = object[j][i];
                        flattened.push(o);
                    } else {
                        var last = flattened[flattened.length - 1];

                        if (!ObjectUtil.isset(last[i])) {
                            last[i] = object[j][i];
                            flattened[flattened.length - 1] = last;
                        } else {
                            var o = {};
                            o[i] = object[j][i];
                            flattened.push(o);
                        }
                    }
                }
            }
        }
    }

    if (ObjectUtil.size(flattened) > 0) {
        return flattened;
    }

    return object;
};

/**
 * Parses an xml string to create a parsed object from the descriptor's structure
 *
 * @param {Mixed} xml : a XML String or a aXMLDocument/aXMLNode to parse
 * @param {Object} descriptor : the object that describes the structure of the parsed object to be created.
 *                 The different available keys taking into account to be used in the descriptor are:
 *                 - node: the name of the XML Node (the XML nodes not represented by a node are not crawled)
 *                 - children: the children of a node. Requires an array of objects
 *                 - name: when name is set, the object is updated with value of the node (cf. node) or the node's attribute.
 *                 - attribute: use the attribute of the node for the value
 *                 - handler: a callback that modifies the value of a key in the parsed object according the value found by the parser and the xml node
 *                 - filter: a callback that filters an xml node to be parsed according the node itself and the current parsed value of
 *                 of this node in the parsed object 
 * @param {Number} [strict=false] : strict mode enabled
 * @param {Number} [index=0] : the index of the parsed object to return (in case of many parsed object)
 * @param {Boolean} [flatten=true] : use the flattening algorithm that recursively flatten the new object if true
 *
 * @return {Object} The object created from the parse
 */
XML2JsonParser.parse = function (xml, descriptor, strict, index, flatten) {
    strict = (typeof strict !== 'undefined') ? strict : false;
    index = (typeof index !== 'undefined') ? index : 0;
    flatten = (typeof flatten !== 'undefined') ? flatten : true;

    if (ObjectUtil.isString(xml)) {
        xml = new aXMLDocument(xml);
    }

    try {
        var object = XML2JsonParser.recursiveParse(descriptor, xml, strict, flatten);
    } catch (e) {
        throw e;
    }

    try {
        return object[index];
    } catch (e) {
        throw {message: "Index " + index + " not found in the metadata array", errorCode: 71};
    }

    return null;
};

/**
 * Parses an xml string to create an array of parsed objects from the descriptor's structure
 *
 * @param {Mixed} xml : a XML String or a aXMLDocument/aXMLNode to parse
 * @param {Object} descriptor : the object that describes the structure of the parsed object to be created.
 *                 The different available keys taking into account to be used in the descriptor are:
 *                 - node: the name of the XML Node (the XML nodes not represented by a node are not crawled)
 *                 - children: the children of a node. Requires an array of objects
 *                 - name: when name is set, the object is updated with value of the node (cf. node) or the node's attribute.
 *                 - attribute: use the attribute of the node for the value
 *                 - handler: a callback that modifies the value of a key in the parsed object according the value found by the parser and the xml node
 *                 - filter: a callback that filters an xml node to be parsed according the node itself and the current parsed value of
 *                 of this node in the parsed object
 * @param {Boolean} [flatten=true] : use the flattening algorithm that recursively flatten the new object if true
 *
 * @return {Array} An array containing all the parsed objects
 */
XML2JsonParser.parseAll = function (xml, descriptor, strict, flatten) {
    strict = (typeof strict !== 'undefined') ? strict : false;
    flatten = (typeof flatten !== 'undefined') ? flatten : true;

    if (ObjectUtil.isString(xml)) {
        xml = new aXMLDocument(xml);
    }

    return XML2JsonParser.recursiveParse(descriptor, xml, strict, flatten);
};
