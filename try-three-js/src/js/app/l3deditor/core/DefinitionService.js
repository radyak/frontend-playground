L3DEditor = (function (L3DEditor) {

  'use strict';

  var masterTemplate = {
    "type": "box",
    "position": [0, 0, 0],
    "rotation": [0, 0, 0],
    "repeat": {
      "times": 1,
      "position": [0, 0, 0],
      "rotation": [0, 0, 0]
    },
    "_dustbin": {}
  };

  var definitionTemplates = {
    "box": {
      "dimensions": [10, 10, 10]
    },
    "cylinder": {
      "radii": [10, 15],
      "height": 10
    },
    "extrude": {
      "points": [
        [-45, 0],
        [65, 0],
        [65, 10],
        [30, 15],
        [-45, 15]
      ],
      "width": 44
    },
    "composite": {
      "parts": []
    },
    "ref": {
      "name": "plate"
    }
  };

  var getDefinitionTemplateNames = function () {
    return Object.keys(definitionTemplates);
  };

  var getCatalogDefinitionNames = function () {
    return Object.keys(L3DEditor.Catalog);
  };

  var getDefinitionTemplate = function (definitionName) {
    var definitionTemplate = definitionTemplates[definitionName];
    if (!definitionTemplate) {
      throw new TemplateException('No template with name "' + definitionName + '" defined');
    }
    definitionTemplate = L3DEditor.ObjectUtils.copyObject(definitionTemplate);
    var masterTemplate = getMasterTemplate();
    L3DEditor.ObjectUtils.copyObjectFields(masterTemplate, definitionTemplate);
    return definitionTemplate;
  };

  var getMasterTemplate = function () {
    return L3DEditor.ObjectUtils.copyObject(masterTemplate);
  };


  /*

  There are three types of definition:

       1. Simple type (box, sphere etc.):
         {
           "type": "box",
           ...
         }

       2. Composite type:
         {
           "type": "composite",
           "parts": [],
           ...
         }

       3. Reference type:
         {
           "type": "ref",
           "name": "...",
           ...
         }

   */


  var checkDefinitionIsObject = function (test) {
    if (!L3DEditor.ObjectUtils.isObject(test)) {
      throw new CompilationException("Definition (or part of a defintion) is not an object: " + test);
    }
  };

  var findForName = function(name) {
    // TODO: Search in main definition, too
    var referredDefinition = L3DEditor.Catalog[name];
    if (referredDefinition === undefined) {
      throw new CompilationException("No object found for reference name '" + name + "'");
    }
    return referredDefinition
  };

  var compileReferenceDefinition = function (definition) {
    var name = definition.name;
    var referredDefinition = findForName(name);
    referredDefinition = L3DEditor.ObjectUtils.copyObject(referredDefinition);
    L3DEditor.ObjectUtils.copyObjectFields(definition, referredDefinition, ["type", "name"]);
    return compile(referredDefinition);
  };

  var transformDefinition = function (definition, transformRules, iterationStep) {
    if (!transformRules) {
      console.warn('No transformRules given!');
      return;
    }

    if (!definition.position) {
      definition.position = [0, 0, 0];
    }
    if (transformRules && Array.isArray(transformRules.position) && definition.position.length === transformRules.position.length) {
      for (var i in definition.position) {
        definition.position[i] += iterationStep * transformRules.position[i];
      }
    }

    if (!definition.rotation) {
      definition.rotation = [0, 0, 0];
    }
    if (transformRules && Array.isArray(transformRules.rotation) && definition.rotation.length === transformRules.rotation.length) {
      for (var i in definition.rotation) {
        definition.rotation[i] += iterationStep * transformRules.rotation[i];
      }
    }
  };

  var compileRepeatingPart = function (definition) {
    var repeater = definition.repeat;
    delete definition.repeat;
    var partsFromDefinitionRepetition = [];
    for (var j = 0; j < repeater.times; j++) {
      var currentDefinition = L3DEditor.ObjectUtils.copyObject(definition);
      transformDefinition(currentDefinition, repeater, j);
      partsFromDefinitionRepetition.push(currentDefinition);
    }
    return {
      "type": "composite",
      "parts": partsFromDefinitionRepetition
    };
  };

  var compileCompositeDefinition = function (definition) {
    if (Array.isArray(definition.parts)) {
      for (var i in definition.parts) {
        var part = definition.parts[i];
        part = compile(part);
        if (L3DEditor.ObjectUtils.isObject(part.repeat)) {
          definition.parts[i] = compileRepeatingPart(part);
        } else {
          definition.parts[i] = part;
        }
      }
    } else {
      delete definition.parts;
    }
    return definition;
  };

  var compile = function (definition) {
    checkDefinitionIsObject(definition);
    if (definition.type === "ref") {
      return compileReferenceDefinition(definition);
    } else if (definition.type === "composite") {
      return compileCompositeDefinition(definition);
    }
    return definition;
  };

  var copyAndCompile = function (definition) {
    definition = L3DEditor.ObjectUtils.copyObject(definition);
    return compile(definition);
  };

  var complementMissingFields = function (definition, template) {
    for (var key in template) {
      if (key === '_dustbin') {
        continue;
      }
      if (definition[key] === undefined) {
        definition[key] = template[key];
      }
    }
  };

  var backupAndRemoveExcessFields = function (definition, template) {
    for (var key in definition) {
      if (key === '_dustbin') {
        continue;
      }
      if (template[key] === undefined) {
        definition._dustbin = definition._dustbin || {};
        definition._dustbin[key] = definition[key];
        console.log('deleting ' + key + ': ' + definition[key]);
        delete definition[key];
      }
    }
  };

  var restoreBackuppedFields = function (definition, template) {
    if (!definition._dustbin) {
      return;
    }
    for (var key in definition._dustbin) {
      if (template.hasOwnProperty(key)) {
        definition[key] = definition._dustbin[key];
      }
    }
  };

  var sanitizeFromTemplate = function (definition, template) {
    complementMissingFields(definition, template);
    backupAndRemoveExcessFields(definition, template);
    restoreBackuppedFields(definition, template);
  };

  var sanitize = function (definition) {
    var definitionTemplate = getDefinitionTemplate(definition.type);

    sanitizeFromTemplate(definition, definitionTemplate);

    if (definition.parts) {
      for (var i in definition.parts) {
        sanitize(definition.parts[i]);
      }
    }
  };

  L3DEditor.DefinitionService = {
    findForName: findForName,
    compile: copyAndCompile,
    getDefinitionTemplateNames: getDefinitionTemplateNames,
    getDefinitionTemplate: getDefinitionTemplate,
    getCatalogDefinitionNames: getCatalogDefinitionNames,
    sanitize: sanitize
  };

  return L3DEditor;

}) (L3DEditor || {});