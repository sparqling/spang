(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
spfmt = (sparql, indentDepth = 2) => {
  const parser = require('../syntax/parser.js');
  const formatter = require('../lib/formatter.js');
  return formatter.format(parser.parse(sparql), indentDepth);
};

},{"../lib/formatter.js":2,"../syntax/parser.js":3}],2:[function(require,module,exports){
let output;
let comments;
let currentIndent;
let indentUnit = '  ';

exports.format = (syntaxTree, indentDepth = 2) => {
  indentUnit = ' '.repeat(indentDepth);

  output = [];
  comments = syntaxTree.comments;
  currentIndent = '';

  if (syntaxTree.headers.length > 0) {
    addLine(syntaxTree.headers.join(''));
  }
  if (syntaxTree.prologue.length) {
    syntaxTree.prologue.forEach((p) => {
      if (p.token === 'base') {
        addLine(`BASE <${p.value}>`);
      } else if (p.token === 'prefix') {
        addLine(`PREFIX ${p.prefix || ''}: <${p.local}>`);
      }
    });
    addLine('');
  }

  syntaxTree.functions.forEach(addFunction);

  if (syntaxTree.body?.kind === 'select') {
    addSelect(syntaxTree.body);
  } else if (syntaxTree.body?.kind === 'construct') {
    addConstruct(syntaxTree.body);
  } else if (syntaxTree.body?.kind === 'ask') {
    addAsk(syntaxTree.body);
  } else if (syntaxTree.body?.kind === 'describe') {
    addDescribe(syntaxTree.body);
  } else if (syntaxTree.units) {
    for (let i = 0; i < syntaxTree.units.length; i++) {
      if (i > 0) {
        output[output.length - 1] += " ;\n";
      }
      addUnit(syntaxTree.units[i]);
    }
  }
  if (syntaxTree.inlineData) {
    addInlineData(syntaxTree.inlineData);
  }

  while (comments.length > 0) {
    output[output.length - 1] += comments.shift().text;
  }

  return output.join('\n');
};

const debugPrint = (object) => {
  console.log(JSON.stringify(object, undefined, 2));
};

const increaseIndent = (depth = 1) => {
  currentIndent += indentUnit.repeat(depth);
};

const decreaseIndent = (depth = 1) => {
  currentIndent = currentIndent.substr(0, currentIndent.length - indentUnit.length * depth);
};

const addLine = (line) => {
  output.push(currentIndent + line);
};

const addLineWithComment = (line, pos) => {
  while (comments.length && comments[0].pos < pos) {
    output[output.length - 1] += comments.shift().text;
  }
  addLine(line);
};

const addAsk = (ask) => {
  addLine('ASK {');
  addGroupGraphPatternSub(ask.pattern);
  addLine('}');
  addSolutionModifier(ask);
}

const addDescribe = (describe) => {
  const elems = describe.value.map(getTripleElem).join(' ');
  addLine(`DESCRIBE ${elems}`);
  addDataset(describe.dataset);
  if (describe.pattern) {
    addLine('WHERE {');
    addGroupGraphPatternSub(describe.pattern);
    addLine('}');
  }
  addSolutionModifier(describe);
}

const addUnit = (unit) => {
  if (unit.kind === 'insertdata') {
    addLine('INSERT DATA');
    addQuads(unit.quads);
  } else if (unit.kind === 'deletedata') {
    addLine('DELETE DATA');
    addQuads(unit.quads);
  } else if (unit.kind === 'deletewhere') {
    addLine('DELETE WHERE {');
    addGroupGraphPatternSub(unit.pattern);
    addLine('}');
  } else if (unit.kind === 'modify') {
    if (unit.with) {
      addLine(`WITH ${getTripleElem(unit.with)}`);
    }
    if (unit.delete) {
      addLine('DELETE');
      addQuads(unit.delete.triplesblock);
    }
    if (unit.insert) {
      addLine('INSERT');
      addQuads(unit.insert.triplesblock);
    }
    if (unit.using) {
      addLine(`USING ${getUsing(unit.using[0])}`);
    }
    addLine('WHERE {');
    addGroupGraphPatternSub(unit.pattern);
    addLine('}');
  } else if (unit.kind === 'add') {
    const g1 = getGraphOrDefault(unit.graphs[0]);
    const g2 = getGraphOrDefault(unit.graphs[1]);
    let silent = ' ';
    if (unit.silent) {
      silent = ' SILENT ';
    }
    addLine(`ADD${silent}${g1} TO ${g2}`);
  } else if (unit.kind === 'move') {
    const g1 = getGraphOrDefault(unit.graphs[0]);
    const g2 = getGraphOrDefault(unit.graphs[1]);
    let silent = ' ';
    if (unit.silent) {
      silent = ' SILENT ';
    }
    addLine(`MOVE${silent}${g1} TO ${g2}`);
  } else if (unit.kind === 'copy') {
    const g1 = getGraphOrDefault(unit.graphs[0]);
    const g2 = getGraphOrDefault(unit.graphs[1]);
    let silent = ' ';
    if (unit.silent) {
      silent = ' SILENT ';
    }
    addLine(`COPY${silent}${g1} TO ${g2}`);
  } else if (unit.kind === 'load') {
    let silent = ' ';
    if (unit.silent) {
      silent = ' SILENT ';
    }
    addLine(`LOAD${silent}${getUri(unit.sourceGraph)}`);
  } else if (unit.kind === 'clear') {
    let silent = ' ';
    if (unit.silent) {
      silent = ' SILENT ';
    }
    addLine(`CLEAR${silent}${getGraphRefAll(unit.destinyGraph)}`);
  } else if (unit.kind === 'drop') {
    let silent = ' ';
    if (unit.silent) {
      silent = ' SILENT ';
    }
    addLine(`DROP${silent}${getGraphRefAll(unit.destinyGraph)}`);
  } else if (unit.kind === 'create') {
    let silent = ' ';
    if (unit.silent) {
      silent = ' SILENT ';
    }
    addLine(`CREATE${silent}GRAPH ${getUri(unit.destinyGraph)}`);
  }
};

const getUsing = (graph) => {
  if (graph.kind === 'default') {
    return getUri(graph.uri);
  } else if (graph.kind === 'named') {
    return `NAMED ${getUri(graph.uri)}`;
  }
};

const getGraphOrDefault = (graph) => {
  if (graph === 'default') {
    return 'DEFAULT';
  } else {
    return getUri(graph);
  }
};

const getGraphRefAll = (graph) => {
  if (graph === 'default') {
    return 'DEFAULT';
  } else if (graph === 'named') {
    return 'NAMED';
  } else if (graph === 'all') {
    return 'ALL';
  } else {
    return `GRAPH ${getUri(graph)}`;
  }
};

const addQuads = (quads) => {
  addLine('{');
  increaseIndent();
  addTriplesBlock(quads);
  decreaseIndent();
  addLine('}');
};

const addSelect = (select) => {
  const proj = select.projection;
  const lastProj = proj[proj.length-1];
  const pos = proj[0].value ? proj[0].value.location.start.offset : proj[0].location.start.offset;
  let endPos = lastProj.value ? lastProj.value.location.end.offset : lastProj.location.end.offset;

  let args = '';
  if (select.modifier) {
    args += `${select.modifier.toString()} `;
  }
  args += proj.map(getProjection).join(' ');
  addLineWithComment(`SELECT ${args}`, pos);

  const datasetEndPos= addDataset(select.dataset);
  if (datasetEndPos > endPos) {
    endPos = datasetEndPos;
  }

  addLineWithComment('WHERE {', endPos+1);
  addGroupGraphPatternSub(select.pattern);
  addLineWithComment('}', select.pattern.location.end.offset);

  addSolutionModifier(select);
};

const addDataset = (dataset) => {
  let endPos;
  if (dataset) {
    dataset.implicit.forEach((graph) => {
      endPos = addFrom(graph);
    });
    dataset.named.forEach((graph) => {
      endPos = addFromNamed(graph);
    });
    return endPos;
  }
}

const addSolutionModifier = (body) => {
  if (body.group) {
    addLine('GROUP BY ' + body.group.map(elem => getTripleElem(elem)).join(' '));
  }
  if (body.having) {
    addLine(`HAVING ${getExpression(body.having[0])}`);
  }
  if (body.order) {
    addLine('ORDER BY ' + getOrderConditions(body.order));
  }
  body.limitoffset?.forEach((lo) => {
    if (lo.limit) {
      addLine(`LIMIT ${lo.limit}`);
    } else if (lo.offset) {
      addLine(`OFFSET ${lo.offset}`);
    }
  });
}

const addConstruct = (body) => {
  if (body.template) {
    addLineWithComment('CONSTRUCT {', body.location.start.offset);
    increaseIndent();
    addTriplesBlock(body.template.triplesblock);
    decreaseIndent();
    addLine('}');
  } else {
    addLine('CONSTRUCT');
  }

  addDataset(body.dataset);

  addLine('WHERE {');
  if (body.pattern.patterns) {
    addGroupGraphPatternSub(body.pattern);
  } else {
    increaseIndent();
    addTriplesBlock(body.pattern.triplesblock);
    decreaseIndent();
  }
  addLine('}');

  addSolutionModifier(body);
};

const addFrom = (graph) => {
  const uri = getUri(graph);
  if (uri != null) {
    const pos = graph.location.start.offset;
    const endPos = graph.location.end.offset;
    addLineWithComment('FROM ' + uri, pos);
    return endPos;
  }
};

const addFromNamed = (graph) => {
  const uri = getUri(graph);
  if (uri != null) {
    const pos = graph.location.start.offset;
    const endPos = graph.location.end.offset;
    addLineWithComment('FROM NAMED ' + uri, pos);
    return endPos;
  }
};

const addGGP = (pattern) => {
  addLine('{');
  switch (pattern.token) {
    case 'ggp':
      addGroupGraphPatternSub(pattern);
      break;
    case 'subselect':
      increaseIndent();
      addSelect(pattern);
      if (pattern.inlineData) {
        addInlineData(pattern.inlineData);
      }
      decreaseIndent();
      break;
  }
  addLine('}');
};

const addGroupGraphPatternSub = (pattern) => {
  increaseIndent();
  pattern.patterns.forEach(addPattern);
  decreaseIndent();
};

const addPattern = (pattern) => {
  switch (pattern.token) {
    case 'triplesblock':
      addTriplesBlock(pattern.triplesblock);
      break;
    case 'ggp':
      addGGP(pattern);
      break;
    case 'subselect':
      addGGP(pattern);
      break;
    case 'filter':
      addFilter(pattern);
      break;
    case 'bind':
      addLine(`BIND (${getExpression(pattern.expression)} AS ${getVar(pattern.as)})`);
      break;
    case 'graphgraphpattern':
      addLine(`GRAPH ${getTripleElem(pattern.graph)} {`);
      addGroupGraphPatternSub(pattern.value);
      addLine('}');
      break;
    case 'unionpattern':
      for (let i = 0; i < pattern.value.length; i++) {
        if (i > 0) {
          addLine('UNION');
        }
        addGGP(pattern.value[i]);
      }
      break;
    case 'optionalgraphpattern':
      addLine('OPTIONAL {');
      addGroupGraphPatternSub(pattern.value);
      addLine('}');
      break;
    case 'servicegraphpattern':
      addLine(`SERVICE ${getTripleElem(pattern.value[0])}`);
      addGGP(pattern.value[1]);
      break;
    case 'minusgraphpattern':
      addLine('MINUS {');
      addGroupGraphPatternSub(pattern.value);
      addLine('}');
      break;
    case 'inlineData':
      addInlineData(pattern);
      break;
    case 'inlineDataFull':
      addInlineData(pattern);
      break;
    case 'expression':
      if (pattern.expressionType === 'functioncall') {
        const args = pattern.args.map(getExpression).join(', ');
        addLine(getUri(pattern.iriref) + `(${args})`);
      } else {
        debugPrint(pattern);
      }
      break;
  }
};

const getOrderConditions = (conditions) => {
  let orderConditions = [];
  conditions.forEach((condition) => {
    const oc = getVar(condition.expression.value);
    if (condition.direction == 'DESC') {
      orderConditions.push(`DESC(${oc})`);
    } else {
      orderConditions.push(oc);
    }
  });

  return orderConditions.join(' ');
};

const getProjection = (projection) => {
  switch (projection.kind) {
    case '*':
      return '*';
    case 'var':
      if (projection.value.prefix === '$') {
        return '$' + projection.value.value;
      } else {
        return '?' + projection.value.value;
      }
    case 'aliased':
      return `(${getExpression(projection.expression)} AS ?${projection.alias.value})`;
    default:
      throw new Error('unknown projection.kind: ' + projection.kind);
  }
};

const addFilter = (filter) => {
  if (filter.value.expressionType === 'builtincall' && filter.value.builtincall === 'notexists') {
    addLine(`FILTER NOT EXISTS`);
    filter.value.args.forEach(addGGP);
  } else if (filter.value.expressionType === 'builtincall' && filter.value.builtincall === 'exists') {
    addLine(`FILTER EXISTS`);
    filter.value.args.forEach(addGGP);
  } else {
    addLineWithComment(`FILTER ${getExpression(filter.value)}`, filter.location.start.offset);
  }
};

const addTriplesBlock = (triplesblock) => {
  if (triplesblock.triplesblock) {
    addTriplesBlock(triplesblock.triplesblock);
  } else {
    triplesblock.forEach((t) => {
      if (t.graph) {
        addLineWithComment(`GRAPH ${getTripleElem(t.graph)} {`, t.graph.location.start.offset);
        increaseIndent();
        addTriplesBlock(t.triplesblock);
        decreaseIndent();
        addLine('}');
      } else if (t.triplesblock) {
        addTriplesBlock(t.triplesblock);
      } else {
        addTriplePath(t);
      }
    });
  }
};

const addTriplePath = (triplepath) => {
  const s = getTripleElem(triplepath.chainSubject);
  let out;
  let outPos;
  triplepath.propertylist.pairs.forEach((pair) => {
    const p = getTripleElem(pair[0]);
    const o = getTripleElem(pair[1]);
    if (out) {
      addLineWithComment(`${out} ;`, outPos);
      out = ' '.repeat(s.length) + ` ${p} ${o}`;
      if (pair[0].location) {
        outPos = pair[0].location.start.offset;
      } else {
        outPos = pair[1][0].location.start.offset;
      }
    } else {
      out = `${s} ${p} ${o}`;
      outPos = triplepath.chainSubject.location.start.offset;
    }
  });
  addLineWithComment(`${out} .`, outPos);
};

const getPropertyList = (propertylist, sLen = 4) => {
  let ret = '';
  propertylist.pairs.forEach((pair) => {
    const p = getTripleElem(pair[0]);
    const o = getTripleElem(pair[1]);
    if (ret) {
      ret += ` ;\n`;
      ret += currentIndent + ' '.repeat(sLen) + ` ${p} ${o}`;
    } else {
      ret += ` ${p} ${o}`;
    }
  });
  return ret;
};

const addFunction = (func) => {
  const name = getUri(func.header.iriref);
  const args = func.header.args.map(getExpression).join(', ');
  addLine(`${name}(${args}) {`);
  addGroupGraphPatternSub(func.body);
  addLine('}');
  addLine('');
};

const getAggregate = (expr) => {
  if (expr.aggregateType === 'count') {
    let distinct = expr.distinct ? 'DISTINCT ' : '';
    let expression;
    if (expr.expression === '*') {
      expression = '*'
    } else {
      expression = getExpression(expr.expression);
    }
    return `COUNT(${distinct}${expression})`;
  } else if (expr.aggregateType === 'sum') {
    return `sum(?${expr.expression.value.value})`;
  } else if (expr.aggregateType === 'min') {
    return `MIN(?${expr.expression.value.value})`;
  } else if (expr.aggregateType === 'max') {
    return `MAX(?${expr.expression.value.value})`;
  } else if (expr.aggregateType === 'avg') {
    return `AVG(${getExpression(expr.expression)})`;
  } else if (expr.aggregateType === 'sample') {
    return `SAMPLE(?${expr.expression.value.value})`;
  } else if (expr.aggregateType === 'group_concat') {
    let distinct = expr.distinct ? 'DISTINCT ' : '';
    let separator = '';
    if (expr.separator) {
      separator = `; SEPARATOR = "${expr.separator.value}"`;
    }
    return `GROUP_CONCAT(${distinct}${getExpression(expr.expression)}${separator})`;
  }
};

const getExpression = (expr) => {
  switch (expr.expressionType) {
    case 'atomic':
      return getTripleElem(expr.value);
    case 'irireforfunction':
      let iri = getUri(expr.iriref);
      if (expr.args) {
        iri += '(' + expr.args.map(getExpression).join(', ') + ')';
      }
      return getBracketted(iri, expr.bracketted);
    case 'builtincall':
      let args = '';
      if (expr.args) {
        args = expr.args.map(getTripleElem).join(', ');
      }
      const ret = expr.builtincall + '(' + args + ')';
      return getBracketted(ret, expr.bracketted);
    case 'unaryexpression':
      let ex = expr.unaryexpression + getExpression(expr.expression);
      return getBracketted(ex, expr.bracketted);
    case 'aggregate':
      return getAggregate(expr);
    case 'multiplicativeexpression':
      let multi = getExpression(expr.factor);
      expr.factors.forEach((elem) => {
        multi += ' ' + elem.operator + ' ' + getExpression(elem.expression);
      });
      return getBracketted(multi, expr.bracketted);
    case 'additiveexpression':
      let additive = getExpression(expr.op1);
      expr.ops.forEach((elem) => {
        additive += ' ' + elem.operator + ' ' + getExpression(elem.expression);
      });
      return getBracketted(additive, expr.bracketted);
    case 'relationalexpression':
      let relation = getExpression(expr.op1) + ' ' + expr.operator + ' ';
      if (Array.isArray(expr.op2)) {
        relation += '(' + expr.op2.map(getTripleElem).join(', ') + ')';
      } else {
        relation += getExpression(expr.op2);
      }
      return getBracketted(relation, expr.bracketted);
    case 'conditionaland':
      return getBracketted(expr.operands.map(getExpression).join(' && '), expr.bracketted);
    case 'conditionalor':
      return getBracketted(expr.operands.map(getExpression).join(' || '), expr.bracketted);
    case 'regex':
      let op = getExpression(expr.text);
      op += ', ' + getExpression(expr.pattern);
      if (expr.flags) {
        op += ', ' + getExpression(expr.flags);
      }
      return `regex(${op})`;
  }
};

const getBracketted = (ret, bracketted) => {
  if (bracketted) {
    return `(${ret})`;
  } else {
    return ret;
  }
};

const addInlineData = (inline) => {
  switch (inline.token) {
    case 'inlineData':
      const v = getTripleElem(inline.var);
      const vals = inline.values.map(getTripleElem).join(' ');
      addLine(`VALUES ${v} { ${vals} }`);
      break;
    case 'inlineDataFull':
      const varlist = inline.variables.map(getVar).join(' ');
      if (inline.variables.length === 1) {
        const vals = inline.values.map((tuple) => {
          return '(' + tuple.map(getTripleElem).join(' ') + ')';
        }).join(' ');
        addLine(`VALUES (${varlist}) { ${vals} }`);
      } else {
        addLine(`VALUES (${varlist}) {`);
        increaseIndent();
        inline.values.map((tuple) => {
          addLine('(' + tuple.map(getTripleElem).join(' ') + ')');
        });
        decreaseIndent();
        addLine('}');
      }
      break;
  }
};

const getTripleElem = (elem) => {
  if (elem === 'UNDEF') {
    return elem;
  }
  if (Array.isArray(elem)) {
    return elem.map((e) => getTripleElem(e)).join(', ');
  }
  switch (elem.token) {
    case 'uri':
      return getUri(elem);
    case 'var':
      return getVar(elem);
    case 'literal':
      if (elem.type === 'http://www.w3.org/2001/XMLSchema#decimal') {
        return elem.value;
      } else if (elem.type === 'http://www.w3.org/2001/XMLSchema#double') {
        return elem.value;
      } else if (elem.type === 'http://www.w3.org/2001/XMLSchema#integer') {
        return elem.value;
      }
      let literal = elem.quote + elem.value + elem.quote;
      if (elem.type?.prefix && elem.type?.suffix) {
        literal += `^^${elem.type.prefix}:${elem.type.suffix}`;
      } else if (elem.type) {
        literal += `^^<${elem.type.value}>`;
      } else if (elem.lang) {
        literal += '@' + elem.lang;
      }
      return literal;
    case 'path':
      if (elem.kind === 'alternative') {
        let path = elem.value.map((e) => getTripleElem(e)).join('|');
        if (elem.bracketted) {
          path = `(${path})`;
        }
        if (elem.modifier) {
          path += elem.modifier;
        }
        return path;
      } else if (elem.kind === 'sequence') {
        return elem.value.map((e) => getPredicate(e)).join('/');
      } else {
        return getPredicate(elem);
      }
    case 'blank':
      return elem.value || '[]';
    case 'triplesnode':
      return `[${getPropertyList(elem.pairs)} ]`;
    case 'triplesnodecollection':
      const collection = elem.collection.map((c) => {
        return getTripleElem(c)
      }).join(' ');
      return `( ${collection} )`;
    default:
      return getExpression(elem);
  }
};

const getPredicate = (elem) => {
  let ret = '';
  if (elem.kind === 'inversePath') {
    ret += '^';
  }
  ret += getTripleElem(elem.value);
  if (elem.modifier) {
    ret += elem.modifier;
  }
  return ret;
};

const getUri = (uri) => {
  if (uri.prefix && uri.suffix) {
    return `${uri.prefix}:${uri.suffix}`;
  } else if (uri.prefix) {
    return `${uri.prefix}:`;
  } else if (uri.suffix) {
    return `:${uri.suffix}`;
  } else if (uri.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') {
    return 'a';
  } else if (uri.value != null) {
    return `<${uri.value}>`;
  } else {
    return null;
  }
};

const getVar = (variable) => {
  if (variable.prefix === '?') {
    return '?' + variable.value;
  } else if (variable.prefix === '$') {
    return '$' + variable.value;
  } else {
    return '{{' + variable.value + '}}';
  }
};

},{}],3:[function(require,module,exports){
/*
 * Generated by PEG.js 0.10.0.
 *
 * http://pegjs.org/
 */

"use strict";

function peg$subclass(child, parent) {
  function ctor() { this.constructor = child; }
  ctor.prototype = parent.prototype;
  child.prototype = new ctor();
}

function peg$SyntaxError(message, expected, found, location) {
  this.message  = message;
  this.expected = expected;
  this.found    = found;
  this.location = location;
  this.name     = "SyntaxError";

  if (typeof Error.captureStackTrace === "function") {
    Error.captureStackTrace(this, peg$SyntaxError);
  }
}

peg$subclass(peg$SyntaxError, Error);

peg$SyntaxError.buildMessage = function(expected, found) {
  var DESCRIBE_EXPECTATION_FNS = {
        literal: function(expectation) {
          return "\"" + literalEscape(expectation.text) + "\"";
        },

        "class": function(expectation) {
          var escapedParts = "",
              i;

          for (i = 0; i < expectation.parts.length; i++) {
            escapedParts += expectation.parts[i] instanceof Array
              ? classEscape(expectation.parts[i][0]) + "-" + classEscape(expectation.parts[i][1])
              : classEscape(expectation.parts[i]);
          }

          return "[" + (expectation.inverted ? "^" : "") + escapedParts + "]";
        },

        any: function(expectation) {
          return "any character";
        },

        end: function(expectation) {
          return "end of input";
        },

        other: function(expectation) {
          return expectation.description;
        }
      };

  function hex(ch) {
    return ch.charCodeAt(0).toString(16).toUpperCase();
  }

  function literalEscape(s) {
    return s
      .replace(/\\/g, '\\\\')
      .replace(/"/g,  '\\"')
      .replace(/\0/g, '\\0')
      .replace(/\t/g, '\\t')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/[\x00-\x0F]/g,          function(ch) { return '\\x0' + hex(ch); })
      .replace(/[\x10-\x1F\x7F-\x9F]/g, function(ch) { return '\\x'  + hex(ch); });
  }

  function classEscape(s) {
    return s
      .replace(/\\/g, '\\\\')
      .replace(/\]/g, '\\]')
      .replace(/\^/g, '\\^')
      .replace(/-/g,  '\\-')
      .replace(/\0/g, '\\0')
      .replace(/\t/g, '\\t')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/[\x00-\x0F]/g,          function(ch) { return '\\x0' + hex(ch); })
      .replace(/[\x10-\x1F\x7F-\x9F]/g, function(ch) { return '\\x'  + hex(ch); });
  }

  function describeExpectation(expectation) {
    return DESCRIBE_EXPECTATION_FNS[expectation.type](expectation);
  }

  function describeExpected(expected) {
    var descriptions = new Array(expected.length),
        i, j;

    for (i = 0; i < expected.length; i++) {
      descriptions[i] = describeExpectation(expected[i]);
    }

    descriptions.sort();

    if (descriptions.length > 0) {
      for (i = 1, j = 1; i < descriptions.length; i++) {
        if (descriptions[i - 1] !== descriptions[i]) {
          descriptions[j] = descriptions[i];
          j++;
        }
      }
      descriptions.length = j;
    }

    switch (descriptions.length) {
      case 1:
        return descriptions[0];

      case 2:
        return descriptions[0] + " or " + descriptions[1];

      default:
        return descriptions.slice(0, -1).join(", ")
          + ", or "
          + descriptions[descriptions.length - 1];
    }
  }

  function describeFound(found) {
    return found ? "\"" + literalEscape(found) + "\"" : "end of input";
  }

  return "Expected " + describeExpected(expected) + " but " + describeFound(found) + " found.";
};

function peg$parse(input, options) {
  options = options !== void 0 ? options : {};

  var peg$FAILED = {},

      peg$startRuleFunctions = { DOCUMENT: peg$parseDOCUMENT },
      peg$startRuleFunction  = peg$parseDOCUMENT,

      peg$c0 = function(h, s, f) {
        s.headers = h;
        s.comments = Object.entries(Comments).map(([loc, str]) => ({
          text: str,
          pos: parseInt(loc),
        }));

        if (s.functions) {
          s.functions = s.functions.concat(f);
        } else {
          s.functions = f;
        }

        return s;
      },
      peg$c1 = function(p, f, q, v) {
        return {
          token: 'query',
          prologue: p,
          body: q,
          inlineData: v,
          functions: f,
        }
      },
      peg$c2 = function(h, b) {
        return {
          token: 'function',
          header: h,
          body: b,
          location: location(),
        }
      },
      peg$c3 = "base",
      peg$c4 = peg$literalExpectation("BASE", true),
      peg$c5 = function(i) {
        return {
          token: 'base',
          value: i,
        }
      },
      peg$c6 = "prefix",
      peg$c7 = peg$literalExpectation("PREFIX", true),
      peg$c8 = function(p, l) {
        return {
          token: 'prefix',
          prefix: p,
          local: l,
        }
      },
      peg$c9 = function(s, gs, w, sm) {
        const dataset = { named: [], implicit: [] };
        gs.forEach((g) => {
          if (g.kind === 'default') {
            dataset.implicit.push(g.graph);
          } else {
            dataset.named.push(g.graph);
          }
        });

        if (dataset.named.length === 0 && dataset.implicit.length === 0) {
          dataset.implicit.push({
            token:'uri',
            location: null,
            prefix: null,
            suffix: null,
          });
        }

        return {
          token: 'executableunit',
          kind: 'select',
          dataset: dataset,
          projection: s.vars,
          modifier: s.modifier,
          pattern: w,
          limitoffset: sm.limitoffset,
          group: sm.group,
          having: sm.having,
          order: sm.order,
          location: location(),
        }
      },
      peg$c10 = function(s, w, sm, v) {
        return {
          token: 'subselect',
          kind: 'select',
          projection: s.vars,
          modifier: s.modifier,
          pattern: w,
          limitoffset: sm.limitoffset,
          group: sm.group,
          having: sm.having,
          order: sm.order,
          inlineData: v,
        };
      },
      peg$c11 = "select",
      peg$c12 = peg$literalExpectation("SELECT", true),
      peg$c13 = "distinct",
      peg$c14 = peg$literalExpectation("DISTINCT", true),
      peg$c15 = "reduced",
      peg$c16 = peg$literalExpectation("REDUCED", true),
      peg$c17 = "(",
      peg$c18 = peg$literalExpectation("(", false),
      peg$c19 = "as",
      peg$c20 = peg$literalExpectation("AS", true),
      peg$c21 = ")",
      peg$c22 = peg$literalExpectation(")", false),
      peg$c23 = "*",
      peg$c24 = peg$literalExpectation("*", false),
      peg$c25 = function(m, vs) {
        let vars;
        if (vs === '*') {
          vars = [{
            token: 'variable',
            kind: '*',
            location: location(),
          }];
        } else {
          vars = vs.map((v) => {
            if (v.length === 2) {
              return {
                token: 'variable',
                kind: 'var',
                value: v[1],
              };
            } else {
              return {
                token: 'variable',
                kind: 'aliased',
                expression: v[3],
                alias: v[7],
                location: location(),
              };
            }
          });
        }

        return {
          vars: vars,
          modifier: m?.toUpperCase(),
        };
      },
      peg$c26 = "construct",
      peg$c27 = peg$literalExpectation("CONSTRUCT", true),
      peg$c28 = function(t, gs, w, sm) {
        const dataset = { named:[], implicit:[] };
        gs.forEach((g) => {
          if (g.kind === 'default') {
            dataset.implicit.push(g.graph);
          } else {
            dataset.named.push(g.graph);
          }
        });

        if (dataset.named.length === 0 && dataset.implicit.length === 0) {
          dataset.implicit.push({
            token:'uri',
            prefix:null,
            suffix:null,
          });
        }
        
        return {
          kind: 'construct',
          token: 'executableunit',
          dataset: dataset,
          template: t,
          pattern: w,
          limitoffset: sm.limitoffset,
          order: sm.order,
          location: location(),
        };
      },
      peg$c29 = "where",
      peg$c30 = peg$literalExpectation("WHERE", true),
      peg$c31 = "{",
      peg$c32 = peg$literalExpectation("{", false),
      peg$c33 = "}",
      peg$c34 = peg$literalExpectation("}", false),
      peg$c35 = function(gs, t, sm) {
        let dataset = { named: [], implicit: [] };
        gs.forEach((g) => {
          if (g.kind === 'default') {
            dataset.implicit.push(g.graph);
          } else {
            dataset.named.push(g.graph)
          }
        });

        if (dataset.named.length === 0 && dataset.implicit.length === 0) {
          dataset.implicit.push({
            token:'uri',
            prefix:null,
            suffix:null,
          });
        }
        
        return {
          kind: 'construct',
          token: 'executableunit',
          dataset: dataset,
          pattern: t,
          limitoffset: sm.limitoffset,
          order: sm.order,
          location: location(),
        };
      },
      peg$c36 = "describe",
      peg$c37 = peg$literalExpectation("DESCRIBE", true),
      peg$c38 = function(v, gs, w, sm) {
        let dataset = { named: [], implicit: [] };
        gs.forEach((g) => {
          if (g.kind === 'default') {
            dataset.implicit.push(g.graph);
          } else {
            dataset.named.push(g.graph)
          }
        });

        return {
          token: 'executableunit',
          kind: 'describe',
          dataset: dataset,
          value: v,
          pattern: w,
          limitoffset: sm.limitoffset,
          order: sm.order,
          location: location(),
        }
      },
      peg$c39 = "ask",
      peg$c40 = peg$literalExpectation("ASK", true),
      peg$c41 = function(gs, w, sm) {
        const dataset = { named: [], implicit: [] };
        gs.forEach((g) => {
          if (g.kind === 'implicit') {
            dataset.implicit.push(g.graph);
          } else {
            dataset.named.push(g.graph);
          }
        });

        if (dataset.named.length === 0 && dataset.implicit.length === 0) {
          dataset.implicit.push({
            token:'uri',
            prefix:null,
            suffix:null,
          });
        }

        return {
          kind: 'ask',
          token: 'executableunit',
          dataset: dataset,
          pattern: w,
          limitoffset: sm.limitoffset,
          group: sm.group,
          order: sm.order,
          location: location(),
        }
      },
      peg$c42 = "from",
      peg$c43 = peg$literalExpectation("FROM", true),
      peg$c44 = function(gs) {
        return gs;
      },
      peg$c45 = function(s) {
        return {
          kind: 'default',
          token: 'graphClause',
          graph: s,
          location: location(),
        }
      },
      peg$c46 = "named",
      peg$c47 = peg$literalExpectation("NAMED", true),
      peg$c48 = function(s) {
        return {
          token: 'graphCluase',
          kind: 'named',
          graph: s,
          location: location(),
        };
      },
      peg$c49 = function(ggp) {
        return ggp;
      },
      peg$c50 = function(gc, h, oc, lo) {
        return {
          group: gc,
          having: h,
          order: oc,
          limitoffset: lo,
        }
      },
      peg$c51 = "group",
      peg$c52 = peg$literalExpectation("GROUP", true),
      peg$c53 = "by",
      peg$c54 = peg$literalExpectation("BY", true),
      peg$c55 = function(conds) {
        return conds;
      },
      peg$c56 = function(b) {
        return b;
      },
      peg$c57 = function(f) {
        return f;
      },
      peg$c58 = function(e, as) {
        if (as) {
          return {
            token: 'aliased_expression',
            expression: e,
            alias: as[2],
            location: location(),
          };
        } else {
          e.bracketted = 'true';
          return e;
        }
      },
      peg$c59 = function(v) {
        return v;
      },
      peg$c60 = "having",
      peg$c61 = peg$literalExpectation("HAVING", true),
      peg$c62 = function(h) {
        return h;
      },
      peg$c63 = "order",
      peg$c64 = peg$literalExpectation("ORDER", true),
      peg$c65 = function(os) {
        return os;
      },
      peg$c66 = "asc",
      peg$c67 = peg$literalExpectation("ASC", true),
      peg$c68 = "desc",
      peg$c69 = peg$literalExpectation("DESC", true),
      peg$c70 = function(direction, e) {
        return {
          direction: direction.toUpperCase(),
          expression: e
        };
      },
      peg$c71 = function(e) {
        if (e.token === 'var') {
          return {
            direction: 'ASC',
            expression: {
              value: e,
              token:'expression',
              expressionType:'atomic',
              primaryexpression: 'var',
              location: location(),
            }
          };
        } else {
          return {
            direction: 'ASC',
            expression: e,
          };
        }
      },
      peg$c72 = function(cls) {
        let acum = [cls[0]];
        if (cls[1]) {
          acum.push(cls[1]);
        }
        return acum;
      },
      peg$c73 = "limit",
      peg$c74 = peg$literalExpectation("LIMIT", true),
      peg$c75 = function(i) {
        return {
          limit: parseInt(i.value)
        };
      },
      peg$c76 = "offset",
      peg$c77 = peg$literalExpectation("OFFSET", true),
      peg$c78 = function(i) {
        return {
          offset: parseInt(i.value)
        };
      },
      peg$c79 = "values",
      peg$c80 = peg$literalExpectation("VALUES", true),
      peg$c81 = function(b) {
        if (b) {
          return b[1];
        } else {
          return null;
        }
      },
      peg$c82 = ";",
      peg$c83 = peg$literalExpectation(";", false),
      peg$c84 = function(p, u) {
        let query = {
          token: 'update',
          prologue: p,
          units: [],
        };
        
        if (u) {
          query.units = [u[1]];
          if (u[2]) {
            query.units = query.units.concat(u[2][3].units);
          }
        }

        return query;
      },
      peg$c85 = "load",
      peg$c86 = peg$literalExpectation("LOAD", true),
      peg$c87 = "silent",
      peg$c88 = peg$literalExpectation("SILENT", true),
      peg$c89 = "into",
      peg$c90 = peg$literalExpectation("INTO", true),
      peg$c91 = function(s, sg, dg) {
        let query = {
          kind: 'load',
          token: 'executableunit',
          silent: s,
          sourceGraph: sg,
        };
        if (dg) {
          query.destinyGraph = dg[2];
        }

        return query;
      },
      peg$c92 = "clear",
      peg$c93 = peg$literalExpectation("CLEAR", true),
      peg$c94 = function(s, ref) {
        return {
          token: 'executableunit',
          kind: 'clear',
          silent: s,
          destinyGraph: ref,
        }
      },
      peg$c95 = "drop",
      peg$c96 = peg$literalExpectation("DROP", true),
      peg$c97 = function(s, ref) {
        return {
          token: 'executableunit',
          kind: 'drop',
          silent: s,
          destinyGraph: ref,
        }
      },
      peg$c98 = "create",
      peg$c99 = peg$literalExpectation("CREATE", true),
      peg$c100 = function(s, ref) {
        return {
          token: 'executableunit',
          kind: 'create',
          silent: s,
          destinyGraph: ref,
        }
      },
      peg$c101 = "add",
      peg$c102 = peg$literalExpectation("ADD", true),
      peg$c103 = "to",
      peg$c104 = peg$literalExpectation("TO", true),
      peg$c105 = function(s, g1, g2) {
        return {
          token: 'executableunit',
          kind: 'add',
          silent: s,
          graphs: [g1, g2],
        }
      },
      peg$c106 = "move",
      peg$c107 = peg$literalExpectation("MOVE", true),
      peg$c108 = function(s, g1, g2) {
        return {
          token: 'executableunit',
          kind: 'move',
          silent: s,
          graphs: [g1, g2],
        }
      },
      peg$c109 = "copy",
      peg$c110 = peg$literalExpectation("COPY", true),
      peg$c111 = function(s, g1, g2) {
        return {
          token: 'executableunit',
          kind: 'copy',
          silent: s,
          graphs: [g1, g2],
        }
      },
      peg$c112 = "insert",
      peg$c113 = peg$literalExpectation("INSERT", true),
      peg$c114 = "data",
      peg$c115 = peg$literalExpectation("DATA", true),
      peg$c116 = function(qs) {
        return {
          token: 'executableunit',
          kind: 'insertdata',
          quads: qs,
        }
      },
      peg$c117 = "delete",
      peg$c118 = peg$literalExpectation("DELETE", true),
      peg$c119 = function(qs) {
        return {
          token: 'executableunit',
          kind: 'deletedata',
          quads: qs,
        }
      },
      peg$c120 = function(p) {
        return {
          kind: 'deletewhere',
          pattern: p,
        };
      },
      peg$c121 = "with",
      peg$c122 = peg$literalExpectation("WITH", true),
      peg$c123 = function(w, m, u, p) {
        let query = {
          kind: 'modify',
        };

        if (w) {
          query.with = w[2];
        }

        if (m.length === 3) {
          query.delete = m[0];
          if (m[2]) {
            query.insert = m[2];
          }
        } else {
          query.insert = m;
        }

        if (u.length) {
          query.using = u;
        }

        query.pattern = p;

        return query;
      },
      peg$c124 = function(q) {
        return q;
      },
      peg$c125 = "using",
      peg$c126 = peg$literalExpectation("USING", true),
      peg$c127 = function(g) {
        if (g.length != null) {
          return { kind: 'named', uri: g[2] };
        } else {
          return { kind: 'default', uri: g };
        }
      },
      peg$c128 = "default",
      peg$c129 = peg$literalExpectation("DEFAULT", true),
      peg$c130 = function() {
        return 'default';
      },
      peg$c131 = "graph",
      peg$c132 = peg$literalExpectation("GRAPH", true),
      peg$c133 = function(i) {
        return i;
      },
      peg$c134 = function(g) {
        return g;
      },
      peg$c135 = function() {
        return 'named';
      },
      peg$c136 = "all",
      peg$c137 = peg$literalExpectation("ALL", true),
      peg$c138 = function() {
        return 'all';
      },
      peg$c139 = ".",
      peg$c140 = peg$literalExpectation(".", false),
      peg$c141 = function(ts, qs) {
        let quads = [];
        if (ts) {
          quads = quads.concat(ts);
        }
        qs.forEach((q) => {
          quads = quads.concat(q[0]);
          if (q[2]) {
            quads = quads.concat(q[2]);
          }
        });

        return {
          token:'quads',
          triplesblock: quads,
          location: location(),
        }
      },
      peg$c142 = function(g, ts) {
        ts.graph = g;
        return ts;
      },
      peg$c143 = function(b, bs) {
        let triplesblock = [b];
        if (bs && bs[3]) {
          triplesblock = triplesblock.concat(bs[3].triplesblock);
        }

        return {
          token:'triplestemplate',
          triplesblock: triplesblock,
          location: location(),
        };
      },
      peg$c144 = function(p) {
        return p;
      },
      peg$c145 = function(tb, tbs) {
        let patterns = [];

        if (tb) {
          patterns.push(tb);
        }
        tbs.forEach((b) => {
          patterns.push(b[0]);
          if (b[4]) {
            patterns.push(b[4]);
          }
        });

        return {
          token: 'ggp',
          patterns: patterns,
          location: location(),
        }
      },
      peg$c146 = function(a, b) {
        let triplesblock = [a];
        if (b && b[3]) {
          triplesblock = triplesblock.concat(b[3].triplesblock);
        }

        return {
          token: 'triplesblock',
          triplesblock: triplesblock,
          location: location(),
        }
      },
      peg$c147 = "optional",
      peg$c148 = peg$literalExpectation("OPTIONAL", true),
      peg$c149 = function(v) {
        return {
          token: 'optionalgraphpattern',
          value: v,
          location: location(),
        }
      },
      peg$c150 = function(g, gg) {
        return {
          token: 'graphgraphpattern',
          graph: g,
          value: gg,
        }
      },
      peg$c151 = "SERVICE",
      peg$c152 = peg$literalExpectation("SERVICE", false),
      peg$c153 = function(s, v, ggp) {
        return {
          token: 'servicegraphpattern',
          value: [v, ggp],
          silent: s,
          location: location(),
        }
      },
      peg$c154 = "bind",
      peg$c155 = peg$literalExpectation("BIND", true),
      peg$c156 = function(ex, v) {
        return {
          token: 'bind',
          expression: ex,
          as: v,
          location: location(),
        };
      },
      peg$c157 = function(d) {
        return d;
      },
      peg$c158 = function(v, d) {
        return {
          token: 'inlineData',
          var: v,
          values: d,
          location: location(),
        };
      },
      peg$c159 = function(vars, vals) {
        return {
          token: 'inlineDataFull',
          variables: vars,
          values: vals,
          location: location(),
        };
      },
      peg$c160 = function(vs) {
        return vs;
      },
      peg$c161 = "UNDEF",
      peg$c162 = peg$literalExpectation("UNDEF", false),
      peg$c163 = "minus",
      peg$c164 = peg$literalExpectation("MINUS", true),
      peg$c165 = function(ggp) {
        return {
          token: 'minusgraphpattern',
          value: ggp,
          location: location(),
        }
      },
      peg$c166 = "union",
      peg$c167 = peg$literalExpectation("UNION", true),
      peg$c168 = function(a, b) {
        if (b.length) {
          return {
            token: 'unionpattern',
            value: [a].concat(b.map((elem) => elem[3])),
            location: location(),
          };
        } else {
          return a;
        }
      },
      peg$c169 = "filter",
      peg$c170 = peg$literalExpectation("FILTER", true),
      peg$c171 = function(c) {
        return {
          token: 'filter',
          value: c,
          location: location(),
        }
      },
      peg$c172 = function(i, args) {
        return {
          token: 'expression',
          expressionType: 'functioncall',
          iriref: i,
          args: args.value,
          location: location(),
        }
      },
      peg$c173 = function() {
        return {
          token: 'args',
          value: [],
        }
      },
      peg$c174 = ",",
      peg$c175 = peg$literalExpectation(",", false),
      peg$c176 = function(d, e, es) {
        return {
          token: 'args',
          distinct: Boolean(d),
          value: [e].concat(es.map((e) => e[2])),
        }
      },
      peg$c177 = function() {
        return [];
      },
      peg$c178 = function(e, es) {
        return [e].concat(es.map((e) => e[2]));
      },
      peg$c179 = function(ts) {
        return ts;
      },
      peg$c180 = function(b, bs) {
        let triplesblock = [b];
        if (bs && bs[3]) {
          triplesblock = triplesblock.concat(bs[3].triplesblock);
        }

        return {
          token:'triplestemplate',
          triplesblock: triplesblock,
          location: location(),
        }
      },
      peg$c181 = function(s, pairs) {
        return {
          token: 'triplessamesubject',
          chainSubject: s,
          propertylist: pairs,
        }
      },
      peg$c182 = function(tn, pairs) {
        return {
          token: 'triplessamesubject',
          chainSubject: tn,
          propertylist: pairs,
        }
      },
      peg$c183 = function(v, ol, rest) {
        let pairs = [];
        pairs.push([v, ol]);
        rest.forEach((r) => {
          if (r[3]) {
            pairs.push([r[3][0], r[3][2]]);
          }
        });

        return {
          token: 'propertylist',
          pairs: pairs,
        };
      },
      peg$c184 = "a",
      peg$c185 = peg$literalExpectation("a", false),
      peg$c186 = function() {
        return {
          token: 'uri',
          prefix: null,
          suffix: null,
          value: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
          location: location(),
        }
      },
      peg$c187 = function(o, os) {
        let ret = [o];

        os.forEach((oi) => {
          ret.push(oi[3]);
        });

        return ret;
      },
      peg$c188 = function(s, list) {
        return {
          token: 'triplessamesubject',
          chainSubject: s,
          propertylist: list,
        }
      },
      peg$c189 = function(tn, pairs) {
        return {
          token: 'triplessamesubject',
          chainSubject: tn,
          propertylist: pairs,
        };
      },
      peg$c190 = "|",
      peg$c191 = peg$literalExpectation("|", false),
      peg$c192 = function(first, rest) {
        if (rest.length) {
          let arr = [first];
          for (let i = 0; i < rest.length; i++) {
            arr.push(rest[i][3]);
          }

          return {
            token: 'path',
            kind: 'alternative',
            value: arr,
            location: location(),
          };
        } else {
          return first;
        }
      },
      peg$c193 = "/",
      peg$c194 = peg$literalExpectation("/", false),
      peg$c195 = function(first, rest) {
        if (rest.length) {
          let arr = [first];
          for (let i = 0; i < rest.length; i++) {
            arr.push(rest[i][3]);
          }

          return {
            token: 'path',
            kind: 'sequence',
            value: arr,
            location: location(),
          };
        } else {
          return first;
        }
      },
      peg$c196 = function(p, m) {
        if (p.token === 'path') {
          p.modifier = m;
          return p;
        } else {
          return {
            token: 'path',
            value: p,
            modifier: m,
          }
        }
      },
      peg$c197 = "^",
      peg$c198 = peg$literalExpectation("^", false),
      peg$c199 = function(elt) {
        elt.kind = 'inversePath';
        return elt;
      },
      peg$c200 = "?",
      peg$c201 = peg$literalExpectation("?", false),
      peg$c202 = "+",
      peg$c203 = peg$literalExpectation("+", false),
      peg$c204 = "!",
      peg$c205 = peg$literalExpectation("!", false),
      peg$c206 = function(p) {
        p.bracketted = true;
        return p;
      },
      peg$c207 = function(c) {
        return {
          token: 'triplesnodecollection',
          collection: c,
          location: location(),
        };
      },
      peg$c208 = "[",
      peg$c209 = peg$literalExpectation("[", false),
      peg$c210 = "]",
      peg$c211 = peg$literalExpectation("]", false),
      peg$c212 = function(pl) {
        return {
          token: 'triplesnode',
          pairs: pl,
          location: location(),
        };
      },
      peg$c213 = function(gn) {
        return gn;
      },
      peg$c214 = function(v) {
        return {
          token: 'var',
          prefix: v.prefix,
          value: v.value,
          location: location(),
        }
      },
      peg$c215 = "||",
      peg$c216 = peg$literalExpectation("||", false),
      peg$c217 = function(v, vs) {
        if (vs.length) {
          return {
            token: 'expression',
            expressionType: 'conditionalor',
            operands: [v].concat(vs.map(op => op[3])),
          };
        } else {
          return v;
        }
      },
      peg$c218 = "&&",
      peg$c219 = peg$literalExpectation("&&", false),
      peg$c220 = function(v, vs) {
        if (vs.length) {
          return {
            token: 'expression',
            expressionType: 'conditionaland',
            operands: [v].concat(vs.map(op => op[3])),
          };
        } else {
          return v;
        }
      },
      peg$c221 = "=",
      peg$c222 = peg$literalExpectation("=", false),
      peg$c223 = "!=",
      peg$c224 = peg$literalExpectation("!=", false),
      peg$c225 = "<",
      peg$c226 = peg$literalExpectation("<", false),
      peg$c227 = ">",
      peg$c228 = peg$literalExpectation(">", false),
      peg$c229 = "<=",
      peg$c230 = peg$literalExpectation("<=", false),
      peg$c231 = ">=",
      peg$c232 = peg$literalExpectation(">=", false),
      peg$c233 = "in",
      peg$c234 = peg$literalExpectation("IN", true),
      peg$c235 = "not",
      peg$c236 = peg$literalExpectation("NOT", true),
      peg$c237 = function(e1, e2) {
        if (e2.length) {
          const o1 = e1;
          let op = e2[0][1].toUpperCase();
          let o2 = e2[0][3];
          if (op === 'NOT') {
            op += ' ' + e2[0][3].toUpperCase();
            o2 = e2[0][5];
          }

          return {
            token: 'expression',
            expressionType: 'relationalexpression',
            operator: op,
            op1: o1,
            op2: o2,
          }
        } else {
          return e1;
        }
      },
      peg$c238 = "-",
      peg$c239 = peg$literalExpectation("-", false),
      peg$c240 = function(op1, ops) {
        if (ops.length === 0) {
          return op1;
        }

        let arr = [];
        ops.forEach((op) => {
          if (op.length == 4) {
            arr.push({
              operator: op[1],
              expression: op[3],
            });
          }
        });

        return {
          token: 'expression',
          expressionType: 'additiveexpression',
          op1: op1,
          ops: arr,
        };
      },
      peg$c241 = function(e1, es) {
        if (es.length) {
          return {
            token: 'expression',
            expressionType: 'multiplicativeexpression',
            factor: e1,
            factors: es.map((e) => ({ operator: e[1], expression: e[3] })),
          };
        } else {
          return e1;
        }
      },
      peg$c242 = function(e) {
        return {
          token: 'expression',
          expressionType: 'unaryexpression',
          unaryexpression: '!',
          expression: e,
        }
      },
      peg$c243 = function(v) {
        return {
          token: 'expression',
          expressionType: 'unaryexpression',
          unaryexpression: '+',
          expression: v,
        }
      },
      peg$c244 = function(v) {
        return {
          token: 'expression',
          expressionType: 'unaryexpression',
          unaryexpression: '-',
          expression: v,
        }
      },
      peg$c245 = function(v) {
        return {
          token: 'expression',
          expressionType: 'atomic',
          primaryexpression: 'rdfliteral',
          value: v,
        }
      },
      peg$c246 = function(v) {
        return {
          token: 'expression',
          expressionType: 'atomic',
          primaryexpression: 'numericliteral',
          value: v,
        }
      },
      peg$c247 = function(v) {
        return {
          token: 'expression',
          expressionType: 'atomic',
          primaryexpression: 'booleanliteral',
          value: v,
        }
      },
      peg$c248 = function(v) {
        return {
          token: 'expression',
          expressionType: 'atomic',
          primaryexpression: 'var',
          value: v,
        }
      },
      peg$c249 = function(e) {
        e.bracketted = 'true';
        return e;
      },
      peg$c250 = "str",
      peg$c251 = peg$literalExpectation("STR", true),
      peg$c252 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'str',
          args: [e],
        }
      },
      peg$c253 = "lang",
      peg$c254 = peg$literalExpectation("LANG", true),
      peg$c255 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'lang',
          args: [e],
        }
      },
      peg$c256 = "langmatches",
      peg$c257 = peg$literalExpectation("LANGMATCHES", true),
      peg$c258 = function(e1, e2) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'langMatches',
          args: [e1, e2],
        }
      },
      peg$c259 = "datatype",
      peg$c260 = peg$literalExpectation("DATATYPE", true),
      peg$c261 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'datatype',
          args: [e],
        }
      },
      peg$c262 = "bound",
      peg$c263 = peg$literalExpectation("BOUND", true),
      peg$c264 = function(v) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'bound',
          args: [v],
        }
      },
      peg$c265 = "iri",
      peg$c266 = peg$literalExpectation("IRI", true),
      peg$c267 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'IRI',
          args: [e],
        }
      },
      peg$c268 = "uri",
      peg$c269 = peg$literalExpectation("URI", true),
      peg$c270 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'URI',
          args: [e],
        }
      },
      peg$c271 = "bnode",
      peg$c272 = peg$literalExpectation("BNODE", true),
      peg$c273 = function(arg) {
        const ret = {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'BNODE',
          args: null,
        };
        if (arg.length === 5) {
          ret.args = [arg[2]];
        }

        return ret;
      },
      peg$c274 = "rand",
      peg$c275 = peg$literalExpectation("RAND", true),
      peg$c276 = function() {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'rand',
        }
      },
      peg$c277 = "abs",
      peg$c278 = peg$literalExpectation("ABS", true),
      peg$c279 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'abs',
          args: [e],
        }
      },
      peg$c280 = "ceil",
      peg$c281 = peg$literalExpectation("CEIL", true),
      peg$c282 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'ceil',
          args: [e],
        }
      },
      peg$c283 = "floor",
      peg$c284 = peg$literalExpectation("FLOOR", true),
      peg$c285 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'floor',
          args: [e],
        }
      },
      peg$c286 = "round",
      peg$c287 = peg$literalExpectation("ROUND", true),
      peg$c288 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'round',
          args: [e],
        }
      },
      peg$c289 = "concat",
      peg$c290 = peg$literalExpectation("CONCAT", true),
      peg$c291 = function(args) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'CONCAT',
          args: args,
        }
      },
      peg$c292 = "strlen",
      peg$c293 = peg$literalExpectation("STRLEN", true),
      peg$c294 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'STRLEN',
          args: [e],
        }
      },
      peg$c295 = "ucase",
      peg$c296 = peg$literalExpectation("UCASE", true),
      peg$c297 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'UCASE',
          args: [e],
        }
      },
      peg$c298 = "lcase",
      peg$c299 = peg$literalExpectation("LCASE", true),
      peg$c300 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'LCASE',
          args: [e],
        }
      },
      peg$c301 = "encode_for_uri",
      peg$c302 = peg$literalExpectation("ENCODE_FOR_URI", true),
      peg$c303 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'ENCODE_FOR_URI',
          args: [e],
        }
      },
      peg$c304 = "contains",
      peg$c305 = peg$literalExpectation("CONTAINS", true),
      peg$c306 = function(e1, e2) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'CONTAINS',
          args: [e1, e2],
        }
      },
      peg$c307 = "strbefore",
      peg$c308 = peg$literalExpectation("STRBEFORE", true),
      peg$c309 = function(e1, e2) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'STRBEFORE',
          args: [e1, e2],
        }
      },
      peg$c310 = "strstarts",
      peg$c311 = peg$literalExpectation("STRSTARTS", true),
      peg$c312 = function(e1, e2) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'STRSTARTS',
          args: [e1, e2],
        }
      },
      peg$c313 = "strends",
      peg$c314 = peg$literalExpectation("STRENDS", true),
      peg$c315 = function(e1, e2) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'STRENDS',
          args: [e1, e2],
        }
      },
      peg$c316 = "strafter",
      peg$c317 = peg$literalExpectation("STRAFTER", true),
      peg$c318 = function(e1, e2) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'STRAFTER',
          args: [e1, e2],
        }
      },
      peg$c319 = "year",
      peg$c320 = peg$literalExpectation("YEAR", true),
      peg$c321 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'year',
          args: [e],
        }
      },
      peg$c322 = "month",
      peg$c323 = peg$literalExpectation("MONTH", true),
      peg$c324 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'month',
          args: [e],
        }
      },
      peg$c325 = "day",
      peg$c326 = peg$literalExpectation("DAY", true),
      peg$c327 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'day',
          args: [e],
        }
      },
      peg$c328 = "hours",
      peg$c329 = peg$literalExpectation("HOURS", true),
      peg$c330 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'hours',
          args: [e],
        }
      },
      peg$c331 = "minutes",
      peg$c332 = peg$literalExpectation("MINUTES", true),
      peg$c333 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'minutes',
          args: [e],
        }
      },
      peg$c334 = "seconds",
      peg$c335 = peg$literalExpectation("SECONDS", true),
      peg$c336 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'seconds',
          args: [e],
        }
      },
      peg$c337 = "timezone",
      peg$c338 = peg$literalExpectation("TIMEZONE", true),
      peg$c339 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'timezone',
          args: [e],
        }
      },
      peg$c340 = "tz",
      peg$c341 = peg$literalExpectation("TZ", true),
      peg$c342 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'tz',
          args: [e],
        }
      },
      peg$c343 = "now",
      peg$c344 = peg$literalExpectation("NOW", true),
      peg$c345 = function() {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'now',
        }
      },
      peg$c346 = "uuid",
      peg$c347 = peg$literalExpectation("UUID", true),
      peg$c348 = function() {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'UUID',
        }
      },
      peg$c349 = "struuid",
      peg$c350 = peg$literalExpectation("STRUUID", true),
      peg$c351 = function() {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'STRUUID',
        }
      },
      peg$c352 = "md5",
      peg$c353 = peg$literalExpectation("MD5", true),
      peg$c354 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'MD5',
          args: [e],
        }
      },
      peg$c355 = "sha1",
      peg$c356 = peg$literalExpectation("SHA1", true),
      peg$c357 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'SHA1',
          args: [e],
        }
      },
      peg$c358 = "sha256",
      peg$c359 = peg$literalExpectation("SHA256", true),
      peg$c360 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'SHA256',
          args: [e],
        }
      },
      peg$c361 = "sha384",
      peg$c362 = peg$literalExpectation("SHA384", true),
      peg$c363 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'SHA384',
          args: [e],
        }
      },
      peg$c364 = "sha512",
      peg$c365 = peg$literalExpectation("SHA512", true),
      peg$c366 = function(e) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'SHA512',
          args: [e],
        }
      },
      peg$c367 = "coalesce",
      peg$c368 = peg$literalExpectation("COALESCE", true),
      peg$c369 = function(args) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'COALESCE',
          args: args,
        }
      },
      peg$c370 = "if",
      peg$c371 = peg$literalExpectation("IF", true),
      peg$c372 = function(test, trueCond, falseCond) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'IF',
          args: [test, trueCond, falseCond],
        }
      },
      peg$c373 = "strlang",
      peg$c374 = peg$literalExpectation("STRLANG", true),
      peg$c375 = function(e1, e2) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'STRLANG',
          args: [e1, e2],
        }
      },
      peg$c376 = "strdt",
      peg$c377 = peg$literalExpectation("STRDT", true),
      peg$c378 = function(e1, e2) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'STRDT',
          args: [e1, e2],
        }
      },
      peg$c379 = "sameterm",
      peg$c380 = peg$literalExpectation("sameTerm", true),
      peg$c381 = function(e1, e2) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'sameTerm',
          args: [e1, e2],
        }
      },
      peg$c382 = "isuri",
      peg$c383 = peg$literalExpectation("isURI", true),
      peg$c384 = "isiri",
      peg$c385 = peg$literalExpectation("isIRI", true),
      peg$c386 = function(arg) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'isURI',
          args: [arg],
        }
      },
      peg$c387 = "isblank",
      peg$c388 = peg$literalExpectation("isBLANK", true),
      peg$c389 = function(arg) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'isBlank',
          args: [arg],
        }
      },
      peg$c390 = "isliteral",
      peg$c391 = peg$literalExpectation("isLITERAL", true),
      peg$c392 = function(arg) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'isLiteral',
          args: [arg],
        }
      },
      peg$c393 = "isnumeric",
      peg$c394 = peg$literalExpectation("isNUMERIC", true),
      peg$c395 = function(arg) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'isNumeric',
          args: [arg],
        }
      },
      peg$c396 = "custom:",
      peg$c397 = peg$literalExpectation("custom:", true),
      peg$c398 = /^[a-zA-Z0-9_]/,
      peg$c399 = peg$classExpectation([["a", "z"], ["A", "Z"], ["0", "9"], "_"], false, false),
      peg$c400 = function(fnname, alter, finalarg) {
        let ret = {
          token: 'expression',
          expressionType: 'custom',
          name: fnname.join(''),
        };

        let acum = [];
        for (let i = 0; i < alter.length; i++) {
          acum.push(alter[i][1]);
        }
        acum.push(finalarg);
        ret.args = acum;

        return ret;
      },
      peg$c401 = "regex",
      peg$c402 = peg$literalExpectation("REGEX", true),
      peg$c403 = function(e1, e2, e3) {
        return {
          token: 'expression',
          expressionType: 'regex',
          text: e1,
          pattern: e2,
          flags: e3 ? e3[2] : null,
        }
      },
      peg$c404 = "substr",
      peg$c405 = peg$literalExpectation("SUBSTR", true),
      peg$c406 = function(e1, e2, e3) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'substr',
          args: [
            e1,
            e2,
            e3 ? e3[2] : null
          ]
        }
      },
      peg$c407 = "replace",
      peg$c408 = peg$literalExpectation("REPLACE", true),
      peg$c409 = function(e1, e2, e3, e4) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'replace',
          args: [
            e1,
            e2,
            e3,
            e4 ? e4[2] : null
          ]
        }
      },
      peg$c410 = "exists",
      peg$c411 = peg$literalExpectation("EXISTS", true),
      peg$c412 = function(ggp) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'exists',
          args: [ggp],
        }
      },
      peg$c413 = function(ggp) {
        return {
          token: 'expression',
          expressionType: 'builtincall',
          builtincall: 'notexists',
          args: [ggp],
        }
      },
      peg$c414 = "count",
      peg$c415 = peg$literalExpectation("COUNT", true),
      peg$c416 = function(d, e) {
        return {
          token: 'expression',
          expressionType: 'aggregate',
          aggregateType: 'count',
          distinct: Boolean(d),
          expression: e,
        }
      },
      peg$c417 = "sum",
      peg$c418 = peg$literalExpectation("SUM", true),
      peg$c419 = function(d, e) {
        return {
          token: 'expression',
          expressionType: 'aggregate',
          aggregateType: 'sum',
          distinct: Boolean(d),
          expression: e,
        }
      },
      peg$c420 = "min",
      peg$c421 = peg$literalExpectation("MIN", true),
      peg$c422 = function(d, e) {
        return {
          token: 'expression',
          expressionType: 'aggregate',
          aggregateType: 'min',
          distinct: Boolean(d),
          expression: e,
        }
      },
      peg$c423 = "max",
      peg$c424 = peg$literalExpectation("MAX", true),
      peg$c425 = function(d, e) {
        return {
          token: 'expression',
          expressionType: 'aggregate',
          aggregateType: 'max',
          distinct: Boolean(d),
          expression: e,
        }
      },
      peg$c426 = "avg",
      peg$c427 = peg$literalExpectation("AVG", true),
      peg$c428 = function(d, e) {
        return {
          token: 'expression',
          expressionType: 'aggregate',
          aggregateType: 'avg',
          distinct: Boolean(d),
          expression: e,
        }
      },
      peg$c429 = "sample",
      peg$c430 = peg$literalExpectation("SAMPLE", true),
      peg$c431 = function(d, e) {
        return {
          token: 'expression',
          expressionType: 'aggregate',
          aggregateType: 'sample',
          distinct: Boolean(d),
          expression: e,
        }
      },
      peg$c432 = "group_concat",
      peg$c433 = peg$literalExpectation("GROUP_CONCAT", true),
      peg$c434 = "separator",
      peg$c435 = peg$literalExpectation("SEPARATOR", true),
      peg$c436 = function(d, e, s) {
        let sep = null;
        if (s.length) {
          sep = s[7];
        }

        return {
          token: 'expression',
          expressionType: 'aggregate',
          aggregateType: 'group_concat',
          expression: e,
          separator: sep,
          distinct: Boolean(d),
        }
      },
      peg$c437 = function(i, args) {
        return {
          token: 'expression',
          expressionType: 'irireforfunction',
          iriref: i,
          args: (args != null ? args.value : args),
        };
      },
      peg$c438 = "^^",
      peg$c439 = peg$literalExpectation("^^", false),
      peg$c440 = function(s, e) {
        let ret = {
          token:'literal',
          quote: s.quote,
          value: s.value,
        };

        if (typeof(e) === 'string') {
          ret.lang = e;
        } else if (e) {
          ret.type = e[1];
        }

        ret.location = location();
        return ret;
      },
      peg$c441 = "true",
      peg$c442 = peg$literalExpectation("TRUE", true),
      peg$c443 = function() {
        return {
          token: 'literal',
          value: true,
          type: 'http://www.w3.org/2001/XMLSchema#boolean',
        }
      },
      peg$c444 = "false",
      peg$c445 = peg$literalExpectation("FALSE", true),
      peg$c446 = function() {
        return {
          token: 'literal',
          value: false,
          type: 'http://www.w3.org/2001/XMLSchema#boolean',
        }
      },
      peg$c447 = function(iri) {
        return {
          token: 'uri',
          prefix: null,
          suffix: null,
          value: iri,
          location: location(),
        }
      },
      peg$c448 = function(p) {
        return p
      },
      peg$c449 = function(p) {
        return {
          token: 'uri',
          prefix: p[0],
          suffix: p[1],
          value: null,
          location: location(),
        }
      },
      peg$c450 = function(p) {
        return {
          token: 'uri',
          prefix: p,
          suffix: '',
          value: null,
          location: location(),
        }
      },
      peg$c451 = function(l) {
        return {
          token: 'blank',
          value: l,
          location: location(),
        }
      },
      peg$c452 = function() { 
        return {
          token: 'blank',
          location: location(),
        }
      },
      peg$c453 = /^[^<>"{}|\^`\\]/,
      peg$c454 = peg$classExpectation(["<", ">", "\"", "{", "}", "|", "^", "`", "\\"], true, false),
      peg$c455 = function(i) {
        return i.join('')
      },
      peg$c456 = ":",
      peg$c457 = peg$literalExpectation(":", false),
      peg$c458 = function(p, s) {
        return [p, s]
      },
      peg$c459 = "_:",
      peg$c460 = peg$literalExpectation("_:", false),
      peg$c461 = /^[0-9]/,
      peg$c462 = peg$classExpectation([["0", "9"]], false, false),
      peg$c463 = function() {
        return text();
      },
      peg$c464 = function(v) {
        return {
          prefix: '?',
          value: v,
        }
      },
      peg$c465 = "$",
      peg$c466 = peg$literalExpectation("$", false),
      peg$c467 = function(v) {
        return {
          prefix: '$',
          value: v,
        }
      },
      peg$c468 = "{{",
      peg$c469 = peg$literalExpectation("{{", false),
      peg$c470 = "}}",
      peg$c471 = peg$literalExpectation("}}", false),
      peg$c472 = function(v) {
        return {
          prefix: 'mustash',
          value: v,
        }
      },
      peg$c473 = "@",
      peg$c474 = peg$literalExpectation("@", false),
      peg$c475 = /^[a-zA-Z]/,
      peg$c476 = peg$classExpectation([["a", "z"], ["A", "Z"]], false, false),
      peg$c477 = /^[a-zA-Z0-9]/,
      peg$c478 = peg$classExpectation([["a", "z"], ["A", "Z"], ["0", "9"]], false, false),
      peg$c479 = function(a, b) {
        let lang = a.join('');

        if (b.length) {
          lang += '-' + b[0][1].join('');
        }

        return lang.toLowerCase();
      },
      peg$c480 = function() {
        return {
          token: 'literal',
          value: text(),
          type: 'http://www.w3.org/2001/XMLSchema#integer',
        }
      },
      peg$c481 = function() {
        return {
          token: 'literal',
          value: text(),
          type: 'http://www.w3.org/2001/XMLSchema#decimal',
        }
      },
      peg$c482 = function() {
        return {
          token: 'literal',
          value: text(),
          type: 'http://www.w3.org/2001/XMLSchema#double',
        }
      },
      peg$c483 = function(d) {
        d.value = '+' + d.value;
        return d;
      },
      peg$c484 = function(d) {
        d.value = '-' + d.value;
        return d;
      },
      peg$c485 = /^[eE]/,
      peg$c486 = peg$classExpectation(["e", "E"], false, false),
      peg$c487 = /^[+\-]/,
      peg$c488 = peg$classExpectation(["+", "-"], false, false),
      peg$c489 = "'",
      peg$c490 = peg$literalExpectation("'", false),
      peg$c491 = /^[^'\\\n\r]/,
      peg$c492 = peg$classExpectation(["'", "\\", "\n", "\r"], true, false),
      peg$c493 = function(s) {
        return {
          token: 'string',
          quote: "'",
          value: s.join(''), // except ' \ LF CR
        };
      },
      peg$c494 = "\"",
      peg$c495 = peg$literalExpectation("\"", false),
      peg$c496 = /^[^"\\\n\r]/,
      peg$c497 = peg$classExpectation(["\"", "\\", "\n", "\r"], true, false),
      peg$c498 = function(s) {
        return {
          token: 'string',
          quote: '"',
          value: s.join(''), // except " \ LF CR
        };
      },
      peg$c499 = "'''",
      peg$c500 = peg$literalExpectation("'''", false),
      peg$c501 = "''",
      peg$c502 = peg$literalExpectation("''", false),
      peg$c503 = /^[^'\\]/,
      peg$c504 = peg$classExpectation(["'", "\\"], true, false),
      peg$c505 = function(s) {
        return {
          token: 'string',
          quote: "'''",
          value: s.map((c) => {
            if (c[0]) {
              return c[0] + c[1];
            } else {
              return c[1];
            }
          }).join(''),
        };
      },
      peg$c506 = "\"\"\"",
      peg$c507 = peg$literalExpectation("\"\"\"", false),
      peg$c508 = "\"\"",
      peg$c509 = peg$literalExpectation("\"\"", false),
      peg$c510 = /^[^"\\]/,
      peg$c511 = peg$classExpectation(["\"", "\\"], true, false),
      peg$c512 = function(s) {

        return {
          token: 'string',
          quote: '"""',
          value: s.map((c) => {
            if (c[0]) {
              return c[0] + c[1];
            } else {
              return c[1];
            }
          }).join(''),
        }
      },
      peg$c513 = "\\",
      peg$c514 = peg$literalExpectation("\\", false),
      peg$c515 = /^[tbnrf\\"']/,
      peg$c516 = peg$classExpectation(["t", "b", "n", "r", "f", "\\", "\"", "'"], false, false),
      peg$c517 = function() {
        return {
          token: 'triplesnodecollection',
          chainSubject: [{
            token: 'uri',
            value: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil',
          }],
          location: location(),
        };
      },
      peg$c518 = /^[ \t]/,
      peg$c519 = peg$classExpectation([" ", "\t"], false, false),
      peg$c520 = /^[\n\r]/,
      peg$c521 = peg$classExpectation(["\n", "\r"], false, false),
      peg$c522 = /^[^\n\r]/,
      peg$c523 = peg$classExpectation(["\n", "\r"], true, false),
      peg$c524 = "#",
      peg$c525 = peg$literalExpectation("#", false),
      peg$c526 = function() {
        Comments[location().start.offset] = text();

        return '';
      },
      peg$c527 = /^[A-Z]/,
      peg$c528 = peg$classExpectation([["A", "Z"]], false, false),
      peg$c529 = /^[a-z]/,
      peg$c530 = peg$classExpectation([["a", "z"]], false, false),
      peg$c531 = /^[\xC0-\xD6]/,
      peg$c532 = peg$classExpectation([["\xC0", "\xD6"]], false, false),
      peg$c533 = /^[\xD8-\xF6]/,
      peg$c534 = peg$classExpectation([["\xD8", "\xF6"]], false, false),
      peg$c535 = /^[\xF8-\u02FF]/,
      peg$c536 = peg$classExpectation([["\xF8", "\u02FF"]], false, false),
      peg$c537 = /^[\u0370-\u037D]/,
      peg$c538 = peg$classExpectation([["\u0370", "\u037D"]], false, false),
      peg$c539 = /^[\u037F-\u1FFF]/,
      peg$c540 = peg$classExpectation([["\u037F", "\u1FFF"]], false, false),
      peg$c541 = /^[\u200C-\u200D]/,
      peg$c542 = peg$classExpectation([["\u200C", "\u200D"]], false, false),
      peg$c543 = /^[\u2070-\u218F]/,
      peg$c544 = peg$classExpectation([["\u2070", "\u218F"]], false, false),
      peg$c545 = /^[\u2C00-\u2FEF]/,
      peg$c546 = peg$classExpectation([["\u2C00", "\u2FEF"]], false, false),
      peg$c547 = /^[\u3001-\uD7FF]/,
      peg$c548 = peg$classExpectation([["\u3001", "\uD7FF"]], false, false),
      peg$c549 = /^[\uF900-\uFDCF]/,
      peg$c550 = peg$classExpectation([["\uF900", "\uFDCF"]], false, false),
      peg$c551 = /^[\uFDF0-\uFFFD]/,
      peg$c552 = peg$classExpectation([["\uFDF0", "\uFFFD"]], false, false),
      peg$c553 = /^[\u1000-\uEFFF]/,
      peg$c554 = peg$classExpectation([["\u1000", "\uEFFF"]], false, false),
      peg$c555 = "_",
      peg$c556 = peg$literalExpectation("_", false),
      peg$c557 = /^[\xB7]/,
      peg$c558 = peg$classExpectation(["\xB7"], false, false),
      peg$c559 = /^[\u0300-\u036F]/,
      peg$c560 = peg$classExpectation([["\u0300", "\u036F"]], false, false),
      peg$c561 = /^[\u203F-\u2040]/,
      peg$c562 = peg$classExpectation([["\u203F", "\u2040"]], false, false),
      peg$c563 = "%",
      peg$c564 = peg$literalExpectation("%", false),
      peg$c565 = /^[A-F]/,
      peg$c566 = peg$classExpectation([["A", "F"]], false, false),
      peg$c567 = /^[a-f]/,
      peg$c568 = peg$classExpectation([["a", "f"]], false, false),
      peg$c569 = "~",
      peg$c570 = peg$literalExpectation("~", false),
      peg$c571 = "&",
      peg$c572 = peg$literalExpectation("&", false),

      peg$currPos          = 0,
      peg$savedPos         = 0,
      peg$posDetailsCache  = [{ line: 1, column: 1 }],
      peg$maxFailPos       = 0,
      peg$maxFailExpected  = [],
      peg$silentFails      = 0,

      peg$result;

  if ("startRule" in options) {
    if (!(options.startRule in peg$startRuleFunctions)) {
      throw new Error("Can't start parsing from rule \"" + options.startRule + "\".");
    }

    peg$startRuleFunction = peg$startRuleFunctions[options.startRule];
  }

  function text() {
    return input.substring(peg$savedPos, peg$currPos);
  }

  function location() {
    return peg$computeLocation(peg$savedPos, peg$currPos);
  }

  function expected(description, location) {
    location = location !== void 0 ? location : peg$computeLocation(peg$savedPos, peg$currPos)

    throw peg$buildStructuredError(
      [peg$otherExpectation(description)],
      input.substring(peg$savedPos, peg$currPos),
      location
    );
  }

  function error(message, location) {
    location = location !== void 0 ? location : peg$computeLocation(peg$savedPos, peg$currPos)

    throw peg$buildSimpleError(message, location);
  }

  function peg$literalExpectation(text, ignoreCase) {
    return { type: "literal", text: text, ignoreCase: ignoreCase };
  }

  function peg$classExpectation(parts, inverted, ignoreCase) {
    return { type: "class", parts: parts, inverted: inverted, ignoreCase: ignoreCase };
  }

  function peg$anyExpectation() {
    return { type: "any" };
  }

  function peg$endExpectation() {
    return { type: "end" };
  }

  function peg$otherExpectation(description) {
    return { type: "other", description: description };
  }

  function peg$computePosDetails(pos) {
    var details = peg$posDetailsCache[pos], p;

    if (details) {
      return details;
    } else {
      p = pos - 1;
      while (!peg$posDetailsCache[p]) {
        p--;
      }

      details = peg$posDetailsCache[p];
      details = {
        line:   details.line,
        column: details.column
      };

      while (p < pos) {
        if (input.charCodeAt(p) === 10) {
          details.line++;
          details.column = 1;
        } else {
          details.column++;
        }

        p++;
      }

      peg$posDetailsCache[pos] = details;
      return details;
    }
  }

  function peg$computeLocation(startPos, endPos) {
    var startPosDetails = peg$computePosDetails(startPos),
        endPosDetails   = peg$computePosDetails(endPos);

    return {
      start: {
        offset: startPos,
        line:   startPosDetails.line,
        column: startPosDetails.column
      },
      end: {
        offset: endPos,
        line:   endPosDetails.line,
        column: endPosDetails.column
      }
    };
  }

  function peg$fail(expected) {
    if (peg$currPos < peg$maxFailPos) { return; }

    if (peg$currPos > peg$maxFailPos) {
      peg$maxFailPos = peg$currPos;
      peg$maxFailExpected = [];
    }

    peg$maxFailExpected.push(expected);
  }

  function peg$buildSimpleError(message, location) {
    return new peg$SyntaxError(message, null, null, location);
  }

  function peg$buildStructuredError(expected, found, location) {
    return new peg$SyntaxError(
      peg$SyntaxError.buildMessage(expected, found),
      expected,
      found,
      location
    );
  }

  function peg$parseDOCUMENT() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseHEADER_LINE();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseHEADER_LINE();
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseSPARQL();
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseFunction();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseFunction();
            }
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c0(s1, s3, s5);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseSPARQL() {
    var s0;

    s0 = peg$parseQuery();
    if (s0 === peg$FAILED) {
      s0 = peg$parseUpdate();
    }

    return s0;
  }

  function peg$parseQuery() {
    var s0, s1, s2, s3, s4, s5, s6;

    s0 = peg$currPos;
    s1 = peg$parsePrologue();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseFunction();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseFunction();
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseSelectQuery();
            if (s5 === peg$FAILED) {
              s5 = peg$parseConstructQuery();
              if (s5 === peg$FAILED) {
                s5 = peg$parseDescribeQuery();
                if (s5 === peg$FAILED) {
                  s5 = peg$parseAskQuery();
                }
              }
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parseValuesClause();
              if (s6 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c1(s1, s3, s5, s6);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseFunction() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    s1 = peg$parseFunctionCall();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseGroupGraphPattern();
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c2(s1, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsePrologue() {
    var s0, s1;

    s0 = [];
    s1 = peg$parseBaseDecl();
    if (s1 === peg$FAILED) {
      s1 = peg$parsePrefixDecl();
    }
    while (s1 !== peg$FAILED) {
      s0.push(s1);
      s1 = peg$parseBaseDecl();
      if (s1 === peg$FAILED) {
        s1 = peg$parsePrefixDecl();
      }
    }

    return s0;
  }

  function peg$parseBaseDecl() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.substr(peg$currPos, 4).toLowerCase() === peg$c3) {
        s2 = input.substr(peg$currPos, 4);
        peg$currPos += 4;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c4); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseIRIREF();
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c5(s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsePrefixDecl() {
    var s0, s1, s2, s3, s4, s5, s6;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.substr(peg$currPos, 6).toLowerCase() === peg$c6) {
        s2 = input.substr(peg$currPos, 6);
        peg$currPos += 6;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c7); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parsePNAME_NS();
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseWS();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseWS();
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parseIRIREF();
              if (s6 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c8(s4, s6);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseSelectQuery() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    s1 = peg$parseSelectClause();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseDatasetClause();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseDatasetClause();
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseWhereClause();
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                s7 = peg$parseSolutionModifier();
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c9(s1, s3, s5, s7);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseSubSelect() {
    var s0, s1, s2, s3, s4, s5, s6;

    s0 = peg$currPos;
    s1 = peg$parseSelectClause();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseWhereClause();
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseSolutionModifier();
            if (s5 !== peg$FAILED) {
              s6 = peg$parseValuesClause();
              if (s6 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c10(s1, s3, s5, s6);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseSelectClause() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, s13, s14, s15, s16;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c11) {
      s1 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c12); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 8).toLowerCase() === peg$c13) {
          s3 = input.substr(peg$currPos, 8);
          peg$currPos += 8;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c14); }
        }
        if (s3 === peg$FAILED) {
          if (input.substr(peg$currPos, 7).toLowerCase() === peg$c15) {
            s3 = input.substr(peg$currPos, 7);
            peg$currPos += 7;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c16); }
          }
        }
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$currPos;
            s7 = [];
            s8 = peg$parseWS();
            while (s8 !== peg$FAILED) {
              s7.push(s8);
              s8 = peg$parseWS();
            }
            if (s7 !== peg$FAILED) {
              s8 = peg$parseVar();
              if (s8 !== peg$FAILED) {
                s7 = [s7, s8];
                s6 = s7;
              } else {
                peg$currPos = s6;
                s6 = peg$FAILED;
              }
            } else {
              peg$currPos = s6;
              s6 = peg$FAILED;
            }
            if (s6 === peg$FAILED) {
              s6 = peg$currPos;
              s7 = [];
              s8 = peg$parseWS();
              while (s8 !== peg$FAILED) {
                s7.push(s8);
                s8 = peg$parseWS();
              }
              if (s7 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 40) {
                  s8 = peg$c17;
                  peg$currPos++;
                } else {
                  s8 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c18); }
                }
                if (s8 !== peg$FAILED) {
                  s9 = [];
                  s10 = peg$parseWS();
                  while (s10 !== peg$FAILED) {
                    s9.push(s10);
                    s10 = peg$parseWS();
                  }
                  if (s9 !== peg$FAILED) {
                    s10 = peg$parseConditionalOrExpression();
                    if (s10 !== peg$FAILED) {
                      s11 = [];
                      s12 = peg$parseWS();
                      while (s12 !== peg$FAILED) {
                        s11.push(s12);
                        s12 = peg$parseWS();
                      }
                      if (s11 !== peg$FAILED) {
                        if (input.substr(peg$currPos, 2).toLowerCase() === peg$c19) {
                          s12 = input.substr(peg$currPos, 2);
                          peg$currPos += 2;
                        } else {
                          s12 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c20); }
                        }
                        if (s12 !== peg$FAILED) {
                          s13 = [];
                          s14 = peg$parseWS();
                          while (s14 !== peg$FAILED) {
                            s13.push(s14);
                            s14 = peg$parseWS();
                          }
                          if (s13 !== peg$FAILED) {
                            s14 = peg$parseVar();
                            if (s14 !== peg$FAILED) {
                              s15 = [];
                              s16 = peg$parseWS();
                              while (s16 !== peg$FAILED) {
                                s15.push(s16);
                                s16 = peg$parseWS();
                              }
                              if (s15 !== peg$FAILED) {
                                if (input.charCodeAt(peg$currPos) === 41) {
                                  s16 = peg$c21;
                                  peg$currPos++;
                                } else {
                                  s16 = peg$FAILED;
                                  if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                }
                                if (s16 !== peg$FAILED) {
                                  s7 = [s7, s8, s9, s10, s11, s12, s13, s14, s15, s16];
                                  s6 = s7;
                                } else {
                                  peg$currPos = s6;
                                  s6 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s6;
                                s6 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s6;
                              s6 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s6;
                            s6 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s6;
                          s6 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s6;
                        s6 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s6;
                      s6 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
              } else {
                peg$currPos = s6;
                s6 = peg$FAILED;
              }
            }
            if (s6 !== peg$FAILED) {
              while (s6 !== peg$FAILED) {
                s5.push(s6);
                s6 = peg$currPos;
                s7 = [];
                s8 = peg$parseWS();
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parseWS();
                }
                if (s7 !== peg$FAILED) {
                  s8 = peg$parseVar();
                  if (s8 !== peg$FAILED) {
                    s7 = [s7, s8];
                    s6 = s7;
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
                if (s6 === peg$FAILED) {
                  s6 = peg$currPos;
                  s7 = [];
                  s8 = peg$parseWS();
                  while (s8 !== peg$FAILED) {
                    s7.push(s8);
                    s8 = peg$parseWS();
                  }
                  if (s7 !== peg$FAILED) {
                    if (input.charCodeAt(peg$currPos) === 40) {
                      s8 = peg$c17;
                      peg$currPos++;
                    } else {
                      s8 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c18); }
                    }
                    if (s8 !== peg$FAILED) {
                      s9 = [];
                      s10 = peg$parseWS();
                      while (s10 !== peg$FAILED) {
                        s9.push(s10);
                        s10 = peg$parseWS();
                      }
                      if (s9 !== peg$FAILED) {
                        s10 = peg$parseConditionalOrExpression();
                        if (s10 !== peg$FAILED) {
                          s11 = [];
                          s12 = peg$parseWS();
                          while (s12 !== peg$FAILED) {
                            s11.push(s12);
                            s12 = peg$parseWS();
                          }
                          if (s11 !== peg$FAILED) {
                            if (input.substr(peg$currPos, 2).toLowerCase() === peg$c19) {
                              s12 = input.substr(peg$currPos, 2);
                              peg$currPos += 2;
                            } else {
                              s12 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c20); }
                            }
                            if (s12 !== peg$FAILED) {
                              s13 = [];
                              s14 = peg$parseWS();
                              while (s14 !== peg$FAILED) {
                                s13.push(s14);
                                s14 = peg$parseWS();
                              }
                              if (s13 !== peg$FAILED) {
                                s14 = peg$parseVar();
                                if (s14 !== peg$FAILED) {
                                  s15 = [];
                                  s16 = peg$parseWS();
                                  while (s16 !== peg$FAILED) {
                                    s15.push(s16);
                                    s16 = peg$parseWS();
                                  }
                                  if (s15 !== peg$FAILED) {
                                    if (input.charCodeAt(peg$currPos) === 41) {
                                      s16 = peg$c21;
                                      peg$currPos++;
                                    } else {
                                      s16 = peg$FAILED;
                                      if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                    }
                                    if (s16 !== peg$FAILED) {
                                      s7 = [s7, s8, s9, s10, s11, s12, s13, s14, s15, s16];
                                      s6 = s7;
                                    } else {
                                      peg$currPos = s6;
                                      s6 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s6;
                                    s6 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s6;
                                  s6 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s6;
                                s6 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s6;
                              s6 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s6;
                            s6 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s6;
                          s6 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s6;
                        s6 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s6;
                      s6 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                }
              }
            } else {
              s5 = peg$FAILED;
            }
            if (s5 === peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 42) {
                s5 = peg$c23;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c24); }
              }
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c25(s3, s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseConstructQuery() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, s13;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 9).toLowerCase() === peg$c26) {
      s1 = input.substr(peg$currPos, 9);
      peg$currPos += 9;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c27); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseConstructTemplate();
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseDatasetClause();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseDatasetClause();
            }
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                s7 = peg$parseWhereClause();
                if (s7 !== peg$FAILED) {
                  s8 = [];
                  s9 = peg$parseWS();
                  while (s9 !== peg$FAILED) {
                    s8.push(s9);
                    s9 = peg$parseWS();
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = peg$parseSolutionModifier();
                    if (s9 !== peg$FAILED) {
                      peg$savedPos = s0;
                      s1 = peg$c28(s3, s5, s7, s9);
                      s0 = s1;
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 9).toLowerCase() === peg$c26) {
        s1 = input.substr(peg$currPos, 9);
        peg$currPos += 9;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c27); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parseWS();
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parseWS();
        }
        if (s2 !== peg$FAILED) {
          s3 = [];
          s4 = peg$parseDatasetClause();
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$parseDatasetClause();
          }
          if (s3 !== peg$FAILED) {
            s4 = [];
            s5 = peg$parseWS();
            while (s5 !== peg$FAILED) {
              s4.push(s5);
              s5 = peg$parseWS();
            }
            if (s4 !== peg$FAILED) {
              if (input.substr(peg$currPos, 5).toLowerCase() === peg$c29) {
                s5 = input.substr(peg$currPos, 5);
                peg$currPos += 5;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c30); }
              }
              if (s5 !== peg$FAILED) {
                s6 = [];
                s7 = peg$parseWS();
                while (s7 !== peg$FAILED) {
                  s6.push(s7);
                  s7 = peg$parseWS();
                }
                if (s6 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 123) {
                    s7 = peg$c31;
                    peg$currPos++;
                  } else {
                    s7 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c32); }
                  }
                  if (s7 !== peg$FAILED) {
                    s8 = [];
                    s9 = peg$parseWS();
                    while (s9 !== peg$FAILED) {
                      s8.push(s9);
                      s9 = peg$parseWS();
                    }
                    if (s8 !== peg$FAILED) {
                      s9 = peg$parseTriplesTemplate();
                      if (s9 === peg$FAILED) {
                        s9 = null;
                      }
                      if (s9 !== peg$FAILED) {
                        s10 = [];
                        s11 = peg$parseWS();
                        while (s11 !== peg$FAILED) {
                          s10.push(s11);
                          s11 = peg$parseWS();
                        }
                        if (s10 !== peg$FAILED) {
                          if (input.charCodeAt(peg$currPos) === 125) {
                            s11 = peg$c33;
                            peg$currPos++;
                          } else {
                            s11 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c34); }
                          }
                          if (s11 !== peg$FAILED) {
                            s12 = [];
                            s13 = peg$parseWS();
                            while (s13 !== peg$FAILED) {
                              s12.push(s13);
                              s13 = peg$parseWS();
                            }
                            if (s12 !== peg$FAILED) {
                              s13 = peg$parseSolutionModifier();
                              if (s13 !== peg$FAILED) {
                                peg$savedPos = s0;
                                s1 = peg$c35(s3, s9, s13);
                                s0 = s1;
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseDescribeQuery() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 8).toLowerCase() === peg$c36) {
      s1 = input.substr(peg$currPos, 8);
      peg$currPos += 8;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c37); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseVarOrIri();
        if (s4 !== peg$FAILED) {
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$parseVarOrIri();
          }
        } else {
          s3 = peg$FAILED;
        }
        if (s3 === peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 42) {
            s3 = peg$c23;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c24); }
          }
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseDatasetClause();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseDatasetClause();
            }
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                s7 = peg$parseWhereClause();
                if (s7 === peg$FAILED) {
                  s7 = null;
                }
                if (s7 !== peg$FAILED) {
                  s8 = [];
                  s9 = peg$parseWS();
                  while (s9 !== peg$FAILED) {
                    s8.push(s9);
                    s9 = peg$parseWS();
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = peg$parseSolutionModifier();
                    if (s9 !== peg$FAILED) {
                      peg$savedPos = s0;
                      s1 = peg$c38(s3, s5, s7, s9);
                      s0 = s1;
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseAskQuery() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.substr(peg$currPos, 3).toLowerCase() === peg$c39) {
        s2 = input.substr(peg$currPos, 3);
        peg$currPos += 3;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c40); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseDatasetClause();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseDatasetClause();
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseWS();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseWS();
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parseWhereClause();
              if (s6 !== peg$FAILED) {
                s7 = [];
                s8 = peg$parseWS();
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parseWS();
                }
                if (s7 !== peg$FAILED) {
                  s8 = peg$parseSolutionModifier();
                  if (s8 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c41(s4, s6, s8);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseDatasetClause() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c42) {
      s1 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c43); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseDefaultGraphClause();
        if (s3 === peg$FAILED) {
          s3 = peg$parseNamedGraphClause();
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c44(s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseDefaultGraphClause() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseIRIref();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c45(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseNamedGraphClause() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c46) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c47); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseIRIref();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c48(s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseWhereClause() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c29) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c30); }
    }
    if (s1 === peg$FAILED) {
      s1 = null;
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseGroupGraphPattern();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c49(s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseSolutionModifier() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    s1 = peg$parseGroupClause();
    if (s1 === peg$FAILED) {
      s1 = null;
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseHavingClause();
      if (s2 === peg$FAILED) {
        s2 = null;
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseOrderClause();
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseLimitOffsetClauses();
          if (s4 === peg$FAILED) {
            s4 = null;
          }
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c50(s1, s2, s3, s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseGroupClause() {
    var s0, s1, s2, s3, s4, s5, s6;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c51) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c52); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 2).toLowerCase() === peg$c53) {
          s3 = input.substr(peg$currPos, 2);
          peg$currPos += 2;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c54); }
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseGroupCondition();
            if (s6 !== peg$FAILED) {
              while (s6 !== peg$FAILED) {
                s5.push(s6);
                s6 = peg$parseGroupCondition();
              }
            } else {
              s5 = peg$FAILED;
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c55(s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseGroupCondition() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseBuiltInCall();
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c56(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = [];
      s2 = peg$parseWS();
      while (s2 !== peg$FAILED) {
        s1.push(s2);
        s2 = peg$parseWS();
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseFunctionCall();
        if (s2 !== peg$FAILED) {
          s3 = [];
          s4 = peg$parseWS();
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$parseWS();
          }
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c57(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = [];
        s2 = peg$parseWS();
        while (s2 !== peg$FAILED) {
          s1.push(s2);
          s2 = peg$parseWS();
        }
        if (s1 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 40) {
            s2 = peg$c17;
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c18); }
          }
          if (s2 !== peg$FAILED) {
            s3 = [];
            s4 = peg$parseWS();
            while (s4 !== peg$FAILED) {
              s3.push(s4);
              s4 = peg$parseWS();
            }
            if (s3 !== peg$FAILED) {
              s4 = peg$parseConditionalOrExpression();
              if (s4 !== peg$FAILED) {
                s5 = [];
                s6 = peg$parseWS();
                while (s6 !== peg$FAILED) {
                  s5.push(s6);
                  s6 = peg$parseWS();
                }
                if (s5 !== peg$FAILED) {
                  s6 = peg$currPos;
                  if (input.substr(peg$currPos, 2).toLowerCase() === peg$c19) {
                    s7 = input.substr(peg$currPos, 2);
                    peg$currPos += 2;
                  } else {
                    s7 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c20); }
                  }
                  if (s7 !== peg$FAILED) {
                    s8 = [];
                    s9 = peg$parseWS();
                    while (s9 !== peg$FAILED) {
                      s8.push(s9);
                      s9 = peg$parseWS();
                    }
                    if (s8 !== peg$FAILED) {
                      s9 = peg$parseVar();
                      if (s9 !== peg$FAILED) {
                        s7 = [s7, s8, s9];
                        s6 = s7;
                      } else {
                        peg$currPos = s6;
                        s6 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s6;
                      s6 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                  if (s6 === peg$FAILED) {
                    s6 = null;
                  }
                  if (s6 !== peg$FAILED) {
                    s7 = [];
                    s8 = peg$parseWS();
                    while (s8 !== peg$FAILED) {
                      s7.push(s8);
                      s8 = peg$parseWS();
                    }
                    if (s7 !== peg$FAILED) {
                      if (input.charCodeAt(peg$currPos) === 41) {
                        s8 = peg$c21;
                        peg$currPos++;
                      } else {
                        s8 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c22); }
                      }
                      if (s8 !== peg$FAILED) {
                        s9 = [];
                        s10 = peg$parseWS();
                        while (s10 !== peg$FAILED) {
                          s9.push(s10);
                          s10 = peg$parseWS();
                        }
                        if (s9 !== peg$FAILED) {
                          peg$savedPos = s0;
                          s1 = peg$c58(s4, s6);
                          s0 = s1;
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = [];
          s2 = peg$parseWS();
          while (s2 !== peg$FAILED) {
            s1.push(s2);
            s2 = peg$parseWS();
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parseVar();
            if (s2 !== peg$FAILED) {
              s3 = [];
              s4 = peg$parseWS();
              while (s4 !== peg$FAILED) {
                s3.push(s4);
                s4 = peg$parseWS();
              }
              if (s3 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c59(s2);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        }
      }
    }

    return s0;
  }

  function peg$parseHavingClause() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c60) {
      s1 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c61); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseHavingCondition();
        if (s4 !== peg$FAILED) {
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$parseHavingCondition();
          }
        } else {
          s3 = peg$FAILED;
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c62(s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseHavingCondition() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    s1 = peg$parseConstraint();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c62(s1);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseOrderClause() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c63) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c64); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 2).toLowerCase() === peg$c53) {
          s3 = input.substr(peg$currPos, 2);
          peg$currPos += 2;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c54); }
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseOrderCondition();
            if (s6 !== peg$FAILED) {
              while (s6 !== peg$FAILED) {
                s5.push(s6);
                s6 = peg$parseOrderCondition();
              }
            } else {
              s5 = peg$FAILED;
            }
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c65(s5);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseOrderCondition() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 3).toLowerCase() === peg$c66) {
      s1 = input.substr(peg$currPos, 3);
      peg$currPos += 3;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c67); }
    }
    if (s1 === peg$FAILED) {
      if (input.substr(peg$currPos, 4).toLowerCase() === peg$c68) {
        s1 = input.substr(peg$currPos, 4);
        peg$currPos += 4;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c69); }
      }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseBrackettedExpression();
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c70(s1, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parseConstraint();
      if (s1 === peg$FAILED) {
        s1 = peg$parseVar();
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parseWS();
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parseWS();
        }
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c71(s1);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseLimitOffsetClauses() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    s1 = peg$currPos;
    s2 = peg$parseLimitClause();
    if (s2 !== peg$FAILED) {
      s3 = peg$parseOffsetClause();
      if (s3 === peg$FAILED) {
        s3 = null;
      }
      if (s3 !== peg$FAILED) {
        s2 = [s2, s3];
        s1 = s2;
      } else {
        peg$currPos = s1;
        s1 = peg$FAILED;
      }
    } else {
      peg$currPos = s1;
      s1 = peg$FAILED;
    }
    if (s1 === peg$FAILED) {
      s1 = peg$currPos;
      s2 = peg$parseOffsetClause();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseLimitClause();
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        if (s3 !== peg$FAILED) {
          s2 = [s2, s3];
          s1 = s2;
        } else {
          peg$currPos = s1;
          s1 = peg$FAILED;
        }
      } else {
        peg$currPos = s1;
        s1 = peg$FAILED;
      }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c72(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parseLimitClause() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c73) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c74); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseINTEGER();
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c75(s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseOffsetClause() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c76) {
      s1 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c77); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseINTEGER();
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c78(s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseValuesClause() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    s1 = peg$currPos;
    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c79) {
      s2 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c80); }
    }
    if (s2 !== peg$FAILED) {
      s3 = peg$parseDataBlock();
      if (s3 !== peg$FAILED) {
        s2 = [s2, s3];
        s1 = s2;
      } else {
        peg$currPos = s1;
        s1 = peg$FAILED;
      }
    } else {
      peg$currPos = s1;
      s1 = peg$FAILED;
    }
    if (s1 === peg$FAILED) {
      s1 = null;
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c81(s1);
    }
    s0 = s1;

    return s0;
  }

  function peg$parseUpdate() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;

    s0 = peg$currPos;
    s1 = peg$parsePrologue();
    if (s1 !== peg$FAILED) {
      s2 = peg$currPos;
      s3 = [];
      s4 = peg$parseWS();
      while (s4 !== peg$FAILED) {
        s3.push(s4);
        s4 = peg$parseWS();
      }
      if (s3 !== peg$FAILED) {
        s4 = peg$parseUpdate1();
        if (s4 !== peg$FAILED) {
          s5 = peg$currPos;
          s6 = [];
          s7 = peg$parseWS();
          while (s7 !== peg$FAILED) {
            s6.push(s7);
            s7 = peg$parseWS();
          }
          if (s6 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 59) {
              s7 = peg$c82;
              peg$currPos++;
            } else {
              s7 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c83); }
            }
            if (s7 !== peg$FAILED) {
              s8 = [];
              s9 = peg$parseWS();
              while (s9 !== peg$FAILED) {
                s8.push(s9);
                s9 = peg$parseWS();
              }
              if (s8 !== peg$FAILED) {
                s9 = peg$parseUpdate();
                if (s9 !== peg$FAILED) {
                  s6 = [s6, s7, s8, s9];
                  s5 = s6;
                } else {
                  peg$currPos = s5;
                  s5 = peg$FAILED;
                }
              } else {
                peg$currPos = s5;
                s5 = peg$FAILED;
              }
            } else {
              peg$currPos = s5;
              s5 = peg$FAILED;
            }
          } else {
            peg$currPos = s5;
            s5 = peg$FAILED;
          }
          if (s5 === peg$FAILED) {
            s5 = null;
          }
          if (s5 !== peg$FAILED) {
            s3 = [s3, s4, s5];
            s2 = s3;
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
      } else {
        peg$currPos = s2;
        s2 = peg$FAILED;
      }
      if (s2 === peg$FAILED) {
        s2 = null;
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c84(s1, s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseUpdate1() {
    var s0;

    s0 = peg$parseLoad();
    if (s0 === peg$FAILED) {
      s0 = peg$parseClear();
      if (s0 === peg$FAILED) {
        s0 = peg$parseDrop();
        if (s0 === peg$FAILED) {
          s0 = peg$parseAdd();
          if (s0 === peg$FAILED) {
            s0 = peg$parseMove();
            if (s0 === peg$FAILED) {
              s0 = peg$parseCopy();
              if (s0 === peg$FAILED) {
                s0 = peg$parseCreate();
                if (s0 === peg$FAILED) {
                  s0 = peg$parseInsertData();
                  if (s0 === peg$FAILED) {
                    s0 = peg$parseDeleteData();
                    if (s0 === peg$FAILED) {
                      s0 = peg$parseDeleteWhere();
                      if (s0 === peg$FAILED) {
                        s0 = peg$parseModify();
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    return s0;
  }

  function peg$parseLoad() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c85) {
      s1 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c86); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 6).toLowerCase() === peg$c87) {
          s3 = input.substr(peg$currPos, 6);
          peg$currPos += 6;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c88); }
        }
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseIRIref();
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                s7 = peg$currPos;
                if (input.substr(peg$currPos, 4).toLowerCase() === peg$c89) {
                  s8 = input.substr(peg$currPos, 4);
                  peg$currPos += 4;
                } else {
                  s8 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c90); }
                }
                if (s8 !== peg$FAILED) {
                  s9 = [];
                  s10 = peg$parseWS();
                  while (s10 !== peg$FAILED) {
                    s9.push(s10);
                    s10 = peg$parseWS();
                  }
                  if (s9 !== peg$FAILED) {
                    s10 = peg$parseGraphRef();
                    if (s10 !== peg$FAILED) {
                      s8 = [s8, s9, s10];
                      s7 = s8;
                    } else {
                      peg$currPos = s7;
                      s7 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s7;
                    s7 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s7;
                  s7 = peg$FAILED;
                }
                if (s7 === peg$FAILED) {
                  s7 = null;
                }
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c91(s3, s5, s7);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseClear() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c92) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c93); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 6).toLowerCase() === peg$c87) {
          s3 = input.substr(peg$currPos, 6);
          peg$currPos += 6;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c88); }
        }
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseGraphRefAll();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c94(s3, s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseDrop() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c95) {
      s1 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c96); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 6).toLowerCase() === peg$c87) {
          s3 = input.substr(peg$currPos, 6);
          peg$currPos += 6;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c88); }
        }
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseGraphRefAll();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c97(s3, s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseCreate() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c98) {
      s1 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c99); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 6).toLowerCase() === peg$c87) {
          s3 = input.substr(peg$currPos, 6);
          peg$currPos += 6;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c88); }
        }
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseGraphRef();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c100(s3, s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseAdd() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 3).toLowerCase() === peg$c101) {
      s1 = input.substr(peg$currPos, 3);
      peg$currPos += 3;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c102); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 6).toLowerCase() === peg$c87) {
          s3 = input.substr(peg$currPos, 6);
          peg$currPos += 6;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c88); }
        }
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseGraphOrDefault();
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                if (input.substr(peg$currPos, 2).toLowerCase() === peg$c103) {
                  s7 = input.substr(peg$currPos, 2);
                  peg$currPos += 2;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c104); }
                }
                if (s7 !== peg$FAILED) {
                  s8 = [];
                  s9 = peg$parseWS();
                  while (s9 !== peg$FAILED) {
                    s8.push(s9);
                    s9 = peg$parseWS();
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = peg$parseGraphOrDefault();
                    if (s9 !== peg$FAILED) {
                      peg$savedPos = s0;
                      s1 = peg$c105(s3, s5, s9);
                      s0 = s1;
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseMove() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c106) {
      s1 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c107); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 6).toLowerCase() === peg$c87) {
          s3 = input.substr(peg$currPos, 6);
          peg$currPos += 6;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c88); }
        }
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseGraphOrDefault();
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                if (input.substr(peg$currPos, 2).toLowerCase() === peg$c103) {
                  s7 = input.substr(peg$currPos, 2);
                  peg$currPos += 2;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c104); }
                }
                if (s7 !== peg$FAILED) {
                  s8 = [];
                  s9 = peg$parseWS();
                  while (s9 !== peg$FAILED) {
                    s8.push(s9);
                    s9 = peg$parseWS();
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = peg$parseGraphOrDefault();
                    if (s9 !== peg$FAILED) {
                      peg$savedPos = s0;
                      s1 = peg$c108(s3, s5, s9);
                      s0 = s1;
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseCopy() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c109) {
      s1 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c110); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 6).toLowerCase() === peg$c87) {
          s3 = input.substr(peg$currPos, 6);
          peg$currPos += 6;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c88); }
        }
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseGraphOrDefault();
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                if (input.substr(peg$currPos, 2).toLowerCase() === peg$c103) {
                  s7 = input.substr(peg$currPos, 2);
                  peg$currPos += 2;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c104); }
                }
                if (s7 !== peg$FAILED) {
                  s8 = [];
                  s9 = peg$parseWS();
                  while (s9 !== peg$FAILED) {
                    s8.push(s9);
                    s9 = peg$parseWS();
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = peg$parseGraphOrDefault();
                    if (s9 !== peg$FAILED) {
                      peg$savedPos = s0;
                      s1 = peg$c111(s3, s5, s9);
                      s0 = s1;
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseInsertData() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c112) {
      s1 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c113); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 4).toLowerCase() === peg$c114) {
          s3 = input.substr(peg$currPos, 4);
          peg$currPos += 4;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c115); }
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseQuadData();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c116(s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseDeleteData() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c117) {
      s1 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c118); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 4).toLowerCase() === peg$c114) {
          s3 = input.substr(peg$currPos, 4);
          peg$currPos += 4;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c115); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseQuadData();
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c119(s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseDeleteWhere() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c117) {
      s1 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c118); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 5).toLowerCase() === peg$c29) {
          s3 = input.substr(peg$currPos, 5);
          peg$currPos += 5;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c30); }
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseGroupGraphPattern();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c120(s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseModify() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10;

    s0 = peg$currPos;
    s1 = peg$currPos;
    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c121) {
      s2 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c122); }
    }
    if (s2 !== peg$FAILED) {
      s3 = [];
      s4 = peg$parseWS();
      while (s4 !== peg$FAILED) {
        s3.push(s4);
        s4 = peg$parseWS();
      }
      if (s3 !== peg$FAILED) {
        s4 = peg$parseIRIref();
        if (s4 !== peg$FAILED) {
          s5 = [];
          s6 = peg$parseWS();
          while (s6 !== peg$FAILED) {
            s5.push(s6);
            s6 = peg$parseWS();
          }
          if (s5 !== peg$FAILED) {
            s2 = [s2, s3, s4, s5];
            s1 = s2;
          } else {
            peg$currPos = s1;
            s1 = peg$FAILED;
          }
        } else {
          peg$currPos = s1;
          s1 = peg$FAILED;
        }
      } else {
        peg$currPos = s1;
        s1 = peg$FAILED;
      }
    } else {
      peg$currPos = s1;
      s1 = peg$FAILED;
    }
    if (s1 === peg$FAILED) {
      s1 = null;
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$currPos;
      s3 = peg$parseDeleteClause();
      if (s3 !== peg$FAILED) {
        s4 = [];
        s5 = peg$parseWS();
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parseWS();
        }
        if (s4 !== peg$FAILED) {
          s5 = peg$parseInsertClause();
          if (s5 === peg$FAILED) {
            s5 = null;
          }
          if (s5 !== peg$FAILED) {
            s3 = [s3, s4, s5];
            s2 = s3;
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
      } else {
        peg$currPos = s2;
        s2 = peg$FAILED;
      }
      if (s2 === peg$FAILED) {
        s2 = peg$parseInsertClause();
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseUsingClause();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseUsingClause();
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseWS();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseWS();
            }
            if (s5 !== peg$FAILED) {
              if (input.substr(peg$currPos, 5).toLowerCase() === peg$c29) {
                s6 = input.substr(peg$currPos, 5);
                peg$currPos += 5;
              } else {
                s6 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c30); }
              }
              if (s6 !== peg$FAILED) {
                s7 = [];
                s8 = peg$parseWS();
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parseWS();
                }
                if (s7 !== peg$FAILED) {
                  s8 = peg$parseGroupGraphPattern();
                  if (s8 !== peg$FAILED) {
                    s9 = [];
                    s10 = peg$parseWS();
                    while (s10 !== peg$FAILED) {
                      s9.push(s10);
                      s10 = peg$parseWS();
                    }
                    if (s9 !== peg$FAILED) {
                      peg$savedPos = s0;
                      s1 = peg$c123(s1, s2, s4, s8);
                      s0 = s1;
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseDeleteClause() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c117) {
      s1 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c118); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseQuadPattern();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c124(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseInsertClause() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c112) {
      s1 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c113); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseQuadPattern();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c124(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseUsingClause() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.substr(peg$currPos, 5).toLowerCase() === peg$c125) {
        s2 = input.substr(peg$currPos, 5);
        peg$currPos += 5;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c126); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseIRIref();
          if (s4 === peg$FAILED) {
            s4 = peg$currPos;
            if (input.substr(peg$currPos, 5).toLowerCase() === peg$c46) {
              s5 = input.substr(peg$currPos, 5);
              peg$currPos += 5;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c47); }
            }
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                s7 = peg$parseIRIref();
                if (s7 !== peg$FAILED) {
                  s5 = [s5, s6, s7];
                  s4 = s5;
                } else {
                  peg$currPos = s4;
                  s4 = peg$FAILED;
                }
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          }
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c127(s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseGraphOrDefault() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 7).toLowerCase() === peg$c128) {
      s1 = input.substr(peg$currPos, 7);
      peg$currPos += 7;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c129); }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c130();
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 5).toLowerCase() === peg$c131) {
        s1 = input.substr(peg$currPos, 5);
        peg$currPos += 5;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c132); }
      }
      if (s1 === peg$FAILED) {
        s1 = null;
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parseWS();
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parseWS();
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parseIRIref();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c133(s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseGraphRef() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c131) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c132); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseIRIref();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c133(s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseGraphRefAll() {
    var s0, s1;

    s0 = peg$currPos;
    s1 = peg$parseGraphRef();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c134(s1);
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 7).toLowerCase() === peg$c128) {
        s1 = input.substr(peg$currPos, 7);
        peg$currPos += 7;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c129); }
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c130();
      }
      s0 = s1;
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 5).toLowerCase() === peg$c46) {
          s1 = input.substr(peg$currPos, 5);
          peg$currPos += 5;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c47); }
        }
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c135();
        }
        s0 = s1;
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.substr(peg$currPos, 3).toLowerCase() === peg$c136) {
            s1 = input.substr(peg$currPos, 3);
            peg$currPos += 3;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c137); }
          }
          if (s1 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c138();
          }
          s0 = s1;
        }
      }
    }

    return s0;
  }

  function peg$parseQuadPattern() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 123) {
        s2 = peg$c31;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c32); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseQuads();
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseWS();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseWS();
            }
            if (s5 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 125) {
                s6 = peg$c33;
                peg$currPos++;
              } else {
                s6 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c34); }
              }
              if (s6 !== peg$FAILED) {
                s7 = [];
                s8 = peg$parseWS();
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parseWS();
                }
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c124(s4);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseQuadData() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 123) {
        s2 = peg$c31;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c32); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseQuads();
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseWS();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseWS();
            }
            if (s5 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 125) {
                s6 = peg$c33;
                peg$currPos++;
              } else {
                s6 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c34); }
              }
              if (s6 !== peg$FAILED) {
                s7 = [];
                s8 = peg$parseWS();
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parseWS();
                }
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c124(s4);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseQuads() {
    var s0, s1, s2, s3, s4, s5, s6;

    s0 = peg$currPos;
    s1 = peg$parseTriplesTemplate();
    if (s1 === peg$FAILED) {
      s1 = null;
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      s4 = peg$parseQuadsNotTriples();
      if (s4 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 46) {
          s5 = peg$c139;
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c140); }
        }
        if (s5 === peg$FAILED) {
          s5 = null;
        }
        if (s5 !== peg$FAILED) {
          s6 = peg$parseTriplesTemplate();
          if (s6 === peg$FAILED) {
            s6 = null;
          }
          if (s6 !== peg$FAILED) {
            s4 = [s4, s5, s6];
            s3 = s4;
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$currPos;
        s4 = peg$parseQuadsNotTriples();
        if (s4 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 46) {
            s5 = peg$c139;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c140); }
          }
          if (s5 === peg$FAILED) {
            s5 = null;
          }
          if (s5 !== peg$FAILED) {
            s6 = peg$parseTriplesTemplate();
            if (s6 === peg$FAILED) {
              s6 = null;
            }
            if (s6 !== peg$FAILED) {
              s4 = [s4, s5, s6];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c141(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseQuadsNotTriples() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.substr(peg$currPos, 5).toLowerCase() === peg$c131) {
        s2 = input.substr(peg$currPos, 5);
        peg$currPos += 5;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c132); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseVarOrIri();
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseWS();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseWS();
            }
            if (s5 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 123) {
                s6 = peg$c31;
                peg$currPos++;
              } else {
                s6 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c32); }
              }
              if (s6 !== peg$FAILED) {
                s7 = [];
                s8 = peg$parseWS();
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parseWS();
                }
                if (s7 !== peg$FAILED) {
                  s8 = peg$parseTriplesTemplate();
                  if (s8 === peg$FAILED) {
                    s8 = null;
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = [];
                    s10 = peg$parseWS();
                    while (s10 !== peg$FAILED) {
                      s9.push(s10);
                      s10 = peg$parseWS();
                    }
                    if (s9 !== peg$FAILED) {
                      if (input.charCodeAt(peg$currPos) === 125) {
                        s10 = peg$c33;
                        peg$currPos++;
                      } else {
                        s10 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c34); }
                      }
                      if (s10 !== peg$FAILED) {
                        s11 = [];
                        s12 = peg$parseWS();
                        while (s12 !== peg$FAILED) {
                          s11.push(s12);
                          s12 = peg$parseWS();
                        }
                        if (s11 !== peg$FAILED) {
                          peg$savedPos = s0;
                          s1 = peg$c142(s4, s8);
                          s0 = s1;
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseTriplesTemplate() {
    var s0, s1, s2, s3, s4, s5, s6;

    s0 = peg$currPos;
    s1 = peg$parseTriplesSameSubject();
    if (s1 !== peg$FAILED) {
      s2 = peg$currPos;
      s3 = [];
      s4 = peg$parseWS();
      while (s4 !== peg$FAILED) {
        s3.push(s4);
        s4 = peg$parseWS();
      }
      if (s3 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 46) {
          s4 = peg$c139;
          peg$currPos++;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c140); }
        }
        if (s4 !== peg$FAILED) {
          s5 = [];
          s6 = peg$parseWS();
          while (s6 !== peg$FAILED) {
            s5.push(s6);
            s6 = peg$parseWS();
          }
          if (s5 !== peg$FAILED) {
            s6 = peg$parseTriplesTemplate();
            if (s6 === peg$FAILED) {
              s6 = null;
            }
            if (s6 !== peg$FAILED) {
              s3 = [s3, s4, s5, s6];
              s2 = s3;
            } else {
              peg$currPos = s2;
              s2 = peg$FAILED;
            }
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
      } else {
        peg$currPos = s2;
        s2 = peg$FAILED;
      }
      if (s2 === peg$FAILED) {
        s2 = null;
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c143(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseGroupGraphPattern() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 123) {
      s1 = peg$c31;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c32); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseSubSelect();
        if (s3 === peg$FAILED) {
          s3 = peg$parseGroupGraphPatternSub();
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 125) {
              s5 = peg$c33;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c34); }
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c144(s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseGroupGraphPatternSub() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;

    s0 = peg$currPos;
    s1 = peg$parseTriplesBlock();
    if (s1 === peg$FAILED) {
      s1 = null;
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$currPos;
        s5 = peg$parseGraphPatternNotTriples();
        if (s5 !== peg$FAILED) {
          s6 = [];
          s7 = peg$parseWS();
          while (s7 !== peg$FAILED) {
            s6.push(s7);
            s7 = peg$parseWS();
          }
          if (s6 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 46) {
              s7 = peg$c139;
              peg$currPos++;
            } else {
              s7 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c140); }
            }
            if (s7 === peg$FAILED) {
              s7 = null;
            }
            if (s7 !== peg$FAILED) {
              s8 = [];
              s9 = peg$parseWS();
              while (s9 !== peg$FAILED) {
                s8.push(s9);
                s9 = peg$parseWS();
              }
              if (s8 !== peg$FAILED) {
                s9 = peg$parseTriplesBlock();
                if (s9 === peg$FAILED) {
                  s9 = null;
                }
                if (s9 !== peg$FAILED) {
                  s5 = [s5, s6, s7, s8, s9];
                  s4 = s5;
                } else {
                  peg$currPos = s4;
                  s4 = peg$FAILED;
                }
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
        } else {
          peg$currPos = s4;
          s4 = peg$FAILED;
        }
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$currPos;
          s5 = peg$parseGraphPatternNotTriples();
          if (s5 !== peg$FAILED) {
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 46) {
                s7 = peg$c139;
                peg$currPos++;
              } else {
                s7 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c140); }
              }
              if (s7 === peg$FAILED) {
                s7 = null;
              }
              if (s7 !== peg$FAILED) {
                s8 = [];
                s9 = peg$parseWS();
                while (s9 !== peg$FAILED) {
                  s8.push(s9);
                  s9 = peg$parseWS();
                }
                if (s8 !== peg$FAILED) {
                  s9 = peg$parseTriplesBlock();
                  if (s9 === peg$FAILED) {
                    s9 = null;
                  }
                  if (s9 !== peg$FAILED) {
                    s5 = [s5, s6, s7, s8, s9];
                    s4 = s5;
                  } else {
                    peg$currPos = s4;
                    s4 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s4;
                  s4 = peg$FAILED;
                }
              } else {
                peg$currPos = s4;
                s4 = peg$FAILED;
              }
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c145(s1, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseTriplesBlock() {
    var s0, s1, s2, s3, s4, s5, s6;

    s0 = peg$currPos;
    s1 = peg$parseTriplesSameSubjectPath();
    if (s1 !== peg$FAILED) {
      s2 = peg$currPos;
      s3 = [];
      s4 = peg$parseWS();
      while (s4 !== peg$FAILED) {
        s3.push(s4);
        s4 = peg$parseWS();
      }
      if (s3 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 46) {
          s4 = peg$c139;
          peg$currPos++;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c140); }
        }
        if (s4 !== peg$FAILED) {
          s5 = [];
          s6 = peg$parseWS();
          while (s6 !== peg$FAILED) {
            s5.push(s6);
            s6 = peg$parseWS();
          }
          if (s5 !== peg$FAILED) {
            s6 = peg$parseTriplesBlock();
            if (s6 === peg$FAILED) {
              s6 = null;
            }
            if (s6 !== peg$FAILED) {
              s3 = [s3, s4, s5, s6];
              s2 = s3;
            } else {
              peg$currPos = s2;
              s2 = peg$FAILED;
            }
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
      } else {
        peg$currPos = s2;
        s2 = peg$FAILED;
      }
      if (s2 === peg$FAILED) {
        s2 = null;
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c146(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseGraphPatternNotTriples() {
    var s0;

    s0 = peg$parseGroupOrUnionGraphPattern();
    if (s0 === peg$FAILED) {
      s0 = peg$parseOptionalGraphPattern();
      if (s0 === peg$FAILED) {
        s0 = peg$parseMinusGraphPattern();
        if (s0 === peg$FAILED) {
          s0 = peg$parseGraphGraphPattern();
          if (s0 === peg$FAILED) {
            s0 = peg$parseServiceGraphPattern();
            if (s0 === peg$FAILED) {
              s0 = peg$parseFilter();
              if (s0 === peg$FAILED) {
                s0 = peg$parseBind();
                if (s0 === peg$FAILED) {
                  s0 = peg$parseInlineData();
                  if (s0 === peg$FAILED) {
                    s0 = peg$parseFunctionCall();
                  }
                }
              }
            }
          }
        }
      }
    }

    return s0;
  }

  function peg$parseOptionalGraphPattern() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.substr(peg$currPos, 8).toLowerCase() === peg$c147) {
        s2 = input.substr(peg$currPos, 8);
        peg$currPos += 8;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c148); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseGroupGraphPattern();
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c149(s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseGraphGraphPattern() {
    var s0, s1, s2, s3, s4, s5, s6;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.substr(peg$currPos, 5).toLowerCase() === peg$c131) {
        s2 = input.substr(peg$currPos, 5);
        peg$currPos += 5;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c132); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseVarOrIri();
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseWS();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseWS();
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parseGroupGraphPattern();
              if (s6 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c150(s4, s6);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseServiceGraphPattern() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 7) === peg$c151) {
      s1 = peg$c151;
      peg$currPos += 7;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c152); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 6).toLowerCase() === peg$c87) {
          s3 = input.substr(peg$currPos, 6);
          peg$currPos += 6;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c88); }
        }
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseVarOrIri();
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                s7 = peg$parseGroupGraphPattern();
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c153(s3, s5, s7);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseBind() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.substr(peg$currPos, 4).toLowerCase() === peg$c154) {
        s2 = input.substr(peg$currPos, 4);
        peg$currPos += 4;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c155); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 40) {
            s4 = peg$c17;
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c18); }
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseWS();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseWS();
            }
            if (s5 !== peg$FAILED) {
              s6 = peg$parseConditionalOrExpression();
              if (s6 !== peg$FAILED) {
                s7 = [];
                s8 = peg$parseWS();
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parseWS();
                }
                if (s7 !== peg$FAILED) {
                  if (input.substr(peg$currPos, 2).toLowerCase() === peg$c19) {
                    s8 = input.substr(peg$currPos, 2);
                    peg$currPos += 2;
                  } else {
                    s8 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c20); }
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = [];
                    s10 = peg$parseWS();
                    while (s10 !== peg$FAILED) {
                      s9.push(s10);
                      s10 = peg$parseWS();
                    }
                    if (s9 !== peg$FAILED) {
                      s10 = peg$parseVar();
                      if (s10 !== peg$FAILED) {
                        s11 = [];
                        s12 = peg$parseWS();
                        while (s12 !== peg$FAILED) {
                          s11.push(s12);
                          s12 = peg$parseWS();
                        }
                        if (s11 !== peg$FAILED) {
                          if (input.charCodeAt(peg$currPos) === 41) {
                            s12 = peg$c21;
                            peg$currPos++;
                          } else {
                            s12 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c22); }
                          }
                          if (s12 !== peg$FAILED) {
                            peg$savedPos = s0;
                            s1 = peg$c156(s6, s10);
                            s0 = s1;
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseInlineData() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.substr(peg$currPos, 6).toLowerCase() === peg$c79) {
        s2 = input.substr(peg$currPos, 6);
        peg$currPos += 6;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c80); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseDataBlock();
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c157(s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseDataBlock() {
    var s0;

    s0 = peg$parseInlineDataOneVar();
    if (s0 === peg$FAILED) {
      s0 = peg$parseInlineDataFull();
    }

    return s0;
  }

  function peg$parseInlineDataOneVar() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseVar();
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 123) {
            s4 = peg$c31;
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c32); }
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseWS();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseWS();
            }
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseDataBlockValue();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseDataBlockValue();
              }
              if (s6 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 125) {
                  s7 = peg$c33;
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c34); }
                }
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c158(s2, s6);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseInlineDataFull() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 40) {
        s2 = peg$c17;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c18); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseVar();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseVar();
          }
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 41) {
              s5 = peg$c21;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c22); }
            }
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 123) {
                  s7 = peg$c31;
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c32); }
                }
                if (s7 !== peg$FAILED) {
                  s8 = [];
                  s9 = peg$parseWS();
                  while (s9 !== peg$FAILED) {
                    s8.push(s9);
                    s9 = peg$parseWS();
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = [];
                    s10 = peg$parseDataBlockTuple();
                    while (s10 !== peg$FAILED) {
                      s9.push(s10);
                      s10 = peg$parseDataBlockTuple();
                    }
                    if (s9 !== peg$FAILED) {
                      if (input.charCodeAt(peg$currPos) === 125) {
                        s10 = peg$c33;
                        peg$currPos++;
                      } else {
                        s10 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c34); }
                      }
                      if (s10 !== peg$FAILED) {
                        peg$savedPos = s0;
                        s1 = peg$c159(s4, s9);
                        s0 = s1;
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseDataBlockTuple() {
    var s0, s1, s2, s3, s4, s5, s6;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 40) {
      s1 = peg$c17;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c18); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseDataBlockValue();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseDataBlockValue();
        }
        if (s3 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 41) {
            s4 = peg$c21;
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c22); }
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseWS();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseWS();
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c160(s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseDataBlockValue() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    s1 = peg$parseIRIref();
    if (s1 === peg$FAILED) {
      s1 = peg$parseRDFLiteral();
      if (s1 === peg$FAILED) {
        s1 = peg$parseNumericLiteral();
        if (s1 === peg$FAILED) {
          s1 = peg$parseBooleanLiteral();
          if (s1 === peg$FAILED) {
            if (input.substr(peg$currPos, 5) === peg$c161) {
              s1 = peg$c161;
              peg$currPos += 5;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c162); }
            }
          }
        }
      }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c59(s1);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseMinusGraphPattern() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c163) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c164); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseGroupGraphPattern();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c165(s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseGroupOrUnionGraphPattern() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    s1 = peg$parseGroupGraphPattern();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      s4 = [];
      s5 = peg$parseWS();
      while (s5 !== peg$FAILED) {
        s4.push(s5);
        s5 = peg$parseWS();
      }
      if (s4 !== peg$FAILED) {
        if (input.substr(peg$currPos, 5).toLowerCase() === peg$c166) {
          s5 = input.substr(peg$currPos, 5);
          peg$currPos += 5;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c167); }
        }
        if (s5 !== peg$FAILED) {
          s6 = [];
          s7 = peg$parseWS();
          while (s7 !== peg$FAILED) {
            s6.push(s7);
            s7 = peg$parseWS();
          }
          if (s6 !== peg$FAILED) {
            s7 = peg$parseGroupGraphPattern();
            if (s7 !== peg$FAILED) {
              s4 = [s4, s5, s6, s7];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$currPos;
        s4 = [];
        s5 = peg$parseWS();
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parseWS();
        }
        if (s4 !== peg$FAILED) {
          if (input.substr(peg$currPos, 5).toLowerCase() === peg$c166) {
            s5 = input.substr(peg$currPos, 5);
            peg$currPos += 5;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c167); }
          }
          if (s5 !== peg$FAILED) {
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              s7 = peg$parseGroupGraphPattern();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c168(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseFilter() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.substr(peg$currPos, 6).toLowerCase() === peg$c169) {
        s2 = input.substr(peg$currPos, 6);
        peg$currPos += 6;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c170); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseConstraint();
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c171(s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseConstraint() {
    var s0;

    s0 = peg$parseBrackettedExpression();
    if (s0 === peg$FAILED) {
      s0 = peg$parseBuiltInCall();
      if (s0 === peg$FAILED) {
        s0 = peg$parseFunctionCall();
      }
    }

    return s0;
  }

  function peg$parseFunctionCall() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    s1 = peg$parseIRIref();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseArgList();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c172(s1, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseArgList() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11;

    s0 = peg$currPos;
    s1 = peg$parseNIL();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c173();
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 40) {
        s1 = peg$c17;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c18); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parseWS();
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parseWS();
        }
        if (s2 !== peg$FAILED) {
          if (input.substr(peg$currPos, 8).toLowerCase() === peg$c13) {
            s3 = input.substr(peg$currPos, 8);
            peg$currPos += 8;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c14); }
          }
          if (s3 === peg$FAILED) {
            s3 = null;
          }
          if (s3 !== peg$FAILED) {
            s4 = [];
            s5 = peg$parseWS();
            while (s5 !== peg$FAILED) {
              s4.push(s5);
              s5 = peg$parseWS();
            }
            if (s4 !== peg$FAILED) {
              s5 = peg$parseConditionalOrExpression();
              if (s5 !== peg$FAILED) {
                s6 = [];
                s7 = peg$parseWS();
                while (s7 !== peg$FAILED) {
                  s6.push(s7);
                  s7 = peg$parseWS();
                }
                if (s6 !== peg$FAILED) {
                  s7 = [];
                  s8 = peg$currPos;
                  if (input.charCodeAt(peg$currPos) === 44) {
                    s9 = peg$c174;
                    peg$currPos++;
                  } else {
                    s9 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c175); }
                  }
                  if (s9 !== peg$FAILED) {
                    s10 = [];
                    s11 = peg$parseWS();
                    while (s11 !== peg$FAILED) {
                      s10.push(s11);
                      s11 = peg$parseWS();
                    }
                    if (s10 !== peg$FAILED) {
                      s11 = peg$parseConditionalOrExpression();
                      if (s11 !== peg$FAILED) {
                        s9 = [s9, s10, s11];
                        s8 = s9;
                      } else {
                        peg$currPos = s8;
                        s8 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s8;
                      s8 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s8;
                    s8 = peg$FAILED;
                  }
                  while (s8 !== peg$FAILED) {
                    s7.push(s8);
                    s8 = peg$currPos;
                    if (input.charCodeAt(peg$currPos) === 44) {
                      s9 = peg$c174;
                      peg$currPos++;
                    } else {
                      s9 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c175); }
                    }
                    if (s9 !== peg$FAILED) {
                      s10 = [];
                      s11 = peg$parseWS();
                      while (s11 !== peg$FAILED) {
                        s10.push(s11);
                        s11 = peg$parseWS();
                      }
                      if (s10 !== peg$FAILED) {
                        s11 = peg$parseConditionalOrExpression();
                        if (s11 !== peg$FAILED) {
                          s9 = [s9, s10, s11];
                          s8 = s9;
                        } else {
                          peg$currPos = s8;
                          s8 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s8;
                        s8 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s8;
                      s8 = peg$FAILED;
                    }
                  }
                  if (s7 !== peg$FAILED) {
                    if (input.charCodeAt(peg$currPos) === 41) {
                      s8 = peg$c21;
                      peg$currPos++;
                    } else {
                      s8 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c22); }
                    }
                    if (s8 !== peg$FAILED) {
                      peg$savedPos = s0;
                      s1 = peg$c176(s3, s5, s7);
                      s0 = s1;
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseExpressionList() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;

    s0 = peg$currPos;
    s1 = peg$parseNIL();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c177();
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 40) {
        s1 = peg$c17;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c18); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parseWS();
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parseWS();
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parseIRIref();
          if (s3 === peg$FAILED) {
            s3 = peg$parseConditionalOrExpression();
          }
          if (s3 !== peg$FAILED) {
            s4 = [];
            s5 = peg$parseWS();
            while (s5 !== peg$FAILED) {
              s4.push(s5);
              s5 = peg$parseWS();
            }
            if (s4 !== peg$FAILED) {
              s5 = [];
              s6 = peg$currPos;
              if (input.charCodeAt(peg$currPos) === 44) {
                s7 = peg$c174;
                peg$currPos++;
              } else {
                s7 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c175); }
              }
              if (s7 !== peg$FAILED) {
                s8 = [];
                s9 = peg$parseWS();
                while (s9 !== peg$FAILED) {
                  s8.push(s9);
                  s9 = peg$parseWS();
                }
                if (s8 !== peg$FAILED) {
                  s9 = peg$parseIRIref();
                  if (s9 === peg$FAILED) {
                    s9 = peg$parseConditionalOrExpression();
                  }
                  if (s9 !== peg$FAILED) {
                    s7 = [s7, s8, s9];
                    s6 = s7;
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
              } else {
                peg$currPos = s6;
                s6 = peg$FAILED;
              }
              while (s6 !== peg$FAILED) {
                s5.push(s6);
                s6 = peg$currPos;
                if (input.charCodeAt(peg$currPos) === 44) {
                  s7 = peg$c174;
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c175); }
                }
                if (s7 !== peg$FAILED) {
                  s8 = [];
                  s9 = peg$parseWS();
                  while (s9 !== peg$FAILED) {
                    s8.push(s9);
                    s9 = peg$parseWS();
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = peg$parseIRIref();
                    if (s9 === peg$FAILED) {
                      s9 = peg$parseConditionalOrExpression();
                    }
                    if (s9 !== peg$FAILED) {
                      s7 = [s7, s8, s9];
                      s6 = s7;
                    } else {
                      peg$currPos = s6;
                      s6 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
              }
              if (s5 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 41) {
                  s6 = peg$c21;
                  peg$currPos++;
                } else {
                  s6 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c22); }
                }
                if (s6 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c178(s3, s5);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parseConstructTemplate() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 123) {
      s1 = peg$c31;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c32); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseConstructTriples();
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 125) {
              s5 = peg$c33;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c34); }
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c179(s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseConstructTriples() {
    var s0, s1, s2, s3, s4, s5, s6;

    s0 = peg$currPos;
    s1 = peg$parseTriplesSameSubject();
    if (s1 !== peg$FAILED) {
      s2 = peg$currPos;
      s3 = [];
      s4 = peg$parseWS();
      while (s4 !== peg$FAILED) {
        s3.push(s4);
        s4 = peg$parseWS();
      }
      if (s3 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 46) {
          s4 = peg$c139;
          peg$currPos++;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c140); }
        }
        if (s4 !== peg$FAILED) {
          s5 = [];
          s6 = peg$parseWS();
          while (s6 !== peg$FAILED) {
            s5.push(s6);
            s6 = peg$parseWS();
          }
          if (s5 !== peg$FAILED) {
            s6 = peg$parseConstructTriples();
            if (s6 === peg$FAILED) {
              s6 = null;
            }
            if (s6 !== peg$FAILED) {
              s3 = [s3, s4, s5, s6];
              s2 = s3;
            } else {
              peg$currPos = s2;
              s2 = peg$FAILED;
            }
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
      } else {
        peg$currPos = s2;
        s2 = peg$FAILED;
      }
      if (s2 === peg$FAILED) {
        s2 = null;
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c180(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseTriplesSameSubject() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    s1 = peg$parseVarOrTerm();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parsePropertyListNotEmpty();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c181(s1, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = [];
      s2 = peg$parseWS();
      while (s2 !== peg$FAILED) {
        s1.push(s2);
        s2 = peg$parseWS();
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseTriplesNode();
        if (s2 !== peg$FAILED) {
          s3 = [];
          s4 = peg$parseWS();
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$parseWS();
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parsePropertyList();
            if (s4 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c182(s2, s4);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parsePropertyList() {
    var s0;

    s0 = peg$parsePropertyListNotEmpty();
    if (s0 === peg$FAILED) {
      s0 = null;
    }

    return s0;
  }

  function peg$parsePropertyListNotEmpty() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12;

    s0 = peg$currPos;
    s1 = peg$parseVerb();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseObjectList();
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$currPos;
          s6 = [];
          s7 = peg$parseWS();
          while (s7 !== peg$FAILED) {
            s6.push(s7);
            s7 = peg$parseWS();
          }
          if (s6 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 59) {
              s7 = peg$c82;
              peg$currPos++;
            } else {
              s7 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c83); }
            }
            if (s7 !== peg$FAILED) {
              s8 = [];
              s9 = peg$parseWS();
              while (s9 !== peg$FAILED) {
                s8.push(s9);
                s9 = peg$parseWS();
              }
              if (s8 !== peg$FAILED) {
                s9 = peg$currPos;
                s10 = peg$parseVerb();
                if (s10 !== peg$FAILED) {
                  s11 = [];
                  s12 = peg$parseWS();
                  while (s12 !== peg$FAILED) {
                    s11.push(s12);
                    s12 = peg$parseWS();
                  }
                  if (s11 !== peg$FAILED) {
                    s12 = peg$parseObjectList();
                    if (s12 !== peg$FAILED) {
                      s10 = [s10, s11, s12];
                      s9 = s10;
                    } else {
                      peg$currPos = s9;
                      s9 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s9;
                    s9 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s9;
                  s9 = peg$FAILED;
                }
                if (s9 === peg$FAILED) {
                  s9 = null;
                }
                if (s9 !== peg$FAILED) {
                  s6 = [s6, s7, s8, s9];
                  s5 = s6;
                } else {
                  peg$currPos = s5;
                  s5 = peg$FAILED;
                }
              } else {
                peg$currPos = s5;
                s5 = peg$FAILED;
              }
            } else {
              peg$currPos = s5;
              s5 = peg$FAILED;
            }
          } else {
            peg$currPos = s5;
            s5 = peg$FAILED;
          }
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$currPos;
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 59) {
                s7 = peg$c82;
                peg$currPos++;
              } else {
                s7 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c83); }
              }
              if (s7 !== peg$FAILED) {
                s8 = [];
                s9 = peg$parseWS();
                while (s9 !== peg$FAILED) {
                  s8.push(s9);
                  s9 = peg$parseWS();
                }
                if (s8 !== peg$FAILED) {
                  s9 = peg$currPos;
                  s10 = peg$parseVerb();
                  if (s10 !== peg$FAILED) {
                    s11 = [];
                    s12 = peg$parseWS();
                    while (s12 !== peg$FAILED) {
                      s11.push(s12);
                      s12 = peg$parseWS();
                    }
                    if (s11 !== peg$FAILED) {
                      s12 = peg$parseObjectList();
                      if (s12 !== peg$FAILED) {
                        s10 = [s10, s11, s12];
                        s9 = s10;
                      } else {
                        peg$currPos = s9;
                        s9 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s9;
                      s9 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s9;
                    s9 = peg$FAILED;
                  }
                  if (s9 === peg$FAILED) {
                    s9 = null;
                  }
                  if (s9 !== peg$FAILED) {
                    s6 = [s6, s7, s8, s9];
                    s5 = s6;
                  } else {
                    peg$currPos = s5;
                    s5 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s5;
                  s5 = peg$FAILED;
                }
              } else {
                peg$currPos = s5;
                s5 = peg$FAILED;
              }
            } else {
              peg$currPos = s5;
              s5 = peg$FAILED;
            }
          }
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c183(s1, s3, s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseVerb() {
    var s0, s1;

    s0 = peg$parseVarOrIri();
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 97) {
        s1 = peg$c184;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c185); }
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c186();
      }
      s0 = s1;
    }

    return s0;
  }

  function peg$parseObjectList() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    s1 = peg$parseGraphNode();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      s4 = [];
      s5 = peg$parseWS();
      while (s5 !== peg$FAILED) {
        s4.push(s5);
        s5 = peg$parseWS();
      }
      if (s4 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 44) {
          s5 = peg$c174;
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c175); }
        }
        if (s5 !== peg$FAILED) {
          s6 = [];
          s7 = peg$parseWS();
          while (s7 !== peg$FAILED) {
            s6.push(s7);
            s7 = peg$parseWS();
          }
          if (s6 !== peg$FAILED) {
            s7 = peg$parseGraphNode();
            if (s7 !== peg$FAILED) {
              s4 = [s4, s5, s6, s7];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$currPos;
        s4 = [];
        s5 = peg$parseWS();
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parseWS();
        }
        if (s4 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 44) {
            s5 = peg$c174;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c175); }
          }
          if (s5 !== peg$FAILED) {
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              s7 = peg$parseGraphNode();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c187(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseTriplesSameSubjectPath() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    s1 = peg$parseVarOrTerm();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parsePropertyListPathNotEmpty();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c188(s1, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = [];
      s2 = peg$parseWS();
      while (s2 !== peg$FAILED) {
        s1.push(s2);
        s2 = peg$parseWS();
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parseTriplesNodePath();
        if (s2 !== peg$FAILED) {
          s3 = [];
          s4 = peg$parseWS();
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$parseWS();
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parsePropertyListPath();
            if (s4 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c189(s2, s4);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parsePropertyListPath() {
    var s0;

    s0 = peg$parsePropertyListPathNotEmpty();
    if (s0 === peg$FAILED) {
      s0 = null;
    }

    return s0;
  }

  function peg$parsePropertyListPathNotEmpty() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12;

    s0 = peg$currPos;
    s1 = peg$parsePathAlternative();
    if (s1 === peg$FAILED) {
      s1 = peg$parseVar();
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseObjectListPath();
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$currPos;
          s6 = [];
          s7 = peg$parseWS();
          while (s7 !== peg$FAILED) {
            s6.push(s7);
            s7 = peg$parseWS();
          }
          if (s6 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 59) {
              s7 = peg$c82;
              peg$currPos++;
            } else {
              s7 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c83); }
            }
            if (s7 !== peg$FAILED) {
              s8 = [];
              s9 = peg$parseWS();
              while (s9 !== peg$FAILED) {
                s8.push(s9);
                s9 = peg$parseWS();
              }
              if (s8 !== peg$FAILED) {
                s9 = peg$currPos;
                s10 = peg$parsePathAlternative();
                if (s10 === peg$FAILED) {
                  s10 = peg$parseVar();
                }
                if (s10 !== peg$FAILED) {
                  s11 = [];
                  s12 = peg$parseWS();
                  while (s12 !== peg$FAILED) {
                    s11.push(s12);
                    s12 = peg$parseWS();
                  }
                  if (s11 !== peg$FAILED) {
                    s12 = peg$parseObjectList();
                    if (s12 !== peg$FAILED) {
                      s10 = [s10, s11, s12];
                      s9 = s10;
                    } else {
                      peg$currPos = s9;
                      s9 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s9;
                    s9 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s9;
                  s9 = peg$FAILED;
                }
                if (s9 === peg$FAILED) {
                  s9 = null;
                }
                if (s9 !== peg$FAILED) {
                  s6 = [s6, s7, s8, s9];
                  s5 = s6;
                } else {
                  peg$currPos = s5;
                  s5 = peg$FAILED;
                }
              } else {
                peg$currPos = s5;
                s5 = peg$FAILED;
              }
            } else {
              peg$currPos = s5;
              s5 = peg$FAILED;
            }
          } else {
            peg$currPos = s5;
            s5 = peg$FAILED;
          }
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$currPos;
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 59) {
                s7 = peg$c82;
                peg$currPos++;
              } else {
                s7 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c83); }
              }
              if (s7 !== peg$FAILED) {
                s8 = [];
                s9 = peg$parseWS();
                while (s9 !== peg$FAILED) {
                  s8.push(s9);
                  s9 = peg$parseWS();
                }
                if (s8 !== peg$FAILED) {
                  s9 = peg$currPos;
                  s10 = peg$parsePathAlternative();
                  if (s10 === peg$FAILED) {
                    s10 = peg$parseVar();
                  }
                  if (s10 !== peg$FAILED) {
                    s11 = [];
                    s12 = peg$parseWS();
                    while (s12 !== peg$FAILED) {
                      s11.push(s12);
                      s12 = peg$parseWS();
                    }
                    if (s11 !== peg$FAILED) {
                      s12 = peg$parseObjectList();
                      if (s12 !== peg$FAILED) {
                        s10 = [s10, s11, s12];
                        s9 = s10;
                      } else {
                        peg$currPos = s9;
                        s9 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s9;
                      s9 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s9;
                    s9 = peg$FAILED;
                  }
                  if (s9 === peg$FAILED) {
                    s9 = null;
                  }
                  if (s9 !== peg$FAILED) {
                    s6 = [s6, s7, s8, s9];
                    s5 = s6;
                  } else {
                    peg$currPos = s5;
                    s5 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s5;
                  s5 = peg$FAILED;
                }
              } else {
                peg$currPos = s5;
                s5 = peg$FAILED;
              }
            } else {
              peg$currPos = s5;
              s5 = peg$FAILED;
            }
          }
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c183(s1, s3, s4);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseObjectListPath() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    s1 = peg$parseGraphNodePath();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      s4 = [];
      s5 = peg$parseWS();
      while (s5 !== peg$FAILED) {
        s4.push(s5);
        s5 = peg$parseWS();
      }
      if (s4 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 44) {
          s5 = peg$c174;
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c175); }
        }
        if (s5 !== peg$FAILED) {
          s6 = [];
          s7 = peg$parseWS();
          while (s7 !== peg$FAILED) {
            s6.push(s7);
            s7 = peg$parseWS();
          }
          if (s6 !== peg$FAILED) {
            s7 = peg$parseGraphNodePath();
            if (s7 !== peg$FAILED) {
              s4 = [s4, s5, s6, s7];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$currPos;
        s4 = [];
        s5 = peg$parseWS();
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parseWS();
        }
        if (s4 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 44) {
            s5 = peg$c174;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c175); }
          }
          if (s5 !== peg$FAILED) {
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              s7 = peg$parseGraphNodePath();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c187(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsePathAlternative() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    s1 = peg$parsePathSequence();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      s4 = [];
      s5 = peg$parseWS();
      while (s5 !== peg$FAILED) {
        s4.push(s5);
        s5 = peg$parseWS();
      }
      if (s4 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 124) {
          s5 = peg$c190;
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c191); }
        }
        if (s5 !== peg$FAILED) {
          s6 = [];
          s7 = peg$parseWS();
          while (s7 !== peg$FAILED) {
            s6.push(s7);
            s7 = peg$parseWS();
          }
          if (s6 !== peg$FAILED) {
            s7 = peg$parsePathSequence();
            if (s7 !== peg$FAILED) {
              s4 = [s4, s5, s6, s7];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$currPos;
        s4 = [];
        s5 = peg$parseWS();
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parseWS();
        }
        if (s4 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 124) {
            s5 = peg$c190;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c191); }
          }
          if (s5 !== peg$FAILED) {
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              s7 = peg$parsePathSequence();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c192(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsePathSequence() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    s1 = peg$parsePathEltOrInverse();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      s4 = [];
      s5 = peg$parseWS();
      while (s5 !== peg$FAILED) {
        s4.push(s5);
        s5 = peg$parseWS();
      }
      if (s4 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 47) {
          s5 = peg$c193;
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c194); }
        }
        if (s5 !== peg$FAILED) {
          s6 = [];
          s7 = peg$parseWS();
          while (s7 !== peg$FAILED) {
            s6.push(s7);
            s7 = peg$parseWS();
          }
          if (s6 !== peg$FAILED) {
            s7 = peg$parsePathEltOrInverse();
            if (s7 !== peg$FAILED) {
              s4 = [s4, s5, s6, s7];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$currPos;
        s4 = [];
        s5 = peg$parseWS();
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parseWS();
        }
        if (s4 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 47) {
            s5 = peg$c193;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c194); }
          }
          if (s5 !== peg$FAILED) {
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              s7 = peg$parsePathEltOrInverse();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c195(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsePathElt() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = peg$parsePathPrimary();
    if (s1 !== peg$FAILED) {
      s2 = peg$parsePathMod();
      if (s2 === peg$FAILED) {
        s2 = null;
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c196(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsePathEltOrInverse() {
    var s0, s1, s2;

    s0 = peg$parsePathElt();
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 94) {
        s1 = peg$c197;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c198); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parsePathElt();
        if (s2 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c199(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parsePathMod() {
    var s0;

    if (input.charCodeAt(peg$currPos) === 63) {
      s0 = peg$c200;
      peg$currPos++;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c201); }
    }
    if (s0 === peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 42) {
        s0 = peg$c23;
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c24); }
      }
      if (s0 === peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 43) {
          s0 = peg$c202;
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c203); }
        }
      }
    }

    return s0;
  }

  function peg$parsePathPrimary() {
    var s0, s1, s2, s3;

    s0 = peg$parseIRIref();
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 97) {
        s1 = peg$c184;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c185); }
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c186();
      }
      s0 = s1;
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 33) {
          s1 = peg$c204;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c205); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parsePathNegatedPropertySet();
          if (s2 !== peg$FAILED) {
            s1 = [s1, s2];
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 40) {
            s1 = peg$c17;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c18); }
          }
          if (s1 !== peg$FAILED) {
            s2 = peg$parsePathAlternative();
            if (s2 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 41) {
                s3 = peg$c21;
                peg$currPos++;
              } else {
                s3 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c22); }
              }
              if (s3 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c206(s2);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        }
      }
    }

    return s0;
  }

  function peg$parsePathNegatedPropertySet() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$parsePathOneInPropertySet();
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 40) {
        s1 = peg$c17;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c18); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$currPos;
        s3 = peg$parsePathOneInPropertySet();
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 124) {
            s6 = peg$c190;
            peg$currPos++;
          } else {
            s6 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c191); }
          }
          if (s6 !== peg$FAILED) {
            s7 = peg$parsePathOneInPropertySet();
            if (s7 !== peg$FAILED) {
              s6 = [s6, s7];
              s5 = s6;
            } else {
              peg$currPos = s5;
              s5 = peg$FAILED;
            }
          } else {
            peg$currPos = s5;
            s5 = peg$FAILED;
          }
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$currPos;
            if (input.charCodeAt(peg$currPos) === 124) {
              s6 = peg$c190;
              peg$currPos++;
            } else {
              s6 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c191); }
            }
            if (s6 !== peg$FAILED) {
              s7 = peg$parsePathOneInPropertySet();
              if (s7 !== peg$FAILED) {
                s6 = [s6, s7];
                s5 = s6;
              } else {
                peg$currPos = s5;
                s5 = peg$FAILED;
              }
            } else {
              peg$currPos = s5;
              s5 = peg$FAILED;
            }
          }
          if (s4 !== peg$FAILED) {
            s3 = [s3, s4];
            s2 = s3;
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
        if (s2 === peg$FAILED) {
          s2 = null;
        }
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 41) {
            s3 = peg$c21;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c22); }
          }
          if (s3 !== peg$FAILED) {
            s1 = [s1, s2, s3];
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    }

    return s0;
  }

  function peg$parsePathOneInPropertySet() {
    var s0, s1, s2;

    s0 = peg$parseIRIref();
    if (s0 === peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 97) {
        s0 = peg$c184;
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c185); }
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 94) {
          s1 = peg$c197;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c198); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseIRIref();
          if (s2 === peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 97) {
              s2 = peg$c184;
              peg$currPos++;
            } else {
              s2 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c185); }
            }
          }
          if (s2 !== peg$FAILED) {
            s1 = [s1, s2];
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      }
    }

    return s0;
  }

  function peg$parseTriplesNode() {
    var s0, s1;

    s0 = peg$currPos;
    s1 = peg$parseCollection();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c207(s1);
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$parseBlankNodePropertyList();
    }

    return s0;
  }

  function peg$parseBlankNodePropertyList() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 91) {
        s2 = peg$c208;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c209); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parsePropertyListNotEmpty();
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseWS();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseWS();
            }
            if (s5 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 93) {
                s6 = peg$c210;
                peg$currPos++;
              } else {
                s6 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c211); }
              }
              if (s6 !== peg$FAILED) {
                s7 = [];
                s8 = peg$parseWS();
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parseWS();
                }
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c212(s4);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseTriplesNodePath() {
    var s0, s1;

    s0 = peg$currPos;
    s1 = peg$parseCollectionPath();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c207(s1);
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$parseBlankNodePropertyListPath();
    }

    return s0;
  }

  function peg$parseBlankNodePropertyListPath() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 91) {
        s2 = peg$c208;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c209); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parsePropertyListPathNotEmpty();
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseWS();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseWS();
            }
            if (s5 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 93) {
                s6 = peg$c210;
                peg$currPos++;
              } else {
                s6 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c211); }
              }
              if (s6 !== peg$FAILED) {
                s7 = [];
                s8 = peg$parseWS();
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parseWS();
                }
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c212(s4);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseCollection() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 40) {
        s2 = peg$c17;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c18); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseGraphNode();
          if (s5 !== peg$FAILED) {
            while (s5 !== peg$FAILED) {
              s4.push(s5);
              s5 = peg$parseGraphNode();
            }
          } else {
            s4 = peg$FAILED;
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseWS();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseWS();
            }
            if (s5 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 41) {
                s6 = peg$c21;
                peg$currPos++;
              } else {
                s6 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c22); }
              }
              if (s6 !== peg$FAILED) {
                s7 = [];
                s8 = peg$parseWS();
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parseWS();
                }
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c213(s4);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseCollectionPath() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 40) {
        s2 = peg$c17;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c18); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseGraphNodePath();
          if (s5 !== peg$FAILED) {
            while (s5 !== peg$FAILED) {
              s4.push(s5);
              s5 = peg$parseGraphNodePath();
            }
          } else {
            s4 = peg$FAILED;
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$parseWS();
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$parseWS();
            }
            if (s5 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 41) {
                s6 = peg$c21;
                peg$currPos++;
              } else {
                s6 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c22); }
              }
              if (s6 !== peg$FAILED) {
                s7 = [];
                s8 = peg$parseWS();
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parseWS();
                }
                if (s7 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c213(s4);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseGraphNode() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseVarOrTerm();
      if (s2 === peg$FAILED) {
        s2 = peg$parseTriplesNode();
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c213(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseGraphNodePath() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseVarOrTerm();
      if (s2 === peg$FAILED) {
        s2 = peg$parseTriplesNodePath();
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c213(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseVarOrTerm() {
    var s0;

    s0 = peg$parseVar();
    if (s0 === peg$FAILED) {
      s0 = peg$parseGraphTerm();
    }

    return s0;
  }

  function peg$parseVarOrIri() {
    var s0;

    s0 = peg$parseVar();
    if (s0 === peg$FAILED) {
      s0 = peg$parseIRIref();
    }

    return s0;
  }

  function peg$parseVar() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    s1 = [];
    s2 = peg$parseWS();
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      s2 = peg$parseWS();
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseVAR1();
      if (s2 === peg$FAILED) {
        s2 = peg$parseVAR2();
        if (s2 === peg$FAILED) {
          s2 = peg$parseVAR3();
        }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$parseWS();
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$parseWS();
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c214(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseGraphTerm() {
    var s0;

    s0 = peg$parseIRIref();
    if (s0 === peg$FAILED) {
      s0 = peg$parseRDFLiteral();
      if (s0 === peg$FAILED) {
        s0 = peg$parseNumericLiteral();
        if (s0 === peg$FAILED) {
          s0 = peg$parseBooleanLiteral();
          if (s0 === peg$FAILED) {
            s0 = peg$parseBlankNode();
            if (s0 === peg$FAILED) {
              s0 = peg$parseNIL();
            }
          }
        }
      }
    }

    return s0;
  }

  function peg$parseConditionalOrExpression() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    s1 = peg$parseConditionalAndExpression();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      s4 = [];
      s5 = peg$parseWS();
      while (s5 !== peg$FAILED) {
        s4.push(s5);
        s5 = peg$parseWS();
      }
      if (s4 !== peg$FAILED) {
        if (input.substr(peg$currPos, 2) === peg$c215) {
          s5 = peg$c215;
          peg$currPos += 2;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c216); }
        }
        if (s5 !== peg$FAILED) {
          s6 = [];
          s7 = peg$parseWS();
          while (s7 !== peg$FAILED) {
            s6.push(s7);
            s7 = peg$parseWS();
          }
          if (s6 !== peg$FAILED) {
            s7 = peg$parseConditionalAndExpression();
            if (s7 !== peg$FAILED) {
              s4 = [s4, s5, s6, s7];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$currPos;
        s4 = [];
        s5 = peg$parseWS();
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parseWS();
        }
        if (s4 !== peg$FAILED) {
          if (input.substr(peg$currPos, 2) === peg$c215) {
            s5 = peg$c215;
            peg$currPos += 2;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c216); }
          }
          if (s5 !== peg$FAILED) {
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              s7 = peg$parseConditionalAndExpression();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c217(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseConditionalAndExpression() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    s1 = peg$parseRelationalExpression();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      s4 = [];
      s5 = peg$parseWS();
      while (s5 !== peg$FAILED) {
        s4.push(s5);
        s5 = peg$parseWS();
      }
      if (s4 !== peg$FAILED) {
        if (input.substr(peg$currPos, 2) === peg$c218) {
          s5 = peg$c218;
          peg$currPos += 2;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c219); }
        }
        if (s5 !== peg$FAILED) {
          s6 = [];
          s7 = peg$parseWS();
          while (s7 !== peg$FAILED) {
            s6.push(s7);
            s7 = peg$parseWS();
          }
          if (s6 !== peg$FAILED) {
            s7 = peg$parseRelationalExpression();
            if (s7 !== peg$FAILED) {
              s4 = [s4, s5, s6, s7];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$currPos;
        s4 = [];
        s5 = peg$parseWS();
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parseWS();
        }
        if (s4 !== peg$FAILED) {
          if (input.substr(peg$currPos, 2) === peg$c218) {
            s5 = peg$c218;
            peg$currPos += 2;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c219); }
          }
          if (s5 !== peg$FAILED) {
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              s7 = peg$parseRelationalExpression();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c220(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseRelationalExpression() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;

    s0 = peg$currPos;
    s1 = peg$parseAdditiveExpression();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      s4 = [];
      s5 = peg$parseWS();
      while (s5 !== peg$FAILED) {
        s4.push(s5);
        s5 = peg$parseWS();
      }
      if (s4 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 61) {
          s5 = peg$c221;
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c222); }
        }
        if (s5 !== peg$FAILED) {
          s6 = [];
          s7 = peg$parseWS();
          while (s7 !== peg$FAILED) {
            s6.push(s7);
            s7 = peg$parseWS();
          }
          if (s6 !== peg$FAILED) {
            s7 = peg$parseAdditiveExpression();
            if (s7 !== peg$FAILED) {
              s4 = [s4, s5, s6, s7];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      if (s3 === peg$FAILED) {
        s3 = peg$currPos;
        s4 = [];
        s5 = peg$parseWS();
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parseWS();
        }
        if (s4 !== peg$FAILED) {
          if (input.substr(peg$currPos, 2) === peg$c223) {
            s5 = peg$c223;
            peg$currPos += 2;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c224); }
          }
          if (s5 !== peg$FAILED) {
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              s7 = peg$parseAdditiveExpression();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
        if (s3 === peg$FAILED) {
          s3 = peg$currPos;
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 60) {
              s5 = peg$c225;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c226); }
            }
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                s7 = peg$parseAdditiveExpression();
                if (s7 !== peg$FAILED) {
                  s4 = [s4, s5, s6, s7];
                  s3 = s4;
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
          if (s3 === peg$FAILED) {
            s3 = peg$currPos;
            s4 = [];
            s5 = peg$parseWS();
            while (s5 !== peg$FAILED) {
              s4.push(s5);
              s5 = peg$parseWS();
            }
            if (s4 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 62) {
                s5 = peg$c227;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c228); }
              }
              if (s5 !== peg$FAILED) {
                s6 = [];
                s7 = peg$parseWS();
                while (s7 !== peg$FAILED) {
                  s6.push(s7);
                  s7 = peg$parseWS();
                }
                if (s6 !== peg$FAILED) {
                  s7 = peg$parseAdditiveExpression();
                  if (s7 !== peg$FAILED) {
                    s4 = [s4, s5, s6, s7];
                    s3 = s4;
                  } else {
                    peg$currPos = s3;
                    s3 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
            if (s3 === peg$FAILED) {
              s3 = peg$currPos;
              s4 = [];
              s5 = peg$parseWS();
              while (s5 !== peg$FAILED) {
                s4.push(s5);
                s5 = peg$parseWS();
              }
              if (s4 !== peg$FAILED) {
                if (input.substr(peg$currPos, 2) === peg$c229) {
                  s5 = peg$c229;
                  peg$currPos += 2;
                } else {
                  s5 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c230); }
                }
                if (s5 !== peg$FAILED) {
                  s6 = [];
                  s7 = peg$parseWS();
                  while (s7 !== peg$FAILED) {
                    s6.push(s7);
                    s7 = peg$parseWS();
                  }
                  if (s6 !== peg$FAILED) {
                    s7 = peg$parseAdditiveExpression();
                    if (s7 !== peg$FAILED) {
                      s4 = [s4, s5, s6, s7];
                      s3 = s4;
                    } else {
                      peg$currPos = s3;
                      s3 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s3;
                    s3 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
              if (s3 === peg$FAILED) {
                s3 = peg$currPos;
                s4 = [];
                s5 = peg$parseWS();
                while (s5 !== peg$FAILED) {
                  s4.push(s5);
                  s5 = peg$parseWS();
                }
                if (s4 !== peg$FAILED) {
                  if (input.substr(peg$currPos, 2) === peg$c231) {
                    s5 = peg$c231;
                    peg$currPos += 2;
                  } else {
                    s5 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c232); }
                  }
                  if (s5 !== peg$FAILED) {
                    s6 = [];
                    s7 = peg$parseWS();
                    while (s7 !== peg$FAILED) {
                      s6.push(s7);
                      s7 = peg$parseWS();
                    }
                    if (s6 !== peg$FAILED) {
                      s7 = peg$parseAdditiveExpression();
                      if (s7 !== peg$FAILED) {
                        s4 = [s4, s5, s6, s7];
                        s3 = s4;
                      } else {
                        peg$currPos = s3;
                        s3 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s3;
                      s3 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s3;
                    s3 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
                if (s3 === peg$FAILED) {
                  s3 = peg$currPos;
                  s4 = [];
                  s5 = peg$parseWS();
                  while (s5 !== peg$FAILED) {
                    s4.push(s5);
                    s5 = peg$parseWS();
                  }
                  if (s4 !== peg$FAILED) {
                    if (input.substr(peg$currPos, 2).toLowerCase() === peg$c233) {
                      s5 = input.substr(peg$currPos, 2);
                      peg$currPos += 2;
                    } else {
                      s5 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c234); }
                    }
                    if (s5 !== peg$FAILED) {
                      s6 = [];
                      s7 = peg$parseWS();
                      while (s7 !== peg$FAILED) {
                        s6.push(s7);
                        s7 = peg$parseWS();
                      }
                      if (s6 !== peg$FAILED) {
                        s7 = peg$parseExpressionList();
                        if (s7 !== peg$FAILED) {
                          s4 = [s4, s5, s6, s7];
                          s3 = s4;
                        } else {
                          peg$currPos = s3;
                          s3 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s3;
                        s3 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s3;
                      s3 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s3;
                    s3 = peg$FAILED;
                  }
                  if (s3 === peg$FAILED) {
                    s3 = peg$currPos;
                    s4 = [];
                    s5 = peg$parseWS();
                    while (s5 !== peg$FAILED) {
                      s4.push(s5);
                      s5 = peg$parseWS();
                    }
                    if (s4 !== peg$FAILED) {
                      if (input.substr(peg$currPos, 3).toLowerCase() === peg$c235) {
                        s5 = input.substr(peg$currPos, 3);
                        peg$currPos += 3;
                      } else {
                        s5 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c236); }
                      }
                      if (s5 !== peg$FAILED) {
                        s6 = [];
                        s7 = peg$parseWS();
                        while (s7 !== peg$FAILED) {
                          s6.push(s7);
                          s7 = peg$parseWS();
                        }
                        if (s6 !== peg$FAILED) {
                          if (input.substr(peg$currPos, 2).toLowerCase() === peg$c233) {
                            s7 = input.substr(peg$currPos, 2);
                            peg$currPos += 2;
                          } else {
                            s7 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c234); }
                          }
                          if (s7 !== peg$FAILED) {
                            s8 = [];
                            s9 = peg$parseWS();
                            while (s9 !== peg$FAILED) {
                              s8.push(s9);
                              s9 = peg$parseWS();
                            }
                            if (s8 !== peg$FAILED) {
                              s9 = peg$parseExpressionList();
                              if (s9 !== peg$FAILED) {
                                s4 = [s4, s5, s6, s7, s8, s9];
                                s3 = s4;
                              } else {
                                peg$currPos = s3;
                                s3 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s3;
                              s3 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s3;
                            s3 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s3;
                          s3 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s3;
                        s3 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s3;
                      s3 = peg$FAILED;
                    }
                  }
                }
              }
            }
          }
        }
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$currPos;
        s4 = [];
        s5 = peg$parseWS();
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parseWS();
        }
        if (s4 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 61) {
            s5 = peg$c221;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c222); }
          }
          if (s5 !== peg$FAILED) {
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              s7 = peg$parseAdditiveExpression();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
        if (s3 === peg$FAILED) {
          s3 = peg$currPos;
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            if (input.substr(peg$currPos, 2) === peg$c223) {
              s5 = peg$c223;
              peg$currPos += 2;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c224); }
            }
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                s7 = peg$parseAdditiveExpression();
                if (s7 !== peg$FAILED) {
                  s4 = [s4, s5, s6, s7];
                  s3 = s4;
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
          if (s3 === peg$FAILED) {
            s3 = peg$currPos;
            s4 = [];
            s5 = peg$parseWS();
            while (s5 !== peg$FAILED) {
              s4.push(s5);
              s5 = peg$parseWS();
            }
            if (s4 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 60) {
                s5 = peg$c225;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c226); }
              }
              if (s5 !== peg$FAILED) {
                s6 = [];
                s7 = peg$parseWS();
                while (s7 !== peg$FAILED) {
                  s6.push(s7);
                  s7 = peg$parseWS();
                }
                if (s6 !== peg$FAILED) {
                  s7 = peg$parseAdditiveExpression();
                  if (s7 !== peg$FAILED) {
                    s4 = [s4, s5, s6, s7];
                    s3 = s4;
                  } else {
                    peg$currPos = s3;
                    s3 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
            if (s3 === peg$FAILED) {
              s3 = peg$currPos;
              s4 = [];
              s5 = peg$parseWS();
              while (s5 !== peg$FAILED) {
                s4.push(s5);
                s5 = peg$parseWS();
              }
              if (s4 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 62) {
                  s5 = peg$c227;
                  peg$currPos++;
                } else {
                  s5 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c228); }
                }
                if (s5 !== peg$FAILED) {
                  s6 = [];
                  s7 = peg$parseWS();
                  while (s7 !== peg$FAILED) {
                    s6.push(s7);
                    s7 = peg$parseWS();
                  }
                  if (s6 !== peg$FAILED) {
                    s7 = peg$parseAdditiveExpression();
                    if (s7 !== peg$FAILED) {
                      s4 = [s4, s5, s6, s7];
                      s3 = s4;
                    } else {
                      peg$currPos = s3;
                      s3 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s3;
                    s3 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
              if (s3 === peg$FAILED) {
                s3 = peg$currPos;
                s4 = [];
                s5 = peg$parseWS();
                while (s5 !== peg$FAILED) {
                  s4.push(s5);
                  s5 = peg$parseWS();
                }
                if (s4 !== peg$FAILED) {
                  if (input.substr(peg$currPos, 2) === peg$c229) {
                    s5 = peg$c229;
                    peg$currPos += 2;
                  } else {
                    s5 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c230); }
                  }
                  if (s5 !== peg$FAILED) {
                    s6 = [];
                    s7 = peg$parseWS();
                    while (s7 !== peg$FAILED) {
                      s6.push(s7);
                      s7 = peg$parseWS();
                    }
                    if (s6 !== peg$FAILED) {
                      s7 = peg$parseAdditiveExpression();
                      if (s7 !== peg$FAILED) {
                        s4 = [s4, s5, s6, s7];
                        s3 = s4;
                      } else {
                        peg$currPos = s3;
                        s3 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s3;
                      s3 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s3;
                    s3 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
                if (s3 === peg$FAILED) {
                  s3 = peg$currPos;
                  s4 = [];
                  s5 = peg$parseWS();
                  while (s5 !== peg$FAILED) {
                    s4.push(s5);
                    s5 = peg$parseWS();
                  }
                  if (s4 !== peg$FAILED) {
                    if (input.substr(peg$currPos, 2) === peg$c231) {
                      s5 = peg$c231;
                      peg$currPos += 2;
                    } else {
                      s5 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c232); }
                    }
                    if (s5 !== peg$FAILED) {
                      s6 = [];
                      s7 = peg$parseWS();
                      while (s7 !== peg$FAILED) {
                        s6.push(s7);
                        s7 = peg$parseWS();
                      }
                      if (s6 !== peg$FAILED) {
                        s7 = peg$parseAdditiveExpression();
                        if (s7 !== peg$FAILED) {
                          s4 = [s4, s5, s6, s7];
                          s3 = s4;
                        } else {
                          peg$currPos = s3;
                          s3 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s3;
                        s3 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s3;
                      s3 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s3;
                    s3 = peg$FAILED;
                  }
                  if (s3 === peg$FAILED) {
                    s3 = peg$currPos;
                    s4 = [];
                    s5 = peg$parseWS();
                    while (s5 !== peg$FAILED) {
                      s4.push(s5);
                      s5 = peg$parseWS();
                    }
                    if (s4 !== peg$FAILED) {
                      if (input.substr(peg$currPos, 2).toLowerCase() === peg$c233) {
                        s5 = input.substr(peg$currPos, 2);
                        peg$currPos += 2;
                      } else {
                        s5 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c234); }
                      }
                      if (s5 !== peg$FAILED) {
                        s6 = [];
                        s7 = peg$parseWS();
                        while (s7 !== peg$FAILED) {
                          s6.push(s7);
                          s7 = peg$parseWS();
                        }
                        if (s6 !== peg$FAILED) {
                          s7 = peg$parseExpressionList();
                          if (s7 !== peg$FAILED) {
                            s4 = [s4, s5, s6, s7];
                            s3 = s4;
                          } else {
                            peg$currPos = s3;
                            s3 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s3;
                          s3 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s3;
                        s3 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s3;
                      s3 = peg$FAILED;
                    }
                    if (s3 === peg$FAILED) {
                      s3 = peg$currPos;
                      s4 = [];
                      s5 = peg$parseWS();
                      while (s5 !== peg$FAILED) {
                        s4.push(s5);
                        s5 = peg$parseWS();
                      }
                      if (s4 !== peg$FAILED) {
                        if (input.substr(peg$currPos, 3).toLowerCase() === peg$c235) {
                          s5 = input.substr(peg$currPos, 3);
                          peg$currPos += 3;
                        } else {
                          s5 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c236); }
                        }
                        if (s5 !== peg$FAILED) {
                          s6 = [];
                          s7 = peg$parseWS();
                          while (s7 !== peg$FAILED) {
                            s6.push(s7);
                            s7 = peg$parseWS();
                          }
                          if (s6 !== peg$FAILED) {
                            if (input.substr(peg$currPos, 2).toLowerCase() === peg$c233) {
                              s7 = input.substr(peg$currPos, 2);
                              peg$currPos += 2;
                            } else {
                              s7 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c234); }
                            }
                            if (s7 !== peg$FAILED) {
                              s8 = [];
                              s9 = peg$parseWS();
                              while (s9 !== peg$FAILED) {
                                s8.push(s9);
                                s9 = peg$parseWS();
                              }
                              if (s8 !== peg$FAILED) {
                                s9 = peg$parseExpressionList();
                                if (s9 !== peg$FAILED) {
                                  s4 = [s4, s5, s6, s7, s8, s9];
                                  s3 = s4;
                                } else {
                                  peg$currPos = s3;
                                  s3 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s3;
                                s3 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s3;
                              s3 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s3;
                            s3 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s3;
                          s3 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s3;
                        s3 = peg$FAILED;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c237(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseAdditiveExpression() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10;

    s0 = peg$currPos;
    s1 = peg$parseMultiplicativeExpression();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      s4 = [];
      s5 = peg$parseWS();
      while (s5 !== peg$FAILED) {
        s4.push(s5);
        s5 = peg$parseWS();
      }
      if (s4 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 43) {
          s5 = peg$c202;
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c203); }
        }
        if (s5 !== peg$FAILED) {
          s6 = [];
          s7 = peg$parseWS();
          while (s7 !== peg$FAILED) {
            s6.push(s7);
            s7 = peg$parseWS();
          }
          if (s6 !== peg$FAILED) {
            s7 = peg$parseMultiplicativeExpression();
            if (s7 !== peg$FAILED) {
              s4 = [s4, s5, s6, s7];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      if (s3 === peg$FAILED) {
        s3 = peg$currPos;
        s4 = [];
        s5 = peg$parseWS();
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parseWS();
        }
        if (s4 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 45) {
            s5 = peg$c238;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c239); }
          }
          if (s5 !== peg$FAILED) {
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              s7 = peg$parseMultiplicativeExpression();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
        if (s3 === peg$FAILED) {
          s3 = peg$currPos;
          s4 = peg$parseNumericLiteralPositive();
          if (s4 === peg$FAILED) {
            s4 = peg$parseNumericLiteralNegative();
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            s6 = peg$currPos;
            s7 = [];
            s8 = peg$parseWS();
            while (s8 !== peg$FAILED) {
              s7.push(s8);
              s8 = peg$parseWS();
            }
            if (s7 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 42) {
                s8 = peg$c23;
                peg$currPos++;
              } else {
                s8 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c24); }
              }
              if (s8 !== peg$FAILED) {
                s9 = [];
                s10 = peg$parseWS();
                while (s10 !== peg$FAILED) {
                  s9.push(s10);
                  s10 = peg$parseWS();
                }
                if (s9 !== peg$FAILED) {
                  s10 = peg$parseUnaryExpression();
                  if (s10 !== peg$FAILED) {
                    s7 = [s7, s8, s9, s10];
                    s6 = s7;
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
              } else {
                peg$currPos = s6;
                s6 = peg$FAILED;
              }
            } else {
              peg$currPos = s6;
              s6 = peg$FAILED;
            }
            if (s6 === peg$FAILED) {
              s6 = peg$currPos;
              s7 = [];
              s8 = peg$parseWS();
              while (s8 !== peg$FAILED) {
                s7.push(s8);
                s8 = peg$parseWS();
              }
              if (s7 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 47) {
                  s8 = peg$c193;
                  peg$currPos++;
                } else {
                  s8 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c194); }
                }
                if (s8 !== peg$FAILED) {
                  s9 = [];
                  s10 = peg$parseWS();
                  while (s10 !== peg$FAILED) {
                    s9.push(s10);
                    s10 = peg$parseWS();
                  }
                  if (s9 !== peg$FAILED) {
                    s10 = peg$parseUnaryExpression();
                    if (s10 !== peg$FAILED) {
                      s7 = [s7, s8, s9, s10];
                      s6 = s7;
                    } else {
                      peg$currPos = s6;
                      s6 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
              } else {
                peg$currPos = s6;
                s6 = peg$FAILED;
              }
            }
            while (s6 !== peg$FAILED) {
              s5.push(s6);
              s6 = peg$currPos;
              s7 = [];
              s8 = peg$parseWS();
              while (s8 !== peg$FAILED) {
                s7.push(s8);
                s8 = peg$parseWS();
              }
              if (s7 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 42) {
                  s8 = peg$c23;
                  peg$currPos++;
                } else {
                  s8 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c24); }
                }
                if (s8 !== peg$FAILED) {
                  s9 = [];
                  s10 = peg$parseWS();
                  while (s10 !== peg$FAILED) {
                    s9.push(s10);
                    s10 = peg$parseWS();
                  }
                  if (s9 !== peg$FAILED) {
                    s10 = peg$parseUnaryExpression();
                    if (s10 !== peg$FAILED) {
                      s7 = [s7, s8, s9, s10];
                      s6 = s7;
                    } else {
                      peg$currPos = s6;
                      s6 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
              } else {
                peg$currPos = s6;
                s6 = peg$FAILED;
              }
              if (s6 === peg$FAILED) {
                s6 = peg$currPos;
                s7 = [];
                s8 = peg$parseWS();
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parseWS();
                }
                if (s7 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 47) {
                    s8 = peg$c193;
                    peg$currPos++;
                  } else {
                    s8 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c194); }
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = [];
                    s10 = peg$parseWS();
                    while (s10 !== peg$FAILED) {
                      s9.push(s10);
                      s10 = peg$parseWS();
                    }
                    if (s9 !== peg$FAILED) {
                      s10 = peg$parseUnaryExpression();
                      if (s10 !== peg$FAILED) {
                        s7 = [s7, s8, s9, s10];
                        s6 = s7;
                      } else {
                        peg$currPos = s6;
                        s6 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s6;
                      s6 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
              }
            }
            if (s5 !== peg$FAILED) {
              s4 = [s4, s5];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        }
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$currPos;
        s4 = [];
        s5 = peg$parseWS();
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parseWS();
        }
        if (s4 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 43) {
            s5 = peg$c202;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c203); }
          }
          if (s5 !== peg$FAILED) {
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              s7 = peg$parseMultiplicativeExpression();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
        if (s3 === peg$FAILED) {
          s3 = peg$currPos;
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 45) {
              s5 = peg$c238;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c239); }
            }
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                s7 = peg$parseMultiplicativeExpression();
                if (s7 !== peg$FAILED) {
                  s4 = [s4, s5, s6, s7];
                  s3 = s4;
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
          if (s3 === peg$FAILED) {
            s3 = peg$currPos;
            s4 = peg$parseNumericLiteralPositive();
            if (s4 === peg$FAILED) {
              s4 = peg$parseNumericLiteralNegative();
            }
            if (s4 !== peg$FAILED) {
              s5 = [];
              s6 = peg$currPos;
              s7 = [];
              s8 = peg$parseWS();
              while (s8 !== peg$FAILED) {
                s7.push(s8);
                s8 = peg$parseWS();
              }
              if (s7 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 42) {
                  s8 = peg$c23;
                  peg$currPos++;
                } else {
                  s8 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c24); }
                }
                if (s8 !== peg$FAILED) {
                  s9 = [];
                  s10 = peg$parseWS();
                  while (s10 !== peg$FAILED) {
                    s9.push(s10);
                    s10 = peg$parseWS();
                  }
                  if (s9 !== peg$FAILED) {
                    s10 = peg$parseUnaryExpression();
                    if (s10 !== peg$FAILED) {
                      s7 = [s7, s8, s9, s10];
                      s6 = s7;
                    } else {
                      peg$currPos = s6;
                      s6 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
              } else {
                peg$currPos = s6;
                s6 = peg$FAILED;
              }
              if (s6 === peg$FAILED) {
                s6 = peg$currPos;
                s7 = [];
                s8 = peg$parseWS();
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parseWS();
                }
                if (s7 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 47) {
                    s8 = peg$c193;
                    peg$currPos++;
                  } else {
                    s8 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c194); }
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = [];
                    s10 = peg$parseWS();
                    while (s10 !== peg$FAILED) {
                      s9.push(s10);
                      s10 = peg$parseWS();
                    }
                    if (s9 !== peg$FAILED) {
                      s10 = peg$parseUnaryExpression();
                      if (s10 !== peg$FAILED) {
                        s7 = [s7, s8, s9, s10];
                        s6 = s7;
                      } else {
                        peg$currPos = s6;
                        s6 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s6;
                      s6 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
              }
              while (s6 !== peg$FAILED) {
                s5.push(s6);
                s6 = peg$currPos;
                s7 = [];
                s8 = peg$parseWS();
                while (s8 !== peg$FAILED) {
                  s7.push(s8);
                  s8 = peg$parseWS();
                }
                if (s7 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 42) {
                    s8 = peg$c23;
                    peg$currPos++;
                  } else {
                    s8 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c24); }
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = [];
                    s10 = peg$parseWS();
                    while (s10 !== peg$FAILED) {
                      s9.push(s10);
                      s10 = peg$parseWS();
                    }
                    if (s9 !== peg$FAILED) {
                      s10 = peg$parseUnaryExpression();
                      if (s10 !== peg$FAILED) {
                        s7 = [s7, s8, s9, s10];
                        s6 = s7;
                      } else {
                        peg$currPos = s6;
                        s6 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s6;
                      s6 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s6;
                  s6 = peg$FAILED;
                }
                if (s6 === peg$FAILED) {
                  s6 = peg$currPos;
                  s7 = [];
                  s8 = peg$parseWS();
                  while (s8 !== peg$FAILED) {
                    s7.push(s8);
                    s8 = peg$parseWS();
                  }
                  if (s7 !== peg$FAILED) {
                    if (input.charCodeAt(peg$currPos) === 47) {
                      s8 = peg$c193;
                      peg$currPos++;
                    } else {
                      s8 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c194); }
                    }
                    if (s8 !== peg$FAILED) {
                      s9 = [];
                      s10 = peg$parseWS();
                      while (s10 !== peg$FAILED) {
                        s9.push(s10);
                        s10 = peg$parseWS();
                      }
                      if (s9 !== peg$FAILED) {
                        s10 = peg$parseUnaryExpression();
                        if (s10 !== peg$FAILED) {
                          s7 = [s7, s8, s9, s10];
                          s6 = s7;
                        } else {
                          peg$currPos = s6;
                          s6 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s6;
                        s6 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s6;
                      s6 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s6;
                    s6 = peg$FAILED;
                  }
                }
              }
              if (s5 !== peg$FAILED) {
                s4 = [s4, s5];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          }
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c240(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseMultiplicativeExpression() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    s1 = peg$parseUnaryExpression();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      s4 = [];
      s5 = peg$parseWS();
      while (s5 !== peg$FAILED) {
        s4.push(s5);
        s5 = peg$parseWS();
      }
      if (s4 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 42) {
          s5 = peg$c23;
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c24); }
        }
        if (s5 !== peg$FAILED) {
          s6 = [];
          s7 = peg$parseWS();
          while (s7 !== peg$FAILED) {
            s6.push(s7);
            s7 = peg$parseWS();
          }
          if (s6 !== peg$FAILED) {
            s7 = peg$parseUnaryExpression();
            if (s7 !== peg$FAILED) {
              s4 = [s4, s5, s6, s7];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      if (s3 === peg$FAILED) {
        s3 = peg$currPos;
        s4 = [];
        s5 = peg$parseWS();
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parseWS();
        }
        if (s4 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 47) {
            s5 = peg$c193;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c194); }
          }
          if (s5 !== peg$FAILED) {
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              s7 = peg$parseUnaryExpression();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$currPos;
        s4 = [];
        s5 = peg$parseWS();
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parseWS();
        }
        if (s4 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 42) {
            s5 = peg$c23;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c24); }
          }
          if (s5 !== peg$FAILED) {
            s6 = [];
            s7 = peg$parseWS();
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              s7 = peg$parseWS();
            }
            if (s6 !== peg$FAILED) {
              s7 = peg$parseUnaryExpression();
              if (s7 !== peg$FAILED) {
                s4 = [s4, s5, s6, s7];
                s3 = s4;
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
        if (s3 === peg$FAILED) {
          s3 = peg$currPos;
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 47) {
              s5 = peg$c193;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c194); }
            }
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                s7 = peg$parseUnaryExpression();
                if (s7 !== peg$FAILED) {
                  s4 = [s4, s5, s6, s7];
                  s3 = s4;
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c241(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseUnaryExpression() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 33) {
      s1 = peg$c204;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c205); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parsePrimaryExpression();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c242(s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 43) {
        s1 = peg$c202;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c203); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parseWS();
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parseWS();
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parsePrimaryExpression();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c243(s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 45) {
          s1 = peg$c238;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c239); }
        }
        if (s1 !== peg$FAILED) {
          s2 = [];
          s3 = peg$parseWS();
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            s3 = peg$parseWS();
          }
          if (s2 !== peg$FAILED) {
            s3 = peg$parsePrimaryExpression();
            if (s3 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c244(s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$parsePrimaryExpression();
        }
      }
    }

    return s0;
  }

  function peg$parsePrimaryExpression() {
    var s0, s1;

    s0 = peg$parseBrackettedExpression();
    if (s0 === peg$FAILED) {
      s0 = peg$parseBuiltInCall();
      if (s0 === peg$FAILED) {
        s0 = peg$parseIRIrefOrFunction();
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$parseRDFLiteral();
          if (s1 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c245(s1);
          }
          s0 = s1;
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            s1 = peg$parseNumericLiteral();
            if (s1 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c246(s1);
            }
            s0 = s1;
            if (s0 === peg$FAILED) {
              s0 = peg$currPos;
              s1 = peg$parseBooleanLiteral();
              if (s1 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c247(s1);
              }
              s0 = s1;
              if (s0 === peg$FAILED) {
                s0 = peg$currPos;
                s1 = peg$parseVar();
                if (s1 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c248(s1);
                }
                s0 = s1;
              }
            }
          }
        }
      }
    }

    return s0;
  }

  function peg$parseBrackettedExpression() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 40) {
      s1 = peg$c17;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c18); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseConditionalOrExpression();
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 41) {
              s5 = peg$c21;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c22); }
            }
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c249(s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseBuiltInCall() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, s13, s14, s15;

    s0 = peg$parseAggregate();
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 3).toLowerCase() === peg$c250) {
        s1 = input.substr(peg$currPos, 3);
        peg$currPos += 3;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c251); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parseWS();
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parseWS();
        }
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 40) {
            s3 = peg$c17;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c18); }
          }
          if (s3 !== peg$FAILED) {
            s4 = [];
            s5 = peg$parseWS();
            while (s5 !== peg$FAILED) {
              s4.push(s5);
              s5 = peg$parseWS();
            }
            if (s4 !== peg$FAILED) {
              s5 = peg$parseConditionalOrExpression();
              if (s5 !== peg$FAILED) {
                s6 = [];
                s7 = peg$parseWS();
                while (s7 !== peg$FAILED) {
                  s6.push(s7);
                  s7 = peg$parseWS();
                }
                if (s6 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 41) {
                    s7 = peg$c21;
                    peg$currPos++;
                  } else {
                    s7 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c22); }
                  }
                  if (s7 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c252(s5);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 4).toLowerCase() === peg$c253) {
          s1 = input.substr(peg$currPos, 4);
          peg$currPos += 4;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c254); }
        }
        if (s1 !== peg$FAILED) {
          s2 = [];
          s3 = peg$parseWS();
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            s3 = peg$parseWS();
          }
          if (s2 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 40) {
              s3 = peg$c17;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c18); }
            }
            if (s3 !== peg$FAILED) {
              s4 = [];
              s5 = peg$parseWS();
              while (s5 !== peg$FAILED) {
                s4.push(s5);
                s5 = peg$parseWS();
              }
              if (s4 !== peg$FAILED) {
                s5 = peg$parseConditionalOrExpression();
                if (s5 !== peg$FAILED) {
                  s6 = [];
                  s7 = peg$parseWS();
                  while (s7 !== peg$FAILED) {
                    s6.push(s7);
                    s7 = peg$parseWS();
                  }
                  if (s6 !== peg$FAILED) {
                    if (input.charCodeAt(peg$currPos) === 41) {
                      s7 = peg$c21;
                      peg$currPos++;
                    } else {
                      s7 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c22); }
                    }
                    if (s7 !== peg$FAILED) {
                      peg$savedPos = s0;
                      s1 = peg$c255(s5);
                      s0 = s1;
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.substr(peg$currPos, 11).toLowerCase() === peg$c256) {
            s1 = input.substr(peg$currPos, 11);
            peg$currPos += 11;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c257); }
          }
          if (s1 !== peg$FAILED) {
            s2 = [];
            s3 = peg$parseWS();
            while (s3 !== peg$FAILED) {
              s2.push(s3);
              s3 = peg$parseWS();
            }
            if (s2 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 40) {
                s3 = peg$c17;
                peg$currPos++;
              } else {
                s3 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c18); }
              }
              if (s3 !== peg$FAILED) {
                s4 = [];
                s5 = peg$parseWS();
                while (s5 !== peg$FAILED) {
                  s4.push(s5);
                  s5 = peg$parseWS();
                }
                if (s4 !== peg$FAILED) {
                  s5 = peg$parseConditionalOrExpression();
                  if (s5 !== peg$FAILED) {
                    s6 = [];
                    s7 = peg$parseWS();
                    while (s7 !== peg$FAILED) {
                      s6.push(s7);
                      s7 = peg$parseWS();
                    }
                    if (s6 !== peg$FAILED) {
                      if (input.charCodeAt(peg$currPos) === 44) {
                        s7 = peg$c174;
                        peg$currPos++;
                      } else {
                        s7 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c175); }
                      }
                      if (s7 !== peg$FAILED) {
                        s8 = [];
                        s9 = peg$parseWS();
                        while (s9 !== peg$FAILED) {
                          s8.push(s9);
                          s9 = peg$parseWS();
                        }
                        if (s8 !== peg$FAILED) {
                          s9 = peg$parseConditionalOrExpression();
                          if (s9 !== peg$FAILED) {
                            s10 = [];
                            s11 = peg$parseWS();
                            while (s11 !== peg$FAILED) {
                              s10.push(s11);
                              s11 = peg$parseWS();
                            }
                            if (s10 !== peg$FAILED) {
                              if (input.charCodeAt(peg$currPos) === 41) {
                                s11 = peg$c21;
                                peg$currPos++;
                              } else {
                                s11 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c22); }
                              }
                              if (s11 !== peg$FAILED) {
                                peg$savedPos = s0;
                                s1 = peg$c258(s5, s9);
                                s0 = s1;
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            if (input.substr(peg$currPos, 8).toLowerCase() === peg$c259) {
              s1 = input.substr(peg$currPos, 8);
              peg$currPos += 8;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c260); }
            }
            if (s1 !== peg$FAILED) {
              s2 = [];
              s3 = peg$parseWS();
              while (s3 !== peg$FAILED) {
                s2.push(s3);
                s3 = peg$parseWS();
              }
              if (s2 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 40) {
                  s3 = peg$c17;
                  peg$currPos++;
                } else {
                  s3 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c18); }
                }
                if (s3 !== peg$FAILED) {
                  s4 = [];
                  s5 = peg$parseWS();
                  while (s5 !== peg$FAILED) {
                    s4.push(s5);
                    s5 = peg$parseWS();
                  }
                  if (s4 !== peg$FAILED) {
                    s5 = peg$parseConditionalOrExpression();
                    if (s5 !== peg$FAILED) {
                      s6 = [];
                      s7 = peg$parseWS();
                      while (s7 !== peg$FAILED) {
                        s6.push(s7);
                        s7 = peg$parseWS();
                      }
                      if (s6 !== peg$FAILED) {
                        if (input.charCodeAt(peg$currPos) === 41) {
                          s7 = peg$c21;
                          peg$currPos++;
                        } else {
                          s7 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c22); }
                        }
                        if (s7 !== peg$FAILED) {
                          peg$savedPos = s0;
                          s1 = peg$c261(s5);
                          s0 = s1;
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
            if (s0 === peg$FAILED) {
              s0 = peg$currPos;
              if (input.substr(peg$currPos, 5).toLowerCase() === peg$c262) {
                s1 = input.substr(peg$currPos, 5);
                peg$currPos += 5;
              } else {
                s1 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c263); }
              }
              if (s1 !== peg$FAILED) {
                s2 = [];
                s3 = peg$parseWS();
                while (s3 !== peg$FAILED) {
                  s2.push(s3);
                  s3 = peg$parseWS();
                }
                if (s2 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 40) {
                    s3 = peg$c17;
                    peg$currPos++;
                  } else {
                    s3 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c18); }
                  }
                  if (s3 !== peg$FAILED) {
                    s4 = [];
                    s5 = peg$parseWS();
                    while (s5 !== peg$FAILED) {
                      s4.push(s5);
                      s5 = peg$parseWS();
                    }
                    if (s4 !== peg$FAILED) {
                      s5 = peg$parseVar();
                      if (s5 !== peg$FAILED) {
                        s6 = [];
                        s7 = peg$parseWS();
                        while (s7 !== peg$FAILED) {
                          s6.push(s7);
                          s7 = peg$parseWS();
                        }
                        if (s6 !== peg$FAILED) {
                          if (input.charCodeAt(peg$currPos) === 41) {
                            s7 = peg$c21;
                            peg$currPos++;
                          } else {
                            s7 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c22); }
                          }
                          if (s7 !== peg$FAILED) {
                            peg$savedPos = s0;
                            s1 = peg$c264(s5);
                            s0 = s1;
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
              if (s0 === peg$FAILED) {
                s0 = peg$currPos;
                if (input.substr(peg$currPos, 3).toLowerCase() === peg$c265) {
                  s1 = input.substr(peg$currPos, 3);
                  peg$currPos += 3;
                } else {
                  s1 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c266); }
                }
                if (s1 !== peg$FAILED) {
                  s2 = [];
                  s3 = peg$parseWS();
                  while (s3 !== peg$FAILED) {
                    s2.push(s3);
                    s3 = peg$parseWS();
                  }
                  if (s2 !== peg$FAILED) {
                    if (input.charCodeAt(peg$currPos) === 40) {
                      s3 = peg$c17;
                      peg$currPos++;
                    } else {
                      s3 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c18); }
                    }
                    if (s3 !== peg$FAILED) {
                      s4 = [];
                      s5 = peg$parseWS();
                      while (s5 !== peg$FAILED) {
                        s4.push(s5);
                        s5 = peg$parseWS();
                      }
                      if (s4 !== peg$FAILED) {
                        s5 = peg$parseConditionalOrExpression();
                        if (s5 !== peg$FAILED) {
                          s6 = [];
                          s7 = peg$parseWS();
                          while (s7 !== peg$FAILED) {
                            s6.push(s7);
                            s7 = peg$parseWS();
                          }
                          if (s6 !== peg$FAILED) {
                            if (input.charCodeAt(peg$currPos) === 41) {
                              s7 = peg$c21;
                              peg$currPos++;
                            } else {
                              s7 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c22); }
                            }
                            if (s7 !== peg$FAILED) {
                              peg$savedPos = s0;
                              s1 = peg$c267(s5);
                              s0 = s1;
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
                if (s0 === peg$FAILED) {
                  s0 = peg$currPos;
                  if (input.substr(peg$currPos, 3).toLowerCase() === peg$c268) {
                    s1 = input.substr(peg$currPos, 3);
                    peg$currPos += 3;
                  } else {
                    s1 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c269); }
                  }
                  if (s1 !== peg$FAILED) {
                    s2 = [];
                    s3 = peg$parseWS();
                    while (s3 !== peg$FAILED) {
                      s2.push(s3);
                      s3 = peg$parseWS();
                    }
                    if (s2 !== peg$FAILED) {
                      if (input.charCodeAt(peg$currPos) === 40) {
                        s3 = peg$c17;
                        peg$currPos++;
                      } else {
                        s3 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c18); }
                      }
                      if (s3 !== peg$FAILED) {
                        s4 = [];
                        s5 = peg$parseWS();
                        while (s5 !== peg$FAILED) {
                          s4.push(s5);
                          s5 = peg$parseWS();
                        }
                        if (s4 !== peg$FAILED) {
                          s5 = peg$parseConditionalOrExpression();
                          if (s5 !== peg$FAILED) {
                            s6 = [];
                            s7 = peg$parseWS();
                            while (s7 !== peg$FAILED) {
                              s6.push(s7);
                              s7 = peg$parseWS();
                            }
                            if (s6 !== peg$FAILED) {
                              if (input.charCodeAt(peg$currPos) === 41) {
                                s7 = peg$c21;
                                peg$currPos++;
                              } else {
                                s7 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c22); }
                              }
                              if (s7 !== peg$FAILED) {
                                peg$savedPos = s0;
                                s1 = peg$c270(s5);
                                s0 = s1;
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                  if (s0 === peg$FAILED) {
                    s0 = peg$currPos;
                    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c271) {
                      s1 = input.substr(peg$currPos, 5);
                      peg$currPos += 5;
                    } else {
                      s1 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c272); }
                    }
                    if (s1 !== peg$FAILED) {
                      s2 = [];
                      s3 = peg$parseWS();
                      while (s3 !== peg$FAILED) {
                        s2.push(s3);
                        s3 = peg$parseWS();
                      }
                      if (s2 !== peg$FAILED) {
                        s3 = peg$currPos;
                        if (input.charCodeAt(peg$currPos) === 40) {
                          s4 = peg$c17;
                          peg$currPos++;
                        } else {
                          s4 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c18); }
                        }
                        if (s4 !== peg$FAILED) {
                          s5 = [];
                          s6 = peg$parseWS();
                          while (s6 !== peg$FAILED) {
                            s5.push(s6);
                            s6 = peg$parseWS();
                          }
                          if (s5 !== peg$FAILED) {
                            s6 = peg$parseConditionalOrExpression();
                            if (s6 !== peg$FAILED) {
                              s7 = [];
                              s8 = peg$parseWS();
                              while (s8 !== peg$FAILED) {
                                s7.push(s8);
                                s8 = peg$parseWS();
                              }
                              if (s7 !== peg$FAILED) {
                                if (input.charCodeAt(peg$currPos) === 41) {
                                  s8 = peg$c21;
                                  peg$currPos++;
                                } else {
                                  s8 = peg$FAILED;
                                  if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                }
                                if (s8 !== peg$FAILED) {
                                  s4 = [s4, s5, s6, s7, s8];
                                  s3 = s4;
                                } else {
                                  peg$currPos = s3;
                                  s3 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s3;
                                s3 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s3;
                              s3 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s3;
                            s3 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s3;
                          s3 = peg$FAILED;
                        }
                        if (s3 === peg$FAILED) {
                          s3 = peg$parseNIL();
                        }
                        if (s3 !== peg$FAILED) {
                          peg$savedPos = s0;
                          s1 = peg$c273(s3);
                          s0 = s1;
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                    if (s0 === peg$FAILED) {
                      s0 = peg$currPos;
                      if (input.substr(peg$currPos, 4).toLowerCase() === peg$c274) {
                        s1 = input.substr(peg$currPos, 4);
                        peg$currPos += 4;
                      } else {
                        s1 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c275); }
                      }
                      if (s1 !== peg$FAILED) {
                        s2 = [];
                        s3 = peg$parseWS();
                        while (s3 !== peg$FAILED) {
                          s2.push(s3);
                          s3 = peg$parseWS();
                        }
                        if (s2 !== peg$FAILED) {
                          s3 = peg$parseNIL();
                          if (s3 !== peg$FAILED) {
                            peg$savedPos = s0;
                            s1 = peg$c276();
                            s0 = s1;
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                      if (s0 === peg$FAILED) {
                        s0 = peg$currPos;
                        if (input.substr(peg$currPos, 3).toLowerCase() === peg$c277) {
                          s1 = input.substr(peg$currPos, 3);
                          peg$currPos += 3;
                        } else {
                          s1 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c278); }
                        }
                        if (s1 !== peg$FAILED) {
                          s2 = [];
                          s3 = peg$parseWS();
                          while (s3 !== peg$FAILED) {
                            s2.push(s3);
                            s3 = peg$parseWS();
                          }
                          if (s2 !== peg$FAILED) {
                            if (input.charCodeAt(peg$currPos) === 40) {
                              s3 = peg$c17;
                              peg$currPos++;
                            } else {
                              s3 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c18); }
                            }
                            if (s3 !== peg$FAILED) {
                              s4 = [];
                              s5 = peg$parseWS();
                              while (s5 !== peg$FAILED) {
                                s4.push(s5);
                                s5 = peg$parseWS();
                              }
                              if (s4 !== peg$FAILED) {
                                s5 = peg$parseConditionalOrExpression();
                                if (s5 !== peg$FAILED) {
                                  s6 = [];
                                  s7 = peg$parseWS();
                                  while (s7 !== peg$FAILED) {
                                    s6.push(s7);
                                    s7 = peg$parseWS();
                                  }
                                  if (s6 !== peg$FAILED) {
                                    if (input.charCodeAt(peg$currPos) === 41) {
                                      s7 = peg$c21;
                                      peg$currPos++;
                                    } else {
                                      s7 = peg$FAILED;
                                      if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                    }
                                    if (s7 !== peg$FAILED) {
                                      peg$savedPos = s0;
                                      s1 = peg$c279(s5);
                                      s0 = s1;
                                    } else {
                                      peg$currPos = s0;
                                      s0 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s0;
                                    s0 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                        if (s0 === peg$FAILED) {
                          s0 = peg$currPos;
                          if (input.substr(peg$currPos, 4).toLowerCase() === peg$c280) {
                            s1 = input.substr(peg$currPos, 4);
                            peg$currPos += 4;
                          } else {
                            s1 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c281); }
                          }
                          if (s1 !== peg$FAILED) {
                            s2 = [];
                            s3 = peg$parseWS();
                            while (s3 !== peg$FAILED) {
                              s2.push(s3);
                              s3 = peg$parseWS();
                            }
                            if (s2 !== peg$FAILED) {
                              if (input.charCodeAt(peg$currPos) === 40) {
                                s3 = peg$c17;
                                peg$currPos++;
                              } else {
                                s3 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c18); }
                              }
                              if (s3 !== peg$FAILED) {
                                s4 = [];
                                s5 = peg$parseWS();
                                while (s5 !== peg$FAILED) {
                                  s4.push(s5);
                                  s5 = peg$parseWS();
                                }
                                if (s4 !== peg$FAILED) {
                                  s5 = peg$parseConditionalOrExpression();
                                  if (s5 !== peg$FAILED) {
                                    s6 = [];
                                    s7 = peg$parseWS();
                                    while (s7 !== peg$FAILED) {
                                      s6.push(s7);
                                      s7 = peg$parseWS();
                                    }
                                    if (s6 !== peg$FAILED) {
                                      if (input.charCodeAt(peg$currPos) === 41) {
                                        s7 = peg$c21;
                                        peg$currPos++;
                                      } else {
                                        s7 = peg$FAILED;
                                        if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                      }
                                      if (s7 !== peg$FAILED) {
                                        peg$savedPos = s0;
                                        s1 = peg$c282(s5);
                                        s0 = s1;
                                      } else {
                                        peg$currPos = s0;
                                        s0 = peg$FAILED;
                                      }
                                    } else {
                                      peg$currPos = s0;
                                      s0 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s0;
                                    s0 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                          if (s0 === peg$FAILED) {
                            s0 = peg$currPos;
                            if (input.substr(peg$currPos, 5).toLowerCase() === peg$c283) {
                              s1 = input.substr(peg$currPos, 5);
                              peg$currPos += 5;
                            } else {
                              s1 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c284); }
                            }
                            if (s1 !== peg$FAILED) {
                              s2 = [];
                              s3 = peg$parseWS();
                              while (s3 !== peg$FAILED) {
                                s2.push(s3);
                                s3 = peg$parseWS();
                              }
                              if (s2 !== peg$FAILED) {
                                if (input.charCodeAt(peg$currPos) === 40) {
                                  s3 = peg$c17;
                                  peg$currPos++;
                                } else {
                                  s3 = peg$FAILED;
                                  if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                }
                                if (s3 !== peg$FAILED) {
                                  s4 = [];
                                  s5 = peg$parseWS();
                                  while (s5 !== peg$FAILED) {
                                    s4.push(s5);
                                    s5 = peg$parseWS();
                                  }
                                  if (s4 !== peg$FAILED) {
                                    s5 = peg$parseConditionalOrExpression();
                                    if (s5 !== peg$FAILED) {
                                      s6 = [];
                                      s7 = peg$parseWS();
                                      while (s7 !== peg$FAILED) {
                                        s6.push(s7);
                                        s7 = peg$parseWS();
                                      }
                                      if (s6 !== peg$FAILED) {
                                        if (input.charCodeAt(peg$currPos) === 41) {
                                          s7 = peg$c21;
                                          peg$currPos++;
                                        } else {
                                          s7 = peg$FAILED;
                                          if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                        }
                                        if (s7 !== peg$FAILED) {
                                          peg$savedPos = s0;
                                          s1 = peg$c285(s5);
                                          s0 = s1;
                                        } else {
                                          peg$currPos = s0;
                                          s0 = peg$FAILED;
                                        }
                                      } else {
                                        peg$currPos = s0;
                                        s0 = peg$FAILED;
                                      }
                                    } else {
                                      peg$currPos = s0;
                                      s0 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s0;
                                    s0 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                            if (s0 === peg$FAILED) {
                              s0 = peg$currPos;
                              if (input.substr(peg$currPos, 5).toLowerCase() === peg$c286) {
                                s1 = input.substr(peg$currPos, 5);
                                peg$currPos += 5;
                              } else {
                                s1 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c287); }
                              }
                              if (s1 !== peg$FAILED) {
                                s2 = [];
                                s3 = peg$parseWS();
                                while (s3 !== peg$FAILED) {
                                  s2.push(s3);
                                  s3 = peg$parseWS();
                                }
                                if (s2 !== peg$FAILED) {
                                  if (input.charCodeAt(peg$currPos) === 40) {
                                    s3 = peg$c17;
                                    peg$currPos++;
                                  } else {
                                    s3 = peg$FAILED;
                                    if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                  }
                                  if (s3 !== peg$FAILED) {
                                    s4 = [];
                                    s5 = peg$parseWS();
                                    while (s5 !== peg$FAILED) {
                                      s4.push(s5);
                                      s5 = peg$parseWS();
                                    }
                                    if (s4 !== peg$FAILED) {
                                      s5 = peg$parseConditionalOrExpression();
                                      if (s5 !== peg$FAILED) {
                                        s6 = [];
                                        s7 = peg$parseWS();
                                        while (s7 !== peg$FAILED) {
                                          s6.push(s7);
                                          s7 = peg$parseWS();
                                        }
                                        if (s6 !== peg$FAILED) {
                                          if (input.charCodeAt(peg$currPos) === 41) {
                                            s7 = peg$c21;
                                            peg$currPos++;
                                          } else {
                                            s7 = peg$FAILED;
                                            if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                          }
                                          if (s7 !== peg$FAILED) {
                                            peg$savedPos = s0;
                                            s1 = peg$c288(s5);
                                            s0 = s1;
                                          } else {
                                            peg$currPos = s0;
                                            s0 = peg$FAILED;
                                          }
                                        } else {
                                          peg$currPos = s0;
                                          s0 = peg$FAILED;
                                        }
                                      } else {
                                        peg$currPos = s0;
                                        s0 = peg$FAILED;
                                      }
                                    } else {
                                      peg$currPos = s0;
                                      s0 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s0;
                                    s0 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                              if (s0 === peg$FAILED) {
                                s0 = peg$currPos;
                                if (input.substr(peg$currPos, 6).toLowerCase() === peg$c289) {
                                  s1 = input.substr(peg$currPos, 6);
                                  peg$currPos += 6;
                                } else {
                                  s1 = peg$FAILED;
                                  if (peg$silentFails === 0) { peg$fail(peg$c290); }
                                }
                                if (s1 !== peg$FAILED) {
                                  s2 = [];
                                  s3 = peg$parseWS();
                                  while (s3 !== peg$FAILED) {
                                    s2.push(s3);
                                    s3 = peg$parseWS();
                                  }
                                  if (s2 !== peg$FAILED) {
                                    s3 = peg$parseExpressionList();
                                    if (s3 !== peg$FAILED) {
                                      peg$savedPos = s0;
                                      s1 = peg$c291(s3);
                                      s0 = s1;
                                    } else {
                                      peg$currPos = s0;
                                      s0 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s0;
                                    s0 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                                if (s0 === peg$FAILED) {
                                  s0 = peg$parseSubstringExpression();
                                  if (s0 === peg$FAILED) {
                                    s0 = peg$currPos;
                                    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c292) {
                                      s1 = input.substr(peg$currPos, 6);
                                      peg$currPos += 6;
                                    } else {
                                      s1 = peg$FAILED;
                                      if (peg$silentFails === 0) { peg$fail(peg$c293); }
                                    }
                                    if (s1 !== peg$FAILED) {
                                      s2 = [];
                                      s3 = peg$parseWS();
                                      while (s3 !== peg$FAILED) {
                                        s2.push(s3);
                                        s3 = peg$parseWS();
                                      }
                                      if (s2 !== peg$FAILED) {
                                        if (input.charCodeAt(peg$currPos) === 40) {
                                          s3 = peg$c17;
                                          peg$currPos++;
                                        } else {
                                          s3 = peg$FAILED;
                                          if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                        }
                                        if (s3 !== peg$FAILED) {
                                          s4 = [];
                                          s5 = peg$parseWS();
                                          while (s5 !== peg$FAILED) {
                                            s4.push(s5);
                                            s5 = peg$parseWS();
                                          }
                                          if (s4 !== peg$FAILED) {
                                            s5 = peg$parseConditionalOrExpression();
                                            if (s5 !== peg$FAILED) {
                                              s6 = [];
                                              s7 = peg$parseWS();
                                              while (s7 !== peg$FAILED) {
                                                s6.push(s7);
                                                s7 = peg$parseWS();
                                              }
                                              if (s6 !== peg$FAILED) {
                                                if (input.charCodeAt(peg$currPos) === 41) {
                                                  s7 = peg$c21;
                                                  peg$currPos++;
                                                } else {
                                                  s7 = peg$FAILED;
                                                  if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                }
                                                if (s7 !== peg$FAILED) {
                                                  peg$savedPos = s0;
                                                  s1 = peg$c294(s5);
                                                  s0 = s1;
                                                } else {
                                                  peg$currPos = s0;
                                                  s0 = peg$FAILED;
                                                }
                                              } else {
                                                peg$currPos = s0;
                                                s0 = peg$FAILED;
                                              }
                                            } else {
                                              peg$currPos = s0;
                                              s0 = peg$FAILED;
                                            }
                                          } else {
                                            peg$currPos = s0;
                                            s0 = peg$FAILED;
                                          }
                                        } else {
                                          peg$currPos = s0;
                                          s0 = peg$FAILED;
                                        }
                                      } else {
                                        peg$currPos = s0;
                                        s0 = peg$FAILED;
                                      }
                                    } else {
                                      peg$currPos = s0;
                                      s0 = peg$FAILED;
                                    }
                                    if (s0 === peg$FAILED) {
                                      s0 = peg$parseStrReplaceExpression();
                                      if (s0 === peg$FAILED) {
                                        s0 = peg$currPos;
                                        if (input.substr(peg$currPos, 5).toLowerCase() === peg$c295) {
                                          s1 = input.substr(peg$currPos, 5);
                                          peg$currPos += 5;
                                        } else {
                                          s1 = peg$FAILED;
                                          if (peg$silentFails === 0) { peg$fail(peg$c296); }
                                        }
                                        if (s1 !== peg$FAILED) {
                                          s2 = [];
                                          s3 = peg$parseWS();
                                          while (s3 !== peg$FAILED) {
                                            s2.push(s3);
                                            s3 = peg$parseWS();
                                          }
                                          if (s2 !== peg$FAILED) {
                                            if (input.charCodeAt(peg$currPos) === 40) {
                                              s3 = peg$c17;
                                              peg$currPos++;
                                            } else {
                                              s3 = peg$FAILED;
                                              if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                            }
                                            if (s3 !== peg$FAILED) {
                                              s4 = [];
                                              s5 = peg$parseWS();
                                              while (s5 !== peg$FAILED) {
                                                s4.push(s5);
                                                s5 = peg$parseWS();
                                              }
                                              if (s4 !== peg$FAILED) {
                                                s5 = peg$parseConditionalOrExpression();
                                                if (s5 !== peg$FAILED) {
                                                  s6 = [];
                                                  s7 = peg$parseWS();
                                                  while (s7 !== peg$FAILED) {
                                                    s6.push(s7);
                                                    s7 = peg$parseWS();
                                                  }
                                                  if (s6 !== peg$FAILED) {
                                                    if (input.charCodeAt(peg$currPos) === 41) {
                                                      s7 = peg$c21;
                                                      peg$currPos++;
                                                    } else {
                                                      s7 = peg$FAILED;
                                                      if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                    }
                                                    if (s7 !== peg$FAILED) {
                                                      peg$savedPos = s0;
                                                      s1 = peg$c297(s5);
                                                      s0 = s1;
                                                    } else {
                                                      peg$currPos = s0;
                                                      s0 = peg$FAILED;
                                                    }
                                                  } else {
                                                    peg$currPos = s0;
                                                    s0 = peg$FAILED;
                                                  }
                                                } else {
                                                  peg$currPos = s0;
                                                  s0 = peg$FAILED;
                                                }
                                              } else {
                                                peg$currPos = s0;
                                                s0 = peg$FAILED;
                                              }
                                            } else {
                                              peg$currPos = s0;
                                              s0 = peg$FAILED;
                                            }
                                          } else {
                                            peg$currPos = s0;
                                            s0 = peg$FAILED;
                                          }
                                        } else {
                                          peg$currPos = s0;
                                          s0 = peg$FAILED;
                                        }
                                        if (s0 === peg$FAILED) {
                                          s0 = peg$currPos;
                                          if (input.substr(peg$currPos, 5).toLowerCase() === peg$c298) {
                                            s1 = input.substr(peg$currPos, 5);
                                            peg$currPos += 5;
                                          } else {
                                            s1 = peg$FAILED;
                                            if (peg$silentFails === 0) { peg$fail(peg$c299); }
                                          }
                                          if (s1 !== peg$FAILED) {
                                            s2 = [];
                                            s3 = peg$parseWS();
                                            while (s3 !== peg$FAILED) {
                                              s2.push(s3);
                                              s3 = peg$parseWS();
                                            }
                                            if (s2 !== peg$FAILED) {
                                              if (input.charCodeAt(peg$currPos) === 40) {
                                                s3 = peg$c17;
                                                peg$currPos++;
                                              } else {
                                                s3 = peg$FAILED;
                                                if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                              }
                                              if (s3 !== peg$FAILED) {
                                                s4 = [];
                                                s5 = peg$parseWS();
                                                while (s5 !== peg$FAILED) {
                                                  s4.push(s5);
                                                  s5 = peg$parseWS();
                                                }
                                                if (s4 !== peg$FAILED) {
                                                  s5 = peg$parseConditionalOrExpression();
                                                  if (s5 !== peg$FAILED) {
                                                    s6 = [];
                                                    s7 = peg$parseWS();
                                                    while (s7 !== peg$FAILED) {
                                                      s6.push(s7);
                                                      s7 = peg$parseWS();
                                                    }
                                                    if (s6 !== peg$FAILED) {
                                                      if (input.charCodeAt(peg$currPos) === 41) {
                                                        s7 = peg$c21;
                                                        peg$currPos++;
                                                      } else {
                                                        s7 = peg$FAILED;
                                                        if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                      }
                                                      if (s7 !== peg$FAILED) {
                                                        peg$savedPos = s0;
                                                        s1 = peg$c300(s5);
                                                        s0 = s1;
                                                      } else {
                                                        peg$currPos = s0;
                                                        s0 = peg$FAILED;
                                                      }
                                                    } else {
                                                      peg$currPos = s0;
                                                      s0 = peg$FAILED;
                                                    }
                                                  } else {
                                                    peg$currPos = s0;
                                                    s0 = peg$FAILED;
                                                  }
                                                } else {
                                                  peg$currPos = s0;
                                                  s0 = peg$FAILED;
                                                }
                                              } else {
                                                peg$currPos = s0;
                                                s0 = peg$FAILED;
                                              }
                                            } else {
                                              peg$currPos = s0;
                                              s0 = peg$FAILED;
                                            }
                                          } else {
                                            peg$currPos = s0;
                                            s0 = peg$FAILED;
                                          }
                                          if (s0 === peg$FAILED) {
                                            s0 = peg$currPos;
                                            if (input.substr(peg$currPos, 14).toLowerCase() === peg$c301) {
                                              s1 = input.substr(peg$currPos, 14);
                                              peg$currPos += 14;
                                            } else {
                                              s1 = peg$FAILED;
                                              if (peg$silentFails === 0) { peg$fail(peg$c302); }
                                            }
                                            if (s1 !== peg$FAILED) {
                                              s2 = [];
                                              s3 = peg$parseWS();
                                              while (s3 !== peg$FAILED) {
                                                s2.push(s3);
                                                s3 = peg$parseWS();
                                              }
                                              if (s2 !== peg$FAILED) {
                                                if (input.charCodeAt(peg$currPos) === 40) {
                                                  s3 = peg$c17;
                                                  peg$currPos++;
                                                } else {
                                                  s3 = peg$FAILED;
                                                  if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                }
                                                if (s3 !== peg$FAILED) {
                                                  s4 = [];
                                                  s5 = peg$parseWS();
                                                  while (s5 !== peg$FAILED) {
                                                    s4.push(s5);
                                                    s5 = peg$parseWS();
                                                  }
                                                  if (s4 !== peg$FAILED) {
                                                    s5 = peg$parseConditionalOrExpression();
                                                    if (s5 !== peg$FAILED) {
                                                      s6 = [];
                                                      s7 = peg$parseWS();
                                                      while (s7 !== peg$FAILED) {
                                                        s6.push(s7);
                                                        s7 = peg$parseWS();
                                                      }
                                                      if (s6 !== peg$FAILED) {
                                                        if (input.charCodeAt(peg$currPos) === 41) {
                                                          s7 = peg$c21;
                                                          peg$currPos++;
                                                        } else {
                                                          s7 = peg$FAILED;
                                                          if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                        }
                                                        if (s7 !== peg$FAILED) {
                                                          peg$savedPos = s0;
                                                          s1 = peg$c303(s5);
                                                          s0 = s1;
                                                        } else {
                                                          peg$currPos = s0;
                                                          s0 = peg$FAILED;
                                                        }
                                                      } else {
                                                        peg$currPos = s0;
                                                        s0 = peg$FAILED;
                                                      }
                                                    } else {
                                                      peg$currPos = s0;
                                                      s0 = peg$FAILED;
                                                    }
                                                  } else {
                                                    peg$currPos = s0;
                                                    s0 = peg$FAILED;
                                                  }
                                                } else {
                                                  peg$currPos = s0;
                                                  s0 = peg$FAILED;
                                                }
                                              } else {
                                                peg$currPos = s0;
                                                s0 = peg$FAILED;
                                              }
                                            } else {
                                              peg$currPos = s0;
                                              s0 = peg$FAILED;
                                            }
                                            if (s0 === peg$FAILED) {
                                              s0 = peg$currPos;
                                              if (input.substr(peg$currPos, 8).toLowerCase() === peg$c304) {
                                                s1 = input.substr(peg$currPos, 8);
                                                peg$currPos += 8;
                                              } else {
                                                s1 = peg$FAILED;
                                                if (peg$silentFails === 0) { peg$fail(peg$c305); }
                                              }
                                              if (s1 !== peg$FAILED) {
                                                s2 = [];
                                                s3 = peg$parseWS();
                                                while (s3 !== peg$FAILED) {
                                                  s2.push(s3);
                                                  s3 = peg$parseWS();
                                                }
                                                if (s2 !== peg$FAILED) {
                                                  if (input.charCodeAt(peg$currPos) === 40) {
                                                    s3 = peg$c17;
                                                    peg$currPos++;
                                                  } else {
                                                    s3 = peg$FAILED;
                                                    if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                  }
                                                  if (s3 !== peg$FAILED) {
                                                    s4 = [];
                                                    s5 = peg$parseWS();
                                                    while (s5 !== peg$FAILED) {
                                                      s4.push(s5);
                                                      s5 = peg$parseWS();
                                                    }
                                                    if (s4 !== peg$FAILED) {
                                                      s5 = peg$parseConditionalOrExpression();
                                                      if (s5 !== peg$FAILED) {
                                                        s6 = [];
                                                        s7 = peg$parseWS();
                                                        while (s7 !== peg$FAILED) {
                                                          s6.push(s7);
                                                          s7 = peg$parseWS();
                                                        }
                                                        if (s6 !== peg$FAILED) {
                                                          if (input.charCodeAt(peg$currPos) === 44) {
                                                            s7 = peg$c174;
                                                            peg$currPos++;
                                                          } else {
                                                            s7 = peg$FAILED;
                                                            if (peg$silentFails === 0) { peg$fail(peg$c175); }
                                                          }
                                                          if (s7 !== peg$FAILED) {
                                                            s8 = [];
                                                            s9 = peg$parseWS();
                                                            while (s9 !== peg$FAILED) {
                                                              s8.push(s9);
                                                              s9 = peg$parseWS();
                                                            }
                                                            if (s8 !== peg$FAILED) {
                                                              s9 = peg$parseConditionalOrExpression();
                                                              if (s9 !== peg$FAILED) {
                                                                s10 = [];
                                                                s11 = peg$parseWS();
                                                                while (s11 !== peg$FAILED) {
                                                                  s10.push(s11);
                                                                  s11 = peg$parseWS();
                                                                }
                                                                if (s10 !== peg$FAILED) {
                                                                  if (input.charCodeAt(peg$currPos) === 41) {
                                                                    s11 = peg$c21;
                                                                    peg$currPos++;
                                                                  } else {
                                                                    s11 = peg$FAILED;
                                                                    if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                  }
                                                                  if (s11 !== peg$FAILED) {
                                                                    peg$savedPos = s0;
                                                                    s1 = peg$c306(s5, s9);
                                                                    s0 = s1;
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                              } else {
                                                                peg$currPos = s0;
                                                                s0 = peg$FAILED;
                                                              }
                                                            } else {
                                                              peg$currPos = s0;
                                                              s0 = peg$FAILED;
                                                            }
                                                          } else {
                                                            peg$currPos = s0;
                                                            s0 = peg$FAILED;
                                                          }
                                                        } else {
                                                          peg$currPos = s0;
                                                          s0 = peg$FAILED;
                                                        }
                                                      } else {
                                                        peg$currPos = s0;
                                                        s0 = peg$FAILED;
                                                      }
                                                    } else {
                                                      peg$currPos = s0;
                                                      s0 = peg$FAILED;
                                                    }
                                                  } else {
                                                    peg$currPos = s0;
                                                    s0 = peg$FAILED;
                                                  }
                                                } else {
                                                  peg$currPos = s0;
                                                  s0 = peg$FAILED;
                                                }
                                              } else {
                                                peg$currPos = s0;
                                                s0 = peg$FAILED;
                                              }
                                              if (s0 === peg$FAILED) {
                                                s0 = peg$currPos;
                                                if (input.substr(peg$currPos, 9).toLowerCase() === peg$c307) {
                                                  s1 = input.substr(peg$currPos, 9);
                                                  peg$currPos += 9;
                                                } else {
                                                  s1 = peg$FAILED;
                                                  if (peg$silentFails === 0) { peg$fail(peg$c308); }
                                                }
                                                if (s1 !== peg$FAILED) {
                                                  s2 = [];
                                                  s3 = peg$parseWS();
                                                  while (s3 !== peg$FAILED) {
                                                    s2.push(s3);
                                                    s3 = peg$parseWS();
                                                  }
                                                  if (s2 !== peg$FAILED) {
                                                    if (input.charCodeAt(peg$currPos) === 40) {
                                                      s3 = peg$c17;
                                                      peg$currPos++;
                                                    } else {
                                                      s3 = peg$FAILED;
                                                      if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                    }
                                                    if (s3 !== peg$FAILED) {
                                                      s4 = [];
                                                      s5 = peg$parseWS();
                                                      while (s5 !== peg$FAILED) {
                                                        s4.push(s5);
                                                        s5 = peg$parseWS();
                                                      }
                                                      if (s4 !== peg$FAILED) {
                                                        s5 = peg$parseConditionalOrExpression();
                                                        if (s5 !== peg$FAILED) {
                                                          s6 = [];
                                                          s7 = peg$parseWS();
                                                          while (s7 !== peg$FAILED) {
                                                            s6.push(s7);
                                                            s7 = peg$parseWS();
                                                          }
                                                          if (s6 !== peg$FAILED) {
                                                            if (input.charCodeAt(peg$currPos) === 44) {
                                                              s7 = peg$c174;
                                                              peg$currPos++;
                                                            } else {
                                                              s7 = peg$FAILED;
                                                              if (peg$silentFails === 0) { peg$fail(peg$c175); }
                                                            }
                                                            if (s7 !== peg$FAILED) {
                                                              s8 = [];
                                                              s9 = peg$parseWS();
                                                              while (s9 !== peg$FAILED) {
                                                                s8.push(s9);
                                                                s9 = peg$parseWS();
                                                              }
                                                              if (s8 !== peg$FAILED) {
                                                                s9 = peg$parseConditionalOrExpression();
                                                                if (s9 !== peg$FAILED) {
                                                                  s10 = [];
                                                                  s11 = peg$parseWS();
                                                                  while (s11 !== peg$FAILED) {
                                                                    s10.push(s11);
                                                                    s11 = peg$parseWS();
                                                                  }
                                                                  if (s10 !== peg$FAILED) {
                                                                    if (input.charCodeAt(peg$currPos) === 41) {
                                                                      s11 = peg$c21;
                                                                      peg$currPos++;
                                                                    } else {
                                                                      s11 = peg$FAILED;
                                                                      if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                    }
                                                                    if (s11 !== peg$FAILED) {
                                                                      peg$savedPos = s0;
                                                                      s1 = peg$c309(s5, s9);
                                                                      s0 = s1;
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                              } else {
                                                                peg$currPos = s0;
                                                                s0 = peg$FAILED;
                                                              }
                                                            } else {
                                                              peg$currPos = s0;
                                                              s0 = peg$FAILED;
                                                            }
                                                          } else {
                                                            peg$currPos = s0;
                                                            s0 = peg$FAILED;
                                                          }
                                                        } else {
                                                          peg$currPos = s0;
                                                          s0 = peg$FAILED;
                                                        }
                                                      } else {
                                                        peg$currPos = s0;
                                                        s0 = peg$FAILED;
                                                      }
                                                    } else {
                                                      peg$currPos = s0;
                                                      s0 = peg$FAILED;
                                                    }
                                                  } else {
                                                    peg$currPos = s0;
                                                    s0 = peg$FAILED;
                                                  }
                                                } else {
                                                  peg$currPos = s0;
                                                  s0 = peg$FAILED;
                                                }
                                                if (s0 === peg$FAILED) {
                                                  s0 = peg$currPos;
                                                  if (input.substr(peg$currPos, 9).toLowerCase() === peg$c310) {
                                                    s1 = input.substr(peg$currPos, 9);
                                                    peg$currPos += 9;
                                                  } else {
                                                    s1 = peg$FAILED;
                                                    if (peg$silentFails === 0) { peg$fail(peg$c311); }
                                                  }
                                                  if (s1 !== peg$FAILED) {
                                                    s2 = [];
                                                    s3 = peg$parseWS();
                                                    while (s3 !== peg$FAILED) {
                                                      s2.push(s3);
                                                      s3 = peg$parseWS();
                                                    }
                                                    if (s2 !== peg$FAILED) {
                                                      if (input.charCodeAt(peg$currPos) === 40) {
                                                        s3 = peg$c17;
                                                        peg$currPos++;
                                                      } else {
                                                        s3 = peg$FAILED;
                                                        if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                      }
                                                      if (s3 !== peg$FAILED) {
                                                        s4 = [];
                                                        s5 = peg$parseWS();
                                                        while (s5 !== peg$FAILED) {
                                                          s4.push(s5);
                                                          s5 = peg$parseWS();
                                                        }
                                                        if (s4 !== peg$FAILED) {
                                                          s5 = peg$parseConditionalOrExpression();
                                                          if (s5 !== peg$FAILED) {
                                                            s6 = [];
                                                            s7 = peg$parseWS();
                                                            while (s7 !== peg$FAILED) {
                                                              s6.push(s7);
                                                              s7 = peg$parseWS();
                                                            }
                                                            if (s6 !== peg$FAILED) {
                                                              if (input.charCodeAt(peg$currPos) === 44) {
                                                                s7 = peg$c174;
                                                                peg$currPos++;
                                                              } else {
                                                                s7 = peg$FAILED;
                                                                if (peg$silentFails === 0) { peg$fail(peg$c175); }
                                                              }
                                                              if (s7 !== peg$FAILED) {
                                                                s8 = [];
                                                                s9 = peg$parseWS();
                                                                while (s9 !== peg$FAILED) {
                                                                  s8.push(s9);
                                                                  s9 = peg$parseWS();
                                                                }
                                                                if (s8 !== peg$FAILED) {
                                                                  s9 = peg$parseConditionalOrExpression();
                                                                  if (s9 !== peg$FAILED) {
                                                                    s10 = [];
                                                                    s11 = peg$parseWS();
                                                                    while (s11 !== peg$FAILED) {
                                                                      s10.push(s11);
                                                                      s11 = peg$parseWS();
                                                                    }
                                                                    if (s10 !== peg$FAILED) {
                                                                      if (input.charCodeAt(peg$currPos) === 41) {
                                                                        s11 = peg$c21;
                                                                        peg$currPos++;
                                                                      } else {
                                                                        s11 = peg$FAILED;
                                                                        if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                      }
                                                                      if (s11 !== peg$FAILED) {
                                                                        peg$savedPos = s0;
                                                                        s1 = peg$c312(s5, s9);
                                                                        s0 = s1;
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                              } else {
                                                                peg$currPos = s0;
                                                                s0 = peg$FAILED;
                                                              }
                                                            } else {
                                                              peg$currPos = s0;
                                                              s0 = peg$FAILED;
                                                            }
                                                          } else {
                                                            peg$currPos = s0;
                                                            s0 = peg$FAILED;
                                                          }
                                                        } else {
                                                          peg$currPos = s0;
                                                          s0 = peg$FAILED;
                                                        }
                                                      } else {
                                                        peg$currPos = s0;
                                                        s0 = peg$FAILED;
                                                      }
                                                    } else {
                                                      peg$currPos = s0;
                                                      s0 = peg$FAILED;
                                                    }
                                                  } else {
                                                    peg$currPos = s0;
                                                    s0 = peg$FAILED;
                                                  }
                                                  if (s0 === peg$FAILED) {
                                                    s0 = peg$currPos;
                                                    if (input.substr(peg$currPos, 7).toLowerCase() === peg$c313) {
                                                      s1 = input.substr(peg$currPos, 7);
                                                      peg$currPos += 7;
                                                    } else {
                                                      s1 = peg$FAILED;
                                                      if (peg$silentFails === 0) { peg$fail(peg$c314); }
                                                    }
                                                    if (s1 !== peg$FAILED) {
                                                      s2 = [];
                                                      s3 = peg$parseWS();
                                                      while (s3 !== peg$FAILED) {
                                                        s2.push(s3);
                                                        s3 = peg$parseWS();
                                                      }
                                                      if (s2 !== peg$FAILED) {
                                                        if (input.charCodeAt(peg$currPos) === 40) {
                                                          s3 = peg$c17;
                                                          peg$currPos++;
                                                        } else {
                                                          s3 = peg$FAILED;
                                                          if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                        }
                                                        if (s3 !== peg$FAILED) {
                                                          s4 = [];
                                                          s5 = peg$parseWS();
                                                          while (s5 !== peg$FAILED) {
                                                            s4.push(s5);
                                                            s5 = peg$parseWS();
                                                          }
                                                          if (s4 !== peg$FAILED) {
                                                            s5 = peg$parseConditionalOrExpression();
                                                            if (s5 !== peg$FAILED) {
                                                              s6 = [];
                                                              s7 = peg$parseWS();
                                                              while (s7 !== peg$FAILED) {
                                                                s6.push(s7);
                                                                s7 = peg$parseWS();
                                                              }
                                                              if (s6 !== peg$FAILED) {
                                                                if (input.charCodeAt(peg$currPos) === 44) {
                                                                  s7 = peg$c174;
                                                                  peg$currPos++;
                                                                } else {
                                                                  s7 = peg$FAILED;
                                                                  if (peg$silentFails === 0) { peg$fail(peg$c175); }
                                                                }
                                                                if (s7 !== peg$FAILED) {
                                                                  s8 = [];
                                                                  s9 = peg$parseWS();
                                                                  while (s9 !== peg$FAILED) {
                                                                    s8.push(s9);
                                                                    s9 = peg$parseWS();
                                                                  }
                                                                  if (s8 !== peg$FAILED) {
                                                                    s9 = peg$parseConditionalOrExpression();
                                                                    if (s9 !== peg$FAILED) {
                                                                      s10 = [];
                                                                      s11 = peg$parseWS();
                                                                      while (s11 !== peg$FAILED) {
                                                                        s10.push(s11);
                                                                        s11 = peg$parseWS();
                                                                      }
                                                                      if (s10 !== peg$FAILED) {
                                                                        if (input.charCodeAt(peg$currPos) === 41) {
                                                                          s11 = peg$c21;
                                                                          peg$currPos++;
                                                                        } else {
                                                                          s11 = peg$FAILED;
                                                                          if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                        }
                                                                        if (s11 !== peg$FAILED) {
                                                                          peg$savedPos = s0;
                                                                          s1 = peg$c315(s5, s9);
                                                                          s0 = s1;
                                                                        } else {
                                                                          peg$currPos = s0;
                                                                          s0 = peg$FAILED;
                                                                        }
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                              } else {
                                                                peg$currPos = s0;
                                                                s0 = peg$FAILED;
                                                              }
                                                            } else {
                                                              peg$currPos = s0;
                                                              s0 = peg$FAILED;
                                                            }
                                                          } else {
                                                            peg$currPos = s0;
                                                            s0 = peg$FAILED;
                                                          }
                                                        } else {
                                                          peg$currPos = s0;
                                                          s0 = peg$FAILED;
                                                        }
                                                      } else {
                                                        peg$currPos = s0;
                                                        s0 = peg$FAILED;
                                                      }
                                                    } else {
                                                      peg$currPos = s0;
                                                      s0 = peg$FAILED;
                                                    }
                                                    if (s0 === peg$FAILED) {
                                                      s0 = peg$currPos;
                                                      if (input.substr(peg$currPos, 8).toLowerCase() === peg$c316) {
                                                        s1 = input.substr(peg$currPos, 8);
                                                        peg$currPos += 8;
                                                      } else {
                                                        s1 = peg$FAILED;
                                                        if (peg$silentFails === 0) { peg$fail(peg$c317); }
                                                      }
                                                      if (s1 !== peg$FAILED) {
                                                        s2 = [];
                                                        s3 = peg$parseWS();
                                                        while (s3 !== peg$FAILED) {
                                                          s2.push(s3);
                                                          s3 = peg$parseWS();
                                                        }
                                                        if (s2 !== peg$FAILED) {
                                                          if (input.charCodeAt(peg$currPos) === 40) {
                                                            s3 = peg$c17;
                                                            peg$currPos++;
                                                          } else {
                                                            s3 = peg$FAILED;
                                                            if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                          }
                                                          if (s3 !== peg$FAILED) {
                                                            s4 = [];
                                                            s5 = peg$parseWS();
                                                            while (s5 !== peg$FAILED) {
                                                              s4.push(s5);
                                                              s5 = peg$parseWS();
                                                            }
                                                            if (s4 !== peg$FAILED) {
                                                              s5 = peg$parseConditionalOrExpression();
                                                              if (s5 !== peg$FAILED) {
                                                                s6 = [];
                                                                s7 = peg$parseWS();
                                                                while (s7 !== peg$FAILED) {
                                                                  s6.push(s7);
                                                                  s7 = peg$parseWS();
                                                                }
                                                                if (s6 !== peg$FAILED) {
                                                                  if (input.charCodeAt(peg$currPos) === 44) {
                                                                    s7 = peg$c174;
                                                                    peg$currPos++;
                                                                  } else {
                                                                    s7 = peg$FAILED;
                                                                    if (peg$silentFails === 0) { peg$fail(peg$c175); }
                                                                  }
                                                                  if (s7 !== peg$FAILED) {
                                                                    s8 = [];
                                                                    s9 = peg$parseWS();
                                                                    while (s9 !== peg$FAILED) {
                                                                      s8.push(s9);
                                                                      s9 = peg$parseWS();
                                                                    }
                                                                    if (s8 !== peg$FAILED) {
                                                                      s9 = peg$parseConditionalOrExpression();
                                                                      if (s9 !== peg$FAILED) {
                                                                        s10 = [];
                                                                        s11 = peg$parseWS();
                                                                        while (s11 !== peg$FAILED) {
                                                                          s10.push(s11);
                                                                          s11 = peg$parseWS();
                                                                        }
                                                                        if (s10 !== peg$FAILED) {
                                                                          if (input.charCodeAt(peg$currPos) === 41) {
                                                                            s11 = peg$c21;
                                                                            peg$currPos++;
                                                                          } else {
                                                                            s11 = peg$FAILED;
                                                                            if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                          }
                                                                          if (s11 !== peg$FAILED) {
                                                                            peg$savedPos = s0;
                                                                            s1 = peg$c318(s5, s9);
                                                                            s0 = s1;
                                                                          } else {
                                                                            peg$currPos = s0;
                                                                            s0 = peg$FAILED;
                                                                          }
                                                                        } else {
                                                                          peg$currPos = s0;
                                                                          s0 = peg$FAILED;
                                                                        }
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                              } else {
                                                                peg$currPos = s0;
                                                                s0 = peg$FAILED;
                                                              }
                                                            } else {
                                                              peg$currPos = s0;
                                                              s0 = peg$FAILED;
                                                            }
                                                          } else {
                                                            peg$currPos = s0;
                                                            s0 = peg$FAILED;
                                                          }
                                                        } else {
                                                          peg$currPos = s0;
                                                          s0 = peg$FAILED;
                                                        }
                                                      } else {
                                                        peg$currPos = s0;
                                                        s0 = peg$FAILED;
                                                      }
                                                      if (s0 === peg$FAILED) {
                                                        s0 = peg$currPos;
                                                        if (input.substr(peg$currPos, 4).toLowerCase() === peg$c319) {
                                                          s1 = input.substr(peg$currPos, 4);
                                                          peg$currPos += 4;
                                                        } else {
                                                          s1 = peg$FAILED;
                                                          if (peg$silentFails === 0) { peg$fail(peg$c320); }
                                                        }
                                                        if (s1 !== peg$FAILED) {
                                                          s2 = [];
                                                          s3 = peg$parseWS();
                                                          while (s3 !== peg$FAILED) {
                                                            s2.push(s3);
                                                            s3 = peg$parseWS();
                                                          }
                                                          if (s2 !== peg$FAILED) {
                                                            if (input.charCodeAt(peg$currPos) === 40) {
                                                              s3 = peg$c17;
                                                              peg$currPos++;
                                                            } else {
                                                              s3 = peg$FAILED;
                                                              if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                            }
                                                            if (s3 !== peg$FAILED) {
                                                              s4 = [];
                                                              s5 = peg$parseWS();
                                                              while (s5 !== peg$FAILED) {
                                                                s4.push(s5);
                                                                s5 = peg$parseWS();
                                                              }
                                                              if (s4 !== peg$FAILED) {
                                                                s5 = peg$parseConditionalOrExpression();
                                                                if (s5 !== peg$FAILED) {
                                                                  s6 = [];
                                                                  s7 = peg$parseWS();
                                                                  while (s7 !== peg$FAILED) {
                                                                    s6.push(s7);
                                                                    s7 = peg$parseWS();
                                                                  }
                                                                  if (s6 !== peg$FAILED) {
                                                                    if (input.charCodeAt(peg$currPos) === 41) {
                                                                      s7 = peg$c21;
                                                                      peg$currPos++;
                                                                    } else {
                                                                      s7 = peg$FAILED;
                                                                      if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                    }
                                                                    if (s7 !== peg$FAILED) {
                                                                      peg$savedPos = s0;
                                                                      s1 = peg$c321(s5);
                                                                      s0 = s1;
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                              } else {
                                                                peg$currPos = s0;
                                                                s0 = peg$FAILED;
                                                              }
                                                            } else {
                                                              peg$currPos = s0;
                                                              s0 = peg$FAILED;
                                                            }
                                                          } else {
                                                            peg$currPos = s0;
                                                            s0 = peg$FAILED;
                                                          }
                                                        } else {
                                                          peg$currPos = s0;
                                                          s0 = peg$FAILED;
                                                        }
                                                        if (s0 === peg$FAILED) {
                                                          s0 = peg$currPos;
                                                          if (input.substr(peg$currPos, 5).toLowerCase() === peg$c322) {
                                                            s1 = input.substr(peg$currPos, 5);
                                                            peg$currPos += 5;
                                                          } else {
                                                            s1 = peg$FAILED;
                                                            if (peg$silentFails === 0) { peg$fail(peg$c323); }
                                                          }
                                                          if (s1 !== peg$FAILED) {
                                                            s2 = [];
                                                            s3 = peg$parseWS();
                                                            while (s3 !== peg$FAILED) {
                                                              s2.push(s3);
                                                              s3 = peg$parseWS();
                                                            }
                                                            if (s2 !== peg$FAILED) {
                                                              if (input.charCodeAt(peg$currPos) === 40) {
                                                                s3 = peg$c17;
                                                                peg$currPos++;
                                                              } else {
                                                                s3 = peg$FAILED;
                                                                if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                              }
                                                              if (s3 !== peg$FAILED) {
                                                                s4 = [];
                                                                s5 = peg$parseWS();
                                                                while (s5 !== peg$FAILED) {
                                                                  s4.push(s5);
                                                                  s5 = peg$parseWS();
                                                                }
                                                                if (s4 !== peg$FAILED) {
                                                                  s5 = peg$parseConditionalOrExpression();
                                                                  if (s5 !== peg$FAILED) {
                                                                    s6 = [];
                                                                    s7 = peg$parseWS();
                                                                    while (s7 !== peg$FAILED) {
                                                                      s6.push(s7);
                                                                      s7 = peg$parseWS();
                                                                    }
                                                                    if (s6 !== peg$FAILED) {
                                                                      if (input.charCodeAt(peg$currPos) === 41) {
                                                                        s7 = peg$c21;
                                                                        peg$currPos++;
                                                                      } else {
                                                                        s7 = peg$FAILED;
                                                                        if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                      }
                                                                      if (s7 !== peg$FAILED) {
                                                                        peg$savedPos = s0;
                                                                        s1 = peg$c324(s5);
                                                                        s0 = s1;
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                              } else {
                                                                peg$currPos = s0;
                                                                s0 = peg$FAILED;
                                                              }
                                                            } else {
                                                              peg$currPos = s0;
                                                              s0 = peg$FAILED;
                                                            }
                                                          } else {
                                                            peg$currPos = s0;
                                                            s0 = peg$FAILED;
                                                          }
                                                          if (s0 === peg$FAILED) {
                                                            s0 = peg$currPos;
                                                            if (input.substr(peg$currPos, 3).toLowerCase() === peg$c325) {
                                                              s1 = input.substr(peg$currPos, 3);
                                                              peg$currPos += 3;
                                                            } else {
                                                              s1 = peg$FAILED;
                                                              if (peg$silentFails === 0) { peg$fail(peg$c326); }
                                                            }
                                                            if (s1 !== peg$FAILED) {
                                                              s2 = [];
                                                              s3 = peg$parseWS();
                                                              while (s3 !== peg$FAILED) {
                                                                s2.push(s3);
                                                                s3 = peg$parseWS();
                                                              }
                                                              if (s2 !== peg$FAILED) {
                                                                if (input.charCodeAt(peg$currPos) === 40) {
                                                                  s3 = peg$c17;
                                                                  peg$currPos++;
                                                                } else {
                                                                  s3 = peg$FAILED;
                                                                  if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                }
                                                                if (s3 !== peg$FAILED) {
                                                                  s4 = [];
                                                                  s5 = peg$parseWS();
                                                                  while (s5 !== peg$FAILED) {
                                                                    s4.push(s5);
                                                                    s5 = peg$parseWS();
                                                                  }
                                                                  if (s4 !== peg$FAILED) {
                                                                    s5 = peg$parseConditionalOrExpression();
                                                                    if (s5 !== peg$FAILED) {
                                                                      s6 = [];
                                                                      s7 = peg$parseWS();
                                                                      while (s7 !== peg$FAILED) {
                                                                        s6.push(s7);
                                                                        s7 = peg$parseWS();
                                                                      }
                                                                      if (s6 !== peg$FAILED) {
                                                                        if (input.charCodeAt(peg$currPos) === 41) {
                                                                          s7 = peg$c21;
                                                                          peg$currPos++;
                                                                        } else {
                                                                          s7 = peg$FAILED;
                                                                          if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                        }
                                                                        if (s7 !== peg$FAILED) {
                                                                          peg$savedPos = s0;
                                                                          s1 = peg$c327(s5);
                                                                          s0 = s1;
                                                                        } else {
                                                                          peg$currPos = s0;
                                                                          s0 = peg$FAILED;
                                                                        }
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                              } else {
                                                                peg$currPos = s0;
                                                                s0 = peg$FAILED;
                                                              }
                                                            } else {
                                                              peg$currPos = s0;
                                                              s0 = peg$FAILED;
                                                            }
                                                            if (s0 === peg$FAILED) {
                                                              s0 = peg$currPos;
                                                              if (input.substr(peg$currPos, 5).toLowerCase() === peg$c328) {
                                                                s1 = input.substr(peg$currPos, 5);
                                                                peg$currPos += 5;
                                                              } else {
                                                                s1 = peg$FAILED;
                                                                if (peg$silentFails === 0) { peg$fail(peg$c329); }
                                                              }
                                                              if (s1 !== peg$FAILED) {
                                                                s2 = [];
                                                                s3 = peg$parseWS();
                                                                while (s3 !== peg$FAILED) {
                                                                  s2.push(s3);
                                                                  s3 = peg$parseWS();
                                                                }
                                                                if (s2 !== peg$FAILED) {
                                                                  if (input.charCodeAt(peg$currPos) === 40) {
                                                                    s3 = peg$c17;
                                                                    peg$currPos++;
                                                                  } else {
                                                                    s3 = peg$FAILED;
                                                                    if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                  }
                                                                  if (s3 !== peg$FAILED) {
                                                                    s4 = [];
                                                                    s5 = peg$parseWS();
                                                                    while (s5 !== peg$FAILED) {
                                                                      s4.push(s5);
                                                                      s5 = peg$parseWS();
                                                                    }
                                                                    if (s4 !== peg$FAILED) {
                                                                      s5 = peg$parseConditionalOrExpression();
                                                                      if (s5 !== peg$FAILED) {
                                                                        s6 = [];
                                                                        s7 = peg$parseWS();
                                                                        while (s7 !== peg$FAILED) {
                                                                          s6.push(s7);
                                                                          s7 = peg$parseWS();
                                                                        }
                                                                        if (s6 !== peg$FAILED) {
                                                                          if (input.charCodeAt(peg$currPos) === 41) {
                                                                            s7 = peg$c21;
                                                                            peg$currPos++;
                                                                          } else {
                                                                            s7 = peg$FAILED;
                                                                            if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                          }
                                                                          if (s7 !== peg$FAILED) {
                                                                            peg$savedPos = s0;
                                                                            s1 = peg$c330(s5);
                                                                            s0 = s1;
                                                                          } else {
                                                                            peg$currPos = s0;
                                                                            s0 = peg$FAILED;
                                                                          }
                                                                        } else {
                                                                          peg$currPos = s0;
                                                                          s0 = peg$FAILED;
                                                                        }
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                              } else {
                                                                peg$currPos = s0;
                                                                s0 = peg$FAILED;
                                                              }
                                                              if (s0 === peg$FAILED) {
                                                                s0 = peg$currPos;
                                                                if (input.substr(peg$currPos, 7).toLowerCase() === peg$c331) {
                                                                  s1 = input.substr(peg$currPos, 7);
                                                                  peg$currPos += 7;
                                                                } else {
                                                                  s1 = peg$FAILED;
                                                                  if (peg$silentFails === 0) { peg$fail(peg$c332); }
                                                                }
                                                                if (s1 !== peg$FAILED) {
                                                                  s2 = [];
                                                                  s3 = peg$parseWS();
                                                                  while (s3 !== peg$FAILED) {
                                                                    s2.push(s3);
                                                                    s3 = peg$parseWS();
                                                                  }
                                                                  if (s2 !== peg$FAILED) {
                                                                    if (input.charCodeAt(peg$currPos) === 40) {
                                                                      s3 = peg$c17;
                                                                      peg$currPos++;
                                                                    } else {
                                                                      s3 = peg$FAILED;
                                                                      if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                    }
                                                                    if (s3 !== peg$FAILED) {
                                                                      s4 = [];
                                                                      s5 = peg$parseWS();
                                                                      while (s5 !== peg$FAILED) {
                                                                        s4.push(s5);
                                                                        s5 = peg$parseWS();
                                                                      }
                                                                      if (s4 !== peg$FAILED) {
                                                                        s5 = peg$parseConditionalOrExpression();
                                                                        if (s5 !== peg$FAILED) {
                                                                          s6 = [];
                                                                          s7 = peg$parseWS();
                                                                          while (s7 !== peg$FAILED) {
                                                                            s6.push(s7);
                                                                            s7 = peg$parseWS();
                                                                          }
                                                                          if (s6 !== peg$FAILED) {
                                                                            if (input.charCodeAt(peg$currPos) === 41) {
                                                                              s7 = peg$c21;
                                                                              peg$currPos++;
                                                                            } else {
                                                                              s7 = peg$FAILED;
                                                                              if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                            }
                                                                            if (s7 !== peg$FAILED) {
                                                                              peg$savedPos = s0;
                                                                              s1 = peg$c333(s5);
                                                                              s0 = s1;
                                                                            } else {
                                                                              peg$currPos = s0;
                                                                              s0 = peg$FAILED;
                                                                            }
                                                                          } else {
                                                                            peg$currPos = s0;
                                                                            s0 = peg$FAILED;
                                                                          }
                                                                        } else {
                                                                          peg$currPos = s0;
                                                                          s0 = peg$FAILED;
                                                                        }
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                } else {
                                                                  peg$currPos = s0;
                                                                  s0 = peg$FAILED;
                                                                }
                                                                if (s0 === peg$FAILED) {
                                                                  s0 = peg$currPos;
                                                                  if (input.substr(peg$currPos, 7).toLowerCase() === peg$c334) {
                                                                    s1 = input.substr(peg$currPos, 7);
                                                                    peg$currPos += 7;
                                                                  } else {
                                                                    s1 = peg$FAILED;
                                                                    if (peg$silentFails === 0) { peg$fail(peg$c335); }
                                                                  }
                                                                  if (s1 !== peg$FAILED) {
                                                                    s2 = [];
                                                                    s3 = peg$parseWS();
                                                                    while (s3 !== peg$FAILED) {
                                                                      s2.push(s3);
                                                                      s3 = peg$parseWS();
                                                                    }
                                                                    if (s2 !== peg$FAILED) {
                                                                      if (input.charCodeAt(peg$currPos) === 40) {
                                                                        s3 = peg$c17;
                                                                        peg$currPos++;
                                                                      } else {
                                                                        s3 = peg$FAILED;
                                                                        if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                      }
                                                                      if (s3 !== peg$FAILED) {
                                                                        s4 = [];
                                                                        s5 = peg$parseWS();
                                                                        while (s5 !== peg$FAILED) {
                                                                          s4.push(s5);
                                                                          s5 = peg$parseWS();
                                                                        }
                                                                        if (s4 !== peg$FAILED) {
                                                                          s5 = peg$parseConditionalOrExpression();
                                                                          if (s5 !== peg$FAILED) {
                                                                            s6 = [];
                                                                            s7 = peg$parseWS();
                                                                            while (s7 !== peg$FAILED) {
                                                                              s6.push(s7);
                                                                              s7 = peg$parseWS();
                                                                            }
                                                                            if (s6 !== peg$FAILED) {
                                                                              if (input.charCodeAt(peg$currPos) === 41) {
                                                                                s7 = peg$c21;
                                                                                peg$currPos++;
                                                                              } else {
                                                                                s7 = peg$FAILED;
                                                                                if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                              }
                                                                              if (s7 !== peg$FAILED) {
                                                                                peg$savedPos = s0;
                                                                                s1 = peg$c336(s5);
                                                                                s0 = s1;
                                                                              } else {
                                                                                peg$currPos = s0;
                                                                                s0 = peg$FAILED;
                                                                              }
                                                                            } else {
                                                                              peg$currPos = s0;
                                                                              s0 = peg$FAILED;
                                                                            }
                                                                          } else {
                                                                            peg$currPos = s0;
                                                                            s0 = peg$FAILED;
                                                                          }
                                                                        } else {
                                                                          peg$currPos = s0;
                                                                          s0 = peg$FAILED;
                                                                        }
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                  } else {
                                                                    peg$currPos = s0;
                                                                    s0 = peg$FAILED;
                                                                  }
                                                                  if (s0 === peg$FAILED) {
                                                                    s0 = peg$currPos;
                                                                    if (input.substr(peg$currPos, 8).toLowerCase() === peg$c337) {
                                                                      s1 = input.substr(peg$currPos, 8);
                                                                      peg$currPos += 8;
                                                                    } else {
                                                                      s1 = peg$FAILED;
                                                                      if (peg$silentFails === 0) { peg$fail(peg$c338); }
                                                                    }
                                                                    if (s1 !== peg$FAILED) {
                                                                      s2 = [];
                                                                      s3 = peg$parseWS();
                                                                      while (s3 !== peg$FAILED) {
                                                                        s2.push(s3);
                                                                        s3 = peg$parseWS();
                                                                      }
                                                                      if (s2 !== peg$FAILED) {
                                                                        if (input.charCodeAt(peg$currPos) === 40) {
                                                                          s3 = peg$c17;
                                                                          peg$currPos++;
                                                                        } else {
                                                                          s3 = peg$FAILED;
                                                                          if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                        }
                                                                        if (s3 !== peg$FAILED) {
                                                                          s4 = [];
                                                                          s5 = peg$parseWS();
                                                                          while (s5 !== peg$FAILED) {
                                                                            s4.push(s5);
                                                                            s5 = peg$parseWS();
                                                                          }
                                                                          if (s4 !== peg$FAILED) {
                                                                            s5 = peg$parseConditionalOrExpression();
                                                                            if (s5 !== peg$FAILED) {
                                                                              s6 = [];
                                                                              s7 = peg$parseWS();
                                                                              while (s7 !== peg$FAILED) {
                                                                                s6.push(s7);
                                                                                s7 = peg$parseWS();
                                                                              }
                                                                              if (s6 !== peg$FAILED) {
                                                                                if (input.charCodeAt(peg$currPos) === 41) {
                                                                                  s7 = peg$c21;
                                                                                  peg$currPos++;
                                                                                } else {
                                                                                  s7 = peg$FAILED;
                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                }
                                                                                if (s7 !== peg$FAILED) {
                                                                                  peg$savedPos = s0;
                                                                                  s1 = peg$c339(s5);
                                                                                  s0 = s1;
                                                                                } else {
                                                                                  peg$currPos = s0;
                                                                                  s0 = peg$FAILED;
                                                                                }
                                                                              } else {
                                                                                peg$currPos = s0;
                                                                                s0 = peg$FAILED;
                                                                              }
                                                                            } else {
                                                                              peg$currPos = s0;
                                                                              s0 = peg$FAILED;
                                                                            }
                                                                          } else {
                                                                            peg$currPos = s0;
                                                                            s0 = peg$FAILED;
                                                                          }
                                                                        } else {
                                                                          peg$currPos = s0;
                                                                          s0 = peg$FAILED;
                                                                        }
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                    } else {
                                                                      peg$currPos = s0;
                                                                      s0 = peg$FAILED;
                                                                    }
                                                                    if (s0 === peg$FAILED) {
                                                                      s0 = peg$currPos;
                                                                      if (input.substr(peg$currPos, 2).toLowerCase() === peg$c340) {
                                                                        s1 = input.substr(peg$currPos, 2);
                                                                        peg$currPos += 2;
                                                                      } else {
                                                                        s1 = peg$FAILED;
                                                                        if (peg$silentFails === 0) { peg$fail(peg$c341); }
                                                                      }
                                                                      if (s1 !== peg$FAILED) {
                                                                        s2 = [];
                                                                        s3 = peg$parseWS();
                                                                        while (s3 !== peg$FAILED) {
                                                                          s2.push(s3);
                                                                          s3 = peg$parseWS();
                                                                        }
                                                                        if (s2 !== peg$FAILED) {
                                                                          if (input.charCodeAt(peg$currPos) === 40) {
                                                                            s3 = peg$c17;
                                                                            peg$currPos++;
                                                                          } else {
                                                                            s3 = peg$FAILED;
                                                                            if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                          }
                                                                          if (s3 !== peg$FAILED) {
                                                                            s4 = [];
                                                                            s5 = peg$parseWS();
                                                                            while (s5 !== peg$FAILED) {
                                                                              s4.push(s5);
                                                                              s5 = peg$parseWS();
                                                                            }
                                                                            if (s4 !== peg$FAILED) {
                                                                              s5 = peg$parseConditionalOrExpression();
                                                                              if (s5 !== peg$FAILED) {
                                                                                s6 = [];
                                                                                s7 = peg$parseWS();
                                                                                while (s7 !== peg$FAILED) {
                                                                                  s6.push(s7);
                                                                                  s7 = peg$parseWS();
                                                                                }
                                                                                if (s6 !== peg$FAILED) {
                                                                                  if (input.charCodeAt(peg$currPos) === 41) {
                                                                                    s7 = peg$c21;
                                                                                    peg$currPos++;
                                                                                  } else {
                                                                                    s7 = peg$FAILED;
                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                  }
                                                                                  if (s7 !== peg$FAILED) {
                                                                                    peg$savedPos = s0;
                                                                                    s1 = peg$c342(s5);
                                                                                    s0 = s1;
                                                                                  } else {
                                                                                    peg$currPos = s0;
                                                                                    s0 = peg$FAILED;
                                                                                  }
                                                                                } else {
                                                                                  peg$currPos = s0;
                                                                                  s0 = peg$FAILED;
                                                                                }
                                                                              } else {
                                                                                peg$currPos = s0;
                                                                                s0 = peg$FAILED;
                                                                              }
                                                                            } else {
                                                                              peg$currPos = s0;
                                                                              s0 = peg$FAILED;
                                                                            }
                                                                          } else {
                                                                            peg$currPos = s0;
                                                                            s0 = peg$FAILED;
                                                                          }
                                                                        } else {
                                                                          peg$currPos = s0;
                                                                          s0 = peg$FAILED;
                                                                        }
                                                                      } else {
                                                                        peg$currPos = s0;
                                                                        s0 = peg$FAILED;
                                                                      }
                                                                      if (s0 === peg$FAILED) {
                                                                        s0 = peg$currPos;
                                                                        if (input.substr(peg$currPos, 3).toLowerCase() === peg$c343) {
                                                                          s1 = input.substr(peg$currPos, 3);
                                                                          peg$currPos += 3;
                                                                        } else {
                                                                          s1 = peg$FAILED;
                                                                          if (peg$silentFails === 0) { peg$fail(peg$c344); }
                                                                        }
                                                                        if (s1 !== peg$FAILED) {
                                                                          s2 = [];
                                                                          s3 = peg$parseWS();
                                                                          while (s3 !== peg$FAILED) {
                                                                            s2.push(s3);
                                                                            s3 = peg$parseWS();
                                                                          }
                                                                          if (s2 !== peg$FAILED) {
                                                                            s3 = peg$parseNIL();
                                                                            if (s3 !== peg$FAILED) {
                                                                              peg$savedPos = s0;
                                                                              s1 = peg$c345();
                                                                              s0 = s1;
                                                                            } else {
                                                                              peg$currPos = s0;
                                                                              s0 = peg$FAILED;
                                                                            }
                                                                          } else {
                                                                            peg$currPos = s0;
                                                                            s0 = peg$FAILED;
                                                                          }
                                                                        } else {
                                                                          peg$currPos = s0;
                                                                          s0 = peg$FAILED;
                                                                        }
                                                                        if (s0 === peg$FAILED) {
                                                                          s0 = peg$currPos;
                                                                          if (input.substr(peg$currPos, 4).toLowerCase() === peg$c346) {
                                                                            s1 = input.substr(peg$currPos, 4);
                                                                            peg$currPos += 4;
                                                                          } else {
                                                                            s1 = peg$FAILED;
                                                                            if (peg$silentFails === 0) { peg$fail(peg$c347); }
                                                                          }
                                                                          if (s1 !== peg$FAILED) {
                                                                            s2 = [];
                                                                            s3 = peg$parseWS();
                                                                            while (s3 !== peg$FAILED) {
                                                                              s2.push(s3);
                                                                              s3 = peg$parseWS();
                                                                            }
                                                                            if (s2 !== peg$FAILED) {
                                                                              s3 = peg$parseNIL();
                                                                              if (s3 !== peg$FAILED) {
                                                                                peg$savedPos = s0;
                                                                                s1 = peg$c348();
                                                                                s0 = s1;
                                                                              } else {
                                                                                peg$currPos = s0;
                                                                                s0 = peg$FAILED;
                                                                              }
                                                                            } else {
                                                                              peg$currPos = s0;
                                                                              s0 = peg$FAILED;
                                                                            }
                                                                          } else {
                                                                            peg$currPos = s0;
                                                                            s0 = peg$FAILED;
                                                                          }
                                                                          if (s0 === peg$FAILED) {
                                                                            s0 = peg$currPos;
                                                                            if (input.substr(peg$currPos, 7).toLowerCase() === peg$c349) {
                                                                              s1 = input.substr(peg$currPos, 7);
                                                                              peg$currPos += 7;
                                                                            } else {
                                                                              s1 = peg$FAILED;
                                                                              if (peg$silentFails === 0) { peg$fail(peg$c350); }
                                                                            }
                                                                            if (s1 !== peg$FAILED) {
                                                                              s2 = [];
                                                                              s3 = peg$parseWS();
                                                                              while (s3 !== peg$FAILED) {
                                                                                s2.push(s3);
                                                                                s3 = peg$parseWS();
                                                                              }
                                                                              if (s2 !== peg$FAILED) {
                                                                                s3 = peg$parseNIL();
                                                                                if (s3 !== peg$FAILED) {
                                                                                  peg$savedPos = s0;
                                                                                  s1 = peg$c351();
                                                                                  s0 = s1;
                                                                                } else {
                                                                                  peg$currPos = s0;
                                                                                  s0 = peg$FAILED;
                                                                                }
                                                                              } else {
                                                                                peg$currPos = s0;
                                                                                s0 = peg$FAILED;
                                                                              }
                                                                            } else {
                                                                              peg$currPos = s0;
                                                                              s0 = peg$FAILED;
                                                                            }
                                                                            if (s0 === peg$FAILED) {
                                                                              s0 = peg$currPos;
                                                                              if (input.substr(peg$currPos, 3).toLowerCase() === peg$c352) {
                                                                                s1 = input.substr(peg$currPos, 3);
                                                                                peg$currPos += 3;
                                                                              } else {
                                                                                s1 = peg$FAILED;
                                                                                if (peg$silentFails === 0) { peg$fail(peg$c353); }
                                                                              }
                                                                              if (s1 !== peg$FAILED) {
                                                                                s2 = [];
                                                                                s3 = peg$parseWS();
                                                                                while (s3 !== peg$FAILED) {
                                                                                  s2.push(s3);
                                                                                  s3 = peg$parseWS();
                                                                                }
                                                                                if (s2 !== peg$FAILED) {
                                                                                  if (input.charCodeAt(peg$currPos) === 40) {
                                                                                    s3 = peg$c17;
                                                                                    peg$currPos++;
                                                                                  } else {
                                                                                    s3 = peg$FAILED;
                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                                  }
                                                                                  if (s3 !== peg$FAILED) {
                                                                                    s4 = [];
                                                                                    s5 = peg$parseWS();
                                                                                    while (s5 !== peg$FAILED) {
                                                                                      s4.push(s5);
                                                                                      s5 = peg$parseWS();
                                                                                    }
                                                                                    if (s4 !== peg$FAILED) {
                                                                                      s5 = peg$parseConditionalOrExpression();
                                                                                      if (s5 !== peg$FAILED) {
                                                                                        s6 = [];
                                                                                        s7 = peg$parseWS();
                                                                                        while (s7 !== peg$FAILED) {
                                                                                          s6.push(s7);
                                                                                          s7 = peg$parseWS();
                                                                                        }
                                                                                        if (s6 !== peg$FAILED) {
                                                                                          if (input.charCodeAt(peg$currPos) === 41) {
                                                                                            s7 = peg$c21;
                                                                                            peg$currPos++;
                                                                                          } else {
                                                                                            s7 = peg$FAILED;
                                                                                            if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                          }
                                                                                          if (s7 !== peg$FAILED) {
                                                                                            peg$savedPos = s0;
                                                                                            s1 = peg$c354(s5);
                                                                                            s0 = s1;
                                                                                          } else {
                                                                                            peg$currPos = s0;
                                                                                            s0 = peg$FAILED;
                                                                                          }
                                                                                        } else {
                                                                                          peg$currPos = s0;
                                                                                          s0 = peg$FAILED;
                                                                                        }
                                                                                      } else {
                                                                                        peg$currPos = s0;
                                                                                        s0 = peg$FAILED;
                                                                                      }
                                                                                    } else {
                                                                                      peg$currPos = s0;
                                                                                      s0 = peg$FAILED;
                                                                                    }
                                                                                  } else {
                                                                                    peg$currPos = s0;
                                                                                    s0 = peg$FAILED;
                                                                                  }
                                                                                } else {
                                                                                  peg$currPos = s0;
                                                                                  s0 = peg$FAILED;
                                                                                }
                                                                              } else {
                                                                                peg$currPos = s0;
                                                                                s0 = peg$FAILED;
                                                                              }
                                                                              if (s0 === peg$FAILED) {
                                                                                s0 = peg$currPos;
                                                                                if (input.substr(peg$currPos, 4).toLowerCase() === peg$c355) {
                                                                                  s1 = input.substr(peg$currPos, 4);
                                                                                  peg$currPos += 4;
                                                                                } else {
                                                                                  s1 = peg$FAILED;
                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c356); }
                                                                                }
                                                                                if (s1 !== peg$FAILED) {
                                                                                  s2 = [];
                                                                                  s3 = peg$parseWS();
                                                                                  while (s3 !== peg$FAILED) {
                                                                                    s2.push(s3);
                                                                                    s3 = peg$parseWS();
                                                                                  }
                                                                                  if (s2 !== peg$FAILED) {
                                                                                    if (input.charCodeAt(peg$currPos) === 40) {
                                                                                      s3 = peg$c17;
                                                                                      peg$currPos++;
                                                                                    } else {
                                                                                      s3 = peg$FAILED;
                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                                    }
                                                                                    if (s3 !== peg$FAILED) {
                                                                                      s4 = [];
                                                                                      s5 = peg$parseWS();
                                                                                      while (s5 !== peg$FAILED) {
                                                                                        s4.push(s5);
                                                                                        s5 = peg$parseWS();
                                                                                      }
                                                                                      if (s4 !== peg$FAILED) {
                                                                                        s5 = peg$parseConditionalOrExpression();
                                                                                        if (s5 !== peg$FAILED) {
                                                                                          s6 = [];
                                                                                          s7 = peg$parseWS();
                                                                                          while (s7 !== peg$FAILED) {
                                                                                            s6.push(s7);
                                                                                            s7 = peg$parseWS();
                                                                                          }
                                                                                          if (s6 !== peg$FAILED) {
                                                                                            if (input.charCodeAt(peg$currPos) === 41) {
                                                                                              s7 = peg$c21;
                                                                                              peg$currPos++;
                                                                                            } else {
                                                                                              s7 = peg$FAILED;
                                                                                              if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                            }
                                                                                            if (s7 !== peg$FAILED) {
                                                                                              peg$savedPos = s0;
                                                                                              s1 = peg$c357(s5);
                                                                                              s0 = s1;
                                                                                            } else {
                                                                                              peg$currPos = s0;
                                                                                              s0 = peg$FAILED;
                                                                                            }
                                                                                          } else {
                                                                                            peg$currPos = s0;
                                                                                            s0 = peg$FAILED;
                                                                                          }
                                                                                        } else {
                                                                                          peg$currPos = s0;
                                                                                          s0 = peg$FAILED;
                                                                                        }
                                                                                      } else {
                                                                                        peg$currPos = s0;
                                                                                        s0 = peg$FAILED;
                                                                                      }
                                                                                    } else {
                                                                                      peg$currPos = s0;
                                                                                      s0 = peg$FAILED;
                                                                                    }
                                                                                  } else {
                                                                                    peg$currPos = s0;
                                                                                    s0 = peg$FAILED;
                                                                                  }
                                                                                } else {
                                                                                  peg$currPos = s0;
                                                                                  s0 = peg$FAILED;
                                                                                }
                                                                                if (s0 === peg$FAILED) {
                                                                                  s0 = peg$currPos;
                                                                                  if (input.substr(peg$currPos, 6).toLowerCase() === peg$c358) {
                                                                                    s1 = input.substr(peg$currPos, 6);
                                                                                    peg$currPos += 6;
                                                                                  } else {
                                                                                    s1 = peg$FAILED;
                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c359); }
                                                                                  }
                                                                                  if (s1 !== peg$FAILED) {
                                                                                    s2 = [];
                                                                                    s3 = peg$parseWS();
                                                                                    while (s3 !== peg$FAILED) {
                                                                                      s2.push(s3);
                                                                                      s3 = peg$parseWS();
                                                                                    }
                                                                                    if (s2 !== peg$FAILED) {
                                                                                      if (input.charCodeAt(peg$currPos) === 40) {
                                                                                        s3 = peg$c17;
                                                                                        peg$currPos++;
                                                                                      } else {
                                                                                        s3 = peg$FAILED;
                                                                                        if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                                      }
                                                                                      if (s3 !== peg$FAILED) {
                                                                                        s4 = [];
                                                                                        s5 = peg$parseWS();
                                                                                        while (s5 !== peg$FAILED) {
                                                                                          s4.push(s5);
                                                                                          s5 = peg$parseWS();
                                                                                        }
                                                                                        if (s4 !== peg$FAILED) {
                                                                                          s5 = peg$parseConditionalOrExpression();
                                                                                          if (s5 !== peg$FAILED) {
                                                                                            s6 = [];
                                                                                            s7 = peg$parseWS();
                                                                                            while (s7 !== peg$FAILED) {
                                                                                              s6.push(s7);
                                                                                              s7 = peg$parseWS();
                                                                                            }
                                                                                            if (s6 !== peg$FAILED) {
                                                                                              if (input.charCodeAt(peg$currPos) === 41) {
                                                                                                s7 = peg$c21;
                                                                                                peg$currPos++;
                                                                                              } else {
                                                                                                s7 = peg$FAILED;
                                                                                                if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                              }
                                                                                              if (s7 !== peg$FAILED) {
                                                                                                peg$savedPos = s0;
                                                                                                s1 = peg$c360(s5);
                                                                                                s0 = s1;
                                                                                              } else {
                                                                                                peg$currPos = s0;
                                                                                                s0 = peg$FAILED;
                                                                                              }
                                                                                            } else {
                                                                                              peg$currPos = s0;
                                                                                              s0 = peg$FAILED;
                                                                                            }
                                                                                          } else {
                                                                                            peg$currPos = s0;
                                                                                            s0 = peg$FAILED;
                                                                                          }
                                                                                        } else {
                                                                                          peg$currPos = s0;
                                                                                          s0 = peg$FAILED;
                                                                                        }
                                                                                      } else {
                                                                                        peg$currPos = s0;
                                                                                        s0 = peg$FAILED;
                                                                                      }
                                                                                    } else {
                                                                                      peg$currPos = s0;
                                                                                      s0 = peg$FAILED;
                                                                                    }
                                                                                  } else {
                                                                                    peg$currPos = s0;
                                                                                    s0 = peg$FAILED;
                                                                                  }
                                                                                  if (s0 === peg$FAILED) {
                                                                                    s0 = peg$currPos;
                                                                                    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c361) {
                                                                                      s1 = input.substr(peg$currPos, 6);
                                                                                      peg$currPos += 6;
                                                                                    } else {
                                                                                      s1 = peg$FAILED;
                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c362); }
                                                                                    }
                                                                                    if (s1 !== peg$FAILED) {
                                                                                      s2 = [];
                                                                                      s3 = peg$parseWS();
                                                                                      while (s3 !== peg$FAILED) {
                                                                                        s2.push(s3);
                                                                                        s3 = peg$parseWS();
                                                                                      }
                                                                                      if (s2 !== peg$FAILED) {
                                                                                        if (input.charCodeAt(peg$currPos) === 40) {
                                                                                          s3 = peg$c17;
                                                                                          peg$currPos++;
                                                                                        } else {
                                                                                          s3 = peg$FAILED;
                                                                                          if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                                        }
                                                                                        if (s3 !== peg$FAILED) {
                                                                                          s4 = [];
                                                                                          s5 = peg$parseWS();
                                                                                          while (s5 !== peg$FAILED) {
                                                                                            s4.push(s5);
                                                                                            s5 = peg$parseWS();
                                                                                          }
                                                                                          if (s4 !== peg$FAILED) {
                                                                                            s5 = peg$parseConditionalOrExpression();
                                                                                            if (s5 !== peg$FAILED) {
                                                                                              s6 = [];
                                                                                              s7 = peg$parseWS();
                                                                                              while (s7 !== peg$FAILED) {
                                                                                                s6.push(s7);
                                                                                                s7 = peg$parseWS();
                                                                                              }
                                                                                              if (s6 !== peg$FAILED) {
                                                                                                if (input.charCodeAt(peg$currPos) === 41) {
                                                                                                  s7 = peg$c21;
                                                                                                  peg$currPos++;
                                                                                                } else {
                                                                                                  s7 = peg$FAILED;
                                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                                }
                                                                                                if (s7 !== peg$FAILED) {
                                                                                                  peg$savedPos = s0;
                                                                                                  s1 = peg$c363(s5);
                                                                                                  s0 = s1;
                                                                                                } else {
                                                                                                  peg$currPos = s0;
                                                                                                  s0 = peg$FAILED;
                                                                                                }
                                                                                              } else {
                                                                                                peg$currPos = s0;
                                                                                                s0 = peg$FAILED;
                                                                                              }
                                                                                            } else {
                                                                                              peg$currPos = s0;
                                                                                              s0 = peg$FAILED;
                                                                                            }
                                                                                          } else {
                                                                                            peg$currPos = s0;
                                                                                            s0 = peg$FAILED;
                                                                                          }
                                                                                        } else {
                                                                                          peg$currPos = s0;
                                                                                          s0 = peg$FAILED;
                                                                                        }
                                                                                      } else {
                                                                                        peg$currPos = s0;
                                                                                        s0 = peg$FAILED;
                                                                                      }
                                                                                    } else {
                                                                                      peg$currPos = s0;
                                                                                      s0 = peg$FAILED;
                                                                                    }
                                                                                    if (s0 === peg$FAILED) {
                                                                                      s0 = peg$currPos;
                                                                                      if (input.substr(peg$currPos, 6).toLowerCase() === peg$c364) {
                                                                                        s1 = input.substr(peg$currPos, 6);
                                                                                        peg$currPos += 6;
                                                                                      } else {
                                                                                        s1 = peg$FAILED;
                                                                                        if (peg$silentFails === 0) { peg$fail(peg$c365); }
                                                                                      }
                                                                                      if (s1 !== peg$FAILED) {
                                                                                        s2 = [];
                                                                                        s3 = peg$parseWS();
                                                                                        while (s3 !== peg$FAILED) {
                                                                                          s2.push(s3);
                                                                                          s3 = peg$parseWS();
                                                                                        }
                                                                                        if (s2 !== peg$FAILED) {
                                                                                          if (input.charCodeAt(peg$currPos) === 40) {
                                                                                            s3 = peg$c17;
                                                                                            peg$currPos++;
                                                                                          } else {
                                                                                            s3 = peg$FAILED;
                                                                                            if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                                          }
                                                                                          if (s3 !== peg$FAILED) {
                                                                                            s4 = [];
                                                                                            s5 = peg$parseWS();
                                                                                            while (s5 !== peg$FAILED) {
                                                                                              s4.push(s5);
                                                                                              s5 = peg$parseWS();
                                                                                            }
                                                                                            if (s4 !== peg$FAILED) {
                                                                                              s5 = peg$parseConditionalOrExpression();
                                                                                              if (s5 !== peg$FAILED) {
                                                                                                s6 = [];
                                                                                                s7 = peg$parseWS();
                                                                                                while (s7 !== peg$FAILED) {
                                                                                                  s6.push(s7);
                                                                                                  s7 = peg$parseWS();
                                                                                                }
                                                                                                if (s6 !== peg$FAILED) {
                                                                                                  if (input.charCodeAt(peg$currPos) === 41) {
                                                                                                    s7 = peg$c21;
                                                                                                    peg$currPos++;
                                                                                                  } else {
                                                                                                    s7 = peg$FAILED;
                                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                                  }
                                                                                                  if (s7 !== peg$FAILED) {
                                                                                                    peg$savedPos = s0;
                                                                                                    s1 = peg$c366(s5);
                                                                                                    s0 = s1;
                                                                                                  } else {
                                                                                                    peg$currPos = s0;
                                                                                                    s0 = peg$FAILED;
                                                                                                  }
                                                                                                } else {
                                                                                                  peg$currPos = s0;
                                                                                                  s0 = peg$FAILED;
                                                                                                }
                                                                                              } else {
                                                                                                peg$currPos = s0;
                                                                                                s0 = peg$FAILED;
                                                                                              }
                                                                                            } else {
                                                                                              peg$currPos = s0;
                                                                                              s0 = peg$FAILED;
                                                                                            }
                                                                                          } else {
                                                                                            peg$currPos = s0;
                                                                                            s0 = peg$FAILED;
                                                                                          }
                                                                                        } else {
                                                                                          peg$currPos = s0;
                                                                                          s0 = peg$FAILED;
                                                                                        }
                                                                                      } else {
                                                                                        peg$currPos = s0;
                                                                                        s0 = peg$FAILED;
                                                                                      }
                                                                                      if (s0 === peg$FAILED) {
                                                                                        s0 = peg$currPos;
                                                                                        if (input.substr(peg$currPos, 8).toLowerCase() === peg$c367) {
                                                                                          s1 = input.substr(peg$currPos, 8);
                                                                                          peg$currPos += 8;
                                                                                        } else {
                                                                                          s1 = peg$FAILED;
                                                                                          if (peg$silentFails === 0) { peg$fail(peg$c368); }
                                                                                        }
                                                                                        if (s1 !== peg$FAILED) {
                                                                                          s2 = [];
                                                                                          s3 = peg$parseWS();
                                                                                          while (s3 !== peg$FAILED) {
                                                                                            s2.push(s3);
                                                                                            s3 = peg$parseWS();
                                                                                          }
                                                                                          if (s2 !== peg$FAILED) {
                                                                                            s3 = peg$parseExpressionList();
                                                                                            if (s3 !== peg$FAILED) {
                                                                                              peg$savedPos = s0;
                                                                                              s1 = peg$c369(s3);
                                                                                              s0 = s1;
                                                                                            } else {
                                                                                              peg$currPos = s0;
                                                                                              s0 = peg$FAILED;
                                                                                            }
                                                                                          } else {
                                                                                            peg$currPos = s0;
                                                                                            s0 = peg$FAILED;
                                                                                          }
                                                                                        } else {
                                                                                          peg$currPos = s0;
                                                                                          s0 = peg$FAILED;
                                                                                        }
                                                                                        if (s0 === peg$FAILED) {
                                                                                          s0 = peg$currPos;
                                                                                          if (input.substr(peg$currPos, 2).toLowerCase() === peg$c370) {
                                                                                            s1 = input.substr(peg$currPos, 2);
                                                                                            peg$currPos += 2;
                                                                                          } else {
                                                                                            s1 = peg$FAILED;
                                                                                            if (peg$silentFails === 0) { peg$fail(peg$c371); }
                                                                                          }
                                                                                          if (s1 !== peg$FAILED) {
                                                                                            s2 = [];
                                                                                            s3 = peg$parseWS();
                                                                                            while (s3 !== peg$FAILED) {
                                                                                              s2.push(s3);
                                                                                              s3 = peg$parseWS();
                                                                                            }
                                                                                            if (s2 !== peg$FAILED) {
                                                                                              if (input.charCodeAt(peg$currPos) === 40) {
                                                                                                s3 = peg$c17;
                                                                                                peg$currPos++;
                                                                                              } else {
                                                                                                s3 = peg$FAILED;
                                                                                                if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                                              }
                                                                                              if (s3 !== peg$FAILED) {
                                                                                                s4 = [];
                                                                                                s5 = peg$parseWS();
                                                                                                while (s5 !== peg$FAILED) {
                                                                                                  s4.push(s5);
                                                                                                  s5 = peg$parseWS();
                                                                                                }
                                                                                                if (s4 !== peg$FAILED) {
                                                                                                  s5 = peg$parseConditionalOrExpression();
                                                                                                  if (s5 !== peg$FAILED) {
                                                                                                    s6 = [];
                                                                                                    s7 = peg$parseWS();
                                                                                                    while (s7 !== peg$FAILED) {
                                                                                                      s6.push(s7);
                                                                                                      s7 = peg$parseWS();
                                                                                                    }
                                                                                                    if (s6 !== peg$FAILED) {
                                                                                                      if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                        s7 = peg$c174;
                                                                                                        peg$currPos++;
                                                                                                      } else {
                                                                                                        s7 = peg$FAILED;
                                                                                                        if (peg$silentFails === 0) { peg$fail(peg$c175); }
                                                                                                      }
                                                                                                      if (s7 !== peg$FAILED) {
                                                                                                        s8 = [];
                                                                                                        s9 = peg$parseWS();
                                                                                                        while (s9 !== peg$FAILED) {
                                                                                                          s8.push(s9);
                                                                                                          s9 = peg$parseWS();
                                                                                                        }
                                                                                                        if (s8 !== peg$FAILED) {
                                                                                                          s9 = peg$parseConditionalOrExpression();
                                                                                                          if (s9 !== peg$FAILED) {
                                                                                                            s10 = [];
                                                                                                            s11 = peg$parseWS();
                                                                                                            while (s11 !== peg$FAILED) {
                                                                                                              s10.push(s11);
                                                                                                              s11 = peg$parseWS();
                                                                                                            }
                                                                                                            if (s10 !== peg$FAILED) {
                                                                                                              if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                s11 = peg$c174;
                                                                                                                peg$currPos++;
                                                                                                              } else {
                                                                                                                s11 = peg$FAILED;
                                                                                                                if (peg$silentFails === 0) { peg$fail(peg$c175); }
                                                                                                              }
                                                                                                              if (s11 !== peg$FAILED) {
                                                                                                                s12 = [];
                                                                                                                s13 = peg$parseWS();
                                                                                                                while (s13 !== peg$FAILED) {
                                                                                                                  s12.push(s13);
                                                                                                                  s13 = peg$parseWS();
                                                                                                                }
                                                                                                                if (s12 !== peg$FAILED) {
                                                                                                                  s13 = peg$parseConditionalOrExpression();
                                                                                                                  if (s13 !== peg$FAILED) {
                                                                                                                    s14 = [];
                                                                                                                    s15 = peg$parseWS();
                                                                                                                    while (s15 !== peg$FAILED) {
                                                                                                                      s14.push(s15);
                                                                                                                      s15 = peg$parseWS();
                                                                                                                    }
                                                                                                                    if (s14 !== peg$FAILED) {
                                                                                                                      if (input.charCodeAt(peg$currPos) === 41) {
                                                                                                                        s15 = peg$c21;
                                                                                                                        peg$currPos++;
                                                                                                                      } else {
                                                                                                                        s15 = peg$FAILED;
                                                                                                                        if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                                                      }
                                                                                                                      if (s15 !== peg$FAILED) {
                                                                                                                        peg$savedPos = s0;
                                                                                                                        s1 = peg$c372(s5, s9, s13);
                                                                                                                        s0 = s1;
                                                                                                                      } else {
                                                                                                                        peg$currPos = s0;
                                                                                                                        s0 = peg$FAILED;
                                                                                                                      }
                                                                                                                    } else {
                                                                                                                      peg$currPos = s0;
                                                                                                                      s0 = peg$FAILED;
                                                                                                                    }
                                                                                                                  } else {
                                                                                                                    peg$currPos = s0;
                                                                                                                    s0 = peg$FAILED;
                                                                                                                  }
                                                                                                                } else {
                                                                                                                  peg$currPos = s0;
                                                                                                                  s0 = peg$FAILED;
                                                                                                                }
                                                                                                              } else {
                                                                                                                peg$currPos = s0;
                                                                                                                s0 = peg$FAILED;
                                                                                                              }
                                                                                                            } else {
                                                                                                              peg$currPos = s0;
                                                                                                              s0 = peg$FAILED;
                                                                                                            }
                                                                                                          } else {
                                                                                                            peg$currPos = s0;
                                                                                                            s0 = peg$FAILED;
                                                                                                          }
                                                                                                        } else {
                                                                                                          peg$currPos = s0;
                                                                                                          s0 = peg$FAILED;
                                                                                                        }
                                                                                                      } else {
                                                                                                        peg$currPos = s0;
                                                                                                        s0 = peg$FAILED;
                                                                                                      }
                                                                                                    } else {
                                                                                                      peg$currPos = s0;
                                                                                                      s0 = peg$FAILED;
                                                                                                    }
                                                                                                  } else {
                                                                                                    peg$currPos = s0;
                                                                                                    s0 = peg$FAILED;
                                                                                                  }
                                                                                                } else {
                                                                                                  peg$currPos = s0;
                                                                                                  s0 = peg$FAILED;
                                                                                                }
                                                                                              } else {
                                                                                                peg$currPos = s0;
                                                                                                s0 = peg$FAILED;
                                                                                              }
                                                                                            } else {
                                                                                              peg$currPos = s0;
                                                                                              s0 = peg$FAILED;
                                                                                            }
                                                                                          } else {
                                                                                            peg$currPos = s0;
                                                                                            s0 = peg$FAILED;
                                                                                          }
                                                                                          if (s0 === peg$FAILED) {
                                                                                            s0 = peg$currPos;
                                                                                            if (input.substr(peg$currPos, 7).toLowerCase() === peg$c373) {
                                                                                              s1 = input.substr(peg$currPos, 7);
                                                                                              peg$currPos += 7;
                                                                                            } else {
                                                                                              s1 = peg$FAILED;
                                                                                              if (peg$silentFails === 0) { peg$fail(peg$c374); }
                                                                                            }
                                                                                            if (s1 !== peg$FAILED) {
                                                                                              s2 = [];
                                                                                              s3 = peg$parseWS();
                                                                                              while (s3 !== peg$FAILED) {
                                                                                                s2.push(s3);
                                                                                                s3 = peg$parseWS();
                                                                                              }
                                                                                              if (s2 !== peg$FAILED) {
                                                                                                if (input.charCodeAt(peg$currPos) === 40) {
                                                                                                  s3 = peg$c17;
                                                                                                  peg$currPos++;
                                                                                                } else {
                                                                                                  s3 = peg$FAILED;
                                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                                                }
                                                                                                if (s3 !== peg$FAILED) {
                                                                                                  s4 = [];
                                                                                                  s5 = peg$parseWS();
                                                                                                  while (s5 !== peg$FAILED) {
                                                                                                    s4.push(s5);
                                                                                                    s5 = peg$parseWS();
                                                                                                  }
                                                                                                  if (s4 !== peg$FAILED) {
                                                                                                    s5 = peg$parseConditionalOrExpression();
                                                                                                    if (s5 !== peg$FAILED) {
                                                                                                      s6 = [];
                                                                                                      s7 = peg$parseWS();
                                                                                                      while (s7 !== peg$FAILED) {
                                                                                                        s6.push(s7);
                                                                                                        s7 = peg$parseWS();
                                                                                                      }
                                                                                                      if (s6 !== peg$FAILED) {
                                                                                                        if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                          s7 = peg$c174;
                                                                                                          peg$currPos++;
                                                                                                        } else {
                                                                                                          s7 = peg$FAILED;
                                                                                                          if (peg$silentFails === 0) { peg$fail(peg$c175); }
                                                                                                        }
                                                                                                        if (s7 !== peg$FAILED) {
                                                                                                          s8 = [];
                                                                                                          s9 = peg$parseWS();
                                                                                                          while (s9 !== peg$FAILED) {
                                                                                                            s8.push(s9);
                                                                                                            s9 = peg$parseWS();
                                                                                                          }
                                                                                                          if (s8 !== peg$FAILED) {
                                                                                                            s9 = peg$parseConditionalOrExpression();
                                                                                                            if (s9 !== peg$FAILED) {
                                                                                                              s10 = [];
                                                                                                              s11 = peg$parseWS();
                                                                                                              while (s11 !== peg$FAILED) {
                                                                                                                s10.push(s11);
                                                                                                                s11 = peg$parseWS();
                                                                                                              }
                                                                                                              if (s10 !== peg$FAILED) {
                                                                                                                if (input.charCodeAt(peg$currPos) === 41) {
                                                                                                                  s11 = peg$c21;
                                                                                                                  peg$currPos++;
                                                                                                                } else {
                                                                                                                  s11 = peg$FAILED;
                                                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                                                }
                                                                                                                if (s11 !== peg$FAILED) {
                                                                                                                  peg$savedPos = s0;
                                                                                                                  s1 = peg$c375(s5, s9);
                                                                                                                  s0 = s1;
                                                                                                                } else {
                                                                                                                  peg$currPos = s0;
                                                                                                                  s0 = peg$FAILED;
                                                                                                                }
                                                                                                              } else {
                                                                                                                peg$currPos = s0;
                                                                                                                s0 = peg$FAILED;
                                                                                                              }
                                                                                                            } else {
                                                                                                              peg$currPos = s0;
                                                                                                              s0 = peg$FAILED;
                                                                                                            }
                                                                                                          } else {
                                                                                                            peg$currPos = s0;
                                                                                                            s0 = peg$FAILED;
                                                                                                          }
                                                                                                        } else {
                                                                                                          peg$currPos = s0;
                                                                                                          s0 = peg$FAILED;
                                                                                                        }
                                                                                                      } else {
                                                                                                        peg$currPos = s0;
                                                                                                        s0 = peg$FAILED;
                                                                                                      }
                                                                                                    } else {
                                                                                                      peg$currPos = s0;
                                                                                                      s0 = peg$FAILED;
                                                                                                    }
                                                                                                  } else {
                                                                                                    peg$currPos = s0;
                                                                                                    s0 = peg$FAILED;
                                                                                                  }
                                                                                                } else {
                                                                                                  peg$currPos = s0;
                                                                                                  s0 = peg$FAILED;
                                                                                                }
                                                                                              } else {
                                                                                                peg$currPos = s0;
                                                                                                s0 = peg$FAILED;
                                                                                              }
                                                                                            } else {
                                                                                              peg$currPos = s0;
                                                                                              s0 = peg$FAILED;
                                                                                            }
                                                                                            if (s0 === peg$FAILED) {
                                                                                              s0 = peg$currPos;
                                                                                              if (input.substr(peg$currPos, 5).toLowerCase() === peg$c376) {
                                                                                                s1 = input.substr(peg$currPos, 5);
                                                                                                peg$currPos += 5;
                                                                                              } else {
                                                                                                s1 = peg$FAILED;
                                                                                                if (peg$silentFails === 0) { peg$fail(peg$c377); }
                                                                                              }
                                                                                              if (s1 !== peg$FAILED) {
                                                                                                s2 = [];
                                                                                                s3 = peg$parseWS();
                                                                                                while (s3 !== peg$FAILED) {
                                                                                                  s2.push(s3);
                                                                                                  s3 = peg$parseWS();
                                                                                                }
                                                                                                if (s2 !== peg$FAILED) {
                                                                                                  if (input.charCodeAt(peg$currPos) === 40) {
                                                                                                    s3 = peg$c17;
                                                                                                    peg$currPos++;
                                                                                                  } else {
                                                                                                    s3 = peg$FAILED;
                                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                                                  }
                                                                                                  if (s3 !== peg$FAILED) {
                                                                                                    s4 = [];
                                                                                                    s5 = peg$parseWS();
                                                                                                    while (s5 !== peg$FAILED) {
                                                                                                      s4.push(s5);
                                                                                                      s5 = peg$parseWS();
                                                                                                    }
                                                                                                    if (s4 !== peg$FAILED) {
                                                                                                      s5 = peg$parseConditionalOrExpression();
                                                                                                      if (s5 !== peg$FAILED) {
                                                                                                        s6 = [];
                                                                                                        s7 = peg$parseWS();
                                                                                                        while (s7 !== peg$FAILED) {
                                                                                                          s6.push(s7);
                                                                                                          s7 = peg$parseWS();
                                                                                                        }
                                                                                                        if (s6 !== peg$FAILED) {
                                                                                                          if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                            s7 = peg$c174;
                                                                                                            peg$currPos++;
                                                                                                          } else {
                                                                                                            s7 = peg$FAILED;
                                                                                                            if (peg$silentFails === 0) { peg$fail(peg$c175); }
                                                                                                          }
                                                                                                          if (s7 !== peg$FAILED) {
                                                                                                            s8 = [];
                                                                                                            s9 = peg$parseWS();
                                                                                                            while (s9 !== peg$FAILED) {
                                                                                                              s8.push(s9);
                                                                                                              s9 = peg$parseWS();
                                                                                                            }
                                                                                                            if (s8 !== peg$FAILED) {
                                                                                                              s9 = peg$parseConditionalOrExpression();
                                                                                                              if (s9 !== peg$FAILED) {
                                                                                                                s10 = [];
                                                                                                                s11 = peg$parseWS();
                                                                                                                while (s11 !== peg$FAILED) {
                                                                                                                  s10.push(s11);
                                                                                                                  s11 = peg$parseWS();
                                                                                                                }
                                                                                                                if (s10 !== peg$FAILED) {
                                                                                                                  if (input.charCodeAt(peg$currPos) === 41) {
                                                                                                                    s11 = peg$c21;
                                                                                                                    peg$currPos++;
                                                                                                                  } else {
                                                                                                                    s11 = peg$FAILED;
                                                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                                                  }
                                                                                                                  if (s11 !== peg$FAILED) {
                                                                                                                    peg$savedPos = s0;
                                                                                                                    s1 = peg$c378(s5, s9);
                                                                                                                    s0 = s1;
                                                                                                                  } else {
                                                                                                                    peg$currPos = s0;
                                                                                                                    s0 = peg$FAILED;
                                                                                                                  }
                                                                                                                } else {
                                                                                                                  peg$currPos = s0;
                                                                                                                  s0 = peg$FAILED;
                                                                                                                }
                                                                                                              } else {
                                                                                                                peg$currPos = s0;
                                                                                                                s0 = peg$FAILED;
                                                                                                              }
                                                                                                            } else {
                                                                                                              peg$currPos = s0;
                                                                                                              s0 = peg$FAILED;
                                                                                                            }
                                                                                                          } else {
                                                                                                            peg$currPos = s0;
                                                                                                            s0 = peg$FAILED;
                                                                                                          }
                                                                                                        } else {
                                                                                                          peg$currPos = s0;
                                                                                                          s0 = peg$FAILED;
                                                                                                        }
                                                                                                      } else {
                                                                                                        peg$currPos = s0;
                                                                                                        s0 = peg$FAILED;
                                                                                                      }
                                                                                                    } else {
                                                                                                      peg$currPos = s0;
                                                                                                      s0 = peg$FAILED;
                                                                                                    }
                                                                                                  } else {
                                                                                                    peg$currPos = s0;
                                                                                                    s0 = peg$FAILED;
                                                                                                  }
                                                                                                } else {
                                                                                                  peg$currPos = s0;
                                                                                                  s0 = peg$FAILED;
                                                                                                }
                                                                                              } else {
                                                                                                peg$currPos = s0;
                                                                                                s0 = peg$FAILED;
                                                                                              }
                                                                                              if (s0 === peg$FAILED) {
                                                                                                s0 = peg$currPos;
                                                                                                if (input.substr(peg$currPos, 8).toLowerCase() === peg$c379) {
                                                                                                  s1 = input.substr(peg$currPos, 8);
                                                                                                  peg$currPos += 8;
                                                                                                } else {
                                                                                                  s1 = peg$FAILED;
                                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c380); }
                                                                                                }
                                                                                                if (s1 !== peg$FAILED) {
                                                                                                  s2 = [];
                                                                                                  s3 = peg$parseWS();
                                                                                                  while (s3 !== peg$FAILED) {
                                                                                                    s2.push(s3);
                                                                                                    s3 = peg$parseWS();
                                                                                                  }
                                                                                                  if (s2 !== peg$FAILED) {
                                                                                                    if (input.charCodeAt(peg$currPos) === 40) {
                                                                                                      s3 = peg$c17;
                                                                                                      peg$currPos++;
                                                                                                    } else {
                                                                                                      s3 = peg$FAILED;
                                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                                                    }
                                                                                                    if (s3 !== peg$FAILED) {
                                                                                                      s4 = [];
                                                                                                      s5 = peg$parseWS();
                                                                                                      while (s5 !== peg$FAILED) {
                                                                                                        s4.push(s5);
                                                                                                        s5 = peg$parseWS();
                                                                                                      }
                                                                                                      if (s4 !== peg$FAILED) {
                                                                                                        s5 = peg$parseConditionalOrExpression();
                                                                                                        if (s5 !== peg$FAILED) {
                                                                                                          s6 = [];
                                                                                                          s7 = peg$parseWS();
                                                                                                          while (s7 !== peg$FAILED) {
                                                                                                            s6.push(s7);
                                                                                                            s7 = peg$parseWS();
                                                                                                          }
                                                                                                          if (s6 !== peg$FAILED) {
                                                                                                            if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                              s7 = peg$c174;
                                                                                                              peg$currPos++;
                                                                                                            } else {
                                                                                                              s7 = peg$FAILED;
                                                                                                              if (peg$silentFails === 0) { peg$fail(peg$c175); }
                                                                                                            }
                                                                                                            if (s7 !== peg$FAILED) {
                                                                                                              s8 = [];
                                                                                                              s9 = peg$parseWS();
                                                                                                              while (s9 !== peg$FAILED) {
                                                                                                                s8.push(s9);
                                                                                                                s9 = peg$parseWS();
                                                                                                              }
                                                                                                              if (s8 !== peg$FAILED) {
                                                                                                                s9 = peg$parseConditionalOrExpression();
                                                                                                                if (s9 !== peg$FAILED) {
                                                                                                                  s10 = [];
                                                                                                                  s11 = peg$parseWS();
                                                                                                                  while (s11 !== peg$FAILED) {
                                                                                                                    s10.push(s11);
                                                                                                                    s11 = peg$parseWS();
                                                                                                                  }
                                                                                                                  if (s10 !== peg$FAILED) {
                                                                                                                    if (input.charCodeAt(peg$currPos) === 41) {
                                                                                                                      s11 = peg$c21;
                                                                                                                      peg$currPos++;
                                                                                                                    } else {
                                                                                                                      s11 = peg$FAILED;
                                                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                                                    }
                                                                                                                    if (s11 !== peg$FAILED) {
                                                                                                                      peg$savedPos = s0;
                                                                                                                      s1 = peg$c381(s5, s9);
                                                                                                                      s0 = s1;
                                                                                                                    } else {
                                                                                                                      peg$currPos = s0;
                                                                                                                      s0 = peg$FAILED;
                                                                                                                    }
                                                                                                                  } else {
                                                                                                                    peg$currPos = s0;
                                                                                                                    s0 = peg$FAILED;
                                                                                                                  }
                                                                                                                } else {
                                                                                                                  peg$currPos = s0;
                                                                                                                  s0 = peg$FAILED;
                                                                                                                }
                                                                                                              } else {
                                                                                                                peg$currPos = s0;
                                                                                                                s0 = peg$FAILED;
                                                                                                              }
                                                                                                            } else {
                                                                                                              peg$currPos = s0;
                                                                                                              s0 = peg$FAILED;
                                                                                                            }
                                                                                                          } else {
                                                                                                            peg$currPos = s0;
                                                                                                            s0 = peg$FAILED;
                                                                                                          }
                                                                                                        } else {
                                                                                                          peg$currPos = s0;
                                                                                                          s0 = peg$FAILED;
                                                                                                        }
                                                                                                      } else {
                                                                                                        peg$currPos = s0;
                                                                                                        s0 = peg$FAILED;
                                                                                                      }
                                                                                                    } else {
                                                                                                      peg$currPos = s0;
                                                                                                      s0 = peg$FAILED;
                                                                                                    }
                                                                                                  } else {
                                                                                                    peg$currPos = s0;
                                                                                                    s0 = peg$FAILED;
                                                                                                  }
                                                                                                } else {
                                                                                                  peg$currPos = s0;
                                                                                                  s0 = peg$FAILED;
                                                                                                }
                                                                                                if (s0 === peg$FAILED) {
                                                                                                  s0 = peg$currPos;
                                                                                                  if (input.substr(peg$currPos, 5).toLowerCase() === peg$c382) {
                                                                                                    s1 = input.substr(peg$currPos, 5);
                                                                                                    peg$currPos += 5;
                                                                                                  } else {
                                                                                                    s1 = peg$FAILED;
                                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c383); }
                                                                                                  }
                                                                                                  if (s1 === peg$FAILED) {
                                                                                                    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c384) {
                                                                                                      s1 = input.substr(peg$currPos, 5);
                                                                                                      peg$currPos += 5;
                                                                                                    } else {
                                                                                                      s1 = peg$FAILED;
                                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c385); }
                                                                                                    }
                                                                                                  }
                                                                                                  if (s1 !== peg$FAILED) {
                                                                                                    s2 = [];
                                                                                                    s3 = peg$parseWS();
                                                                                                    while (s3 !== peg$FAILED) {
                                                                                                      s2.push(s3);
                                                                                                      s3 = peg$parseWS();
                                                                                                    }
                                                                                                    if (s2 !== peg$FAILED) {
                                                                                                      if (input.charCodeAt(peg$currPos) === 40) {
                                                                                                        s3 = peg$c17;
                                                                                                        peg$currPos++;
                                                                                                      } else {
                                                                                                        s3 = peg$FAILED;
                                                                                                        if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                                                      }
                                                                                                      if (s3 !== peg$FAILED) {
                                                                                                        s4 = [];
                                                                                                        s5 = peg$parseWS();
                                                                                                        while (s5 !== peg$FAILED) {
                                                                                                          s4.push(s5);
                                                                                                          s5 = peg$parseWS();
                                                                                                        }
                                                                                                        if (s4 !== peg$FAILED) {
                                                                                                          s5 = peg$parseConditionalOrExpression();
                                                                                                          if (s5 !== peg$FAILED) {
                                                                                                            s6 = [];
                                                                                                            s7 = peg$parseWS();
                                                                                                            while (s7 !== peg$FAILED) {
                                                                                                              s6.push(s7);
                                                                                                              s7 = peg$parseWS();
                                                                                                            }
                                                                                                            if (s6 !== peg$FAILED) {
                                                                                                              if (input.charCodeAt(peg$currPos) === 41) {
                                                                                                                s7 = peg$c21;
                                                                                                                peg$currPos++;
                                                                                                              } else {
                                                                                                                s7 = peg$FAILED;
                                                                                                                if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                                              }
                                                                                                              if (s7 !== peg$FAILED) {
                                                                                                                peg$savedPos = s0;
                                                                                                                s1 = peg$c386(s5);
                                                                                                                s0 = s1;
                                                                                                              } else {
                                                                                                                peg$currPos = s0;
                                                                                                                s0 = peg$FAILED;
                                                                                                              }
                                                                                                            } else {
                                                                                                              peg$currPos = s0;
                                                                                                              s0 = peg$FAILED;
                                                                                                            }
                                                                                                          } else {
                                                                                                            peg$currPos = s0;
                                                                                                            s0 = peg$FAILED;
                                                                                                          }
                                                                                                        } else {
                                                                                                          peg$currPos = s0;
                                                                                                          s0 = peg$FAILED;
                                                                                                        }
                                                                                                      } else {
                                                                                                        peg$currPos = s0;
                                                                                                        s0 = peg$FAILED;
                                                                                                      }
                                                                                                    } else {
                                                                                                      peg$currPos = s0;
                                                                                                      s0 = peg$FAILED;
                                                                                                    }
                                                                                                  } else {
                                                                                                    peg$currPos = s0;
                                                                                                    s0 = peg$FAILED;
                                                                                                  }
                                                                                                  if (s0 === peg$FAILED) {
                                                                                                    s0 = peg$currPos;
                                                                                                    if (input.substr(peg$currPos, 7).toLowerCase() === peg$c387) {
                                                                                                      s1 = input.substr(peg$currPos, 7);
                                                                                                      peg$currPos += 7;
                                                                                                    } else {
                                                                                                      s1 = peg$FAILED;
                                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c388); }
                                                                                                    }
                                                                                                    if (s1 !== peg$FAILED) {
                                                                                                      s2 = [];
                                                                                                      s3 = peg$parseWS();
                                                                                                      while (s3 !== peg$FAILED) {
                                                                                                        s2.push(s3);
                                                                                                        s3 = peg$parseWS();
                                                                                                      }
                                                                                                      if (s2 !== peg$FAILED) {
                                                                                                        if (input.charCodeAt(peg$currPos) === 40) {
                                                                                                          s3 = peg$c17;
                                                                                                          peg$currPos++;
                                                                                                        } else {
                                                                                                          s3 = peg$FAILED;
                                                                                                          if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                                                        }
                                                                                                        if (s3 !== peg$FAILED) {
                                                                                                          s4 = [];
                                                                                                          s5 = peg$parseWS();
                                                                                                          while (s5 !== peg$FAILED) {
                                                                                                            s4.push(s5);
                                                                                                            s5 = peg$parseWS();
                                                                                                          }
                                                                                                          if (s4 !== peg$FAILED) {
                                                                                                            s5 = peg$parseConditionalOrExpression();
                                                                                                            if (s5 !== peg$FAILED) {
                                                                                                              s6 = [];
                                                                                                              s7 = peg$parseWS();
                                                                                                              while (s7 !== peg$FAILED) {
                                                                                                                s6.push(s7);
                                                                                                                s7 = peg$parseWS();
                                                                                                              }
                                                                                                              if (s6 !== peg$FAILED) {
                                                                                                                if (input.charCodeAt(peg$currPos) === 41) {
                                                                                                                  s7 = peg$c21;
                                                                                                                  peg$currPos++;
                                                                                                                } else {
                                                                                                                  s7 = peg$FAILED;
                                                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                                                }
                                                                                                                if (s7 !== peg$FAILED) {
                                                                                                                  peg$savedPos = s0;
                                                                                                                  s1 = peg$c389(s5);
                                                                                                                  s0 = s1;
                                                                                                                } else {
                                                                                                                  peg$currPos = s0;
                                                                                                                  s0 = peg$FAILED;
                                                                                                                }
                                                                                                              } else {
                                                                                                                peg$currPos = s0;
                                                                                                                s0 = peg$FAILED;
                                                                                                              }
                                                                                                            } else {
                                                                                                              peg$currPos = s0;
                                                                                                              s0 = peg$FAILED;
                                                                                                            }
                                                                                                          } else {
                                                                                                            peg$currPos = s0;
                                                                                                            s0 = peg$FAILED;
                                                                                                          }
                                                                                                        } else {
                                                                                                          peg$currPos = s0;
                                                                                                          s0 = peg$FAILED;
                                                                                                        }
                                                                                                      } else {
                                                                                                        peg$currPos = s0;
                                                                                                        s0 = peg$FAILED;
                                                                                                      }
                                                                                                    } else {
                                                                                                      peg$currPos = s0;
                                                                                                      s0 = peg$FAILED;
                                                                                                    }
                                                                                                    if (s0 === peg$FAILED) {
                                                                                                      s0 = peg$currPos;
                                                                                                      if (input.substr(peg$currPos, 9).toLowerCase() === peg$c390) {
                                                                                                        s1 = input.substr(peg$currPos, 9);
                                                                                                        peg$currPos += 9;
                                                                                                      } else {
                                                                                                        s1 = peg$FAILED;
                                                                                                        if (peg$silentFails === 0) { peg$fail(peg$c391); }
                                                                                                      }
                                                                                                      if (s1 !== peg$FAILED) {
                                                                                                        s2 = [];
                                                                                                        s3 = peg$parseWS();
                                                                                                        while (s3 !== peg$FAILED) {
                                                                                                          s2.push(s3);
                                                                                                          s3 = peg$parseWS();
                                                                                                        }
                                                                                                        if (s2 !== peg$FAILED) {
                                                                                                          if (input.charCodeAt(peg$currPos) === 40) {
                                                                                                            s3 = peg$c17;
                                                                                                            peg$currPos++;
                                                                                                          } else {
                                                                                                            s3 = peg$FAILED;
                                                                                                            if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                                                          }
                                                                                                          if (s3 !== peg$FAILED) {
                                                                                                            s4 = [];
                                                                                                            s5 = peg$parseWS();
                                                                                                            while (s5 !== peg$FAILED) {
                                                                                                              s4.push(s5);
                                                                                                              s5 = peg$parseWS();
                                                                                                            }
                                                                                                            if (s4 !== peg$FAILED) {
                                                                                                              s5 = peg$parseConditionalOrExpression();
                                                                                                              if (s5 !== peg$FAILED) {
                                                                                                                s6 = [];
                                                                                                                s7 = peg$parseWS();
                                                                                                                while (s7 !== peg$FAILED) {
                                                                                                                  s6.push(s7);
                                                                                                                  s7 = peg$parseWS();
                                                                                                                }
                                                                                                                if (s6 !== peg$FAILED) {
                                                                                                                  if (input.charCodeAt(peg$currPos) === 41) {
                                                                                                                    s7 = peg$c21;
                                                                                                                    peg$currPos++;
                                                                                                                  } else {
                                                                                                                    s7 = peg$FAILED;
                                                                                                                    if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                                                  }
                                                                                                                  if (s7 !== peg$FAILED) {
                                                                                                                    peg$savedPos = s0;
                                                                                                                    s1 = peg$c392(s5);
                                                                                                                    s0 = s1;
                                                                                                                  } else {
                                                                                                                    peg$currPos = s0;
                                                                                                                    s0 = peg$FAILED;
                                                                                                                  }
                                                                                                                } else {
                                                                                                                  peg$currPos = s0;
                                                                                                                  s0 = peg$FAILED;
                                                                                                                }
                                                                                                              } else {
                                                                                                                peg$currPos = s0;
                                                                                                                s0 = peg$FAILED;
                                                                                                              }
                                                                                                            } else {
                                                                                                              peg$currPos = s0;
                                                                                                              s0 = peg$FAILED;
                                                                                                            }
                                                                                                          } else {
                                                                                                            peg$currPos = s0;
                                                                                                            s0 = peg$FAILED;
                                                                                                          }
                                                                                                        } else {
                                                                                                          peg$currPos = s0;
                                                                                                          s0 = peg$FAILED;
                                                                                                        }
                                                                                                      } else {
                                                                                                        peg$currPos = s0;
                                                                                                        s0 = peg$FAILED;
                                                                                                      }
                                                                                                      if (s0 === peg$FAILED) {
                                                                                                        s0 = peg$currPos;
                                                                                                        if (input.substr(peg$currPos, 9).toLowerCase() === peg$c393) {
                                                                                                          s1 = input.substr(peg$currPos, 9);
                                                                                                          peg$currPos += 9;
                                                                                                        } else {
                                                                                                          s1 = peg$FAILED;
                                                                                                          if (peg$silentFails === 0) { peg$fail(peg$c394); }
                                                                                                        }
                                                                                                        if (s1 !== peg$FAILED) {
                                                                                                          s2 = [];
                                                                                                          s3 = peg$parseWS();
                                                                                                          while (s3 !== peg$FAILED) {
                                                                                                            s2.push(s3);
                                                                                                            s3 = peg$parseWS();
                                                                                                          }
                                                                                                          if (s2 !== peg$FAILED) {
                                                                                                            if (input.charCodeAt(peg$currPos) === 40) {
                                                                                                              s3 = peg$c17;
                                                                                                              peg$currPos++;
                                                                                                            } else {
                                                                                                              s3 = peg$FAILED;
                                                                                                              if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                                                            }
                                                                                                            if (s3 !== peg$FAILED) {
                                                                                                              s4 = [];
                                                                                                              s5 = peg$parseWS();
                                                                                                              while (s5 !== peg$FAILED) {
                                                                                                                s4.push(s5);
                                                                                                                s5 = peg$parseWS();
                                                                                                              }
                                                                                                              if (s4 !== peg$FAILED) {
                                                                                                                s5 = peg$parseConditionalOrExpression();
                                                                                                                if (s5 !== peg$FAILED) {
                                                                                                                  s6 = [];
                                                                                                                  s7 = peg$parseWS();
                                                                                                                  while (s7 !== peg$FAILED) {
                                                                                                                    s6.push(s7);
                                                                                                                    s7 = peg$parseWS();
                                                                                                                  }
                                                                                                                  if (s6 !== peg$FAILED) {
                                                                                                                    if (input.charCodeAt(peg$currPos) === 41) {
                                                                                                                      s7 = peg$c21;
                                                                                                                      peg$currPos++;
                                                                                                                    } else {
                                                                                                                      s7 = peg$FAILED;
                                                                                                                      if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                                                    }
                                                                                                                    if (s7 !== peg$FAILED) {
                                                                                                                      peg$savedPos = s0;
                                                                                                                      s1 = peg$c395(s5);
                                                                                                                      s0 = s1;
                                                                                                                    } else {
                                                                                                                      peg$currPos = s0;
                                                                                                                      s0 = peg$FAILED;
                                                                                                                    }
                                                                                                                  } else {
                                                                                                                    peg$currPos = s0;
                                                                                                                    s0 = peg$FAILED;
                                                                                                                  }
                                                                                                                } else {
                                                                                                                  peg$currPos = s0;
                                                                                                                  s0 = peg$FAILED;
                                                                                                                }
                                                                                                              } else {
                                                                                                                peg$currPos = s0;
                                                                                                                s0 = peg$FAILED;
                                                                                                              }
                                                                                                            } else {
                                                                                                              peg$currPos = s0;
                                                                                                              s0 = peg$FAILED;
                                                                                                            }
                                                                                                          } else {
                                                                                                            peg$currPos = s0;
                                                                                                            s0 = peg$FAILED;
                                                                                                          }
                                                                                                        } else {
                                                                                                          peg$currPos = s0;
                                                                                                          s0 = peg$FAILED;
                                                                                                        }
                                                                                                        if (s0 === peg$FAILED) {
                                                                                                          s0 = peg$currPos;
                                                                                                          if (input.substr(peg$currPos, 7).toLowerCase() === peg$c396) {
                                                                                                            s1 = input.substr(peg$currPos, 7);
                                                                                                            peg$currPos += 7;
                                                                                                          } else {
                                                                                                            s1 = peg$FAILED;
                                                                                                            if (peg$silentFails === 0) { peg$fail(peg$c397); }
                                                                                                          }
                                                                                                          if (s1 !== peg$FAILED) {
                                                                                                            s2 = [];
                                                                                                            if (peg$c398.test(input.charAt(peg$currPos))) {
                                                                                                              s3 = input.charAt(peg$currPos);
                                                                                                              peg$currPos++;
                                                                                                            } else {
                                                                                                              s3 = peg$FAILED;
                                                                                                              if (peg$silentFails === 0) { peg$fail(peg$c399); }
                                                                                                            }
                                                                                                            if (s3 !== peg$FAILED) {
                                                                                                              while (s3 !== peg$FAILED) {
                                                                                                                s2.push(s3);
                                                                                                                if (peg$c398.test(input.charAt(peg$currPos))) {
                                                                                                                  s3 = input.charAt(peg$currPos);
                                                                                                                  peg$currPos++;
                                                                                                                } else {
                                                                                                                  s3 = peg$FAILED;
                                                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c399); }
                                                                                                                }
                                                                                                              }
                                                                                                            } else {
                                                                                                              s2 = peg$FAILED;
                                                                                                            }
                                                                                                            if (s2 !== peg$FAILED) {
                                                                                                              s3 = [];
                                                                                                              s4 = peg$parseWS();
                                                                                                              while (s4 !== peg$FAILED) {
                                                                                                                s3.push(s4);
                                                                                                                s4 = peg$parseWS();
                                                                                                              }
                                                                                                              if (s3 !== peg$FAILED) {
                                                                                                                if (input.charCodeAt(peg$currPos) === 40) {
                                                                                                                  s4 = peg$c17;
                                                                                                                  peg$currPos++;
                                                                                                                } else {
                                                                                                                  s4 = peg$FAILED;
                                                                                                                  if (peg$silentFails === 0) { peg$fail(peg$c18); }
                                                                                                                }
                                                                                                                if (s4 !== peg$FAILED) {
                                                                                                                  s5 = [];
                                                                                                                  s6 = peg$currPos;
                                                                                                                  s7 = [];
                                                                                                                  s8 = peg$parseWS();
                                                                                                                  while (s8 !== peg$FAILED) {
                                                                                                                    s7.push(s8);
                                                                                                                    s8 = peg$parseWS();
                                                                                                                  }
                                                                                                                  if (s7 !== peg$FAILED) {
                                                                                                                    s8 = peg$parseConditionalOrExpression();
                                                                                                                    if (s8 !== peg$FAILED) {
                                                                                                                      if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                        s9 = peg$c174;
                                                                                                                        peg$currPos++;
                                                                                                                      } else {
                                                                                                                        s9 = peg$FAILED;
                                                                                                                        if (peg$silentFails === 0) { peg$fail(peg$c175); }
                                                                                                                      }
                                                                                                                      if (s9 !== peg$FAILED) {
                                                                                                                        s7 = [s7, s8, s9];
                                                                                                                        s6 = s7;
                                                                                                                      } else {
                                                                                                                        peg$currPos = s6;
                                                                                                                        s6 = peg$FAILED;
                                                                                                                      }
                                                                                                                    } else {
                                                                                                                      peg$currPos = s6;
                                                                                                                      s6 = peg$FAILED;
                                                                                                                    }
                                                                                                                  } else {
                                                                                                                    peg$currPos = s6;
                                                                                                                    s6 = peg$FAILED;
                                                                                                                  }
                                                                                                                  while (s6 !== peg$FAILED) {
                                                                                                                    s5.push(s6);
                                                                                                                    s6 = peg$currPos;
                                                                                                                    s7 = [];
                                                                                                                    s8 = peg$parseWS();
                                                                                                                    while (s8 !== peg$FAILED) {
                                                                                                                      s7.push(s8);
                                                                                                                      s8 = peg$parseWS();
                                                                                                                    }
                                                                                                                    if (s7 !== peg$FAILED) {
                                                                                                                      s8 = peg$parseConditionalOrExpression();
                                                                                                                      if (s8 !== peg$FAILED) {
                                                                                                                        if (input.charCodeAt(peg$currPos) === 44) {
                                                                                                                          s9 = peg$c174;
                                                                                                                          peg$currPos++;
                                                                                                                        } else {
                                                                                                                          s9 = peg$FAILED;
                                                                                                                          if (peg$silentFails === 0) { peg$fail(peg$c175); }
                                                                                                                        }
                                                                                                                        if (s9 !== peg$FAILED) {
                                                                                                                          s7 = [s7, s8, s9];
                                                                                                                          s6 = s7;
                                                                                                                        } else {
                                                                                                                          peg$currPos = s6;
                                                                                                                          s6 = peg$FAILED;
                                                                                                                        }
                                                                                                                      } else {
                                                                                                                        peg$currPos = s6;
                                                                                                                        s6 = peg$FAILED;
                                                                                                                      }
                                                                                                                    } else {
                                                                                                                      peg$currPos = s6;
                                                                                                                      s6 = peg$FAILED;
                                                                                                                    }
                                                                                                                  }
                                                                                                                  if (s5 !== peg$FAILED) {
                                                                                                                    s6 = [];
                                                                                                                    s7 = peg$parseWS();
                                                                                                                    while (s7 !== peg$FAILED) {
                                                                                                                      s6.push(s7);
                                                                                                                      s7 = peg$parseWS();
                                                                                                                    }
                                                                                                                    if (s6 !== peg$FAILED) {
                                                                                                                      s7 = peg$parseConditionalOrExpression();
                                                                                                                      if (s7 !== peg$FAILED) {
                                                                                                                        s8 = [];
                                                                                                                        s9 = peg$parseWS();
                                                                                                                        while (s9 !== peg$FAILED) {
                                                                                                                          s8.push(s9);
                                                                                                                          s9 = peg$parseWS();
                                                                                                                        }
                                                                                                                        if (s8 !== peg$FAILED) {
                                                                                                                          if (input.charCodeAt(peg$currPos) === 41) {
                                                                                                                            s9 = peg$c21;
                                                                                                                            peg$currPos++;
                                                                                                                          } else {
                                                                                                                            s9 = peg$FAILED;
                                                                                                                            if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                                                                                                          }
                                                                                                                          if (s9 !== peg$FAILED) {
                                                                                                                            peg$savedPos = s0;
                                                                                                                            s1 = peg$c400(s2, s5, s7);
                                                                                                                            s0 = s1;
                                                                                                                          } else {
                                                                                                                            peg$currPos = s0;
                                                                                                                            s0 = peg$FAILED;
                                                                                                                          }
                                                                                                                        } else {
                                                                                                                          peg$currPos = s0;
                                                                                                                          s0 = peg$FAILED;
                                                                                                                        }
                                                                                                                      } else {
                                                                                                                        peg$currPos = s0;
                                                                                                                        s0 = peg$FAILED;
                                                                                                                      }
                                                                                                                    } else {
                                                                                                                      peg$currPos = s0;
                                                                                                                      s0 = peg$FAILED;
                                                                                                                    }
                                                                                                                  } else {
                                                                                                                    peg$currPos = s0;
                                                                                                                    s0 = peg$FAILED;
                                                                                                                  }
                                                                                                                } else {
                                                                                                                  peg$currPos = s0;
                                                                                                                  s0 = peg$FAILED;
                                                                                                                }
                                                                                                              } else {
                                                                                                                peg$currPos = s0;
                                                                                                                s0 = peg$FAILED;
                                                                                                              }
                                                                                                            } else {
                                                                                                              peg$currPos = s0;
                                                                                                              s0 = peg$FAILED;
                                                                                                            }
                                                                                                          } else {
                                                                                                            peg$currPos = s0;
                                                                                                            s0 = peg$FAILED;
                                                                                                          }
                                                                                                          if (s0 === peg$FAILED) {
                                                                                                            s0 = peg$parseRegexExpression();
                                                                                                            if (s0 === peg$FAILED) {
                                                                                                              s0 = peg$parseExistsFunc();
                                                                                                              if (s0 === peg$FAILED) {
                                                                                                                s0 = peg$parseNotExistsFunc();
                                                                                                              }
                                                                                                            }
                                                                                                          }
                                                                                                        }
                                                                                                      }
                                                                                                    }
                                                                                                  }
                                                                                                }
                                                                                              }
                                                                                            }
                                                                                          }
                                                                                        }
                                                                                      }
                                                                                    }
                                                                                  }
                                                                                }
                                                                              }
                                                                            }
                                                                          }
                                                                        }
                                                                      }
                                                                    }
                                                                  }
                                                                }
                                                              }
                                                            }
                                                          }
                                                        }
                                                      }
                                                    }
                                                  }
                                                }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    return s0;
  }

  function peg$parseRegexExpression() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, s13, s14;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c401) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c402); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 40) {
          s3 = peg$c17;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c18); }
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseConditionalOrExpression();
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 44) {
                  s7 = peg$c174;
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c175); }
                }
                if (s7 !== peg$FAILED) {
                  s8 = [];
                  s9 = peg$parseWS();
                  while (s9 !== peg$FAILED) {
                    s8.push(s9);
                    s9 = peg$parseWS();
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = peg$parseConditionalOrExpression();
                    if (s9 !== peg$FAILED) {
                      s10 = [];
                      s11 = peg$parseWS();
                      while (s11 !== peg$FAILED) {
                        s10.push(s11);
                        s11 = peg$parseWS();
                      }
                      if (s10 !== peg$FAILED) {
                        s11 = peg$currPos;
                        if (input.charCodeAt(peg$currPos) === 44) {
                          s12 = peg$c174;
                          peg$currPos++;
                        } else {
                          s12 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c175); }
                        }
                        if (s12 !== peg$FAILED) {
                          s13 = [];
                          s14 = peg$parseWS();
                          while (s14 !== peg$FAILED) {
                            s13.push(s14);
                            s14 = peg$parseWS();
                          }
                          if (s13 !== peg$FAILED) {
                            s14 = peg$parseConditionalOrExpression();
                            if (s14 !== peg$FAILED) {
                              s12 = [s12, s13, s14];
                              s11 = s12;
                            } else {
                              peg$currPos = s11;
                              s11 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s11;
                            s11 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s11;
                          s11 = peg$FAILED;
                        }
                        if (s11 === peg$FAILED) {
                          s11 = null;
                        }
                        if (s11 !== peg$FAILED) {
                          s12 = [];
                          s13 = peg$parseWS();
                          while (s13 !== peg$FAILED) {
                            s12.push(s13);
                            s13 = peg$parseWS();
                          }
                          if (s12 !== peg$FAILED) {
                            if (input.charCodeAt(peg$currPos) === 41) {
                              s13 = peg$c21;
                              peg$currPos++;
                            } else {
                              s13 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c22); }
                            }
                            if (s13 !== peg$FAILED) {
                              peg$savedPos = s0;
                              s1 = peg$c403(s5, s9, s11);
                              s0 = s1;
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseSubstringExpression() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, s13, s14;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c404) {
      s1 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c405); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 40) {
          s3 = peg$c17;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c18); }
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseConditionalOrExpression();
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 44) {
                  s7 = peg$c174;
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c175); }
                }
                if (s7 !== peg$FAILED) {
                  s8 = [];
                  s9 = peg$parseWS();
                  while (s9 !== peg$FAILED) {
                    s8.push(s9);
                    s9 = peg$parseWS();
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = peg$parseConditionalOrExpression();
                    if (s9 !== peg$FAILED) {
                      s10 = [];
                      s11 = peg$parseWS();
                      while (s11 !== peg$FAILED) {
                        s10.push(s11);
                        s11 = peg$parseWS();
                      }
                      if (s10 !== peg$FAILED) {
                        s11 = peg$currPos;
                        if (input.charCodeAt(peg$currPos) === 44) {
                          s12 = peg$c174;
                          peg$currPos++;
                        } else {
                          s12 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c175); }
                        }
                        if (s12 !== peg$FAILED) {
                          s13 = [];
                          s14 = peg$parseWS();
                          while (s14 !== peg$FAILED) {
                            s13.push(s14);
                            s14 = peg$parseWS();
                          }
                          if (s13 !== peg$FAILED) {
                            s14 = peg$parseConditionalOrExpression();
                            if (s14 !== peg$FAILED) {
                              s12 = [s12, s13, s14];
                              s11 = s12;
                            } else {
                              peg$currPos = s11;
                              s11 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s11;
                            s11 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s11;
                          s11 = peg$FAILED;
                        }
                        if (s11 === peg$FAILED) {
                          s11 = null;
                        }
                        if (s11 !== peg$FAILED) {
                          s12 = [];
                          s13 = peg$parseWS();
                          while (s13 !== peg$FAILED) {
                            s12.push(s13);
                            s13 = peg$parseWS();
                          }
                          if (s12 !== peg$FAILED) {
                            if (input.charCodeAt(peg$currPos) === 41) {
                              s13 = peg$c21;
                              peg$currPos++;
                            } else {
                              s13 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c22); }
                            }
                            if (s13 !== peg$FAILED) {
                              peg$savedPos = s0;
                              s1 = peg$c406(s5, s9, s11);
                              s0 = s1;
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseStrReplaceExpression() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, s13, s14, s15, s16, s17, s18;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 7).toLowerCase() === peg$c407) {
      s1 = input.substr(peg$currPos, 7);
      peg$currPos += 7;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c408); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 40) {
          s3 = peg$c17;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c18); }
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseConditionalOrExpression();
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 44) {
                  s7 = peg$c174;
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c175); }
                }
                if (s7 !== peg$FAILED) {
                  s8 = [];
                  s9 = peg$parseWS();
                  while (s9 !== peg$FAILED) {
                    s8.push(s9);
                    s9 = peg$parseWS();
                  }
                  if (s8 !== peg$FAILED) {
                    s9 = peg$parseConditionalOrExpression();
                    if (s9 !== peg$FAILED) {
                      s10 = [];
                      s11 = peg$parseWS();
                      while (s11 !== peg$FAILED) {
                        s10.push(s11);
                        s11 = peg$parseWS();
                      }
                      if (s10 !== peg$FAILED) {
                        if (input.charCodeAt(peg$currPos) === 44) {
                          s11 = peg$c174;
                          peg$currPos++;
                        } else {
                          s11 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c175); }
                        }
                        if (s11 !== peg$FAILED) {
                          s12 = [];
                          s13 = peg$parseWS();
                          while (s13 !== peg$FAILED) {
                            s12.push(s13);
                            s13 = peg$parseWS();
                          }
                          if (s12 !== peg$FAILED) {
                            s13 = peg$parseConditionalOrExpression();
                            if (s13 !== peg$FAILED) {
                              s14 = [];
                              s15 = peg$parseWS();
                              while (s15 !== peg$FAILED) {
                                s14.push(s15);
                                s15 = peg$parseWS();
                              }
                              if (s14 !== peg$FAILED) {
                                s15 = peg$currPos;
                                if (input.charCodeAt(peg$currPos) === 44) {
                                  s16 = peg$c174;
                                  peg$currPos++;
                                } else {
                                  s16 = peg$FAILED;
                                  if (peg$silentFails === 0) { peg$fail(peg$c175); }
                                }
                                if (s16 !== peg$FAILED) {
                                  s17 = [];
                                  s18 = peg$parseWS();
                                  while (s18 !== peg$FAILED) {
                                    s17.push(s18);
                                    s18 = peg$parseWS();
                                  }
                                  if (s17 !== peg$FAILED) {
                                    s18 = peg$parseConditionalOrExpression();
                                    if (s18 !== peg$FAILED) {
                                      s16 = [s16, s17, s18];
                                      s15 = s16;
                                    } else {
                                      peg$currPos = s15;
                                      s15 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s15;
                                    s15 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s15;
                                  s15 = peg$FAILED;
                                }
                                if (s15 === peg$FAILED) {
                                  s15 = null;
                                }
                                if (s15 !== peg$FAILED) {
                                  s16 = [];
                                  s17 = peg$parseWS();
                                  while (s17 !== peg$FAILED) {
                                    s16.push(s17);
                                    s17 = peg$parseWS();
                                  }
                                  if (s16 !== peg$FAILED) {
                                    if (input.charCodeAt(peg$currPos) === 41) {
                                      s17 = peg$c21;
                                      peg$currPos++;
                                    } else {
                                      s17 = peg$FAILED;
                                      if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                    }
                                    if (s17 !== peg$FAILED) {
                                      peg$savedPos = s0;
                                      s1 = peg$c409(s5, s9, s13, s15);
                                      s0 = s1;
                                    } else {
                                      peg$currPos = s0;
                                      s0 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s0;
                                    s0 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseExistsFunc() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 6).toLowerCase() === peg$c410) {
      s1 = input.substr(peg$currPos, 6);
      peg$currPos += 6;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c411); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseGroupGraphPattern();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c412(s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseNotExistsFunc() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 3).toLowerCase() === peg$c235) {
      s1 = input.substr(peg$currPos, 3);
      peg$currPos += 3;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c236); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 6).toLowerCase() === peg$c410) {
          s3 = input.substr(peg$currPos, 6);
          peg$currPos += 6;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c411); }
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parseGroupGraphPattern();
            if (s5 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c413(s5);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseAggregate() {
    var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, s13, s14, s15, s16;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 5).toLowerCase() === peg$c414) {
      s1 = input.substr(peg$currPos, 5);
      peg$currPos += 5;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c415); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 40) {
          s3 = peg$c17;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c18); }
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseWS();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseWS();
          }
          if (s4 !== peg$FAILED) {
            if (input.substr(peg$currPos, 8).toLowerCase() === peg$c13) {
              s5 = input.substr(peg$currPos, 8);
              peg$currPos += 8;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c14); }
            }
            if (s5 === peg$FAILED) {
              s5 = null;
            }
            if (s5 !== peg$FAILED) {
              s6 = [];
              s7 = peg$parseWS();
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                s7 = peg$parseWS();
              }
              if (s6 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 42) {
                  s7 = peg$c23;
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c24); }
                }
                if (s7 === peg$FAILED) {
                  s7 = peg$parseConditionalOrExpression();
                }
                if (s7 !== peg$FAILED) {
                  s8 = [];
                  s9 = peg$parseWS();
                  while (s9 !== peg$FAILED) {
                    s8.push(s9);
                    s9 = peg$parseWS();
                  }
                  if (s8 !== peg$FAILED) {
                    if (input.charCodeAt(peg$currPos) === 41) {
                      s9 = peg$c21;
                      peg$currPos++;
                    } else {
                      s9 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c22); }
                    }
                    if (s9 !== peg$FAILED) {
                      s10 = [];
                      s11 = peg$parseWS();
                      while (s11 !== peg$FAILED) {
                        s10.push(s11);
                        s11 = peg$parseWS();
                      }
                      if (s10 !== peg$FAILED) {
                        peg$savedPos = s0;
                        s1 = peg$c416(s5, s7);
                        s0 = s1;
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 3).toLowerCase() === peg$c417) {
        s1 = input.substr(peg$currPos, 3);
        peg$currPos += 3;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c418); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parseWS();
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parseWS();
        }
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 40) {
            s3 = peg$c17;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c18); }
          }
          if (s3 !== peg$FAILED) {
            s4 = [];
            s5 = peg$parseWS();
            while (s5 !== peg$FAILED) {
              s4.push(s5);
              s5 = peg$parseWS();
            }
            if (s4 !== peg$FAILED) {
              if (input.substr(peg$currPos, 8).toLowerCase() === peg$c13) {
                s5 = input.substr(peg$currPos, 8);
                peg$currPos += 8;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c14); }
              }
              if (s5 === peg$FAILED) {
                s5 = null;
              }
              if (s5 !== peg$FAILED) {
                s6 = [];
                s7 = peg$parseWS();
                while (s7 !== peg$FAILED) {
                  s6.push(s7);
                  s7 = peg$parseWS();
                }
                if (s6 !== peg$FAILED) {
                  s7 = peg$parseConditionalOrExpression();
                  if (s7 !== peg$FAILED) {
                    s8 = [];
                    s9 = peg$parseWS();
                    while (s9 !== peg$FAILED) {
                      s8.push(s9);
                      s9 = peg$parseWS();
                    }
                    if (s8 !== peg$FAILED) {
                      if (input.charCodeAt(peg$currPos) === 41) {
                        s9 = peg$c21;
                        peg$currPos++;
                      } else {
                        s9 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c22); }
                      }
                      if (s9 !== peg$FAILED) {
                        s10 = [];
                        s11 = peg$parseWS();
                        while (s11 !== peg$FAILED) {
                          s10.push(s11);
                          s11 = peg$parseWS();
                        }
                        if (s10 !== peg$FAILED) {
                          peg$savedPos = s0;
                          s1 = peg$c419(s5, s7);
                          s0 = s1;
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 3).toLowerCase() === peg$c420) {
          s1 = input.substr(peg$currPos, 3);
          peg$currPos += 3;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c421); }
        }
        if (s1 !== peg$FAILED) {
          s2 = [];
          s3 = peg$parseWS();
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            s3 = peg$parseWS();
          }
          if (s2 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 40) {
              s3 = peg$c17;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c18); }
            }
            if (s3 !== peg$FAILED) {
              s4 = [];
              s5 = peg$parseWS();
              while (s5 !== peg$FAILED) {
                s4.push(s5);
                s5 = peg$parseWS();
              }
              if (s4 !== peg$FAILED) {
                if (input.substr(peg$currPos, 8).toLowerCase() === peg$c13) {
                  s5 = input.substr(peg$currPos, 8);
                  peg$currPos += 8;
                } else {
                  s5 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c14); }
                }
                if (s5 === peg$FAILED) {
                  s5 = null;
                }
                if (s5 !== peg$FAILED) {
                  s6 = [];
                  s7 = peg$parseWS();
                  while (s7 !== peg$FAILED) {
                    s6.push(s7);
                    s7 = peg$parseWS();
                  }
                  if (s6 !== peg$FAILED) {
                    s7 = peg$parseConditionalOrExpression();
                    if (s7 !== peg$FAILED) {
                      s8 = [];
                      s9 = peg$parseWS();
                      while (s9 !== peg$FAILED) {
                        s8.push(s9);
                        s9 = peg$parseWS();
                      }
                      if (s8 !== peg$FAILED) {
                        if (input.charCodeAt(peg$currPos) === 41) {
                          s9 = peg$c21;
                          peg$currPos++;
                        } else {
                          s9 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c22); }
                        }
                        if (s9 !== peg$FAILED) {
                          s10 = [];
                          s11 = peg$parseWS();
                          while (s11 !== peg$FAILED) {
                            s10.push(s11);
                            s11 = peg$parseWS();
                          }
                          if (s10 !== peg$FAILED) {
                            peg$savedPos = s0;
                            s1 = peg$c422(s5, s7);
                            s0 = s1;
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.substr(peg$currPos, 3).toLowerCase() === peg$c423) {
            s1 = input.substr(peg$currPos, 3);
            peg$currPos += 3;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c424); }
          }
          if (s1 !== peg$FAILED) {
            s2 = [];
            s3 = peg$parseWS();
            while (s3 !== peg$FAILED) {
              s2.push(s3);
              s3 = peg$parseWS();
            }
            if (s2 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 40) {
                s3 = peg$c17;
                peg$currPos++;
              } else {
                s3 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c18); }
              }
              if (s3 !== peg$FAILED) {
                s4 = [];
                s5 = peg$parseWS();
                while (s5 !== peg$FAILED) {
                  s4.push(s5);
                  s5 = peg$parseWS();
                }
                if (s4 !== peg$FAILED) {
                  if (input.substr(peg$currPos, 8).toLowerCase() === peg$c13) {
                    s5 = input.substr(peg$currPos, 8);
                    peg$currPos += 8;
                  } else {
                    s5 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c14); }
                  }
                  if (s5 === peg$FAILED) {
                    s5 = null;
                  }
                  if (s5 !== peg$FAILED) {
                    s6 = [];
                    s7 = peg$parseWS();
                    while (s7 !== peg$FAILED) {
                      s6.push(s7);
                      s7 = peg$parseWS();
                    }
                    if (s6 !== peg$FAILED) {
                      s7 = peg$parseConditionalOrExpression();
                      if (s7 !== peg$FAILED) {
                        s8 = [];
                        s9 = peg$parseWS();
                        while (s9 !== peg$FAILED) {
                          s8.push(s9);
                          s9 = peg$parseWS();
                        }
                        if (s8 !== peg$FAILED) {
                          if (input.charCodeAt(peg$currPos) === 41) {
                            s9 = peg$c21;
                            peg$currPos++;
                          } else {
                            s9 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c22); }
                          }
                          if (s9 !== peg$FAILED) {
                            s10 = [];
                            s11 = peg$parseWS();
                            while (s11 !== peg$FAILED) {
                              s10.push(s11);
                              s11 = peg$parseWS();
                            }
                            if (s10 !== peg$FAILED) {
                              peg$savedPos = s0;
                              s1 = peg$c425(s5, s7);
                              s0 = s1;
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            if (input.substr(peg$currPos, 3).toLowerCase() === peg$c426) {
              s1 = input.substr(peg$currPos, 3);
              peg$currPos += 3;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c427); }
            }
            if (s1 !== peg$FAILED) {
              s2 = [];
              s3 = peg$parseWS();
              while (s3 !== peg$FAILED) {
                s2.push(s3);
                s3 = peg$parseWS();
              }
              if (s2 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 40) {
                  s3 = peg$c17;
                  peg$currPos++;
                } else {
                  s3 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c18); }
                }
                if (s3 !== peg$FAILED) {
                  s4 = [];
                  s5 = peg$parseWS();
                  while (s5 !== peg$FAILED) {
                    s4.push(s5);
                    s5 = peg$parseWS();
                  }
                  if (s4 !== peg$FAILED) {
                    if (input.substr(peg$currPos, 8).toLowerCase() === peg$c13) {
                      s5 = input.substr(peg$currPos, 8);
                      peg$currPos += 8;
                    } else {
                      s5 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c14); }
                    }
                    if (s5 === peg$FAILED) {
                      s5 = null;
                    }
                    if (s5 !== peg$FAILED) {
                      s6 = [];
                      s7 = peg$parseWS();
                      while (s7 !== peg$FAILED) {
                        s6.push(s7);
                        s7 = peg$parseWS();
                      }
                      if (s6 !== peg$FAILED) {
                        s7 = peg$parseConditionalOrExpression();
                        if (s7 !== peg$FAILED) {
                          s8 = [];
                          s9 = peg$parseWS();
                          while (s9 !== peg$FAILED) {
                            s8.push(s9);
                            s9 = peg$parseWS();
                          }
                          if (s8 !== peg$FAILED) {
                            if (input.charCodeAt(peg$currPos) === 41) {
                              s9 = peg$c21;
                              peg$currPos++;
                            } else {
                              s9 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c22); }
                            }
                            if (s9 !== peg$FAILED) {
                              s10 = [];
                              s11 = peg$parseWS();
                              while (s11 !== peg$FAILED) {
                                s10.push(s11);
                                s11 = peg$parseWS();
                              }
                              if (s10 !== peg$FAILED) {
                                peg$savedPos = s0;
                                s1 = peg$c428(s5, s7);
                                s0 = s1;
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
            if (s0 === peg$FAILED) {
              s0 = peg$currPos;
              if (input.substr(peg$currPos, 6).toLowerCase() === peg$c429) {
                s1 = input.substr(peg$currPos, 6);
                peg$currPos += 6;
              } else {
                s1 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c430); }
              }
              if (s1 !== peg$FAILED) {
                s2 = [];
                s3 = peg$parseWS();
                while (s3 !== peg$FAILED) {
                  s2.push(s3);
                  s3 = peg$parseWS();
                }
                if (s2 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 40) {
                    s3 = peg$c17;
                    peg$currPos++;
                  } else {
                    s3 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c18); }
                  }
                  if (s3 !== peg$FAILED) {
                    s4 = [];
                    s5 = peg$parseWS();
                    while (s5 !== peg$FAILED) {
                      s4.push(s5);
                      s5 = peg$parseWS();
                    }
                    if (s4 !== peg$FAILED) {
                      if (input.substr(peg$currPos, 8).toLowerCase() === peg$c13) {
                        s5 = input.substr(peg$currPos, 8);
                        peg$currPos += 8;
                      } else {
                        s5 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c14); }
                      }
                      if (s5 === peg$FAILED) {
                        s5 = null;
                      }
                      if (s5 !== peg$FAILED) {
                        s6 = [];
                        s7 = peg$parseWS();
                        while (s7 !== peg$FAILED) {
                          s6.push(s7);
                          s7 = peg$parseWS();
                        }
                        if (s6 !== peg$FAILED) {
                          s7 = peg$parseConditionalOrExpression();
                          if (s7 !== peg$FAILED) {
                            s8 = [];
                            s9 = peg$parseWS();
                            while (s9 !== peg$FAILED) {
                              s8.push(s9);
                              s9 = peg$parseWS();
                            }
                            if (s8 !== peg$FAILED) {
                              if (input.charCodeAt(peg$currPos) === 41) {
                                s9 = peg$c21;
                                peg$currPos++;
                              } else {
                                s9 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c22); }
                              }
                              if (s9 !== peg$FAILED) {
                                s10 = [];
                                s11 = peg$parseWS();
                                while (s11 !== peg$FAILED) {
                                  s10.push(s11);
                                  s11 = peg$parseWS();
                                }
                                if (s10 !== peg$FAILED) {
                                  peg$savedPos = s0;
                                  s1 = peg$c431(s5, s7);
                                  s0 = s1;
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
              if (s0 === peg$FAILED) {
                s0 = peg$currPos;
                if (input.substr(peg$currPos, 12).toLowerCase() === peg$c432) {
                  s1 = input.substr(peg$currPos, 12);
                  peg$currPos += 12;
                } else {
                  s1 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c433); }
                }
                if (s1 !== peg$FAILED) {
                  s2 = [];
                  s3 = peg$parseWS();
                  while (s3 !== peg$FAILED) {
                    s2.push(s3);
                    s3 = peg$parseWS();
                  }
                  if (s2 !== peg$FAILED) {
                    if (input.charCodeAt(peg$currPos) === 40) {
                      s3 = peg$c17;
                      peg$currPos++;
                    } else {
                      s3 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c18); }
                    }
                    if (s3 !== peg$FAILED) {
                      s4 = [];
                      s5 = peg$parseWS();
                      while (s5 !== peg$FAILED) {
                        s4.push(s5);
                        s5 = peg$parseWS();
                      }
                      if (s4 !== peg$FAILED) {
                        if (input.substr(peg$currPos, 8).toLowerCase() === peg$c13) {
                          s5 = input.substr(peg$currPos, 8);
                          peg$currPos += 8;
                        } else {
                          s5 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c14); }
                        }
                        if (s5 === peg$FAILED) {
                          s5 = null;
                        }
                        if (s5 !== peg$FAILED) {
                          s6 = [];
                          s7 = peg$parseWS();
                          while (s7 !== peg$FAILED) {
                            s6.push(s7);
                            s7 = peg$parseWS();
                          }
                          if (s6 !== peg$FAILED) {
                            s7 = peg$parseConditionalOrExpression();
                            if (s7 !== peg$FAILED) {
                              s8 = peg$currPos;
                              s9 = [];
                              s10 = peg$parseWS();
                              while (s10 !== peg$FAILED) {
                                s9.push(s10);
                                s10 = peg$parseWS();
                              }
                              if (s9 !== peg$FAILED) {
                                if (input.charCodeAt(peg$currPos) === 59) {
                                  s10 = peg$c82;
                                  peg$currPos++;
                                } else {
                                  s10 = peg$FAILED;
                                  if (peg$silentFails === 0) { peg$fail(peg$c83); }
                                }
                                if (s10 !== peg$FAILED) {
                                  s11 = [];
                                  s12 = peg$parseWS();
                                  while (s12 !== peg$FAILED) {
                                    s11.push(s12);
                                    s12 = peg$parseWS();
                                  }
                                  if (s11 !== peg$FAILED) {
                                    if (input.substr(peg$currPos, 9).toLowerCase() === peg$c434) {
                                      s12 = input.substr(peg$currPos, 9);
                                      peg$currPos += 9;
                                    } else {
                                      s12 = peg$FAILED;
                                      if (peg$silentFails === 0) { peg$fail(peg$c435); }
                                    }
                                    if (s12 !== peg$FAILED) {
                                      s13 = [];
                                      s14 = peg$parseWS();
                                      while (s14 !== peg$FAILED) {
                                        s13.push(s14);
                                        s14 = peg$parseWS();
                                      }
                                      if (s13 !== peg$FAILED) {
                                        if (input.charCodeAt(peg$currPos) === 61) {
                                          s14 = peg$c221;
                                          peg$currPos++;
                                        } else {
                                          s14 = peg$FAILED;
                                          if (peg$silentFails === 0) { peg$fail(peg$c222); }
                                        }
                                        if (s14 !== peg$FAILED) {
                                          s15 = [];
                                          s16 = peg$parseWS();
                                          while (s16 !== peg$FAILED) {
                                            s15.push(s16);
                                            s16 = peg$parseWS();
                                          }
                                          if (s15 !== peg$FAILED) {
                                            s16 = peg$parseString();
                                            if (s16 !== peg$FAILED) {
                                              s9 = [s9, s10, s11, s12, s13, s14, s15, s16];
                                              s8 = s9;
                                            } else {
                                              peg$currPos = s8;
                                              s8 = peg$FAILED;
                                            }
                                          } else {
                                            peg$currPos = s8;
                                            s8 = peg$FAILED;
                                          }
                                        } else {
                                          peg$currPos = s8;
                                          s8 = peg$FAILED;
                                        }
                                      } else {
                                        peg$currPos = s8;
                                        s8 = peg$FAILED;
                                      }
                                    } else {
                                      peg$currPos = s8;
                                      s8 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s8;
                                    s8 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s8;
                                  s8 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s8;
                                s8 = peg$FAILED;
                              }
                              if (s8 === peg$FAILED) {
                                s8 = null;
                              }
                              if (s8 !== peg$FAILED) {
                                s9 = [];
                                s10 = peg$parseWS();
                                while (s10 !== peg$FAILED) {
                                  s9.push(s10);
                                  s10 = peg$parseWS();
                                }
                                if (s9 !== peg$FAILED) {
                                  if (input.charCodeAt(peg$currPos) === 41) {
                                    s10 = peg$c21;
                                    peg$currPos++;
                                  } else {
                                    s10 = peg$FAILED;
                                    if (peg$silentFails === 0) { peg$fail(peg$c22); }
                                  }
                                  if (s10 !== peg$FAILED) {
                                    s11 = [];
                                    s12 = peg$parseWS();
                                    while (s12 !== peg$FAILED) {
                                      s11.push(s12);
                                      s12 = peg$parseWS();
                                    }
                                    if (s11 !== peg$FAILED) {
                                      peg$savedPos = s0;
                                      s1 = peg$c436(s5, s7, s8);
                                      s0 = s1;
                                    } else {
                                      peg$currPos = s0;
                                      s0 = peg$FAILED;
                                    }
                                  } else {
                                    peg$currPos = s0;
                                    s0 = peg$FAILED;
                                  }
                                } else {
                                  peg$currPos = s0;
                                  s0 = peg$FAILED;
                                }
                              } else {
                                peg$currPos = s0;
                                s0 = peg$FAILED;
                              }
                            } else {
                              peg$currPos = s0;
                              s0 = peg$FAILED;
                            }
                          } else {
                            peg$currPos = s0;
                            s0 = peg$FAILED;
                          }
                        } else {
                          peg$currPos = s0;
                          s0 = peg$FAILED;
                        }
                      } else {
                        peg$currPos = s0;
                        s0 = peg$FAILED;
                      }
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              }
            }
          }
        }
      }
    }

    return s0;
  }

  function peg$parseIRIrefOrFunction() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    s1 = peg$parseIRIref();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseArgList();
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c437(s1, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseRDFLiteral() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    s1 = peg$parseString();
    if (s1 !== peg$FAILED) {
      s2 = peg$parseLANGTAG();
      if (s2 === peg$FAILED) {
        s2 = peg$currPos;
        if (input.substr(peg$currPos, 2) === peg$c438) {
          s3 = peg$c438;
          peg$currPos += 2;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c439); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseIRIref();
          if (s4 !== peg$FAILED) {
            s3 = [s3, s4];
            s2 = s3;
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$FAILED;
        }
      }
      if (s2 === peg$FAILED) {
        s2 = null;
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c440(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseNumericLiteral() {
    var s0;

    s0 = peg$parseNumericLiteralUnsigned();
    if (s0 === peg$FAILED) {
      s0 = peg$parseNumericLiteralPositive();
      if (s0 === peg$FAILED) {
        s0 = peg$parseNumericLiteralNegative();
      }
    }

    return s0;
  }

  function peg$parseNumericLiteralUnsigned() {
    var s0;

    s0 = peg$parseDOUBLE();
    if (s0 === peg$FAILED) {
      s0 = peg$parseDECIMAL();
      if (s0 === peg$FAILED) {
        s0 = peg$parseINTEGER();
      }
    }

    return s0;
  }

  function peg$parseNumericLiteralPositive() {
    var s0;

    s0 = peg$parseDOUBLE_POSITIVE();
    if (s0 === peg$FAILED) {
      s0 = peg$parseDECIMAL_POSITIVE();
      if (s0 === peg$FAILED) {
        s0 = peg$parseINTEGER_POSITIVE();
      }
    }

    return s0;
  }

  function peg$parseNumericLiteralNegative() {
    var s0;

    s0 = peg$parseDOUBLE_NEGATIVE();
    if (s0 === peg$FAILED) {
      s0 = peg$parseDECIMAL_NEGATIVE();
      if (s0 === peg$FAILED) {
        s0 = peg$parseINTEGER_NEGATIVE();
      }
    }

    return s0;
  }

  function peg$parseBooleanLiteral() {
    var s0, s1;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 4).toLowerCase() === peg$c441) {
      s1 = input.substr(peg$currPos, 4);
      peg$currPos += 4;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c442); }
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c443();
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.substr(peg$currPos, 5).toLowerCase() === peg$c444) {
        s1 = input.substr(peg$currPos, 5);
        peg$currPos += 5;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c445); }
      }
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c446();
      }
      s0 = s1;
    }

    return s0;
  }

  function peg$parseString() {
    var s0;

    s0 = peg$parseSTRING_LITERAL_LONG1();
    if (s0 === peg$FAILED) {
      s0 = peg$parseSTRING_LITERAL_LONG2();
      if (s0 === peg$FAILED) {
        s0 = peg$parseSTRING_LITERAL1();
        if (s0 === peg$FAILED) {
          s0 = peg$parseSTRING_LITERAL2();
        }
      }
    }

    return s0;
  }

  function peg$parseIRIref() {
    var s0, s1;

    s0 = peg$currPos;
    s1 = peg$parseIRIREF();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c447(s1);
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parsePrefixedName();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c448(s1);
      }
      s0 = s1;
    }

    return s0;
  }

  function peg$parsePrefixedName() {
    var s0, s1;

    s0 = peg$currPos;
    s1 = peg$parsePNAME_LN();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c449(s1);
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parsePNAME_NS();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c450(s1);
      }
      s0 = s1;
    }

    return s0;
  }

  function peg$parseBlankNode() {
    var s0, s1;

    s0 = peg$currPos;
    s1 = peg$parseBLANK_NODE_LABEL();
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c451(s1);
    }
    s0 = s1;
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      s1 = peg$parseANON();
      if (s1 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c452();
      }
      s0 = s1;
    }

    return s0;
  }

  function peg$parseIRIREF() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 60) {
      s1 = peg$c225;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c226); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      if (peg$c453.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c454); }
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        if (peg$c453.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c454); }
        }
      }
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 62) {
          s3 = peg$c227;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c228); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c455(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsePNAME_NS() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = peg$parsePN_PREFIX();
    if (s1 === peg$FAILED) {
      s1 = null;
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 58) {
        s2 = peg$c456;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c457); }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c448(s1);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsePNAME_LN() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = peg$parsePNAME_NS();
    if (s1 !== peg$FAILED) {
      s2 = peg$parsePN_LOCAL();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c458(s1, s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseBLANK_NODE_LABEL() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 2) === peg$c459) {
      s1 = peg$c459;
      peg$currPos += 2;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c460); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parsePN_CHARS_U();
      if (s2 === peg$FAILED) {
        if (peg$c461.test(input.charAt(peg$currPos))) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c462); }
        }
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$currPos;
        s4 = [];
        s5 = peg$parsePN_CHARS();
        if (s5 === peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 46) {
            s5 = peg$c139;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c140); }
          }
        }
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          s5 = peg$parsePN_CHARS();
          if (s5 === peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 46) {
              s5 = peg$c139;
              peg$currPos++;
            } else {
              s5 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c140); }
            }
          }
        }
        if (s4 !== peg$FAILED) {
          s5 = peg$parsePN_CHARS();
          if (s5 !== peg$FAILED) {
            s4 = [s4, s5];
            s3 = s4;
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
        if (s3 === peg$FAILED) {
          s3 = null;
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c463();
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseVAR1() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 63) {
      s1 = peg$c200;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c201); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseVARNAME();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c464(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseVAR2() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 36) {
      s1 = peg$c465;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c466); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseVARNAME();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c467(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseVAR3() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 2) === peg$c468) {
      s1 = peg$c468;
      peg$currPos += 2;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c469); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseVARNAME();
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 2) === peg$c470) {
          s3 = peg$c470;
          peg$currPos += 2;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c471); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c472(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseLANGTAG() {
    var s0, s1, s2, s3, s4, s5, s6, s7;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 64) {
      s1 = peg$c473;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c474); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      if (peg$c475.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c476); }
      }
      if (s3 !== peg$FAILED) {
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          if (peg$c475.test(input.charAt(peg$currPos))) {
            s3 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c476); }
          }
        }
      } else {
        s2 = peg$FAILED;
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        s4 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 45) {
          s5 = peg$c238;
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c239); }
        }
        if (s5 !== peg$FAILED) {
          s6 = [];
          if (peg$c477.test(input.charAt(peg$currPos))) {
            s7 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s7 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c478); }
          }
          if (s7 !== peg$FAILED) {
            while (s7 !== peg$FAILED) {
              s6.push(s7);
              if (peg$c477.test(input.charAt(peg$currPos))) {
                s7 = input.charAt(peg$currPos);
                peg$currPos++;
              } else {
                s7 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c478); }
              }
            }
          } else {
            s6 = peg$FAILED;
          }
          if (s6 !== peg$FAILED) {
            s5 = [s5, s6];
            s4 = s5;
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
        } else {
          peg$currPos = s4;
          s4 = peg$FAILED;
        }
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          s4 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 45) {
            s5 = peg$c238;
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c239); }
          }
          if (s5 !== peg$FAILED) {
            s6 = [];
            if (peg$c477.test(input.charAt(peg$currPos))) {
              s7 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s7 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c478); }
            }
            if (s7 !== peg$FAILED) {
              while (s7 !== peg$FAILED) {
                s6.push(s7);
                if (peg$c477.test(input.charAt(peg$currPos))) {
                  s7 = input.charAt(peg$currPos);
                  peg$currPos++;
                } else {
                  s7 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c478); }
                }
              }
            } else {
              s6 = peg$FAILED;
            }
            if (s6 !== peg$FAILED) {
              s5 = [s5, s6];
              s4 = s5;
            } else {
              peg$currPos = s4;
              s4 = peg$FAILED;
            }
          } else {
            peg$currPos = s4;
            s4 = peg$FAILED;
          }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c479(s2, s3);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseINTEGER() {
    var s0, s1, s2;

    s0 = peg$currPos;
    s1 = [];
    if (peg$c461.test(input.charAt(peg$currPos))) {
      s2 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c462); }
    }
    if (s2 !== peg$FAILED) {
      while (s2 !== peg$FAILED) {
        s1.push(s2);
        if (peg$c461.test(input.charAt(peg$currPos))) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c462); }
        }
      }
    } else {
      s1 = peg$FAILED;
    }
    if (s1 !== peg$FAILED) {
      peg$savedPos = s0;
      s1 = peg$c480();
    }
    s0 = s1;

    return s0;
  }

  function peg$parseDECIMAL() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    s1 = [];
    if (peg$c461.test(input.charAt(peg$currPos))) {
      s2 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c462); }
    }
    while (s2 !== peg$FAILED) {
      s1.push(s2);
      if (peg$c461.test(input.charAt(peg$currPos))) {
        s2 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c462); }
      }
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 46) {
        s2 = peg$c139;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c140); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        if (peg$c461.test(input.charAt(peg$currPos))) {
          s4 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c462); }
        }
        if (s4 !== peg$FAILED) {
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            if (peg$c461.test(input.charAt(peg$currPos))) {
              s4 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s4 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c462); }
            }
          }
        } else {
          s3 = peg$FAILED;
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c481();
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseDOUBLE() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    s1 = [];
    if (peg$c461.test(input.charAt(peg$currPos))) {
      s2 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s2 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c462); }
    }
    if (s2 !== peg$FAILED) {
      while (s2 !== peg$FAILED) {
        s1.push(s2);
        if (peg$c461.test(input.charAt(peg$currPos))) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c462); }
        }
      }
    } else {
      s1 = peg$FAILED;
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 46) {
        s2 = peg$c139;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c140); }
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        if (peg$c461.test(input.charAt(peg$currPos))) {
          s4 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c462); }
        }
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          if (peg$c461.test(input.charAt(peg$currPos))) {
            s4 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c462); }
          }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseEXPONENT();
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c482();
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }
    if (s0 === peg$FAILED) {
      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 46) {
        s1 = peg$c139;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c140); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        if (peg$c461.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c462); }
        }
        if (s3 !== peg$FAILED) {
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            if (peg$c461.test(input.charAt(peg$currPos))) {
              s3 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c462); }
            }
          }
        } else {
          s2 = peg$FAILED;
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parseEXPONENT();
          if (s3 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c482();
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = [];
        if (peg$c461.test(input.charAt(peg$currPos))) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c462); }
        }
        if (s2 !== peg$FAILED) {
          while (s2 !== peg$FAILED) {
            s1.push(s2);
            if (peg$c461.test(input.charAt(peg$currPos))) {
              s2 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s2 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c462); }
            }
          }
        } else {
          s1 = peg$FAILED;
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseEXPONENT();
          if (s2 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c482();
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      }
    }

    return s0;
  }

  function peg$parseINTEGER_POSITIVE() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 43) {
      s1 = peg$c202;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c203); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseINTEGER();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c483(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseDECIMAL_POSITIVE() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 43) {
      s1 = peg$c202;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c203); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseDECIMAL();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c483(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseDOUBLE_POSITIVE() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 43) {
      s1 = peg$c202;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c203); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseDOUBLE();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c483(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseINTEGER_NEGATIVE() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 45) {
      s1 = peg$c238;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c239); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseINTEGER();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c484(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseDECIMAL_NEGATIVE() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 45) {
      s1 = peg$c238;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c239); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseDECIMAL();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c484(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseDOUBLE_NEGATIVE() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 45) {
      s1 = peg$c238;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c239); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseDOUBLE();
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c484(s2);
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseEXPONENT() {
    var s0, s1, s2, s3, s4;

    s0 = peg$currPos;
    if (peg$c485.test(input.charAt(peg$currPos))) {
      s1 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c486); }
    }
    if (s1 !== peg$FAILED) {
      if (peg$c487.test(input.charAt(peg$currPos))) {
        s2 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c488); }
      }
      if (s2 === peg$FAILED) {
        s2 = null;
      }
      if (s2 !== peg$FAILED) {
        s3 = [];
        if (peg$c461.test(input.charAt(peg$currPos))) {
          s4 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c462); }
        }
        if (s4 !== peg$FAILED) {
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            if (peg$c461.test(input.charAt(peg$currPos))) {
              s4 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s4 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c462); }
            }
          }
        } else {
          s3 = peg$FAILED;
        }
        if (s3 !== peg$FAILED) {
          s1 = [s1, s2, s3];
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseSTRING_LITERAL1() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 39) {
      s1 = peg$c489;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c490); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      if (peg$c491.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c492); }
      }
      if (s3 === peg$FAILED) {
        s3 = peg$parseECHAR();
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        if (peg$c491.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c492); }
        }
        if (s3 === peg$FAILED) {
          s3 = peg$parseECHAR();
        }
      }
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 39) {
          s3 = peg$c489;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c490); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c493(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseSTRING_LITERAL2() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 34) {
      s1 = peg$c494;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c495); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      if (peg$c496.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c497); }
      }
      if (s3 === peg$FAILED) {
        s3 = peg$parseECHAR();
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        if (peg$c496.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c497); }
        }
        if (s3 === peg$FAILED) {
          s3 = peg$parseECHAR();
        }
      }
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 34) {
          s3 = peg$c494;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c495); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c498(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseSTRING_LITERAL_LONG1() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 3) === peg$c499) {
      s1 = peg$c499;
      peg$currPos += 3;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c500); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      if (input.substr(peg$currPos, 2) === peg$c501) {
        s4 = peg$c501;
        peg$currPos += 2;
      } else {
        s4 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c502); }
      }
      if (s4 === peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 39) {
          s4 = peg$c489;
          peg$currPos++;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c490); }
        }
      }
      if (s4 === peg$FAILED) {
        s4 = null;
      }
      if (s4 !== peg$FAILED) {
        if (peg$c503.test(input.charAt(peg$currPos))) {
          s5 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c504); }
        }
        if (s5 === peg$FAILED) {
          s5 = peg$parseECHAR();
        }
        if (s5 !== peg$FAILED) {
          s4 = [s4, s5];
          s3 = s4;
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$currPos;
        if (input.substr(peg$currPos, 2) === peg$c501) {
          s4 = peg$c501;
          peg$currPos += 2;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c502); }
        }
        if (s4 === peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 39) {
            s4 = peg$c489;
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c490); }
          }
        }
        if (s4 === peg$FAILED) {
          s4 = null;
        }
        if (s4 !== peg$FAILED) {
          if (peg$c503.test(input.charAt(peg$currPos))) {
            s5 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c504); }
          }
          if (s5 === peg$FAILED) {
            s5 = peg$parseECHAR();
          }
          if (s5 !== peg$FAILED) {
            s4 = [s4, s5];
            s3 = s4;
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 3) === peg$c499) {
          s3 = peg$c499;
          peg$currPos += 3;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c500); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c505(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseSTRING_LITERAL_LONG2() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    if (input.substr(peg$currPos, 3) === peg$c506) {
      s1 = peg$c506;
      peg$currPos += 3;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c507); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$currPos;
      if (input.substr(peg$currPos, 2) === peg$c508) {
        s4 = peg$c508;
        peg$currPos += 2;
      } else {
        s4 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c509); }
      }
      if (s4 === peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 34) {
          s4 = peg$c494;
          peg$currPos++;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c495); }
        }
      }
      if (s4 === peg$FAILED) {
        s4 = null;
      }
      if (s4 !== peg$FAILED) {
        if (peg$c510.test(input.charAt(peg$currPos))) {
          s5 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c511); }
        }
        if (s5 === peg$FAILED) {
          s5 = peg$parseECHAR();
        }
        if (s5 !== peg$FAILED) {
          s4 = [s4, s5];
          s3 = s4;
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      } else {
        peg$currPos = s3;
        s3 = peg$FAILED;
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$currPos;
        if (input.substr(peg$currPos, 2) === peg$c508) {
          s4 = peg$c508;
          peg$currPos += 2;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c509); }
        }
        if (s4 === peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 34) {
            s4 = peg$c494;
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c495); }
          }
        }
        if (s4 === peg$FAILED) {
          s4 = null;
        }
        if (s4 !== peg$FAILED) {
          if (peg$c510.test(input.charAt(peg$currPos))) {
            s5 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c511); }
          }
          if (s5 === peg$FAILED) {
            s5 = peg$parseECHAR();
          }
          if (s5 !== peg$FAILED) {
            s4 = [s4, s5];
            s3 = s4;
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
        } else {
          peg$currPos = s3;
          s3 = peg$FAILED;
        }
      }
      if (s2 !== peg$FAILED) {
        if (input.substr(peg$currPos, 3) === peg$c506) {
          s3 = peg$c506;
          peg$currPos += 3;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c507); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c512(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseECHAR() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 92) {
      s1 = peg$c513;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c514); }
    }
    if (s1 !== peg$FAILED) {
      if (peg$c515.test(input.charAt(peg$currPos))) {
        s2 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c516); }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c463();
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseNIL() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 40) {
      s1 = peg$c17;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c18); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 41) {
          s3 = peg$c21;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c22); }
        }
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c517();
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseWS() {
    var s0;

    s0 = peg$parseCOMMENT();
    if (s0 === peg$FAILED) {
      s0 = peg$parseSPACE_OR_TAB();
      if (s0 === peg$FAILED) {
        s0 = peg$parseNEW_LINE();
      }
    }

    return s0;
  }

  function peg$parseSPACE_OR_TAB() {
    var s0;

    if (peg$c518.test(input.charAt(peg$currPos))) {
      s0 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c519); }
    }

    return s0;
  }

  function peg$parseNEW_LINE() {
    var s0;

    if (peg$c520.test(input.charAt(peg$currPos))) {
      s0 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c521); }
    }

    return s0;
  }

  function peg$parseNON_NEW_LINE() {
    var s0;

    if (peg$c522.test(input.charAt(peg$currPos))) {
      s0 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c523); }
    }

    return s0;
  }

  function peg$parseHEADER_LINE() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 35) {
      s1 = peg$c524;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c525); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseNON_NEW_LINE();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseNON_NEW_LINE();
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parseNEW_LINE();
        if (s3 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c463();
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseCOMMENT() {
    var s0, s1, s2, s3, s4, s5;

    s0 = peg$currPos;
    s1 = peg$parseNEW_LINE();
    if (s1 === peg$FAILED) {
      s1 = null;
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseSPACE_OR_TAB();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseSPACE_OR_TAB();
      }
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 35) {
          s3 = peg$c524;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c525); }
        }
        if (s3 !== peg$FAILED) {
          s4 = [];
          s5 = peg$parseNON_NEW_LINE();
          while (s5 !== peg$FAILED) {
            s4.push(s5);
            s5 = peg$parseNON_NEW_LINE();
          }
          if (s4 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c526();
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseANON() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 91) {
      s1 = peg$c208;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c209); }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parseWS();
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parseWS();
      }
      if (s2 !== peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 93) {
          s3 = peg$c210;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c211); }
        }
        if (s3 !== peg$FAILED) {
          s1 = [s1, s2, s3];
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsePN_CHARS_BASE() {
    var s0;

    if (peg$c527.test(input.charAt(peg$currPos))) {
      s0 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c528); }
    }
    if (s0 === peg$FAILED) {
      if (peg$c529.test(input.charAt(peg$currPos))) {
        s0 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c530); }
      }
      if (s0 === peg$FAILED) {
        if (peg$c531.test(input.charAt(peg$currPos))) {
          s0 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c532); }
        }
        if (s0 === peg$FAILED) {
          if (peg$c533.test(input.charAt(peg$currPos))) {
            s0 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c534); }
          }
          if (s0 === peg$FAILED) {
            if (peg$c535.test(input.charAt(peg$currPos))) {
              s0 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s0 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c536); }
            }
            if (s0 === peg$FAILED) {
              if (peg$c537.test(input.charAt(peg$currPos))) {
                s0 = input.charAt(peg$currPos);
                peg$currPos++;
              } else {
                s0 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c538); }
              }
              if (s0 === peg$FAILED) {
                if (peg$c539.test(input.charAt(peg$currPos))) {
                  s0 = input.charAt(peg$currPos);
                  peg$currPos++;
                } else {
                  s0 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c540); }
                }
                if (s0 === peg$FAILED) {
                  if (peg$c541.test(input.charAt(peg$currPos))) {
                    s0 = input.charAt(peg$currPos);
                    peg$currPos++;
                  } else {
                    s0 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c542); }
                  }
                  if (s0 === peg$FAILED) {
                    if (peg$c543.test(input.charAt(peg$currPos))) {
                      s0 = input.charAt(peg$currPos);
                      peg$currPos++;
                    } else {
                      s0 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c544); }
                    }
                    if (s0 === peg$FAILED) {
                      if (peg$c545.test(input.charAt(peg$currPos))) {
                        s0 = input.charAt(peg$currPos);
                        peg$currPos++;
                      } else {
                        s0 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c546); }
                      }
                      if (s0 === peg$FAILED) {
                        if (peg$c547.test(input.charAt(peg$currPos))) {
                          s0 = input.charAt(peg$currPos);
                          peg$currPos++;
                        } else {
                          s0 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c548); }
                        }
                        if (s0 === peg$FAILED) {
                          if (peg$c549.test(input.charAt(peg$currPos))) {
                            s0 = input.charAt(peg$currPos);
                            peg$currPos++;
                          } else {
                            s0 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c550); }
                          }
                          if (s0 === peg$FAILED) {
                            if (peg$c551.test(input.charAt(peg$currPos))) {
                              s0 = input.charAt(peg$currPos);
                              peg$currPos++;
                            } else {
                              s0 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c552); }
                            }
                            if (s0 === peg$FAILED) {
                              if (peg$c553.test(input.charAt(peg$currPos))) {
                                s0 = input.charAt(peg$currPos);
                                peg$currPos++;
                              } else {
                                s0 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c554); }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    return s0;
  }

  function peg$parsePN_CHARS_U() {
    var s0;

    s0 = peg$parsePN_CHARS_BASE();
    if (s0 === peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 95) {
        s0 = peg$c555;
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c556); }
      }
    }

    return s0;
  }

  function peg$parseVARNAME() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    s1 = peg$parsePN_CHARS_U();
    if (s1 === peg$FAILED) {
      if (peg$c461.test(input.charAt(peg$currPos))) {
        s1 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c462); }
      }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parsePN_CHARS_U();
      if (s3 === peg$FAILED) {
        if (peg$c461.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c462); }
        }
        if (s3 === peg$FAILED) {
          if (peg$c557.test(input.charAt(peg$currPos))) {
            s3 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c558); }
          }
          if (s3 === peg$FAILED) {
            if (peg$c559.test(input.charAt(peg$currPos))) {
              s3 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c560); }
            }
            if (s3 === peg$FAILED) {
              if (peg$c561.test(input.charAt(peg$currPos))) {
                s3 = input.charAt(peg$currPos);
                peg$currPos++;
              } else {
                s3 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c562); }
              }
            }
          }
        }
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parsePN_CHARS_U();
        if (s3 === peg$FAILED) {
          if (peg$c461.test(input.charAt(peg$currPos))) {
            s3 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c462); }
          }
          if (s3 === peg$FAILED) {
            if (peg$c557.test(input.charAt(peg$currPos))) {
              s3 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c558); }
            }
            if (s3 === peg$FAILED) {
              if (peg$c559.test(input.charAt(peg$currPos))) {
                s3 = input.charAt(peg$currPos);
                peg$currPos++;
              } else {
                s3 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c560); }
              }
              if (s3 === peg$FAILED) {
                if (peg$c561.test(input.charAt(peg$currPos))) {
                  s3 = input.charAt(peg$currPos);
                  peg$currPos++;
                } else {
                  s3 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c562); }
                }
              }
            }
          }
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c463();
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsePN_CHARS() {
    var s0;

    s0 = peg$parsePN_CHARS_U();
    if (s0 === peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 45) {
        s0 = peg$c238;
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c239); }
      }
      if (s0 === peg$FAILED) {
        if (peg$c461.test(input.charAt(peg$currPos))) {
          s0 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c462); }
        }
        if (s0 === peg$FAILED) {
          if (peg$c557.test(input.charAt(peg$currPos))) {
            s0 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c558); }
          }
          if (s0 === peg$FAILED) {
            if (peg$c559.test(input.charAt(peg$currPos))) {
              s0 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s0 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c560); }
            }
            if (s0 === peg$FAILED) {
              if (peg$c561.test(input.charAt(peg$currPos))) {
                s0 = input.charAt(peg$currPos);
                peg$currPos++;
              } else {
                s0 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c562); }
              }
            }
          }
        }
      }
    }

    return s0;
  }

  function peg$parsePN_PREFIX() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    s1 = peg$parsePN_CHARS_U();
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parsePN_CHARS();
      if (s3 === peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 46) {
          s3 = peg$c139;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c140); }
        }
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parsePN_CHARS();
        if (s3 === peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 46) {
            s3 = peg$c139;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c140); }
          }
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c463();
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsePN_LOCAL() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 36) {
      s1 = peg$c465;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c466); }
    }
    if (s1 === peg$FAILED) {
      s1 = peg$parsePN_CHARS_U();
      if (s1 === peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 58) {
          s1 = peg$c456;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c457); }
        }
        if (s1 === peg$FAILED) {
          if (peg$c461.test(input.charAt(peg$currPos))) {
            s1 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c462); }
          }
          if (s1 === peg$FAILED) {
            s1 = peg$parsePLX();
          }
        }
      }
    }
    if (s1 !== peg$FAILED) {
      s2 = [];
      s3 = peg$parsePN_CHARS();
      if (s3 === peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 46) {
          s3 = peg$c139;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c140); }
        }
        if (s3 === peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 58) {
            s3 = peg$c456;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c457); }
          }
          if (s3 === peg$FAILED) {
            s3 = peg$parsePLX();
          }
        }
      }
      while (s3 !== peg$FAILED) {
        s2.push(s3);
        s3 = peg$parsePN_CHARS();
        if (s3 === peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 46) {
            s3 = peg$c139;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c140); }
          }
          if (s3 === peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 58) {
              s3 = peg$c456;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c457); }
            }
            if (s3 === peg$FAILED) {
              s3 = peg$parsePLX();
            }
          }
        }
      }
      if (s2 !== peg$FAILED) {
        peg$savedPos = s0;
        s1 = peg$c463();
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parsePLX() {
    var s0;

    s0 = peg$parsePERCENT();
    if (s0 === peg$FAILED) {
      s0 = peg$parsePN_LOCAL_ESC();
    }

    return s0;
  }

  function peg$parsePERCENT() {
    var s0, s1, s2, s3;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 37) {
      s1 = peg$c563;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c564); }
    }
    if (s1 !== peg$FAILED) {
      s2 = peg$parseHEX();
      if (s2 !== peg$FAILED) {
        s3 = peg$parseHEX();
        if (s3 !== peg$FAILED) {
          s1 = [s1, s2, s3];
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }

  function peg$parseHEX() {
    var s0;

    if (peg$c461.test(input.charAt(peg$currPos))) {
      s0 = input.charAt(peg$currPos);
      peg$currPos++;
    } else {
      s0 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c462); }
    }
    if (s0 === peg$FAILED) {
      if (peg$c565.test(input.charAt(peg$currPos))) {
        s0 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s0 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c566); }
      }
      if (s0 === peg$FAILED) {
        if (peg$c567.test(input.charAt(peg$currPos))) {
          s0 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c568); }
        }
      }
    }

    return s0;
  }

  function peg$parsePN_LOCAL_ESC() {
    var s0, s1, s2;

    s0 = peg$currPos;
    if (input.charCodeAt(peg$currPos) === 92) {
      s1 = peg$c513;
      peg$currPos++;
    } else {
      s1 = peg$FAILED;
      if (peg$silentFails === 0) { peg$fail(peg$c514); }
    }
    if (s1 !== peg$FAILED) {
      if (input.charCodeAt(peg$currPos) === 95) {
        s2 = peg$c555;
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c556); }
      }
      if (s2 === peg$FAILED) {
        if (input.charCodeAt(peg$currPos) === 126) {
          s2 = peg$c569;
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c570); }
        }
        if (s2 === peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 46) {
            s2 = peg$c139;
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c140); }
          }
          if (s2 === peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 45) {
              s2 = peg$c238;
              peg$currPos++;
            } else {
              s2 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c239); }
            }
            if (s2 === peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 33) {
                s2 = peg$c204;
                peg$currPos++;
              } else {
                s2 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c205); }
              }
              if (s2 === peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 36) {
                  s2 = peg$c465;
                  peg$currPos++;
                } else {
                  s2 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c466); }
                }
                if (s2 === peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 38) {
                    s2 = peg$c571;
                    peg$currPos++;
                  } else {
                    s2 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c572); }
                  }
                  if (s2 === peg$FAILED) {
                    if (input.charCodeAt(peg$currPos) === 39) {
                      s2 = peg$c489;
                      peg$currPos++;
                    } else {
                      s2 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c490); }
                    }
                    if (s2 === peg$FAILED) {
                      if (input.charCodeAt(peg$currPos) === 40) {
                        s2 = peg$c17;
                        peg$currPos++;
                      } else {
                        s2 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c18); }
                      }
                      if (s2 === peg$FAILED) {
                        if (input.charCodeAt(peg$currPos) === 41) {
                          s2 = peg$c21;
                          peg$currPos++;
                        } else {
                          s2 = peg$FAILED;
                          if (peg$silentFails === 0) { peg$fail(peg$c22); }
                        }
                        if (s2 === peg$FAILED) {
                          if (input.charCodeAt(peg$currPos) === 42) {
                            s2 = peg$c23;
                            peg$currPos++;
                          } else {
                            s2 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c24); }
                          }
                          if (s2 === peg$FAILED) {
                            if (input.charCodeAt(peg$currPos) === 43) {
                              s2 = peg$c202;
                              peg$currPos++;
                            } else {
                              s2 = peg$FAILED;
                              if (peg$silentFails === 0) { peg$fail(peg$c203); }
                            }
                            if (s2 === peg$FAILED) {
                              if (input.charCodeAt(peg$currPos) === 44) {
                                s2 = peg$c174;
                                peg$currPos++;
                              } else {
                                s2 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c175); }
                              }
                              if (s2 === peg$FAILED) {
                                if (input.charCodeAt(peg$currPos) === 59) {
                                  s2 = peg$c82;
                                  peg$currPos++;
                                } else {
                                  s2 = peg$FAILED;
                                  if (peg$silentFails === 0) { peg$fail(peg$c83); }
                                }
                                if (s2 === peg$FAILED) {
                                  if (input.charCodeAt(peg$currPos) === 58) {
                                    s2 = peg$c456;
                                    peg$currPos++;
                                  } else {
                                    s2 = peg$FAILED;
                                    if (peg$silentFails === 0) { peg$fail(peg$c457); }
                                  }
                                  if (s2 === peg$FAILED) {
                                    if (input.charCodeAt(peg$currPos) === 61) {
                                      s2 = peg$c221;
                                      peg$currPos++;
                                    } else {
                                      s2 = peg$FAILED;
                                      if (peg$silentFails === 0) { peg$fail(peg$c222); }
                                    }
                                    if (s2 === peg$FAILED) {
                                      if (input.charCodeAt(peg$currPos) === 47) {
                                        s2 = peg$c193;
                                        peg$currPos++;
                                      } else {
                                        s2 = peg$FAILED;
                                        if (peg$silentFails === 0) { peg$fail(peg$c194); }
                                      }
                                      if (s2 === peg$FAILED) {
                                        if (input.charCodeAt(peg$currPos) === 63) {
                                          s2 = peg$c200;
                                          peg$currPos++;
                                        } else {
                                          s2 = peg$FAILED;
                                          if (peg$silentFails === 0) { peg$fail(peg$c201); }
                                        }
                                        if (s2 === peg$FAILED) {
                                          if (input.charCodeAt(peg$currPos) === 35) {
                                            s2 = peg$c524;
                                            peg$currPos++;
                                          } else {
                                            s2 = peg$FAILED;
                                            if (peg$silentFails === 0) { peg$fail(peg$c525); }
                                          }
                                          if (s2 === peg$FAILED) {
                                            if (input.charCodeAt(peg$currPos) === 64) {
                                              s2 = peg$c473;
                                              peg$currPos++;
                                            } else {
                                              s2 = peg$FAILED;
                                              if (peg$silentFails === 0) { peg$fail(peg$c474); }
                                            }
                                            if (s2 === peg$FAILED) {
                                              if (input.charCodeAt(peg$currPos) === 37) {
                                                s2 = peg$c563;
                                                peg$currPos++;
                                              } else {
                                                s2 = peg$FAILED;
                                                if (peg$silentFails === 0) { peg$fail(peg$c564); }
                                              }
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      if (s2 !== peg$FAILED) {
        s1 = [s1, s2];
        s0 = s1;
      } else {
        peg$currPos = s0;
        s0 = peg$FAILED;
      }
    } else {
      peg$currPos = s0;
      s0 = peg$FAILED;
    }

    return s0;
  }


    let Comments = {};


  peg$result = peg$startRuleFunction();

  if (peg$result !== peg$FAILED && peg$currPos === input.length) {
    return peg$result;
  } else {
    if (peg$result !== peg$FAILED && peg$currPos < input.length) {
      peg$fail(peg$endExpectation());
    }

    throw peg$buildStructuredError(
      peg$maxFailExpected,
      peg$maxFailPos < input.length ? input.charAt(peg$maxFailPos) : null,
      peg$maxFailPos < input.length
        ? peg$computeLocation(peg$maxFailPos, peg$maxFailPos + 1)
        : peg$computeLocation(peg$maxFailPos, peg$maxFailPos)
    );
  }
}

module.exports = {
  SyntaxError: peg$SyntaxError,
  parse:       peg$parse
};

},{}]},{},[1]);
