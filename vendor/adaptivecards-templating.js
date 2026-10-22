"use strict";
var ACData = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // browser-global:AEL
  var require_AEL = __commonJS({
    "browser-global:AEL"(exports, module) {
      module.exports = globalThis.AEL;
    }
  });

  // vendor/adaptivecards-templating.package.json
  var require_adaptivecards_templating_package = __commonJS({
    "vendor/adaptivecards-templating.package.json"(exports, module) {
      module.exports = {
        name: "adaptivecards-templating",
        version: "2.4.0-alpha.0",
        description: "Adaptive Card data binding and templating engine for JavaScript",
        author: "AdaptiveCards",
        license: "MIT",
        homepage: "https://adaptivecards.io",
        repository: {
          type: "git",
          url: "https://github.com/microsoft/AdaptiveCards.git",
          directory: "source/nodejs/adaptivecards-templating"
        },
        keywords: [
          "adaptivecards",
          "adaptive",
          "cards",
          "microsoft",
          "bot"
        ],
        main: "lib/adaptivecards-templating.js",
        types: "lib/adaptivecards-templating.d.ts",
        files: [
          "lib",
          "dist",
          "src"
        ],
        scripts: {
          clean: "rimraf build lib dist",
          prebuild: "tsc",
          build: "webpack",
          watch: "webpack --watch",
          start: "webpack-dev-server --open",
          dts: "dts-generator --prefix adaptivecards-templating --project . --out dist/adaptivecards-templating.d.ts",
          lint: "eslint src/*.ts",
          release: "npm run build && webpack --mode=production && npm run dts",
          docs: "npx typedoc"
        },
        devDependencies: {
          "@types/json-schema": "^7.0.8",
          "adaptive-expressions": "^4.11.0",
          adaptivecards: "^3.0.0-beta.6",
          typedoc: "^0.22.5",
          "typedoc-plugin-markdown": "^3.11.2"
        },
        peerDependencies: {
          "adaptive-expressions": "^4.11.0"
        }
      };
    }
  });

  // vendor/adaptivecards-templating.ts
  var adaptivecards_templating_exports = {};
  __export(adaptivecards_templating_exports, {
    GlobalSettings: () => GlobalSettings,
    Template: () => Template
  });
  var AEL = __toESM(require_AEL(), 1);
  var pkg = require_adaptivecards_templating_package();
  var _EvaluationContext = class _EvaluationContext {
    constructor(context) {
      __publicField(this, "_stateStack", []);
      __publicField(this, "_$data");
      __publicField(this, "$root");
      __publicField(this, "$host");
      __publicField(this, "$index");
      __publicField(this, "$_acTemplateVersion");
      if (context !== void 0) {
        this.$_acTemplateVersion = this.generateVersionJson();
        this.$root = context.$root;
        this.$host = context.$host;
      }
    }
    isReservedField(name) {
      return _EvaluationContext._reservedFields.indexOf(name) >= 0;
    }
    saveState() {
      this._stateStack.push(
        {
          $data: this.$data,
          $index: this.$index
        }
      );
    }
    restoreLastState() {
      if (this._stateStack.length === 0) {
        throw new Error("There is no evaluation context state to restore.");
      }
      let savedContext = this._stateStack.pop();
      this.$data = savedContext.$data;
      this.$index = savedContext.$index;
    }
    get $data() {
      return this._$data !== void 0 ? this._$data : this.$root;
    }
    set $data(value) {
      this._$data = value;
    }
    generateVersionJson() {
      const version = pkg.version;
      const versionSplit = version.split(".");
      let patchSplit = [];
      const patchIndex = 2;
      if (versionSplit[patchIndex]) {
        patchSplit = versionSplit[patchIndex].split("-");
      }
      return {
        "major": parseInt(versionSplit[0]),
        "minor": parseInt(versionSplit[1]),
        "patch": parseInt(patchSplit[0]),
        "suffix": patchSplit[1] || ""
      };
    }
  };
  __publicField(_EvaluationContext, "_reservedFields", ["$data", "$when", "$root", "$index", "$host", "$_acTemplateVersion"]);
  var EvaluationContext = _EvaluationContext;
  var TemplateObjectMemory = class {
    constructor() {
      __publicField(this, "_memory");
      __publicField(this, "$root");
      __publicField(this, "$data");
      __publicField(this, "$index");
      __publicField(this, "$host");
      __publicField(this, "$_acTemplateVersion");
      this._memory = new AEL.SimpleObjectMemory(this);
    }
    getValue(path) {
      let actualPath = path.length > 0 && path[0] !== "$" ? "$data." + path : path;
      return this._memory.getValue(actualPath);
    }
    setValue(path, input) {
      this._memory.setValue(path, input);
    }
    version() {
      return this._memory.version();
    }
  };
  var GlobalSettings = class {
  };
  /**
   * Callback invoked when expression evaluation needs the value of a field in the source data object
   * and that field is undefined or null. By default, expression evaluation will substitute an undefined
   * field with its binding expression (e.g. `${field}`). This callback makes it possible to customize that
   * behavior.
   *
   * **Example**
   * Given this data object:
   *
   * ```json
   * {
   *     firstName: "David"
   * }
   * ```
   *
   * The expression `${firstName} ${lastName}` will evaluate to "David ${lastName}" because the `lastName`
   * field is undefined.
   *
   * Now let's set the callback:
   * ```typescript
   * GlobalSettings.getUndefinedFieldValueSubstitutionString = (path: string) => { return "<undefined value>"; }
   * ```
   *
   * With that, the above expression will evaluate to "David &lt;undefined value&gt;"
   */
  __publicField(GlobalSettings, "getUndefinedFieldValueSubstitutionString");
  var Template = class _Template {
    /**
     * Initializes a new Template instance based on the provided payload.
     * Once created, the instance can be bound to different data objects
     * in a loop.
     *
     * @param payload The template payload.
     */
    constructor(payload) {
      __publicField(this, "templateExpansionWarnings");
      __publicField(this, "_context");
      __publicField(this, "_preparedPayload");
      this._preparedPayload = _Template.prepare(payload);
    }
    static prepare(node) {
      if (typeof node === "string") {
        return _Template.parseInterpolatedString(node);
      } else if (typeof node === "object" && node !== null) {
        if (Array.isArray(node)) {
          let result = [];
          for (let item of node) {
            result.push(_Template.prepare(item));
          }
          return result;
        } else {
          let keys = Object.keys(node);
          let result = {};
          for (let key of keys) {
            result[key] = _Template.prepare(node[key]);
          }
          return result;
        }
      } else {
        return node;
      }
    }
    static internalTryEvaluateExpression(expression, context, allowSubstitutions) {
      let memory = new TemplateObjectMemory();
      memory.$root = context.$root;
      memory.$data = context.$data;
      memory.$index = context.$index;
      memory.$host = context.$host;
      memory.$_acTemplateVersion = context.$_acTemplateVersion;
      let options = void 0;
      if (allowSubstitutions) {
        options = new AEL.Options();
        options.nullSubstitution = (path) => {
          let substitutionValue = void 0;
          if (GlobalSettings.getUndefinedFieldValueSubstitutionString) {
            substitutionValue = GlobalSettings.getUndefinedFieldValueSubstitutionString(path);
          }
          return substitutionValue ? substitutionValue : "${" + path + "}";
        };
      }
      if (expression.type === AEL.ExpressionType.Concat && allowSubstitutions) {
        let result = "";
        for (let childExpression of expression.children) {
          let evaluationResult;
          try {
            evaluationResult = childExpression.tryEvaluate(memory, options);
          } catch (ex) {
            evaluationResult = {
              value: void 0,
              error: ex
            };
          }
          if (evaluationResult.error) {
            evaluationResult.value = "${" + childExpression.toString() + "}";
          }
          result += evaluationResult.value.toString();
        }
        return { value: result, error: void 0 };
      }
      return expression.tryEvaluate(memory, options);
    }
    /**
     * Parses an interpolated string into an Expression object ready to evaluate.
     *
     * @param interpolatedString The interpolated string to parse. Example: "Hello ${name}"
     * @returns An Expression object if the provided interpolated string contained at least one expression (e.g. "${expression}"); the original string otherwise.
     */
    static parseInterpolatedString(interpolatedString) {
      let lookup = (type) => {
        let standardFunction = AEL.ExpressionFunctions.standardFunctions.get(type);
        if (standardFunction) {
          return standardFunction;
        } else {
          return new AEL.ExpressionEvaluator(
            type,
            (expression, state, options) => {
              throw new Error("Unknown function " + type);
            },
            AEL.ReturnType.String
          );
        }
      };
      if (interpolatedString.indexOf("${") >= 0) {
        let parsedExpression = AEL.Expression.parse("`" + interpolatedString + "`", lookup);
        if (parsedExpression.type === "concat") {
          if (parsedExpression.children.length === 1 && !(parsedExpression.children[0] instanceof AEL.Constant)) {
            return parsedExpression.children[0];
          } else if (parsedExpression.children.length === 2) {
            let firstChild = parsedExpression.children[0];
            if (firstChild instanceof AEL.Constant && firstChild.value === "" && !(parsedExpression.children[1] instanceof AEL.Constant)) {
              return parsedExpression.children[1];
            }
          }
          return parsedExpression;
        }
      }
      return interpolatedString;
    }
    /**
     * Tries to evaluate the provided expression using the provided context.
     *
     * @param expression The expression to evaluate.
     * @param context The context (data) used to evaluate the expression.
     * @param allowSubstitutions Indicates if the expression evaluator should substitute undefined value with a default
     *   string or the value returned by the GlobalSettings.getUndefinedFieldValueSubstitutionString callback.
     * @returns An object representing the result of the evaluation. If the evaluation succeeded, the value property
     *   contains the actual evaluation result, and the error property is undefined. If the evaluation fails, the error
     *   property contains a message detailing the error that occurred.
     */
    static tryEvaluateExpression(expression, context, allowSubstitutions) {
      return _Template.internalTryEvaluateExpression(expression, new EvaluationContext(context), allowSubstitutions);
    }
    expandSingleObject(node) {
      let result = {};
      let keys = Object.keys(node);
      for (let key of keys) {
        if (!this._context.isReservedField(key)) {
          let value = this.internalExpand(node[key]);
          if (value !== void 0) {
            result[key] = value;
          }
        }
      }
      return result;
    }
    internalExpand(node) {
      let result;
      this._context.saveState();
      if (Array.isArray(node)) {
        let itemArray = [];
        for (let item of node) {
          let expandedItem = this.internalExpand(item);
          if (expandedItem !== null) {
            if (Array.isArray(expandedItem)) {
              itemArray = itemArray.concat(expandedItem);
            } else {
              itemArray.push(expandedItem);
            }
          }
        }
        result = itemArray;
      } else if (node instanceof AEL.Expression) {
        let evaluationResult = _Template.internalTryEvaluateExpression(node, this._context, true);
        if (!evaluationResult.error) {
          result = evaluationResult.value;
        } else {
          throw new Error(evaluationResult.error);
        }
      } else if (typeof node === "object" && node !== null) {
        let when = node["$when"];
        let dataContext = node["$data"];
        let dataContextIsArray = false;
        let dataContexts;
        if (dataContext === void 0) {
          dataContexts = [void 0];
        } else {
          if (dataContext instanceof AEL.Expression) {
            let evaluationResult = _Template.internalTryEvaluateExpression(dataContext, this._context, true);
            if (!evaluationResult.error) {
              dataContext = evaluationResult.value;
            } else {
              throw new Error(evaluationResult.error);
            }
          }
          if (Array.isArray(dataContext)) {
            dataContexts = dataContext;
            dataContextIsArray = true;
          } else {
            dataContexts = [dataContext];
          }
        }
        result = [];
        for (let i = 0; i < dataContexts.length; i++) {
          if (dataContextIsArray) {
            this._context.$index = i;
          }
          if (dataContexts[i] !== void 0) {
            this._context.$data = dataContexts[i];
          }
          let dropObject = false;
          if (when instanceof AEL.Expression) {
            let evaluationResult = _Template.internalTryEvaluateExpression(when, this._context, false);
            let whenValue = false;
            if (!evaluationResult.error) {
              whenValue = typeof evaluationResult.value === "boolean" && evaluationResult.value;
            }
            if (evaluationResult.value === void 0) {
              this.templateExpansionWarnings.push(`WARN: Unable to parse the Adaptive Expression ${when}. The $when condition has been set to false by default.`);
            }
            dropObject = !whenValue;
          } else if (when) {
            this.templateExpansionWarnings.push(`WARN: ${when} is not an Adaptive Expression. The $when condition has been set to false by default.`);
            dropObject = true;
          }
          if (!dropObject) {
            let expandedObject = this.expandSingleObject(node);
            if (expandedObject !== null) {
              result.push(expandedObject);
            }
          }
        }
        if (result.length === 0) {
          result = null;
        } else if (result.length === 1) {
          result = result[0];
        }
      } else {
        result = node;
      }
      this._context.restoreLastState();
      return result;
    }
    /**
     * Expands the template using the provided context. Template expansion involves
     * evaluating the expressions used in the original template payload, as well as
     * repeating (expanding) parts of that payload that are bound to arrays.
     *
     * Example:
     *
     * ```typescript
     * let context = {
     *     $root: {
     *         firstName: "John",
     *         lastName: "Doe",
     *         children: [
     *             { fullName: "Jane Doe", age: 9 },
     *             { fullName: "Alex Doe", age: 12 }
     *         ]
     *     }
     * }
     *
     * let templatePayload = {
     *     type: "AdaptiveCard",
     *     version: "1.2",
     *     body: [
     *         {
     *             type: "TextBlock",
     *             text: "${firstName} ${lastName}"
     *         },
     *         {
     *             type: "TextBlock",
     *             $data: "${children}",
     *             text: "${fullName} (${age})"
     *         }
     *     ]
     * }
     *
     * let template = new Template(templatePayload);
     *
     * let expandedTemplate = template.expand(context);
     * ```
     *
     * With the above code, the value of `expandedTemplate` will be
     *
     * ```json
     * {
     *     type: "AdaptiveCard",
     *     version: "1.2",
     *     body: [
     *         {
     *             type: "TextBlock",
     *             text: "John Doe"
     *         },
     *         {
     *             type: "TextBlock",
     *             text: "Jane Doe (9)"
     *         },
     *         {
     *             type: "TextBlock",
     *             text: "Alex Doe (12)"
     *         }
     *     ]
     * }
     * ```
     *
     * @param context The context to bind the template to.
     * @returns A value representing the expanded template. The type of that value
     *   is dependent on the type of the original template payload passed to the constructor.
     */
    expand(context) {
      this.templateExpansionWarnings = [];
      this._context = new EvaluationContext(context);
      return this.internalExpand(this._preparedPayload);
    }
    /**
     * Getter method for the array of warning strings
     * @returns An array storing any warnings that occurred while expanding the template
     */
    getLastTemplateExpansionWarnings() {
      return this.templateExpansionWarnings;
    }
  };
  return __toCommonJS(adaptivecards_templating_exports);
})();
