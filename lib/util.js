String.prototype.insert = function(idx, val) {
  return this.substring(0, idx) + val + this.substring(idx);
};

String.prototype.remove = function(start, end){
  return this.substring(0, start) + this.substring(end);
};

traverse = (o, fn) => {
  for (const i in o) {
    fn.apply(this,[i,o[i]]);  
    if (o[i] !== null && typeof(o[i])=="object") {
      traverse(o[i], fn);
    }
  }
}

exports.traverse = traverse;

exports.literalToString = (literal) => {
  if(literal.type == "http://www.w3.org/2001/XMLSchema#boolean") {
    return literal.value ? "true" : "false";
  } else if(literal.type == "http://www.w3.org/2001/XMLSchema#decimal" || literal.type == "http://www.w3.org/2001/XMLSchema#double" || literal.type == "http://www.w3.org/2001/XMLSchema#integer") {
    return literal.value;
  } else if(literal.type) {
    return `"${literal.value}"^^<${literal.type}>`;
  } else {
    return `"${literal.value}"`;
  }
};

exports.printError = (inputText, err) => {
  const startLine = err.location.start.line;
  const endLine = err.location.end.line;
  const startCol = err.location.start.column;
  const endCol = err.location.end.column;

  if (startLine == endLine) {
    console.error(`ERROR line:${startLine}(col:${startCol}-${endCol})`);
  } else {
    console.error(`ERROR line:${startLine}(col:${startCol})-${endLine}(col:${endCol})`);
  }
  console.error(err.message);
  console.error('--');

  const lines = inputText.split('\n').slice(startLine-1, endLine);
  lines.forEach((line, i) => {
    if (i == 0) {
      console.error(makeRed(line.substring(0, startCol - 1)) + line.substring(startCol - 1));
    } else if (i < lines.length - 1) {
      console.error(makeRed(line));
    } else {
      console.error(makeRed(line.substring(0, endCol)) + line.substring(endCol));
    }
  });
}

makeRed = (text) => {
  // const red = '\u001b[31m'; // foreground
  const red = '\u001b[41m'; // backgrond
  const reset = '\u001b[0m';
  return red + text + reset;
}
